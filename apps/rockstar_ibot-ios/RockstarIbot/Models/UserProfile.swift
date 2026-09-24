import Foundation

enum ProductLocale: String, Codable, CaseIterable, Sendable, Equatable, Identifiable {
    case en
    case ja

    var id: String { rawValue }

    static func preferred(from languages: [String] = Locale.preferredLanguages) -> ProductLocale {
        guard let first = languages.first?.lowercased() else { return .en }
        return first.hasPrefix("ja") ? .ja : .en
    }

    var locale: Locale { Locale(identifier: rawValue) }
}

enum ProfileFieldStatus: String, Codable, Sendable, Equatable {
    case ready
    case missing
    case configured
}

struct HomeProjection: Codable, Sendable, Equatable {
    let status: ProfileFieldStatus
    let display: String?
}

struct PhoneProjection: Codable, Sendable, Equatable {
    let status: ProfileFieldStatus
    let masked: String?
}

struct UserProfile: Codable, Sendable, Equatable {
    let id: String
    var name: String?
    var productLocale: ProductLocale
    let timezone: String
    var home: HomeProjection
    var phone: PhoneProjection
    var callsEnabled: Bool
    var callLanguage: ProductLocale?
}

struct ProfileDraft: Codable, Sendable, Equatable {
    var name: String
    var homeAddress: String
    var productLocale: ProductLocale
    var phone: String?
    var callsEnabled: Bool
    var callLanguage: ProductLocale?

    enum CodingKeys: String, CodingKey {
        case name
        case homeAddress = "home_address"
        case productLocale = "product_locale"
        case phone
        case callsEnabled = "calls_enabled"
        case callLanguage = "call_language"
    }
}

enum CalendarConnectionStatus: String, Codable, Sendable, Equatable {
    case connected
    case actionRequired = "action_required"
    case error
    case disconnected
}

enum OfferStatus: String, Codable, Sendable, Equatable {
    case available
    case unavailable
}

struct CalendarProjection: Codable, Sendable, Equatable {
    let status: CalendarConnectionStatus
}

struct OfferProjection: Codable, Sendable, Equatable {
    let status: OfferStatus
}

struct BootstrapResponse: Codable, Sendable, Equatable {
    let user: UserProfile
    let calendar: CalendarProjection
    let offer: OfferProjection
    let analysis: AnalysisProjection
}
