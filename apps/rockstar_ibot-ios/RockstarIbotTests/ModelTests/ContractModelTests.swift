import XCTest
@testable import RockstarIbot

final class ContractModelTests: XCTestCase {
    func testRouteDecodesNullableProviderFactsWithoutInventingValues() throws {
        let json = """
        {
          "status":"route_ready",
          "provider":"transit",
          "providerAttribution":"Transit API",
          "computedAt":"2026-08-28T04:00:00Z",
          "timezone":"Asia/Tokyo",
          "eventId":"event-1",
          "origin":{"displayName":"Shibuya","userContent":null},
          "destination":{"displayName":"Roppongi","userContent":null},
          "leaveAt":"2026-08-28T04:40:00Z",
          "arriveAt":"2026-08-28T05:07:00Z",
          "durationSeconds":1620,
          "bufferSeconds":180,
          "transferCount":0,
          "fare":null,
          "steps":[{
            "sequence":1,
            "mode":"walk",
            "instruction":"Walk to Shibuya Station",
            "from":null,
            "to":"Shibuya Station",
            "service":null,
            "headsign":null,
            "platform":null,
            "departAt":"2026-08-28T04:40:00Z",
            "arriveAt":"2026-08-28T04:47:00Z",
            "durationSeconds":420
          }]
        }
        """.data(using: .utf8)!

        let route = try JSONDecoder().decode(RouteProjection.self, from: json)

        XCTAssertNil(route.fare)
        XCTAssertNil(route.steps[0].platform)
        XCTAssertNil(route.steps[0].service)
        XCTAssertEqual(route.timezone, "Asia/Tokyo")
    }

    func testAllFiveTerminalAnalysisStatesAreRepresentable() {
        let terminal: Set<AnalysisStatus> = [
            .routeReady,
            .needsInformation,
            .noUpcomingEvent,
            .routeUnavailable,
            .failed
        ]
        XCTAssertEqual(terminal.count, 5)
        XCTAssertFalse(terminal.contains(.running))
    }

    func testPreferredLocaleFallsBackToEnglish() {
        XCTAssertEqual(ProductLocale.preferred(from: ["ja-JP"]), .ja)
        XCTAssertEqual(ProductLocale.preferred(from: ["fr-FR"]), .en)
        XCTAssertEqual(ProductLocale.preferred(from: []), .en)
    }
}
