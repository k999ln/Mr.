import Foundation

struct AppConfiguration: Sendable, Equatable {
    let apiBaseURL: URL
    let callbackScheme: String
    let previewMode: Bool

    static func bundled(bundle: Bundle = .main) -> AppConfiguration {
        let rawURL = bundle.object(forInfoDictionaryKey: "LMAPIBaseURL") as? String
        let rawScheme = bundle.object(forInfoDictionaryKey: "LMCallbackScheme") as? String
        let rawPreview = bundle.object(forInfoDictionaryKey: "LMPreviewMode") as? String

        guard
            let rawURL,
            let url = URL(string: rawURL),
            url.scheme == "https",
            url.host != nil
        else {
            preconditionFailure("LMAPIBaseURL must be an absolute HTTPS URL")
        }

        let scheme = rawScheme?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        precondition(!scheme.isEmpty, "LMCallbackScheme is required")

        return AppConfiguration(
            apiBaseURL: url,
            callbackScheme: scheme,
            previewMode: rawPreview?.uppercased() == "YES"
        )
    }

    static let preview = AppConfiguration(
        apiBaseURL: URL(string: "https://mobile-api-not-configured.invalid")!,
        callbackScheme: "rockstaribot",
        previewMode: true
    )
}
