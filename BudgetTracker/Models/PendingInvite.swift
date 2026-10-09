import Foundation
import FirebaseFirestore

enum InviteStatus: String, Codable {
    case pending
    case accepted
}

struct PendingInvite: Identifiable, Codable, Hashable {
    @DocumentID var id: String?
    var householdId: String
    var householdName: String
    var email: String
    var invitedBy: String
    var invitedByName: String
    var status: InviteStatus
    var createdAt: Date

    init(
        id: String? = nil,
        householdId: String,
        householdName: String,
        email: String,
        invitedBy: String,
        invitedByName: String,
        status: InviteStatus = .pending,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.householdId = householdId
        self.householdName = householdName
        self.email = email.lowercased()
        self.invitedBy = invitedBy
        self.invitedByName = invitedByName
        self.status = status
        self.createdAt = createdAt
    }
}
