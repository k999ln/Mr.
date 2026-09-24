import XCTest
@testable import RockstarIbot

@MainActor
final class ChatViewModelTests: XCTestCase {
    func testFetchDeduplicatesStableMessageIDs() async {
        let route = PreviewFixtures.routeMessage(locale: .en)
        let page = ChatPage(messages: [route, route], nextCursor: "next")
        let service = StubChatService(page: page, replyMessage: route)
        let model = ChatViewModel(service: service)

        await model.load(reset: true)

        XCTAssertEqual(model.messages.map(\.id), [route.id])
    }

    func testComposerOnlyOpensForBackendQuestion() async {
        let question = PreviewFixtures.message(for: .needsInformation, locale: .en)
        let page = ChatPage(messages: [question], nextCursor: nil)
        let service = StubChatService(page: page, replyMessage: question)
        let model = ChatViewModel(service: service)

        await model.load(reset: true)
        XCTAssertNotNil(model.openQuestion?.id)
        XCTAssertFalse(model.canReply)

        model.composerText = "Shibuya"
        XCTAssertTrue(model.canReply)
    }
}
