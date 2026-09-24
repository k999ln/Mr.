import XCTest
@testable import RockstarIbot

@MainActor
final class AppViewModelTests: XCTestCase {
    func testPreviewOnboardingAllowsPhoneSkipAndEndsInChat() async {
        let model = AppViewModel(environment: .preview())

        await model.start()
        XCTAssertEqual(model.route, .welcome)

        await model.connectCalendar()
        XCTAssertEqual(model.route, .profile)

        model.name = "Preview User"
        model.homeAddress = "Shibuya"
        await model.saveProfile()
        XCTAssertEqual(model.route, .phone)

        await model.skipPhone()
        XCTAssertEqual(model.route, .chat)
        XCTAssertEqual(model.analysisStatus, .routeReady)
        XCTAssertEqual(model.profile?.phone.status, .missing)
        XCTAssertEqual(model.profile?.callsEnabled, false)
        XCTAssertTrue(model.isPaywallPresented)
    }

    func testEveryTerminalAnalysisStateReachesVisibleChat() async {
        for scenario in PreviewScenario.allCases {
            let model = AppViewModel(environment: .preview())
            await model.changePreviewScenario(scenario)

            await model.runAnalysis()

            XCTAssertEqual(model.route, .chat, "Scenario \(scenario) did not reach chat")
            XCTAssertEqual(model.analysisStatus, scenario.status)
            XCTAssertFalse(model.chat.messages.isEmpty)
        }
    }

    func testPhoneRequiresE164AndDoesNotEnableCallsImplicitly() async {
        let model = AppViewModel(environment: .preview())
        model.phoneNumber = "09012345678"
        XCTAssertFalse(model.isValidPhone)
        model.phoneNumber = "+819012345678"
        XCTAssertTrue(model.isValidPhone)
    }

    func testPreviewConfigurationCannotTargetTheRetiredProductionOwner() {
        XCTAssertEqual(AppConfiguration.preview.apiBaseURL.host, "mobile-api-not-configured.invalid")
        XCTAssertTrue(AppConfiguration.preview.previewMode)
    }

    func testUnDeployedOperatingSurfaceRemainsExplicitPreviewInReleaseConfiguration() async throws {
        let configuration = AppConfiguration(
            apiBaseURL: URL(string: "https://mobile-api-not-configured.invalid")!,
            callbackScheme: "rockstaribot",
            previewMode: false
        )
        let environment = AppEnvironment.bundled(configuration: configuration)

        XCTAssertEqual(environment.operatingSurfaceMode, .previewOnly)
        let snapshot = try await environment.operating.fetchSnapshot()
        XCTAssertEqual(snapshot.serviceCells.count, 6)
        XCTAssertTrue(snapshot.serviceRuns.isEmpty)
    }
}
