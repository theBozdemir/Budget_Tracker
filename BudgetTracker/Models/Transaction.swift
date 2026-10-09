import Foundation
import FirebaseFirestore

struct Transaction: Identifiable, Codable, Hashable {
    @DocumentID var id: String?
    var householdId: String
    var amount: Double
    var type: TransactionType
    var category: String
    var note: String
    var timestamp: Date
    var createdBy: String
    var createdByName: String
    var createdAt: Date

    init(
        id: String? = nil,
        householdId: String,
        amount: Double,
        type: TransactionType,
        category: String,
        note: String = "",
        timestamp: Date = Date(),
        createdBy: String,
        createdByName: String,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.householdId = householdId
        self.amount = amount
        self.type = type
        self.category = category
        self.note = note
        self.timestamp = timestamp
        self.createdBy = createdBy
        self.createdByName = createdByName
        self.createdAt = createdAt
    }

    var signedAmount: Double {
        type == .expense ? -abs(amount) : abs(amount)
    }
}
