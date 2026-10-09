import SwiftUI

struct ContentView: View {
    @Environment(AuthManager.self) private var authManager

    var body: some View {
        Group {
            if authManager.isSignedIn {
                MainTabView()
            } else {
                AuthView()
            }
        }
        .animation(.easeInOut, value: authManager.isSignedIn)
    }
}

struct MainTabView: View {
    @Environment(AuthManager.self) private var authManager

    var body: some View {
        TabView {
            HouseholdListView()
                .tabItem {
                    Label("Households", systemImage: "house.fill")
                }

            if !authManager.pendingInvites.isEmpty {
                PendingInvitesView()
                    .tabItem {
                        Label("Invites", systemImage: "envelope.fill")
                    }
            }

            ProfileView()
                .tabItem {
                    Label("Profile", systemImage: "person.fill")
                }
        }
    }
}

#Preview {
    ContentView()
        .environment(AuthManager())
}
