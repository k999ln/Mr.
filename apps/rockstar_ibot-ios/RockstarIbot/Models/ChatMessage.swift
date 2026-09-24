import Foundation

enum ChatMessageType: String, Codable, Sendable, Equatable {
    case analysis
    case question
    case route
    case routeUnavailable = "route_unavailable"
    case callStatus = "call_status"
    case system
}

struct UserContentProjection: Codable, Sendable, Equatable {
    let eventTitle: String?
    let eventLocation: String?
}

struct QuestionProjection: Codable, Sendable, Equatable {
    let id: String?
    let prompt: String?
}

enum ChatActionID: String, Codable, Sendable, Equatable {
    case reply
    case refresh
    case showRoute = "show_route"
    case call
    case upgrade
}

struct ChatAction: Codable, Sendable, Equatable, Identifiable {
    let id: ChatActionID
    let label: String
}

struct ChatMessage: Codable, Sendable, Equatable, Identifiable {
    let id: String
    let cursor: String
    let createdAt: String
    let locale: ProductLocale
    let type: ChatMessageType
    let text: String
    let userContent: UserContentProjection?
    let question: QuestionProjection?
    let route: RouteProjection?
    let actions: [ChatAction]
}

struct ChatPage: Codable, Sendable, Equatable {
    let messages: [ChatMessage]
    let nextCursor: String?
}

struct QuestionReplyRequest: Codable, Sendable, Equatable {
    let text: String
}
