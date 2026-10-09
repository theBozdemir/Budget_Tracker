import SwiftUI

struct HouseholdDetailView: View {
    @Environment(AuthManager.self) private var authManager

    let household: Household

    @State private var transactions: [Transaction] = []
    @State private var pendingInvites: [PendingInvite] = []
    @State private var isLoading = false
    @State private var showingAddTransaction = false
    @State private var showingInviteSheet = false
    @State private var errorMessage: String?

    private var summary: (income: Double, expenses: Double, balance: Double) {
        TransactionService.summary(for: transactions)
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
                                Text(invite.email)
                                    .font(.subheadline)
                                Text("Invited by \(invite.invitedByName)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text("Pending")
                                .font(.caption)
                                .foregroundStyle(.orange)
                        }
                    }
                }
            } header: {
                Text("Members")
            } footer: {
                Text("Any member can invite others. Invites are only for this household.")
            }

            Section("Transactions") {
                if transactions.isEmpty {
                    Text("No transactions yet. Add an expense or income to get started.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                ForEach(transactions) { transaction in
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
        .refreshable {
            await loadData()
        }
        .task {
            await loadData()
        }
        .alert("Error", isPresented: .constant(errorMessage != nil)) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private func loadData() async {
        guard let householdId = household.id else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            async let fetchedTransactions = TransactionService.fetchTransactions(householdId: householdId)
            async let fetchedInvites = HouseholdService.fetchHouseholdInvites(householdId: householdId)
            transactions = try await fetchedTransactions
            pendingInvites = try await fetchedInvites
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func deleteTransactions(at offsets: IndexSet) {
        let toDelete = offsets.map { transactions[$0] }
        transactions.remove(atOffsets: offsets)

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
