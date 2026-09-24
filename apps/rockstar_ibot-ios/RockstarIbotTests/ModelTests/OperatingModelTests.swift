import XCTest
@testable import RockstarIbot

final class OperatingModelTests: XCTestCase {
    func testFourCurrencyMinorUnitRulesAreExact() {
        XCTAssertEqual(MoneyCurrency.jpy.minorUnits(from: "10,000"), 10_000)
        XCTAssertNil(MoneyCurrency.jpy.minorUnits(from: "10.50"))
        XCTAssertEqual(MoneyCurrency.usd.minorUnits(from: "12.34"), 1_234)
        XCTAssertEqual(MoneyCurrency.eur.minorUnits(from: "1.2"), 120)
        XCTAssertEqual(MoneyCurrency.gbp.minorUnits(from: "5"), 500)
        XCTAssertNil(MoneyCurrency.usd.minorUnits(from: "1.234"))
        XCTAssertNil(MoneyCurrency.usd.minorUnits(from: "0"))
        XCTAssertNil(MoneyCurrency.usd.minorUnits(from: "-2"))
    }

    func testOperatingCopySeparatesPreviewFromLiveInEnglishAndJapanese() {
        let english = OperatingCopy(locale: .en)
        let japanese = OperatingCopy(locale: .ja)

        XCTAssertTrue(english.previewBanner.contains("PREVIEW"))
        XCTAssertTrue(english.queuedOnly.lowercased().contains("queued"))
        XCTAssertTrue(japanese.previewBanner.contains("PREVIEW"))
        XCTAssertTrue(japanese.queuedOnly.contains("完了"))
    }

    func testCatalogContainsExactlySixDefaultServiceCells() {
        XCTAssertEqual(ServiceCellCatalog.all.count, 6)
        XCTAssertEqual(
            Set(ServiceCellCatalog.all.map(\.defaultCellID)),
            Set([
                "youtube-script-writer",
                "seo-blueprint",
                "landing-page-sprint",
                "sales-objection-reply-builder",
                "user-interview-synthesizer",
                "gig-delivery-verifier"
            ])
        )
    }

    func testBundledAIToolCatalogIsMetadataOnlyAndFailClosed() {
        let catalog = BundledAIToolCatalog.current

        XCTAssertEqual(catalog.schemaVersion, 1)
        XCTAssertFalse(catalog.executionEnabled)
        XCTAssertFalse(catalog.packages.isEmpty)
        XCTAssertTrue(catalog.packages.allSatisfy { $0.validationState == .schemaValid })
        XCTAssertTrue(catalog.packages.allSatisfy { $0.runtimeState == .catalogOnly })
        XCTAssertTrue(catalog.packages.contains { $0.publisherTrust == .publisherUnverified })
    }
}
