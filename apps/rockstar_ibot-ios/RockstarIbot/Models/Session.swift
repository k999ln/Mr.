import Foundation

struct MobileSession: Codable, Sendable, Equatable {
    let accessToken: String
    let refreshToken: String
    let expiresAt: Date
}

struct CalendarSessionStart: Codable, Sendable, Equatable {
    let authorizationURL: URL
}

struct SessionExchangeRequest: Codable, Sendable, Equatable {
    let callbackCode: String
}

struct RefreshSessionRequest: Codable, Sendable, Equatable {
    let refreshToken: String
}
