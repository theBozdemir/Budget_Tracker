import SwiftUI

struct AddTransactionView: View {
    @Environment(AuthManager.self) private var authManager
    @Environment(\.dismiss) private var dismiss

    let household: Household
    let onSaved: () -> Void

    @State private var amountText = ""
    @State private var type: TransactionType = .expense
    @State private var expenseCategories = AppConstants.expenseCategories
    @State private var incomeCategories = AppConstants.incomeCategories
    @State private var category = AppConstants.expenseCategories[0]
    @State private var note = ""
    @State private var timestamp = Date()
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Type") {
                    Picker("Type", selection: $type) {
                        ForEach(TransactionType.allCases) { transactionType in
                            Text(transactionType.label).tag(transactionType)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                Section("Amount") {
                    TextField("0.00", text: $amountText)
                        .keyboardType(.decimalPad)
                }

                Section("Category") {
                    Picker("Category", selection: $category) {
                        ForEach(categories(for: type), id: \.self) { item in
                            Text(item).tag(item)
                        }
                    }
                }

                Section("Date & Time") {
                    DatePicker(
                        "When",
                        selection: $timestamp,
                        displayedComponents: [.date, .hourAndMinute]
                    )
                }

                Section("Note (optional)") {
                    TextField("What was this for?", text: $note)
                }
            }
            .onChange(of: type) { _, newType in
                category = categories(for: newType).first ?? ""
            }
            .task { await loadCategories() }
            .navigationTitle("Add Entry")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task { await save() }
                    }
                    .disabled(!isValid || isSaving)
                }
            }
            .alert("Error", isPresented: .constant(errorMessage != nil)) {
                Button("OK") { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    private var isValid: Bool {
        parsedAmount != nil && (parsedAmount ?? 0) > 0
    }

    private var parsedAmount: Double? {
        Double(amountText.replacingOccurrences(of: ",", with: "."))
    }

    private func categories(for type: TransactionType) -> [String] {
        type == .income ? incomeCategories : expenseCategories
    }

    private func loadCategories() async {
        guard let householdId = household.id else { return }
        do {
            let categories = try await HouseholdService.fetchCategories(householdId: householdId)
            expenseCategories = categories.expense
            incomeCategories = categories.income
            category = self.categories(for: type).first ?? ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }
    private func save() async {
        guard
            let householdId = household.id,
            let user = authManager.user,
            let amount = parsedAmount
        else { return }

        isSaving = true
        defer { isSaving = false }

        let transaction = Transaction(
            householdId: householdId,
            amount: amount,
            type: type,
            category: category,
            note: note.trimmingCharacters(in: .whitespacesAndNewlines),
            timestamp: timestamp,
            createdBy: user.uid,
            createdByName: authManager.profile?.displayName ?? user.displayName ?? "User"
        )

        do {
            try await TransactionService.addTransaction(transaction)
            onSaved()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
