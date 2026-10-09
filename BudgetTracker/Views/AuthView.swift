import SwiftUI

struct AuthView: View {
    @State private var isSignUp = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                VStack(spacing: 8) {
                    Image(systemName: "dollarsign.circle.fill")
                        .font(.system(size: 64))
                        .foregroundStyle(.green)

                    Text("Budget Tracker")
                        .font(.largeTitle.bold())

                    Text("Shared households. Private groups.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 32)

                if isSignUp {
                    SignUpView(isSignUp: $isSignUp)
                } else {
                    SignInView(isSignUp: $isSignUp)
                }

                Spacer()
            }
            .padding()
            .navigationBarHidden(true)
        }
    }
}

struct SignInView: View {
    @Environment(AuthManager.self) private var authManager
    @Binding var isSignUp: Bool

    @State private var email = ""
    @State private var password = ""
    @State private var showingForgotPassword = false

    var body: some View {
        VStack(spacing: 16) {
            TextField("Email", text: $email)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .autocapitalization(.none)
                .textFieldStyle(.roundedBorder)

            SecureField("Password", text: $password)
                .textContentType(.password)
                .textFieldStyle(.roundedBorder)

            if let error = authManager.errorMessage {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }

            Button {
                Task {
                    await authManager.signIn(email: email, password: password)
                }
            } label: {
                if authManager.isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                } else {
                    Text("Sign In")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(email.isEmpty || password.isEmpty || authManager.isLoading)

            Button("Forgot password?") {
                authManager.errorMessage = nil
                showingForgotPassword = true
            }
            .font(.footnote)

            Button("Create an account") {
                authManager.errorMessage = nil
                isSignUp = true
            }
            .font(.footnote)
        }
        .sheet(isPresented: $showingForgotPassword) {
            ForgotPasswordView(initialEmail: email)
        }
    }
}

struct ForgotPasswordView: View {
    @Environment(AuthManager.self) private var authManager
    @Environment(\.dismiss) private var dismiss

    @State private var email: String
    @State private var successMessage: String?

    init(initialEmail: String = "") {
        _email = State(initialValue: initialEmail)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Email", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                } footer: {
                    Text("We'll email you a link to reset your password.")
                }

                if let successMessage {
                    Section {
                        Text(successMessage)
                            .foregroundStyle(.green)
                    }
                }
            }
            .navigationTitle("Reset Password")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Send") {
                        Task { await sendReset() }
                    }
                    .disabled(email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || authManager.isLoading)
                }
            }
        }
    }

    private func sendReset() async {
        successMessage = nil
        await authManager.resetPassword(email: email)
        if authManager.errorMessage == nil {
            successMessage = "Password reset email sent. Check your inbox and spam folder."
        }
    }
}

struct SignUpView: View {
    @Environment(AuthManager.self) private var authManager
    @Binding var isSignUp: Bool

    @State private var displayName = ""
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        VStack(spacing: 16) {
            TextField("Your name", text: $displayName)
                .textContentType(.name)
                .textFieldStyle(.roundedBorder)

            TextField("Email", text: $email)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .autocapitalization(.none)
                .textFieldStyle(.roundedBorder)

            SecureField("Password (6+ characters)", text: $password)
                .textContentType(.newPassword)
                .textFieldStyle(.roundedBorder)

            if let error = authManager.errorMessage {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }

            Button {
                Task {
                    await authManager.signUp(displayName: displayName, email: email, password: password)
                }
            } label: {
                if authManager.isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                } else {
                    Text("Create Account")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(displayName.isEmpty || email.isEmpty || password.count < 6 || authManager.isLoading)

            Button("Already have an account? Sign in") {
                authManager.errorMessage = nil
                isSignUp = false
            }
            .font(.footnote)
        }
    }
}
