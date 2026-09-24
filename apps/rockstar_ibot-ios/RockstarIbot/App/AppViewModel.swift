import Foundation

enum AppRoute: Equatable {
    case restoring
    case welcome
    case calendarConnecting
    case profile
    case phone
    case analyzing
    case chat
}

struct AppErrorState: Identifiable, Equatable, Sendable {
    let id = UUID()
    let message: String
    let canRetry: Bool

    static func == (lhs: AppErrorState, rhs: AppErrorState) -> Bool {
        lhs.message == rhs.message && lhs.canRetry == rhs.canRetry
    }
}

@MainActor
final class AppViewModel: ObservableObject {
    @Published private(set) var route: AppRoute = .restoring
    @Published var locale: ProductLocale
    @Published var name = ""
    @Published var homeAddress = ""
    @Published var phoneNumber = ""
    @Published private(set) var profile: UserProfile?
    @Published private(set) var calendarStatus: CalendarConnectionStatus = .disconnected
    @Published private(set) var analysisStatus: AnalysisStatus = .idle
    @Published private(set) var analysisPhase: AnalysisPhase = .readingEvents
    @Published var errorState: AppErrorState?
    @Published var isRouteDetailPresented = false
    @Published var selectedRoute: RouteProjection?
    @Published var isPaywallPresented = false
    @Published var isSettingsPresented = false
    @Published var isCommandCenterPresented = false
    @Published var selectedPreviewScenario: PreviewScenario = .routeReady
    @Published var previewReceipt: String?

    let environment: AppEnvironment
    let chat: ChatViewModel
    let operatingHub: OperatingHubViewModel

    init(environment: AppEnvironment) {
        self.environment = environment
        locale = .preferred()
        chat = ChatViewModel(service: environment.chat)
        operatingHub = OperatingHubViewModel(
            service: environment.operating,
            mode: environment.operatingSurfaceMode
        )
    }

    var isPreview: Bool { environment.configuration.previewMode }
    var canContinueProfile: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !homeAddress.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var isValidPhone: Bool {
        let candidate = phoneNumber.trimmingCharacters(in: .whitespacesAndNewlines)
        guard candidate.hasPrefix("+") else { return false }
        return candidate.dropFirst().allSatisfy(\.isNumber) && (8...15).contains(candidate.count - 1)
    }

    func start() async {
        route = .restoring
        do {
            guard try await environment.auth.restoreSession() != nil else {
                route = .welcome
                return
            }
            let bootstrap = try await environment.bootstrap.fetchBootstrap()
            apply(bootstrap)
            if bootstrap.user.name == nil || bootstrap.user.home.status == .missing {
                route = .profile
            } else {
                route = .chat
                await chat.load(reset: true)
            }
        } catch {
            route = .welcome
            present(error)
        }
    }

    func connectCalendar() async {
        guard route == .welcome else { return }
        route = .calendarConnecting
        errorState = nil
        do {
            _ = try await environment.auth.connectCalendar()
            calendarStatus = .connected
            route = .profile
        } catch {
            calendarStatus = .error
            route = .welcome
            present(error)
        }
    }

    func saveProfile() async {
        guard canContinueProfile else { return }
        do {
            let updated = try await environment.profile.update(
                ProfileDraft(
                    name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                    homeAddress: homeAddress.trimmingCharacters(in: .whitespacesAndNewlines),
                    productLocale: locale,
                    phone: nil,
                    callsEnabled: false,
                    callLanguage: nil
                ),
                idempotencyKey: UUID()
            )
            profile = updated
            route = .phone
        } catch {
            present(error)
        }
    }

    func skipPhone() async {
        await persistPhone(nil)
    }

