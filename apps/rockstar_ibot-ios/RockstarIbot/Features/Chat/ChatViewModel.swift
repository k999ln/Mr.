import Foundation

@MainActor
final class ChatViewModel: ObservableObject {
    @Published private(set) var messages: [ChatMessage] = []
    @Published private(set) var isLoading = false
    @Published private(set) var errorMessage: String?
    @Published var composerText = ""

    private let service: any ChatServicing
    private var cursor: String?

    init(service: any ChatServicing) {
        self.service = service
    }

    var openQuestion: QuestionProjection? {
        messages.reversed().compactMap(\.question).first(where: { $0.id != nil })
    }

    var canReply: Bool {
        openQuestion?.id != nil && !composerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    func load(reset: Bool = false) async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let page = try await service.fetch(after: reset ? nil : cursor)
            if reset {
                messages = deduplicated(page.messages)
            } else {
                messages = deduplicated(messages + page.messages)
            }
            cursor = page.nextCursor
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    func sendReply() async {
        guard let questionID = openQuestion?.id, canReply, !isLoading else { return }
        let text = composerText.trimmingCharacters(in: .whitespacesAndNewlines)
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let message = try await service.reply(
                questionID: questionID,
                text: text,
                idempotencyKey: UUID()
            )
            composerText = ""
            messages = deduplicated(messages + [message])
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    func replaceWithPreview(_ page: ChatPage) {
        messages = deduplicated(page.messages)
        cursor = page.nextCursor
        errorMessage = nil
    }

    private func deduplicated(_ input: [ChatMessage]) -> [ChatMessage] {
        var seen = Set<String>()
        return input.filter { seen.insert($0.id).inserted }
    }
}
