import Foundation

@MainActor
final class PreviewAuthService: AuthServicing {
    private let sessionStore: any SessionStoring

    init(sessionStore: any SessionStoring) {
        self.sessionStore = sessionStore
    }

    func restoreSession() async throws -> MobileSession? {
        try await sessionStore.load()
    }

    func connectCalendar() async throws -> MobileSession {
        let session = MobileSession(
            accessToken: "preview-token-not-a-credential",
            refreshToken: "preview-refresh-not-a-credential",
            expiresAt: Date().addingTimeInterval(3_600)
        )
        try await sessionStore.save(session)
        return session
    }

    func signOut() async throws {
        try await sessionStore.clear()
    }
}

actor PreviewRockstarIbotService: BootstrapServicing, ProfileServicing, AnalysisServicing, ChatServicing, AccountServicing {
    private var locale: ProductLocale
    private var scenario: PreviewScenario = .routeReady

    init(locale: ProductLocale = .preferred()) {
        self.locale = locale
    }

    func setScenario(_ scenario: PreviewScenario) {
        self.scenario = scenario
    }

    func fetchBootstrap() async throws -> BootstrapResponse {
        PreviewFixtures.bootstrap(locale: locale)
    }

    func update(_ draft: ProfileDraft, idempotencyKey: UUID) async throws -> UserProfile {
        locale = draft.productLocale
        var profile = PreviewFixtures.profile(locale: locale)
        profile.name = draft.name
        profile.home = HomeProjection(status: .ready, display: draft.homeAddress)
        if let phone = draft.phone {
            profile.phone = PhoneProjection(status: .configured, masked: "••••\(phone.suffix(4))")
        }
        profile.callsEnabled = draft.callsEnabled
        profile.callLanguage = draft.callLanguage
        return profile
    }

    func analyzeNextCommitment(idempotencyKey: UUID) async throws -> AnalysisResponse {
        PreviewFixtures.analysis(scenario, locale: locale)
    }

    func fetch(after cursor: String?) async throws -> ChatPage {
        PreviewFixtures.page(scenario, locale: locale)
    }

    func reply(questionID: String, text: String, idempotencyKey: UUID) async throws -> ChatMessage {
        ChatMessage(
            id: "preview-reply-\(idempotencyKey.uuidString)",
            cursor: "preview-cursor-reply",
            createdAt: ISO8601DateFormatter().string(from: Date()),
            locale: locale,
            type: .system,
            text: locale == .ja
                ? "プレビュー回答を受け取りました。実際の予定は変更されていません。"
                : "Preview reply received. No real event was changed.",
            userContent: nil,
            question: nil,
            route: nil,
            actions: []
        )
    }

    func testCall(idempotencyKey: UUID) async throws -> CallReceipt {
        CallReceipt(
            status: "preview_only",
            message: locale == .ja ? "プレビューでは電話を発信しません。" : "Preview mode never places a call.",
            retryAfterSeconds: nil
        )
    }

    func deleteAccount(idempotencyKey: UUID) async throws -> DeletionReceipt {
        DeletionReceipt(
            receiptID: "preview-no-deletion",
            deletedAt: ISO8601DateFormatter().string(from: Date()),
            message: locale == .ja
                ? "プレビューのため、アカウントは削除されていません。"
                : "Preview mode did not delete an account."
        )
    }
}
