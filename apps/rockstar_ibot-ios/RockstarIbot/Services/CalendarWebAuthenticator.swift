import AuthenticationServices
import Foundation
import UIKit

@MainActor
protocol CalendarWebAuthenticating: AnyObject {
    func authenticate(at authorizationURL: URL, callbackScheme: String) async throws -> URL
}

@MainActor
final class CalendarWebAuthenticator: NSObject, CalendarWebAuthenticating, ASWebAuthenticationPresentationContextProviding {
    private var activeSession: ASWebAuthenticationSession?

    func authenticate(at authorizationURL: URL, callbackScheme: String) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: authorizationURL,
                callbackURLScheme: callbackScheme
            ) { [weak self] callbackURL, error in
                self?.activeSession = nil
                if let callbackURL {
                    continuation.resume(returning: callbackURL)
                } else {
                    continuation.resume(throwing: error ?? APIError.invalidResponse)
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            activeSession = session
            guard session.start() else {
                activeSession = nil
                continuation.resume(throwing: APIError.invalidResponse)
                return
            }
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let window = scenes.flatMap(\.windows).first(where: \.isKeyWindow)
        return window ?? ASPresentationAnchor()
    }
}
