import SwiftUI

struct HouseholdDetailView: View {
    @Environment(AuthManager.self) private var authManager

    let household: Household

    @State private var transactions: [Transaction] = []
    @State private var pendingInvites: [PendingInvite] = []
    @State private var expenseCategories = AppConstants.expenseCategories
    @State private var incomeCategories = AppConstants.incomeCategories
    @State private var isLoading = false
    @State private var showingAddTransaction = false
    @State private var showingInviteSheet = false
    @State private var showingCategorySettings = false
    @State private var showingFilters = false
    @State private var filterType = "all"
    @State private var filterCategory = "all"
    @State private var filterMember = "all"
    @State private var useStartDate = false
    @State private var useEndDate = false
    @State private var startDate = Date()
    @State private var endDate = Date()
    @State private var errorMessage: String?

    private var filteredTransactions: [Transaction] {
        transactions.filter { transaction in
            if filterType != "all" && transaction.type.rawValue != filterType { return false }
            if filterCategory != "all" && transaction.category != filterCategory { return false }
            if filterMember != "all" && transaction.createdBy != filterMember { return false }
            let calendar = Calendar.current
            if useStartDate, transaction.timestamp < calendar.startOfDay(for: startDate) { return false }
            if useEndDate, let nextDay = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: endDate)), transaction.timestamp >= nextDay { return false }
            return true
        }
    }

    private var memberIDs: [String] {
        Array(Set(transactions.map(\.createdBy))).sorted {
            memberName(for: $0).localizedCaseInsensitiveCompare(memberName(for: $1)) == .orderedAscending
        }
    }

    private var summary: (income: Double, expenses: Double, balance: Double) {
        TransactionService.summary(for: filteredTransactions)
    }

    var body: some View {
        List {
            Section {
                SummaryCard(summary: summary)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
            }

            Section {
                Button {
                    showingInviteSheet = true
                } label: {
                    Label("Invite by Email", systemImage: "person.badge.plus")
                }

                if !pendingInvites.isEmpty {
                    ForEach(pendingInvites) { invite in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(invite.email).font(.subheadline)
                                Text("Invited by \(invite.invitedByName)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text("Pending").font(.caption).foregroundStyle(.orange)
                        }
                    }
                }
            } header: {
                Text("Members")
            } footer: {
                Text("Any member can invite others. Invites are only for this household.")
            }

            Section("Categories") {
                Button {
                    showingCategorySettings = true
                } label: {
                    Label("Manage expense and income categories", systemImage: "slider.horizontal.3")
                }
            }

            Section {
                DisclosureGroup("Filter Transactions", isExpanded: $showingFilters) {
                    Picker("Type", selection: $filterType) {
                        Text("All types").tag("all")
                        ForEach(TransactionType.allCases) { type in
                            Text(type.label).tag(type.rawValue)
                        }
                    }
                    .onChange(of: filterType) { _, _ in filterCategory = "all" }

                    Picker("Category", selection: $filterCategory) {
                        Text("All categories").tag("all")
                        ForEach(availableFilterCategories, id: \.self) { category in
                            Text(category).tag(category)
                        }
                    }

                    Picker("Added by", selection: $filterMember) {
                        Text("Everyone").tag("all")
                        ForEach(memberIDs, id: \.self) { memberID in
                            Text(memberName(for: memberID)).tag(memberID)
                        }
                    }

                    Toggle("From date", isOn: $useStartDate)
                    if useStartDate {
                        DatePicker("Start", selection: $startDate, displayedComponents: .date)
                    }
                    Toggle("Through date", isOn: $useEndDate)
                    if useEndDate {
                        DatePicker("End", selection: $endDate, displayedComponents: .date)
                    }

                    if filterType != "all" || filterCategory != "all" || filterMember != "all" || useStartDate || useEndDate {
                        Button("Clear filters") {
                            filterType = "all"
                            filterCategory = "all"
                            filterMember = "all"
                            useStartDate = false
                            useEndDate = false
                        }
                    }
                }
            }

            Section("Transactions") {
                if filteredTransactions.isEmpty {
                    Text(transactions.isEmpty
                         ? "No transactions yet. Add an expense or income to get started."
                         : "No transactions match these filters.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                ForEach(filteredTransactions) { transaction in
                    TransactionRowView(transaction: transaction)
                }
                .onDelete(perform: deleteTransactions)
            }
        }
        .navigationTitle(household.name)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showingAddTransaction = true
                } label: {
                    Image(systemName: "plus.circle.fill")
                }
            }
        }
        .sheet(isPresented: $showingAddTransaction) {
            AddTransactionView(household: household) {
                Task { await loadData() }
            }
        }
        .sheet(isPresented: $showingInviteSheet) {
            InviteMemberView(household: household) {
                Task { await loadData() }
            }
        }
        .sheet(isPresented: $showingCategorySettings) {
            if let householdId = household.id {
                CategoryManagementView(
                    householdId: householdId,
                    expenseCategories: expenseCategories,
                    incomeCategories: incomeCategories
                ) { expense, income in
                    expenseCategories = expense
                    incomeCategories = income
                    if filterCategory != "all" && !expense.contains(filterCategory) && !income.contains(filterCategory) {
                        filterCategory = "all"
                    }
                }
            }
        }
        .refreshable { await loadData() }
        .task { await loadData() }
        .alert("Error", isPresented: .constant(errorMessage != nil)) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private var availableFilterCategories: [String] {
        let categories: [String]
        if filterType == TransactionType.expense.rawValue {
            categories = expenseCategories
        } else if filterType == TransactionType.income.rawValue {
            categories = incomeCategories
        } else {
            categories = Array(Set(expenseCategories + incomeCategories)).sorted()
        }
        return categories.sorted()
    }

    private func memberName(for memberID: String) -> String {
        transactions.first(where: { $0.createdBy == memberID })?.createdByName ?? "Member"
    }

    private func loadData() async {
        guard let householdId = household.id else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            async let fetchedTransactions = TransactionService.fetchTransactions(householdId: householdId)
            async let fetchedInvites = HouseholdService.fetchHouseholdInvites(householdId: householdId)
            async let fetchedCategories = HouseholdService.fetchCategories(householdId: householdId)
            transactions = try await fetchedTransactions
            pendingInvites = try await fetchedInvites
            let categories = try await fetchedCategories
            expenseCategories = categories.expense
            incomeCategories = categories.income
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func deleteTransactions(at offsets: IndexSet) {
        let toDelete = offsets.map { filteredTransactions[$0] }
        transactions.removeAll { transaction in toDelete.contains(where: { $0.id == transaction.id }) }

        Task {
            for transaction in toDelete {
                do {
                    try await TransactionService.deleteTransaction(transaction)
                } catch {
                    errorMessage = error.localizedDescription
                    await loadData()
                    return
                }
            }
        }
    }
}

