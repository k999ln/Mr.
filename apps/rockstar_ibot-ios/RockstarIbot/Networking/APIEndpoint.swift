import Foundation

enum HTTPMethod: String, Sendable {
    case get = "GET"
    case post = "POST"
    case patch = "PATCH"
    case put = "PUT"
    case delete = "DELETE"
}

enum APIEndpoint: Sendable, Equatable {
    case calendarStart
    case sessionExchange
    case sessionRefresh
    case sessionDelete
    case bootstrap
    case profile
    case analysis
    case chat(cursor: String?)
    case questionReply(id: String)
    case testCall
    case registerDevice
    case deleteDevice
    case deleteAccount
    case operatingSnapshot
    case operatingTaskCreate
    case operatingTaskUpdate(id: String)
    case operatingCheckin
    case operatingMoneyCreate
    case operatingServiceCellUpdate(slotID: String)
    case operatingServiceRun(slotID: String)

    var method: HTTPMethod {
        switch self {
        case .bootstrap, .chat, .operatingSnapshot:
            .get
        case .sessionDelete, .deleteDevice, .deleteAccount:
            .delete
        case .profile, .operatingTaskUpdate:
            .patch
        case .registerDevice, .operatingCheckin, .operatingServiceCellUpdate:
            .put
        default:
            .post
        }
    }

    var path: String {
        switch self {
        case .calendarStart: "/session/calendar/start"
        case .sessionExchange: "/session/exchange"
        case .sessionRefresh: "/session/refresh"
        case .sessionDelete: "/session"
        case .bootstrap: "/bootstrap"
        case .profile: "/profile"
        case .analysis: "/analysis"
        case .chat: "/chat"
        case let .questionReply(id): "/questions/\(id)/reply"
        case .testCall: "/calls/test"
        case .registerDevice, .deleteDevice: "/devices/apns"
        case .deleteAccount: "/account"
        case .operatingSnapshot: "/operating/snapshot"
        case .operatingTaskCreate: "/operating/tasks"
        case let .operatingTaskUpdate(id): "/operating/tasks/\(id)"
        case .operatingCheckin: "/operating/checkin"
        case .operatingMoneyCreate: "/operating/money"
        case let .operatingServiceCellUpdate(slotID): "/operating/service-cells/\(slotID)"
        case let .operatingServiceRun(slotID): "/operating/service-cells/\(slotID)/runs"
        }
    }

    var queryItems: [URLQueryItem] {
        guard case let .chat(cursor) = self, let cursor else { return [] }
        return [URLQueryItem(name: "cursor", value: cursor)]
    }

    var requiresAuthentication: Bool {
        switch self {
        case .calendarStart, .sessionExchange, .sessionRefresh:
            false
        default:
            true
        }
    }

    var requiresIdempotencyKey: Bool {
        method != .get && self != .sessionRefresh
    }
}
