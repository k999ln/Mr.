import Foundation

enum AnalysisStatus: String, Codable, Sendable, Equatable, CaseIterable {
    case idle
    case running
    case routeReady = "route_ready"
    case needsInformation = "needs_information"
    case noUpcomingEvent = "no_upcoming_event"
    case routeUnavailable = "route_unavailable"
    case failed
}

struct AnalysisProjection: Codable, Sendable, Equatable {
    let status: AnalysisStatus
}

struct AnalysisResponse: Codable, Sendable, Equatable {
    let status: AnalysisStatus
    let message: ChatMessage?
}

enum AnalysisPhase: String, Codable, Sendable, Equatable, CaseIterable {
    case readingEvents = "reading_upcoming_events"
    case checkingLocations = "checking_locations"
    case calculatingTrip = "calculating_next_trip"
}