private struct CategoryManagementView: View {
    @Environment(\.dismiss) private var dismiss
    let householdId: String
    let onSaved: ([String], [String]) -> Void

    @State private var expenseCategories: [String]
    @State private var incomeCategories: [String]
    @State private var selectedType: TransactionType = .expense
    @State private var newCategory = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(householdId: String, expenseCategories: [String], incomeCategories: [String], onSaved: @escaping ([String], [String]) -> Void) {
        self.householdId = householdId
        self.onSaved = onSaved
        _expenseCategories = State(initialValue: expenseCategories)
        _incomeCategories = State(initialValue: incomeCategories)
    }

    private var categories: [String] {
        selectedType == .expense ? expenseCategories : incomeCategories
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Type", selection: $selectedType) {
                        ForEach(TransactionType.allCases) { type in
                            Text(type.label).tag(type)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                Section("\(selectedType.label) categories") {
                    ForEach(categories, id: \.self) { category in
                        Text(category)
                    }
                    .onDelete(perform: removeCategories)
                }

                Section("Add category") {
                    HStack {
                        TextField("Category name", text: $newCategory)
                        Button("Add", action: addCategory)
                            .disabled(newCategory.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)
                    }
                }
            }
            .navigationTitle("Categories")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .alert("Could Not Save Categories", isPresented: .constant(errorMessage != nil)) {
                Button("OK") { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    private func addCategory() {
        let name = newCategory.trimmingCharacters(in: .whitespacesAndNewlines)
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
        guard !name.isEmpty else { return }
        guard !categories.contains(where: { $0.caseInsensitiveCompare(name) == .orderedSame }) else {
            errorMessage = "That category already exists."
            return
        }
        save(selectedType == .expense ? categories + [name] : expenseCategories,
             selectedType == .income ? categories + [name] : incomeCategories)
    }

    private func removeCategories(at offsets: IndexSet) {
        guard categories.count - offsets.count > 0 else {
            errorMessage = "Keep at least one category in each list."
            return
        }
        let remaining = categories.enumerated().filter { !offsets.contains($0.offset) }.map(\.element)
        save(selectedType == .expense ? remaining : expenseCategories,
             selectedType == .income ? remaining : incomeCategories)
    }

    private func save(_ expense: [String], _ income: [String]) {
        isSaving = true
        Task {
            defer { isSaving = false }
            do {
                try await HouseholdService.updateCategories(householdId: householdId, expense: expense, income: income)
                expenseCategories = expense
                incomeCategories = income
                newCategory = ""
                onSaved(expense, income)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}
struct SummaryCard: View {
    let summary: (income: Double, expenses: Double, balance: Double)

    var body: some View {
        VStack(spacing: 16) {
            Text("Balance")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            Text(AppConstants.formatCurrency(summary.balance))
                .font(.system(size: 36, weight: .bold, design: .rounded))
                .foregroundStyle(summary.balance >= 0 ? .green : .red)

            HStack {
                VStack {
                    Text("Income")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(AppConstants.formatCurrency(summary.income))
                        .font(.headline)
                        .foregroundStyle(.green)
                }
                .frame(maxWidth: .infinity)

                VStack {
                    Text("Expenses")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(AppConstants.formatCurrency(summary.expenses))
                        .font(.headline)
                        .foregroundStyle(.red)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        .padding(.vertical, 8)
    }
}

struct TransactionRowView: View {
    let transaction: Transaction

    private var formattedDate: String {
        transaction.timestamp.formatted(date: .abbreviated, time: .shortened)
    }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: transaction.type.symbol)
                .foregroundStyle(transaction.type == .income ? .green : .red)
                .font(.title3)

            VStack(alignment: .leading, spacing: 4) {
                Text(transaction.category)
                    .font(.headline)
                if !transaction.note.isEmpty {
                    Text(transaction.note)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Text(formattedDate)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("Added by \(transaction.createdByName)")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }

            Spacer()

            Text(AppConstants.formatCurrency(abs(transaction.amount)))
                .font(.headline)
                .foregroundStyle(transaction.type == .income ? .green : .primary)
        }
        .padding(.vertical, 4)
    }
}
