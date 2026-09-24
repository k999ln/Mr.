import SwiftUI

struct SettingsView: View {
    @ObservedObject var model: AppViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var confirmCall = false
    @State private var confirmDelete = false

    private var copy: LMCopy { LMCopy(locale: model.locale) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    connectionSection
                    profileSection
                    callsSection
                    subscriptionSection
                    if model.isPreview { previewSection }
                    accountSection
                }
                .padding(16)
            }
            .background(LMTheme.canvas)
            .navigationTitle(copy.settings)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(copy.close) { dismiss() }
                        .accessibilityIdentifier(AccessibilityID.settingsClose)
                }
            }
            .alert(copy.callNow, isPresented: $confirmCall) {
                Button(copy.cancel, role: .cancel) {}
                Button(copy.confirm) { Task { await model.testCall() } }
            } message: {
                Text(copy.callConfirmation)
            }
            .alert(copy.deleteAccount, isPresented: $confirmDelete) {
                Button(copy.cancel, role: .cancel) {}
                Button(copy.deleteAccount, role: .destructive) {
                    Task { await model.deleteAccount() }
                }
            } message: {
                Text(copy.deleteConfirmation)
            }
        }
        .tint(LMTheme.ink)
    }

    private var connectionSection: some View {
        settingsCard(title: copy.calendar, icon: "calendar") {
            HStack {
                Circle()
                    .fill(calendarColor)
                    .frame(width: 9, height: 9)
                Text(calendarLabel)
                    .font(.body.weight(.semibold))
                Spacer()
                Image(systemName: "lock.open")
                    .foregroundStyle(LMTheme.muted)
            }
        }
    }

    private var profileSection: some View {
        settingsCard(title: copy.profileTitle, icon: "person.crop.circle") {
            settingValue(copy.name, model.profile?.name ?? model.name)
            Divider()
            settingValue(copy.home, model.profile?.home.display ?? model.homeAddress)
            Divider()
            VStack(alignment: .leading, spacing: 8) {
                Text(copy.language).font(.caption).foregroundStyle(LMTheme.muted)
                Picker(copy.language, selection: localeBinding) {
                    Text("English").tag(ProductLocale.en)
                    Text("日本語").tag(ProductLocale.ja)
                }
                .pickerStyle(.segmented)
            }
        }
    }

    private var callsSection: some View {
        settingsCard(title: copy.calls, icon: "phone") {
            if let masked = model.profile?.phone.masked {
                settingValue(copy.phoneTitle, masked)
            } else {
                settingValue(copy.phoneTitle, copy.callsOff)
            }

            Divider()

            Toggle(copy.calls, isOn: callsEnabledBinding)
                .disabled(model.profile?.phone.status != .configured)

            if model.profile?.callsEnabled == true {
                Picker(copy.callLanguage, selection: callLanguageBinding) {
                    Text("English").tag(ProductLocale.en)
                    Text("日本語").tag(ProductLocale.ja)
                }
                .pickerStyle(.segmented)

                Button(copy.callNow) { confirmCall = true }
                    .buttonStyle(LMSecondaryButtonStyle())
            }
        }
    }

    private var subscriptionSection: some View {
        settingsCard(title: copy.subscription, icon: "star") {
            Button(copy.upgrade) { model.showPurchaseUnavailable() }
                .buttonStyle(LMPrimaryButtonStyle())
            Button(copy.restore) { model.showPurchaseUnavailable() }
                .buttonStyle(LMSecondaryButtonStyle())
            if let receipt = model.previewReceipt {
                Text(receipt)
                    .font(.footnote)
                    .foregroundStyle(LMTheme.muted)
            }
        }
    }

    private var previewSection: some View {
        settingsCard(title: copy.previewScenario, icon: "eye") {
            Picker(copy.previewScenario, selection: previewScenarioBinding) {
                ForEach(PreviewScenario.allCases) { scenario in
                    Text(previewLabel(scenario)).tag(scenario)
                }
            }
            .pickerStyle(.menu)
            Text(copy.previewDisclosure)
                .font(.footnote)
                .foregroundStyle(LMTheme.muted)
        }
    }

    private var accountSection: some View {
        settingsCard(title: "", icon: "person.crop.circle.badge.xmark") {
            Button(copy.logout) {
                Task { await model.signOut() }
                dismiss()
            }
            .buttonStyle(LMSecondaryButtonStyle())
            .accessibilityIdentifier(AccessibilityID.settingsLogout)

            Button(copy.deleteAccount, role: .destructive) {
                confirmDelete = true
            }
            .font(.headline)
            .foregroundStyle(LMTheme.danger)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .accessibilityIdentifier(AccessibilityID.settingsDelete)
        }
    }

    private func settingsCard<Content: View>(
        title: String,
        icon: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            if !title.isEmpty {
                Label(title, systemImage: icon)
                    .font(.headline.weight(.black))
            }
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .lmCard()
    }

    private func settingValue(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label).font(.caption).foregroundStyle(LMTheme.muted)
            Text(value).font(.body.weight(.semibold))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var localeBinding: Binding<ProductLocale> {
        Binding(
            get: { model.locale },
            set: { value in Task { await model.changeLocale(value) } }
        )
    }

    private var callsEnabledBinding: Binding<Bool> {
        Binding(
            get: { model.profile?.callsEnabled ?? false },
            set: { value in Task { await model.setCallsEnabled(value) } }
        )
    }

    private var callLanguageBinding: Binding<ProductLocale> {
        Binding(
            get: { model.profile?.callLanguage ?? model.locale },
            set: { value in Task { await model.setCallLanguage(value) } }
        )
    }

    private var previewScenarioBinding: Binding<PreviewScenario> {
        Binding(
            get: { model.selectedPreviewScenario },
            set: { value in Task { await model.changePreviewScenario(value) } }
        )
    }

    private var calendarLabel: String {
        switch model.calendarStatus {
        case .connected: copy.connected
        case .actionRequired: copy.actionRequired
        case .error: copy.error
        case .disconnected: copy.disconnected
        }
    }

    private var calendarColor: Color {
        switch model.calendarStatus {
        case .connected: LMTheme.lime
        case .actionRequired: LMTheme.warning
        case .error: LMTheme.danger
        case .disconnected: LMTheme.muted
        }
    }

    private func previewLabel(_ scenario: PreviewScenario) -> String {
        switch scenario {
        case .routeReady: copy.routeReady
        case .needsInformation: copy.needsInformation
        case .noUpcomingEvent: copy.noUpcomingEvent
        case .routeUnavailable: copy.routeUnavailable
        case .failed: copy.failed
        }
    }
}
