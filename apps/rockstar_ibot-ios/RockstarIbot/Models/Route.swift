import Foundation

enum RouteProvider: String, Codable, Sendable, Equatable {
    case transit
    case google
}

struct RoutePlace: Codable, Sendable, Equatable {
    let displayName: String
    let userContent: String?
}

struct RouteFare: Codable, Sendable, Equatable {
    let currency: String
    let amount: Decimal
    let medium: String?
}

enum RouteMode: String, Codable, Sendable, Equatable {
    case walk
    case train
    case subway
    case bus
    case transfer
    case other
}

struct RouteStep: Codable, Sendable, Equatable, Identifiable {
    let sequence: Int
    let mode: RouteMode
    let instruction: String
    let from: String?
    let to: String?
    let service: String?
    let headsign: String?
    let platform: String?
    let departAt: String?
    let arriveAt: String?
    let durationSeconds: Int

    var id: Int { sequence }
}

struct RouteProjection: Codable, Sendable, Equatable {
    let status: AnalysisStatus
    let provider: RouteProvider
    let providerAttribution: String
    let computedAt: String
    let timezone: String
    let eventId: String
    let origin: RoutePlace
    let destination: RoutePlace
    let leaveAt: String
    let arriveAt: String
    let durationSeconds: Int
    let bufferSeconds: Int
    let transferCount: Int
    let fare: RouteFare?
    let steps: [RouteStep]
}

extension RouteProjection {
    func formattedTime(_ value: String, locale: Locale) -> String {
        let formatter = ISO8601DateFormatter()
        guard let date = formatter.date(from: value) else { return value }
        let timeFormatter = DateFormatter()
        timeFormatter.locale = locale
        timeFormatter.timeZone = TimeZone(identifier: timezone) ?? .current
        timeFormatter.dateStyle = .none
        timeFormatter.timeStyle = .short
        return timeFormatter.string(from: date)
    }

    var durationMinutes: Int { max(1, durationSeconds / 60) }
    var bufferMinutes: Int { max(0, bufferSeconds / 60) }
}
