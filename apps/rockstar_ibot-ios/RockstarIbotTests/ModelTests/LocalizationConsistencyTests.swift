import XCTest
@testable import RockstarIbot

final class LocalizationConsistencyTests: XCTestCase {
    func testEnglishSystemCopyContainsNoJapaneseScript() throws {
        let copy = LMCopy(locale: .en)
        let values = [
            copy.welcomePromise,
            copy.welcomeBody,
            copy.readOnly,
            copy.analysisTitle,
            copy.routeHonesty,
            copy.paywallBody,
            copy.deleteConfirmation
        ]
        let regex = try NSRegularExpression(pattern: "[\\p{Hiragana}\\p{Katakana}\\p{Han}]")
        for value in values {
            let range = NSRange(value.startIndex..., in: value)
            XCTAssertNil(regex.firstMatch(in: value, range: range), value)
        }
    }

    func testJapaneseCoreCopyIsTranslated() {
        let copy = LMCopy(locale: .ja)
        XCTAssertTrue(copy.welcomePromise.contains("日"))
        XCTAssertTrue(copy.routeHonesty.contains("現在地"))
        XCTAssertTrue(copy.deleteConfirmation.contains("削除"))
    }
}
