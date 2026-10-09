import Foundation
import FirebaseFirestore

struct UserProfile: Identifiable, Codable {
    @DocumentID var id: String?
    var displayName: String
    var email: String
    var createdAt: Date

    init(id: String? = nil, displayName: String, email: String, createdAt: Date = Date()) {
        self.id = id
        self.displayName = displayName
        self.email = email.lowercased()
        self.createdAt = createdAt
    }
}
