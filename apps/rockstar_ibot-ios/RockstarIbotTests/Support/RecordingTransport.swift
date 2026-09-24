import Foundation
@testable import RockstarIbot

actor RecordingTransport: HTTPTransport {
    private(set) var requests: [URLRequest] = []
    private let responseData: Data
    private let statusCode: Int

    init(responseData: Data, statusCode: Int = 200) {
        self.responseData = responseData
        self.statusCode = statusCode
    }

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        requests.append(request)
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: statusCode,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "application/json"]
        )!
        return (responseData, response)
    }

    func lastRequest() -> URLRequest? { requests.last }
}

struct ProbeResponse: Codable, Sendable, Equatable {
    let ok: Bool
}

struct ProbeBody: Codable, Sendable, Equatable {
    let value: String
}

actor StubChatService: ChatServicing {
    var page: ChatPage
    var replyMessage: ChatMessage

    init(page: ChatPage, replyMessage: ChatMessage) {
        self.page = page
        self.replyMessage = replyMessage
    }

    func fetch(after cursor: String?) async throws -> ChatPage { page }

    func reply(
        questionID: String,
        text: String,
        idempotencyKey: UUID
    ) async throws -> ChatMessage {
        replyMessage
    }
}
