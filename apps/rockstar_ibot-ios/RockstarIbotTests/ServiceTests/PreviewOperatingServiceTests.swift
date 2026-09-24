import XCTest
@testable import RockstarIbot

final class PreviewOperatingServiceTests: XCTestCase {
    func testTaskCheckinAndFourCurrencyLedgerMutateOnlyPreviewSnapshot() async throws {
        let service = PreviewOperatingService()
        let taskKey = UUID()
        let request = CreateTaskRequest(domain: .today, title: "Prepare the brief", dueAt: nil)

        var snapshot = try await service.createTask(request, idempotencyKey: taskKey)
        snapshot = try await service.createTask(request, idempotencyKey: taskKey)
        XCTAssertEqual(snapshot.tasks.count, 1, "Retrying one idempotency key must not duplicate a task")

        let task = try XCTUnwrap(snapshot.tasks.first)
        snapshot = try await service.setTaskCompleted(
            taskID: task.id,
            request: TaskCompletionRequest(completed: true),
            idempotencyKey: UUID()
        )
        XCTAssertTrue(try XCTUnwrap(snapshot.tasks.first).completed)

        snapshot = try await service.saveCheckin(
            DailyCheckinDraft(day: "2026-08-28", bodyScore: 4, mindScore: 3, energyScore: 5, note: "Preview"),
            idempotencyKey: UUID()
        )
        XCTAssertEqual(snapshot.checkin?.bodyScore, 4)

        for currency in MoneyCurrency.allCases {
            snapshot = try await service.createMoneyEntry(
                MoneyEntryDraft(
                    direction: .income,
                    amountMinor: currency == .jpy ? 1_000 : 1_234,
                    currency: currency,
                    category: "Preview",
                    note: "",
                    occurredAt: "2026-08-28"
                ),
                idempotencyKey: UUID()
            )
        }

        XCTAssertEqual(snapshot.moneyTotals.count, 4)
        XCTAssertEqual(snapshot.moneyTotals.first(where: { $0.currency == .jpy })?.netMinor, 1_000)
        XCTAssertEqual(snapshot.auditEvents.filter { $0.action == "money.entry_created" }.count, 4)
    }

    func testServiceCellCanOnlyProduceQueuedPreviewReceiptAfterPreviewConnection() async throws {
        let service = PreviewOperatingService()
        let definition = try XCTUnwrap(ServiceCellCatalog.all.first)

        do {
            _ = try await service.queueServiceRun(
                slotID: definition.slotID,
                request: ServiceRunRequest(summary: "Create a preview script"),
                idempotencyKey: UUID()
            )
            XCTFail("A disconnected preview cell must reject queueing")
        } catch {
            XCTAssertEqual(error as? OperatingServiceError, .cellNotConnected)
        }

        _ = try await service.updateServiceCell(
            slotID: definition.slotID,
            request: ServiceCellUpdateRequest(cellID: definition.defaultCellID, enabled: true),
            idempotencyKey: UUID()
        )
        let key = UUID()
        var snapshot = try await service.queueServiceRun(
            slotID: definition.slotID,
            request: ServiceRunRequest(summary: "Create a preview script"),
            idempotencyKey: key
        )
        snapshot = try await service.queueServiceRun(
            slotID: definition.slotID,
            request: ServiceRunRequest(summary: "Create a preview script"),
            idempotencyKey: key
        )

        XCTAssertEqual(snapshot.serviceRuns.count, 1)
        XCTAssertEqual(snapshot.serviceRuns.first?.status, .queued)
        XCTAssertTrue(snapshot.auditEvents.contains(where: { $0.action == "service.run_queued" }))
    }

    func testInvalidCalendarDayAndIdempotencyConflictFailClosed() async throws {
        let service = PreviewOperatingService()
        do {
            _ = try await service.saveCheckin(
                DailyCheckinDraft(day: "2026-99-99", bodyScore: 3, mindScore: 3, energyScore: 3, note: ""),
                idempotencyKey: UUID()
            )
            XCTFail("Invalid calendar day must fail")
        } catch {
            guard case .invalidInput = error as? OperatingServiceError else {
                return XCTFail("Unexpected error: \(error)")
            }
        }

        let key = UUID()
        _ = try await service.createTask(
            CreateTaskRequest(domain: .today, title: "First task", dueAt: nil),
            idempotencyKey: key
        )
        do {
            _ = try await service.createTask(
                CreateTaskRequest(domain: .today, title: "Different task", dueAt: nil),
                idempotencyKey: key
            )
            XCTFail("A reused key with different data must conflict")
        } catch {
            XCTAssertEqual(error as? OperatingServiceError, .conflict)
        }
    }

    func testConnectionMapKeepsHubCoreAndPlannedSeparate() async throws {
        let snapshot = try await PreviewOperatingService().fetchSnapshot()
        XCTAssertEqual(Set(snapshot.connections.map { $0.tier.rawValue }), Set(["hub", "core", "planned"]))
        XCTAssertTrue(snapshot.connections.allSatisfy { $0.state != .previewOnly || $0.tier == .hub })
    }
}
