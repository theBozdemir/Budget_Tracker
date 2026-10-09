import SwiftUI

struct HouseholdListView: View {
    @Environment(AuthManager.self) private var authManager

    @State private var households: [Household] = []
    @State private var isLoading = false
    @State private var showingCreateSheet = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Group {
                if isLoading && households.isEmpty {
                    ProgressView("Loading households...")
                } else if households.isEmpty {
                    ContentUnavailableView {
                        Label("No Households", systemImage: "house")
                    } description: {
                        Text("Create a household for your family or roommates. Each group keeps its finances private.")
                    } actions: {
                        Button("Create Household") {
                            showingCreateSheet = true
                        }
                        .buttonStyle(.borderedProminent)
                    }
                } else {
                    List(households) { household in
                        NavigationLink(value: household) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(household.name)
                                    .font(.headline)
                                Text("\(household.memberIds.count) member\(household.memberIds.count == 1 ? "" : "s")")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
            }
            .navigationTitle("Households")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingCreateSheet = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .navigationDestination(for: Household.self) { household in
                HouseholdDetailView(household: household)
            }
            .sheet(isPresented: $showingCreateSheet) {
                CreateHouseholdView { newHousehold in
                    households.append(newHousehold)
                }
            }
            .refreshable {
                await loadHouseholds()
            }
            .task {
                await loadHouseholds()
            }
            .alert("Error", isPresented: .constant(errorMessage != nil)) {
                Button("OK") { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    private func loadHouseholds() async {
        guard let userId = authManager.user?.uid else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            households = try await HouseholdService.fetchHouseholds(for: userId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct CreateHouseholdView: View {
    @Environment(AuthManager.self) private var authManager
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    let onCreated: (Household) -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section("Household name") {
                    TextField("e.g. Our Family, Apartment 402", text: $name)
                }

                Section {
                    Text("Only members of this household can see its transactions. You can invite others after creating it.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("New Household")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        Task { await create() }
                    }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)
                }
            }
            .alert("Error", isPresented: .constant(errorMessage != nil)) {
                Button("OK") { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    private func create() async {
        guard let user = authManager.user else { return }
        isSaving = true
        defer { isSaving = false }

        do {
            let household = try await HouseholdService.createHousehold(
                name: name,
                user: user,
                profile: authManager.profile
            )
            onCreated(household)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
