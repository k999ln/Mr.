protocol SessionStoring: Sendable {
    func load() async throws -> MobileSession?
    func save(_ session: MobileSession) async throws
    func clear() async throws
}

actor InMemorySessionStore: SessionStoring {
    private var session: MobileSession?

    init(session: MobileSession? = nil) {
        self.session = session
    }

    func load() -> MobileSession? { session }
    func save(_ session: MobileSession) { self.session = session }
    func clear() { session = nil }
}
