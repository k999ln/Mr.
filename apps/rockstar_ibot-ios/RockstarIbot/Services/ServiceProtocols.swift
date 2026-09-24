import Foundation

@MainActor
protocol AuthServicing: AnyObject {
    func restoreSession() async throws -> MobileSession?
    func connectCalendar() async throws -> MobileSession
    func signOut() async throws
}

protocol BootstrapServicing: Sendable {
    func fetchBootstrap() async throws -> BootstrapResponse
}

protocol ProfileServicing: Sendable {
    func update(_ draft: ProfileDraft, idempotencyKey: UUID) async throws -> UserProfile
}

protocol AnalysisServicing: Sendable {
    func analyzeNextCommitment(idempotencyKey: UUID) async throws -> AnalysisResponse
}

protocol ChatServicing: Sendable {
    func fetch(after cursor: String?) async throws -> ChatPage
    func reply(
        questionID: String,
        text: String,
        idempotencyKey: UUID
    ) async throws -> ChatMessage
}

protocol AccountServicing: Sendable {
    func testCall(idempotencyKey: UUID) async throws -> CallReceipt
    func deleteAccount(idempotencyKey: UUID) async throws -> DeletionReceipt
}