    func addPhone() async {
        guard isValidPhone else { return }
        await persistPhone(phoneNumber.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private func persistPhone(_ phone: String?) async {
        guard let existingName = profile?.name ?? Optional(name), !existingName.isEmpty else { return }
        do {
            profile = try await environment.profile.update(
                ProfileDraft(
                    name: existingName,
                    homeAddress: profile?.home.display ?? homeAddress,
                    productLocale: locale,
                    phone: phone,
                    callsEnabled: false,
                    callLanguage: nil
                ),
                idempotencyKey: UUID()
            )
            await runAnalysis()
        } catch {
            present(error)
        }
    }

    func runAnalysis() async {
        route = .analyzing
        analysisStatus = .running
        analysisPhase = .readingEvents
        errorState = nil
        do {
            let response = try await environment.analysis.analyzeNextCommitment(idempotencyKey: UUID())
            analysisStatus = response.status
            await chat.load(reset: true)
            route = .chat
            if response.status == .routeReady {
                isPaywallPresented = true
            }
        } catch {
            analysisStatus = .failed
            route = .chat
            present(error)
        }
    }

    func refreshChat() async {
        await chat.load(reset: true)
    }

    func showCommandCenter() {
        isCommandCenterPresented = true
    }

    func showRoute(_ route: RouteProjection) {
        selectedRoute = route
        isRouteDetailPresented = true
    }

    func dismissPaywall() {
        isPaywallPresented = false
    }

    func changePreviewScenario(_ scenario: PreviewScenario) async {
        guard isPreview, let service = environment.previewService else { return }
        selectedPreviewScenario = scenario
        await service.setScenario(scenario)
        analysisStatus = scenario.status
        let page = PreviewFixtures.page(scenario, locale: locale)
        chat.replaceWithPreview(page)
    }

    func changeLocale(_ newLocale: ProductLocale) async {
        locale = newLocale
        guard isPreview, let service = environment.previewService else { return }
        let draft = ProfileDraft(
            name: profile?.name ?? name,
            homeAddress: profile?.home.display ?? homeAddress,
            productLocale: newLocale,
            phone: nil,
            callsEnabled: profile?.callsEnabled ?? false,
            callLanguage: profile?.callLanguage
        )
        profile = try? await environment.profile.update(draft, idempotencyKey: UUID())
        await service.setScenario(selectedPreviewScenario)
        chat.replaceWithPreview(PreviewFixtures.page(selectedPreviewScenario, locale: newLocale))
    }

    func testCall() async {
        do {
            let receipt = try await environment.account.testCall(idempotencyKey: UUID())
            previewReceipt = receipt.message
        } catch {
            present(error)
        }
    }

    func setCallsEnabled(_ enabled: Bool) async {
        guard var current = profile else { return }
        guard current.phone.status == .configured else {
            previewReceipt = LMCopy(locale: locale).invalidPhone
            return
        }
        do {
            current = try await environment.profile.update(
                ProfileDraft(
                    name: current.name ?? name,
                    homeAddress: current.home.display ?? homeAddress,
                    productLocale: locale,
                    phone: phoneNumber.isEmpty ? nil : phoneNumber,
                    callsEnabled: enabled,
                    callLanguage: enabled ? (current.callLanguage ?? locale) : nil
                ),
                idempotencyKey: UUID()
            )
            profile = current
        } catch {
            present(error)
        }
    }

    func setCallLanguage(_ language: ProductLocale) async {
        guard var current = profile, current.callsEnabled else { return }
        do {
            current = try await environment.profile.update(
                ProfileDraft(
                    name: current.name ?? name,
                    homeAddress: current.home.display ?? homeAddress,
                    productLocale: locale,
                    phone: phoneNumber.isEmpty ? nil : phoneNumber,
                    callsEnabled: true,
                    callLanguage: language
                ),
                idempotencyKey: UUID()
            )
            profile = current
        } catch {
            present(error)
        }
    }

    func showPurchaseUnavailable() {
        previewReceipt = LMCopy(locale: locale).purchasesUnavailable
    }

    func deleteAccount() async {
        do {
            let receipt = try await environment.account.deleteAccount(idempotencyKey: UUID())
            previewReceipt = receipt.message
            if !isPreview {
                try await environment.auth.signOut()
                route = .welcome
            }
        } catch {
            present(error)
        }
    }

    func signOut() async {
        do {
            try await environment.auth.signOut()
            profile = nil
            chat.replaceWithPreview(ChatPage(messages: [], nextCursor: nil))
            route = .welcome
            isSettingsPresented = false
        } catch {
            present(error)
        }
    }

    private func apply(_ bootstrap: BootstrapResponse) {
        profile = bootstrap.user
        locale = bootstrap.user.productLocale
        name = bootstrap.user.name ?? ""
        homeAddress = bootstrap.user.home.display ?? ""
        calendarStatus = bootstrap.calendar.status
        analysisStatus = bootstrap.analysis.status
    }

    private func present(_ error: Error) {
        let message = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        errorState = AppErrorState(message: message, canRetry: true)
    }
}
