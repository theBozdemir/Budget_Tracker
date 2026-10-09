import SwiftUI

struct InviteMemberView: View {
    @Environment(AuthManager.self) private var authManager
    @Environment(\.dismiss) private var dismiss

    let household: Household
    let onInvited: () -> Void

    @State private var email = ""
    @State private var isSending = false
    @State private var successMessage: String?
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Email address") {
                    TextField("partner@email.com", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                }

                Section {
                    Text("They'll receive an email invite to join \"\(household.name)\". Once they sign up with this email, they'll see the invite in the app.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Invite Member")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Send") {
                        Task { await sendInvite() }
                    }
                    .disabled(email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSending)
                }
            }
            .alert("Invite Sent", isPresented: .constant(successMessage != nil)) {
                Button("OK") {
                    successMessage = nil
                    dismiss()
                }
            } message: {
                Text(successMessage ?? "")
            }
            .alert("Error", isPresented: .constant(errorMessage != nil)) {
                Button("OK") { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    private func sendInvite() async {
        guard let user = authManager.user else { return }
        isSending = true
        defer { isSending = false }

        do {
            try await HouseholdService.inviteMember(
                email: email,
                household: household,
                invitedBy: user,
                profile: authManager.profile
            )
            onInvited()
            successMessage = "An invite was sent to \(email.lowercased()). They can accept it after creating an account."
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct PendingInvitesView: View {
    @Environment(AuthManager.self) private var authManager

    @State private var isProcessing = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            List(authManager.pendingInvites) { invite in
                VStack(alignment: .leading, spacing: 8) {
                    Text(invite.householdName)
                        .font(.headline)
                    Text("Invited by \(invite.invitedByName)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    Button("Accept Invite") {
                        Task { await accept(invite) }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(isProcessing)
                }
                .padding(.vertical, 4)
            }
            .navigationTitle("Pending Invites")
            .alert("Error", isPresented: .constant(errorMessage != nil)) {
                Button("OK") { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    private func accept(_ invite: PendingInvite) async {
        isProcessing = true
        defer { isProcessing = false }

        do {
            try await authManager.acceptInvite(invite)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct ProfileView: View {
    @Environment(AuthManager.self) private var authManager

    var body: some View {
        NavigationStack {
            List {
                Section("Account") {
                    if let profile = authManager.profile {
                        LabeledContent("Name", value: profile.displayName)
                        LabeledContent("Email", value: profile.email)
                    }
                }

                Section {
                    Button("Sign Out", role: .destructive) {
                        authManager.signOut()
                    }
                }
            }
            .navigationTitle("Profile")
        }
    }
}
