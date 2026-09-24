import Foundation

@MainActor
final class LiveAuthService: AuthServicing {
    private let apiClient: APIClient
    private let sessionStore: any SessionStoring
    private let configuration: AppConfiguration
    private let webAuthenticator: any CalendarWebAuthenticating

    init(
        apiClient: APIClient,
        sessionStore: any SessionStoring,
        configuration: AppConfiguration,
        webAuthenticator: (any CalendarWebAuthenticating)? = nil
    ) {
        self.apiClient = apiClient
        self.sessionStore = sessionStore
        self.configuration = configuration
        self.webAuthenticator = webAuthenticator ?? CalendarWebAuthenticator()
    }

    func restoreSession() async throws -> MobileSession? {
        try await sessionStore.load()
    }

    func connectCalendar() async throws -> MobileSession {
        let start: CalendarSessionStart = try await apiClient.send(
            .calendarStart,
            body: EmptyRequest(),
            idempotencyKey: UUID()
        )
        let callback = try await webAuthenticator.authenticate(
            at: start.authorizationURL,
            callbackScheme: configuration.callbackScheme
        )
        guard
            callback.scheme == configuration.callbackScheme,
            let components = URLComponents(url: callback, resolvingAgainstBaseURL: false),
            let code = components.queryItems?.first(where: { $0.name == "code" })?.value,
            !code.isEmpty
        else {
            throw APIError.invalidResponse
        }

        let session: MobileSession = try await apiClient.send(
            .sessionExchange,
            body: SessionExchangeRequest(callbackCode: code),
            idempotencyKey: UUID()
        )
        try await sessionStore.save(session)
        return session
    }

    func signOut() async throws {
        try await apiClient.sendWithoutResponse(
            .sessionDelete,
            body: EmptyRequest(),
            idempotencyKey: UUID()
        )
        try await sessionStore.clear()
    }
}

actor LiveRockstarIbotService: BootstrapServicing, ProfileServicing, AnalysisServicing, ChatServicing, AccountServicing {
    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func fetchBootstrap() async throws -> BootstrapResponse {
        try await apiClient.send(.bootstrap)
    }

    func update(_ draft: ProfileDraft, idempotencyKey: UUID) async throws -> UserProfile {
        try await apiClient.send(.profile, body: draft, idempotencyKey: idempotencyKey)
    }

    func analyzeNextCommitment(idempotencyKey: UUID) async throws -> AnalysisResponse {
        try await apiClient.send(.analysis, body: EmptyRequest(), idempotencyKey: idempotencyKey)
    }

    func fetch(after cursor: String?) async throws -> ChatPage {
        try await apiClient.send(.chat(cursor: cursor))
    }

    func reply(questionID: String, text: String, idempotencyKey: UUID) async throws -> ChatMessage {
        try await apiClient.send(
            .questionReply(id: questionID),
            body: QuestionReplyRequest(text: text),
            idempotencyKey: idempotencyKey
        )
    }

    func testCall(idempotencyKey: UUID) async throws -> CallReceipt {
        try await apiClient.send(.testCall, body: EmptyRequest(), idempotencyKey: idempotencyKey)
    }

    func deleteAccount(idempotencyKey: UUID) async throws -> DeletionReceipt {
        try await apiClient.send(
            .deleteAccount,
            body: AccountDeletionRequest(confirmation: "DELETE"),
            idempotencyKey: idempotencyKey
        )
    }
}
