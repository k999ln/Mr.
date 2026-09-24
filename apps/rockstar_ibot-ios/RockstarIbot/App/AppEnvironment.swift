import Foundation

@MainActor
struct AppEnvironment {
    let configuration: AppConfiguration
    let auth: any AuthServicing
    let bootstrap: any BootstrapServicing
    let profile: any ProfileServicing
    let analysis: any AnalysisServicing
    let chat: any ChatServicing
    let account: any AccountServicing
    let operating: any OperatingServicing
    let operatingSurfaceMode: OperatingSurfaceMode
    let previewService: PreviewRockstarIbotService?

    static func bundled(configuration: AppConfiguration = .bundled()) -> AppEnvironment {
        if configuration.previewMode {
            let store = InMemorySessionStore()
            let service = PreviewRockstarIbotService()
            let operating = PreviewOperatingService()
            return AppEnvironment(
                configuration: configuration,
                auth: PreviewAuthService(sessionStore: store),
                bootstrap: service,
                profile: service,
                analysis: service,
                chat: service,
                account: service,
                operating: operating,
                operatingSurfaceMode: .previewOnly,
                previewService: service
            )
        }

        let store = KeychainSessionStore()
        let client = APIClient(
            configuration: configuration,
            sessionStore: store
        )
        let service = LiveRockstarIbotService(apiClient: client)
        // The operating endpoints are intentionally not wired to Release yet.
        // Until server deployment and schema freeze, this surface remains an explicit preview.
        let operating = PreviewOperatingService()
        return AppEnvironment(
            configuration: configuration,
            auth: LiveAuthService(
                apiClient: client,
                sessionStore: store,
                configuration: configuration
            ),
            bootstrap: service,
            profile: service,
            analysis: service,
            chat: service,
            account: service,
            operating: operating,
            operatingSurfaceMode: .previewOnly,
            previewService: nil
        )
    }

    static func preview() -> AppEnvironment {
        bundled(configuration: .preview)
    }
}
