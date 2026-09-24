import Foundation

@MainActor
final class OperatingHubViewModel: ObservableObject {
    @Published private(set) var snapshot: OperatingSnapshot = .previewEmpty
    @Published private(set) var isLoading = false
    @Published private(set) var busyAction: String?
    @Published var errorMessage: String?
    @Published var noticeMessage: String?

    let mode: OperatingSurfaceMode
    private let service: any OperatingServicing
    private var hasLoaded = false

    init(service: any OperatingServicing, mode: OperatingSurfaceMode) {
        self.service = service
        self.mode = mode
    }

    var workTasks: [LifeTask] { snapshot.tasks.filter { $0.domain == .work } }

    func load(force: Bool = false) async {
        guard force || !hasLoaded else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            snapshot = try await service.fetchSnapshot()
            hasLoaded = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @discardableResult
    func createTask(title: String, domain: TaskDomain) async -> Bool {
        await perform(action: "task.create") {
            try await self.service.createTask(
                CreateTaskRequest(domain: domain, title: title, dueAt: nil),
                idempotencyKey: UUID()
            )
        }
    }

    func setTaskCompleted(_ task: LifeTask, completed: Bool) async {
        _ = await perform(action: "task.complete") {
            try await self.service.setTaskCompleted(
                taskID: task.id,
                request: TaskCompletionRequest(completed: completed),
                idempotencyKey: UUID()
            )
        }
    }

    @discardableResult
    func saveCheckin(body: Int, mind: Int, energy: Int, note: String) async -> Bool {
        await perform(action: "checkin.save") {
            try await self.service.saveCheckin(
                DailyCheckinDraft(
                    day: Self.localDay(),
                    bodyScore: body,
                    mindScore: mind,
                    energyScore: energy,
                    note: note
                ),
                idempotencyKey: UUID()
            )
        }
    }

    @discardableResult
    func createMoneyEntry(
        direction: MoneyDirection,
        amountMinor: Int64,
        currency: MoneyCurrency,
        category: String,
        note: String
    ) async -> Bool {
        await perform(action: "money.create") {
            try await self.service.createMoneyEntry(
                MoneyEntryDraft(
                    direction: direction,
                    amountMinor: amountMinor,
                    currency: currency,
                    category: category,
                    note: note,
                    occurredAt: Self.localDay()
                ),
                idempotencyKey: UUID()
            )
        }
    }

    @discardableResult
    func updateServiceCell(slotID: String, cellID: String, enabled: Bool) async -> Bool {
        await perform(action: "cell.update") {
            try await self.service.updateServiceCell(
                slotID: slotID,
                request: ServiceCellUpdateRequest(cellID: cellID, enabled: enabled),
                idempotencyKey: UUID()
            )
        }
    }

    @discardableResult
    func queueServiceRun(slotID: String, summary: String) async -> Bool {
        await perform(action: "run.queue") {
            try await self.service.queueServiceRun(
                slotID: slotID,
                request: ServiceRunRequest(summary: summary),
                idempotencyKey: UUID()
            )
        }
    }

    func cellState(for slotID: String) -> ServiceCellState? {
        snapshot.serviceCells.first(where: { $0.slotID == slotID })
    }

    static func localDay(now: Date = Date(), calendar: Calendar = .current) -> String {
        let components = calendar.dateComponents([.year, .month, .day], from: now)
        return String(
            format: "%04d-%02d-%02d",
            components.year ?? 0,
            components.month ?? 0,
            components.day ?? 0
        )
    }

    @discardableResult
    private func perform(
        action: String,
        operation: () async throws -> OperatingSnapshot
    ) async -> Bool {
        guard busyAction == nil else { return false }
        busyAction = action
        errorMessage = nil
        noticeMessage = nil
        defer { busyAction = nil }
        do {
            snapshot = try await operation()
            noticeMessage = "preview.saved"
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }
}
