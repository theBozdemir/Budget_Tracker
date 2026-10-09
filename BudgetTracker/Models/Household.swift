import Foundation
import FirebaseFirestore

struct Household: Identifiable, Codable, Hashable {
    @DocumentID var id: String?
    var name: String
    var memberIds: [String]
    var createdBy: String
    var createdAt: Date

    init(
        id: String? = nil,
        name: String,
        memberIds: [String],
        createdBy: String,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.name = name
        self.memberIds = memberIds
        self.createdBy = createdBy
        self.createdAt = createdAt
    }
}
