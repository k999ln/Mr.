import XCTest

final class RockstarIbotUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testPreviewHappyPathReachesChatRouteSettingsAndNativeLifeHub() throws {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(element("preview.banner", in: app).waitForExistence(timeout: 5))

        let connect = app.buttons["welcome.connectCalendar"]
        XCTAssertTrue(connect.waitForExistence(timeout: 5))
        connect.tap()

        let name = app.textFields["profile.name"]
        XCTAssertTrue(name.waitForExistence(timeout: 5))
        name.tap()
        name.typeText("Preview User")

        let home = app.textFields["profile.home"]
        home.tap()
        home.typeText("Shibuya\n")

        let profileContinue = app.buttons["profile.continue"]
        XCTAssertTrue(profileContinue.waitForExistence(timeout: 2))
        XCTAssertTrue(profileContinue.isEnabled)
        profileContinue.tap()

        let phoneSkip = app.buttons["phone.skip"]
        XCTAssertTrue(phoneSkip.waitForExistence(timeout: 5))
        phoneSkip.tap()

        let continueFree = app.buttons["paywall.continueFree"]
        XCTAssertTrue(continueFree.waitForExistence(timeout: 5))
        continueFree.tap()

        XCTAssertTrue(element("chat.list", in: app).waitForExistence(timeout: 5))

        let routeDetails = app.buttons["route.showDetails"]
        XCTAssertTrue(routeDetails.waitForExistence(timeout: 5))
        if !routeDetails.isHittable {
            element("chat.list", in: app).swipeUp()
        }
        routeDetails.tap()

        let closeRoute = app.buttons["route.detail.close"]
        XCTAssertTrue(closeRoute.waitForExistence(timeout: 5))
        closeRoute.tap()

        let settings = app.buttons["chat.settings"]
        XCTAssertTrue(settings.waitForExistence(timeout: 5))
        settings.tap()

        XCTAssertTrue(app.buttons["settings.logout"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["settings.deleteAccount"].exists)

        let settingsClose = app.buttons["settings.close"]
        XCTAssertTrue(settingsClose.waitForExistence(timeout: 5))
        settingsClose.tap()

        let commandCenter = app.buttons["chat.commandCenter"]
        XCTAssertTrue(commandCenter.waitForExistence(timeout: 5))
        commandCenter.tap()

        XCTAssertTrue(element("hub.preview.banner", in: app).waitForExistence(timeout: 5))
        let hubHome = element("hub.home", in: app)
        XCTAssertTrue(hubHome.waitForExistence(timeout: 5))

        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Life-Hub-Preview"
        screenshot.lifetime = .keepAlways
        add(screenshot)

        let destinations = [
            "hub.nav.today",
            "hub.nav.wellbeing",
            "hub.nav.money",
            "hub.nav.work",
            "hub.nav.services",
            "hub.nav.connections",
            "hub.nav.proof"
        ]
        for identifier in destinations {
            var attempts = 0
            while !element(identifier, in: app).exists && attempts < 5 {
                hubHome.swipeUp()
                attempts += 1
            }
            XCTAssertTrue(element(identifier, in: app).exists, "Missing native Hub destination: \(identifier)")
        }

        let connections = element("hub.nav.connections", in: app)
        XCTAssertTrue(connections.isHittable)
        connections.tap()
        let package = element("hub.ai-tool-package.io.rockstar-ibot.examples/remote-ai-tool", in: app)
        XCTAssertTrue(package.waitForExistence(timeout: 5))
        XCTAssertFalse(package.elementType == .button, "Metadata-only packages must not become an execution button")
        let back = app.navigationBars.buttons.firstMatch
        XCTAssertTrue(back.waitForExistence(timeout: 5))
        back.tap()

        let homeAfterBack = element("hub.home", in: app)
        XCTAssertTrue(homeAfterBack.waitForExistence(timeout: 5))
        let today = element("hub.nav.today", in: app)
        var returnAttempts = 0
        while !today.isHittable && returnAttempts < 8 {
            homeAfterBack.swipeDown()
            returnAttempts += 1
        }
        XCTAssertTrue(today.isHittable)
        today.tap()

        let previewTask = app.textFields["hub.today.taskTitle"]
        XCTAssertTrue(previewTask.waitForExistence(timeout: 5))
        previewTask.tap()
        previewTask.typeText("Native preview task\n")
        let addTask = app.buttons["hub.today.add"]
        XCTAssertTrue(addTask.isEnabled)
        addTask.tap()
        XCTAssertTrue(app.staticTexts["Native preview task"].waitForExistence(timeout: 5))
    }

    private func element(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)[identifier]
    }
}
