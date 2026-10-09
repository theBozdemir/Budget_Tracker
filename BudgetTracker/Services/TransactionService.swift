import Foundation
import FirebaseFirestore

@MainActor
enum TransactionService {
    private static let db = Firestore.firestore()

    static func fetchTransactions(householdId: String) async throws -> [Transaction] {
        let snapshot = try await db.collection("transactions")
            .whereField("householdId", isEqualTo: householdId)
            .getDocuments()

        return snapshot.documents
            .compactMap { try? $0.data(as: Transaction.self) }
            .sorted { $0.timestamp > $1.timestamp }
    }

    static func addTransaction(_ transaction: Transaction) async throws {
        try db.collection("transactions").addDocument(from: transaction)
    }

    static func deleteTransaction(_ transaction: Transaction) async throws {
        guard let id = transaction.id else { return }
        try await db.collection("transactions").document(id).delete()
    }

    static func summary(for transactions: [Transaction]) -> (income: Double, expenses: Double, balance: Double) {
        let income = transactions
            .filter { $0.type == .income }
            .reduce(0) { $0 + abs($1.amount) }

        let expenses = transactions
            .filter { $0.type == .expense }
            .reduce(0) { $0 + abs($1.amount) }

        return (income, expenses, income - expenses)
    }
}
