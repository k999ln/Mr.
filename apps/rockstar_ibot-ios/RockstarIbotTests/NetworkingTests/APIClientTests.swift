import XCTest
@testable import RockstarIbot

final class APIClientTests: XCTestCase {
    func testAuthenticatedMutationCarriesBearerAndStableIdempotencyKey() async throws {
        let response = try JSONEncoder().encode(ProbeResponse(ok: true))
        let transport = RecordingTransport(responseData: response)
        let session = MobileSession(
            accessToken: "access-for-test",
            refreshToken: "refresh-for-test",
            expiresAt: Date().addingTimeInterval(600)
        )
        let store = InMemorySessionStore(session: session)
        let client = APIClient(
            configuration: .preview,
            transport: transport,
            sessionStore: store
        )
        let key = UUID()

        let result: ProbeResponse = try await client.send(
            .profile,
            body: ProbeBody(value: "hello"),
            idempotencyKey: key
        )

        XCTAssertEqual(result, ProbeResponse(ok: true))
        let request = await transport.lastRequest()
        XCTAssertEqual(request?.value(forHTTPHeaderField: "Authorization"), "Bearer access-for-test")
        XCTAssertEqual(request?.value(forHTTPHeaderField: "Idempotency-Key"), key.uuidString)
        XCTAssertEqual(request?.url?.path, "/api/mobile/v1/profile")
        XCTAssertNil(request?.value(forHTTPHeaderField: "X-User-ID"))
    }

    func testMutationWithoutIdempotencyKeyIsRejectedBeforeNetwork() async {
        let transport = RecordingTransport(responseData: Data("{}".utf8))
        let client = APIClient(
            configuration: .preview,
            transport: transport,
            sessionStore: InMemorySessionStore()
        )

        do {
            let _: ProbeResponse = try await client.send(.analysis, body: EmptyRequest())
            XCTFail("Expected invalid configuration")
        } catch {
            XCTAssertEqual(error as? APIError, .invalidConfiguration)
        }
        let request = await transport.lastRequest()
        XCTAssertNil(request)
    }

    func testOperatingMutationUsesMobileV1BearerBoundaryWithoutClientUserID() async throws {
        let response = try JSONEncoder().encode(OperatingSnapshot.previewEmpty)
        let transport = RecordingTransport(responseData: response)
        let store = InMemorySessionStore(
            session: MobileSession(
                accessToken: "access-for-test",
                refreshToken: "refresh-for-test",
                expiresAt: Date().addingTimeInterval(600)
            )
        )
        let client = APIClient(configuration: .preview, transport: transport, sessionStore: store)
        let key = UUID()

        let _: OperatingSnapshot = try await client.send(
            .operatingTaskCreate,
            body: CreateTaskRequest(domain: .work, title: "Ship preview", dueAt: nil),
            idempotencyKey: key
        )

        let request = await transport.lastRequest()
        XCTAssertEqual(request?.url?.path, "/api/mobile/v1/operating/tasks")
        XCTAssertEqual(request?.httpMethod, "POST")
        XCTAssertEqual(request?.value(forHTTPHeaderField: "Idempotency-Key"), key.uuidString)
        XCTAssertEqual(request?.value(forHTTPHeaderField: "Authorization"), "Bearer access-for-test")
        XCTAssertNil(request?.value(forHTTPHeaderField: "X-User-ID"))
    }

    func testOperatingEndpointContractUsesTypedMethodsAndPaths() {
        XCTAssertEqual(APIEndpoint.operatingSnapshot.method, .get)
        XCTAssertEqual(APIEndpoint.operatingSnapshot.path, "/operating/snapshot")
        XCTAssertEqual(APIEndpoint.operatingTaskCreate.method, .post)
        XCTAssertEqual(APIEndpoint.operatingTaskCreate.path, "/operating/tasks")
        XCTAssertEqual(APIEndpoint.operatingTaskUpdate(id: "task-1").method, .patch)
        XCTAssertEqual(APIEndpoint.operatingTaskUpdate(id: "task-1").path, "/operating/tasks/task-1")
        XCTAssertEqual(APIEndpoint.operatingCheckin.method, .put)
        XCTAssertEqual(APIEndpoint.operatingCheckin.path, "/operating/checkin")
        XCTAssertEqual(APIEndpoint.operatingMoneyCreate.path, "/operating/money")
        XCTAssertEqual(
            APIEndpoint.operatingServiceCellUpdate(slotID: "slot.create").path,
            "/operating/service-cells/slot.create"
        )
        XCTAssertEqual(
            APIEndpoint.operatingServiceRun(slotID: "slot.create").path,
            "/operating/service-cells/slot.create/runs"
        )
    }
}
