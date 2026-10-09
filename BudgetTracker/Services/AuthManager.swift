import Foundation
import FirebaseAuth
import FirebaseFirestore
import Observation

@Observable
@MainActor
final class AuthManager {
    var user: User?
    var profile: UserProfile?
    var pendingInvites: [PendingInvite] = []
    var isLoading = false
    var errorMessage: String?

    private let auth = Auth.auth()
    private let db = Firestore.firestore()
    nonisolated(unsafe) private var authListener: AuthStateDidChangeListenerHandle?

    var isSignedIn: Bool { user != nil }

    init() {
        authListener = auth.addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in
                self?.user = user
                if let user {
                    await self?.loadProfile(for: user)
                    await self?.loadPendingInvites(for: user)
                } else {
                    self?.profile = nil
                    self?.pendingInvites = []
                }
            }
        }
    }

    deinit {
        if let authListener {
            Auth.auth().removeStateDidChangeListener(authListener)
        }
    }

    func signIn(email: String, password: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let result = try await auth.signIn(withEmail: email.lowercased(), password: password)
            user = result.user
            await loadProfile(for: result.user)
            await loadPendingInvites(for: result.user)
        } catch {
            errorMessage = Self.authErrorMessage(from: error)
            print("Sign in failed:", error)
        }
    }

    func signUp(displayName: String, email: String, password: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let result = try await auth.createUser(withEmail: email.lowercased(), password: password)
            let changeRequest = result.user.createProfileChangeRequest()
            changeRequest.displayName = displayName
            try await changeRequest.commitChanges()

            let profile = UserProfile(
                id: result.user.uid,
                displayName: displayName,
                email: email.lowercased()
            )
            try db.collection("users").document(result.user.uid).setData(from: profile)

            user = result.user
            self.profile = profile
            await loadPendingInvites(for: result.user)
        } catch {
            errorMessage = Self.authErrorMessage(from: error)
            print("Sign up failed:", error)
        }
    }

    private static func authErrorMessage(from error: Error) -> String {
        let nsError = error as NSError

        if nsError.domain == AuthErrorDomain,
           let code = AuthErrorCode(rawValue: nsError.code) {
            switch code {
            case .operationNotAllowed:
                return "Email/Password sign-in is not enabled in Firebase. Turn it on under Authentication → Sign-in method."
            case .emailAlreadyInUse:
                return "An account with this email already exists. Try signing in instead."
            case .invalidEmail:
                return "That email address doesn't look valid."
            case .weakPassword:
                return "Password is too weak. Use at least 6 characters."
            case .networkError:
                return "Network error. Check your internet connection and try again."
            case .internalError:
                return "Firebase auth error. In Firebase Console, enable Email/Password under Authentication → Sign-in method, then try again."
            case .userNotFound:
                return "No account found with this email."
            default:
                break
            }
        }

        return nsError.localizedDescription
    }

    func resetPassword(email: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            try await auth.sendPasswordReset(withEmail: email.lowercased())
            errorMessage = nil
        } catch {
            errorMessage = Self.authErrorMessage(from: error)
        }
    }

    func signOut() {
        do {
            try auth.signOut()
            user = nil
            profile = nil
            pendingInvites = []
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func acceptInvite(_ invite: PendingInvite) async throws {
        guard let user, let inviteId = invite.id else { return }

        let householdRef = db.collection("households").document(invite.householdId)
        _ = try await db.runTransaction { transaction, errorPointer in
            let snapshot: DocumentSnapshot
            do {
                snapshot = try transaction.getDocument(householdRef)
            } catch {
                errorPointer?.pointee = error as NSError
                return nil
            }

            guard var household = try? snapshot.data(as: Household.self) else {
                return nil
            }

            if !household.memberIds.contains(user.uid) {
                household.memberIds.append(user.uid)
                do {
                    try transaction.setData(from: household, forDocument: householdRef)
                } catch {
                    errorPointer?.pointee = error as NSError
                    return nil
                }
            }

            transaction.updateData(["status": InviteStatus.accepted.rawValue], forDocument: self.db.collection("invites").document(inviteId))
            return nil
        }

        await loadPendingInvites(for: user)
    }

    private func loadProfile(for user: User) async {
        do {
            let doc = try await db.collection("users").document(user.uid).getDocument()
            profile = try doc.data(as: UserProfile.self)
        } catch {
            profile = UserProfile(
                id: user.uid,
                displayName: user.displayName ?? "User",
                email: user.email ?? ""
            )
        }
    }

    private func loadPendingInvites(for user: User) async {
        guard let email = user.email?.lowercased() else {
            pendingInvites = []
            return
        }

        do {
            let snapshot = try await db.collection("invites")
                .whereField("email", isEqualTo: email)
                .whereField("status", isEqualTo: InviteStatus.pending.rawValue)
                .getDocuments()

            pendingInvites = snapshot.documents.compactMap { try? $0.data(as: PendingInvite.self) }
        } catch {
            pendingInvites = []
        }
    }
}
