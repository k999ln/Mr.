import Foundation

enum APIError: Error, Sendable, Equatable, LocalizedError {
    case invalidConfiguration
    case invalidResponse
    case unauthorized
    case conflict
    case server(status: Int, code: String?, message: String?)
    case decoding
    case offline

    var errorDescription: String? {
        switch self {
        case .invalidConfiguration:
            "The app configuration is invalid."
        case .invalidResponse:
            "Rockstar_ibot returned an invalid response."
        case .unauthorized:
            "Your session expired. Connect Calendar again."
        case .conflict:
            "This action was already used with different information."
        case let .server(_, _, message):
            message ?? "Rockstar_ibot is temporarily unavailable."
        case .decoding:
            "Rockstar_ibot returned data this app cannot read yet."
        case .offline:
            "You are offline. Cached information remains visible."
        }
    }
}

struct APIErrorEnvelope: Codable, Sendable, Equatable {
    let code: String?
    let message: String?
}
