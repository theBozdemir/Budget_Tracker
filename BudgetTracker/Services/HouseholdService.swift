import Foundation
import FirebaseAuth
import FirebaseFirestore

@MainActor
enum HouseholdService {
    private static let db = Firestore.firestore()

    static func fetchHouseholds(for userId: String) async throws -> [Household] {
        let snapshot = try await db.collection("households")
            .whereField("memberIds", arrayContains: userId)
            .getDocuments()

        return snapshot.documents
            .compactMap { try? $0.data(as: Household.self) }
            .sorted { $0.createdAt < $1.createdAt }
    }

    static func createHousehold(name: String, user: User, profile: UserProfile?) async throws -> Household {
        let household = Household(
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            memberIds: [user.uid],
            createdBy: user.uid
        )

        let ref = db.collection("households").document()
        var newHousehold = household
        newHousehold.id = ref.documentID
        try ref.setData(from: newHousehold)
        return newHousehold
    }

    static func inviteMember(
        email: String,
        household: Household,
        invitedBy user: User,
        profile: UserProfile?
    ) async throws {
        guard let householdId = household.id else { return }

        let normalizedEmail = email.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedEmail.isEmpty else {
            throw InviteError.invalidEmail
        }

        if let currentEmail = user.email?.lowercased(), currentEmail == normalizedEmail {
            throw InviteError.cannotInviteSelf
        }

        let existing = try await db.collection("invites")
            .whereField("householdId", isEqualTo: householdId)
            .whereField("email", isEqualTo: normalizedEmail)
            .whereField("status", isEqualTo: InviteStatus.pending.rawValue)
            .getDocuments()

        if !existing.documents.isEmpty {
            throw InviteError.alreadyInvited
        }

        let invite = PendingInvite(
            householdId: householdId,
            householdName: household.name,
            email: normalizedEmail,
            invitedBy: user.uid,
            invitedByName: profile?.displayName ?? user.displayName ?? "Someone"
        )

        try db.collection("invites").addDocument(from: invite)
    }

    static func fetchHouseholdInvites(householdId: String) async throws -> [PendingInvite] {
        let snapshot = try await db.collection("invites")
            .whereField("householdId", isEqualTo: householdId)
            .whereField("status", isEqualTo: InviteStatus.pending.rawValue)
            .getDocuments()

        return snapshot.documents
            .compactMap { try? $0.data(as: PendingInvite.self) }
            .sorted { $0.createdAt > $1.createdAt }
    }
}

enum InviteError: LocalizedError {
    case invalidEmail
    case cannotInviteSelf
    case alreadyInvited

    var errorDescription: String? {
        switch self {
        case .invalidEmail: return "Please enter a valid email address."
        case .cannotInviteSelf: return "You are already in this household."
        case .alreadyInvited: return "This person already has a pending invite."
        }
    }
}
