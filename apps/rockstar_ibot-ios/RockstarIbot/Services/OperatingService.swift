import Foundation

protocol OperatingServicing: Sendable {
    func fetchSnapshot() async throws -> OperatingSnapshot
    func createTask(_ request: CreateTaskRequest, idempotencyKey: UUID) async throws -> OperatingSnapshot
    func setTaskCompleted(
        taskID: String,
        request: TaskCompletionRequest,
        idempotencyKey: UUID
    ) async throws -> OperatingSnapshot
    func saveCheckin(_ draft: DailyCheckinDraft, idempotencyKey: UUID) async throws -> OperatingSnapshot
    func createMoneyEntry(_ draft: MoneyEntryDraft, idempotencyKey: UUID) async throws -> OperatingSnapshot
    func updateServiceCell(
        slotID: String,
        request: ServiceCellUpdateRequest,
        idempotencyKey: UUID
    ) async throws -> OperatingSnapshot
    func queueServiceRun(
        slotID: String,
        request: ServiceRunRequest,
        idempotencyKey: UUID
    ) async throws -> OperatingSnapshot
}

enum OperatingSurfaceMode: Sendable, Equatable {
    case previewOnly
}

enum OperatingServiceError: LocalizedError, Sendable, Equatable {
    case invalidInput(String)
    case notFound
    case conflict
    case cellNotConnected

    var errorDescription: String? {
        switch self {
        case let .invalidInput(message): message
        case .notFound: "The requested preview record was not found."
        case .conflict: "This idempotency key was already used for different preview data."
        case .cellNotConnected: "Connect this preview Service Cell before queuing a request."
        }
    }
}

actor PreviewOperatingService: OperatingServicing {
    private var snapshot = OperatingSnapshot.previewEmpty
    private var mutationFingerprints: [UUID: String] = [:]

    func fetchSnapshot() -> OperatingSnapshot { snapshot }

    func createTask(_ request: CreateTaskRequest, idempotencyKey: UUID) throws -> OperatingSnapshot {
        let title = request.title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (2...240).contains(title.count) else {
            throw OperatingServiceError.invalidInput("Task titles must contain 2–240 characters.")
        }
        if let dueAt = request.dueAt, !Self.validDay(dueAt) {
            throw OperatingServiceError.invalidInput("The task date is invalid.")
        }
        guard try shouldApply(idempotencyKey, fingerprint: "task|\(request.domain.rawValue)|\(title)|\(request.dueAt ?? "")") else {
            return snapshot
        }

        let timestamp = now()
        snapshot.tasks.insert(
            LifeTask(
                id: "preview-task-\(idempotencyKey.uuidString)",
                domain: request.domain,
                title: title,
                completed: false,
                dueAt: request.dueAt,
                createdAt: timestamp,
                updatedAt: timestamp
            ),
            at: 0
        )
        audit("task.created", at: timestamp)
        return snapshot
    }

    func setTaskCompleted(
        taskID: String,
        request: TaskCompletionRequest,
        idempotencyKey: UUID
    ) throws -> OperatingSnapshot {
        guard let index = snapshot.tasks.firstIndex(where: { $0.id == taskID }) else {
            throw OperatingServiceError.notFound
        }
        guard try shouldApply(idempotencyKey, fingerprint: "task.complete|\(taskID)|\(request.completed)") else {
            return snapshot
        }
        let timestamp = now()
        snapshot.tasks[index].completed = request.completed
        snapshot.tasks[index].updatedAt = timestamp
        audit("task.status_changed", at: timestamp)
        return snapshot
    }

    func saveCheckin(_ draft: DailyCheckinDraft, idempotencyKey: UUID) throws -> OperatingSnapshot {
        guard Self.validDay(draft.day) else {
            throw OperatingServiceError.invalidInput("The check-in date is invalid.")
        }
        guard [draft.bodyScore, draft.mindScore, draft.energyScore].allSatisfy({ (1...5).contains($0) }) else {
            throw OperatingServiceError.invalidInput("Check-in scores must be between 1 and 5.")
        }
        let note = draft.note.trimmingCharacters(in: .whitespacesAndNewlines)
        guard note.count <= 500 else {
            throw OperatingServiceError.invalidInput("Check-in notes must contain at most 500 characters.")
        }
        let fingerprint = "checkin|\(draft.day)|\(draft.bodyScore)|\(draft.mindScore)|\(draft.energyScore)|\(note)"
        guard try shouldApply(idempotencyKey, fingerprint: fingerprint) else { return snapshot }
        let timestamp = now()
        snapshot.checkin = DailyCheckin(
            day: draft.day,
            bodyScore: draft.bodyScore,
            mindScore: draft.mindScore,
            energyScore: draft.energyScore,
            note: note,
            updatedAt: timestamp
        )
        audit("checkin.saved", at: timestamp)
        return snapshot
    }

    func createMoneyEntry(_ draft: MoneyEntryDraft, idempotencyKey: UUID) throws -> OperatingSnapshot {
        let category = draft.category.trimmingCharacters(in: .whitespacesAndNewlines)
        let note = draft.note.trimmingCharacters(in: .whitespacesAndNewlines)
        guard draft.amountMinor > 0 else {
            throw OperatingServiceError.invalidInput("The amount must be greater than zero.")
        }
        guard Self.validDay(draft.occurredAt) else {
            throw OperatingServiceError.invalidInput("The ledger date is invalid.")
        }
        guard (1...80).contains(category.count), note.count <= 240 else {
            throw OperatingServiceError.invalidInput("Use a category of 1–80 characters and a note of at most 240 characters.")
        }
        let fingerprint = "money|\(draft.direction.rawValue)|\(draft.amountMinor)|\(draft.currency.rawValue)|\(category)|\(note)|\(draft.occurredAt)"
        guard try shouldApply(idempotencyKey, fingerprint: fingerprint) else { return snapshot }
        let timestamp = now()
        snapshot.moneyEntries.insert(
            MoneyEntry(
                id: "preview-money-\(idempotencyKey.uuidString)",
                direction: draft.direction,
                amountMinor: draft.amountMinor,
                currency: draft.currency,
                category: category,
                note: note,
                occurredAt: draft.occurredAt,
                createdAt: timestamp
            ),
            at: 0
        )
        recalculateMoneyTotals()
        audit("money.entry_created", at: timestamp)
        return snapshot
    }

    func updateServiceCell(
        slotID: String,
        request: ServiceCellUpdateRequest,
        idempotencyKey: UUID
    ) throws -> OperatingSnapshot {
        guard
            let definition = ServiceCellCatalog.all.first(where: { $0.slotID == slotID }),
            definition.variantIDs.contains(request.cellID),
            let index = snapshot.serviceCells.firstIndex(where: { $0.slotID == slotID })
        else {
            throw OperatingServiceError.invalidInput("The Service Cell selection is not available.")
        }
        let fingerprint = "cell|\(slotID)|\(request.cellID)|\(request.enabled)"
        guard try shouldApply(idempotencyKey, fingerprint: fingerprint) else { return snapshot }
        snapshot.serviceCells[index].selectedCellID = request.cellID
        snapshot.serviceCells[index].enabled = request.enabled
        audit("portfolio.slot_changed", at: now())
        return snapshot
    }

    func queueServiceRun(
        slotID: String,
        request: ServiceRunRequest,
        idempotencyKey: UUID
    ) throws -> OperatingSnapshot {
        let summary = request.summary.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (3...5_000).contains(summary.count) else {
            throw OperatingServiceError.invalidInput("Service requests must contain 3–5,000 characters.")
        }
        guard let cell = snapshot.serviceCells.first(where: { $0.slotID == slotID }) else {
            throw OperatingServiceError.notFound
        }
        guard cell.enabled else { throw OperatingServiceError.cellNotConnected }
        let fingerprint = "run|\(slotID)|\(cell.selectedCellID)|\(summary)"
        guard try shouldApply(idempotencyKey, fingerprint: fingerprint) else { return snapshot }
        let timestamp = now()
        snapshot.serviceRuns.insert(
            ServiceRun(
                id: "preview-run-\(idempotencyKey.uuidString)",
                slotID: slotID,
                cellID: cell.selectedCellID,
                summary: summary,
                status: .queued,
                createdAt: timestamp
            ),
            at: 0
        )
        audit("service.run_queued", at: timestamp)
        return snapshot
    }

    private func shouldApply(_ key: UUID, fingerprint: String) throws -> Bool {
        if let previous = mutationFingerprints[key] {
            guard previous == fingerprint else { throw OperatingServiceError.conflict }
            return false
        }
        mutationFingerprints[key] = fingerprint
        return true
    }

    private func audit(_ action: String, at timestamp: String) {
        snapshot.auditEvents.insert(
            OperatingAuditEvent(id: UUID().uuidString, action: action, createdAt: timestamp),
            at: 0
        )
    }

    private func recalculateMoneyTotals() {
        snapshot.moneyTotals = MoneyCurrency.allCases.map { currency in
            let entries = snapshot.moneyEntries.filter { $0.currency == currency }
            let income = entries.filter { $0.direction == .income }.reduce(Int64(0)) { $0 + $1.amountMinor }
            let expense = entries.filter { $0.direction == .expense }.reduce(Int64(0)) { $0 + $1.amountMinor }
            return MoneyTotal(
                currency: currency,
                incomeMinor: income,
                expenseMinor: expense,
                netMinor: income - expense
            )
        }
    }

    private func now() -> String {
        ISO8601DateFormatter().string(from: Date())
    }

    private static func validDay(_ value: String) -> Bool {
        guard value.count == 10 else { return false }
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        guard let date = formatter.date(from: value) else { return false }
        return formatter.string(from: date) == value
    }
}

actor LiveOperatingService: OperatingServicing {
    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func fetchSnapshot() async throws -> OperatingSnapshot {
        try await apiClient.send(.operatingSnapshot)
    }

    func createTask(_ request: CreateTaskRequest, idempotencyKey: UUID) async throws -> OperatingSnapshot {
        try await apiClient.send(.operatingTaskCreate, body: request, idempotencyKey: idempotencyKey)
    }

    func setTaskCompleted(
        taskID: String,
        request: TaskCompletionRequest,
        idempotencyKey: UUID
    ) async throws -> OperatingSnapshot {
        try await apiClient.send(
            .operatingTaskUpdate(id: taskID),
            body: request,
            idempotencyKey: idempotencyKey
        )
    }

    func saveCheckin(_ draft: DailyCheckinDraft, idempotencyKey: UUID) async throws -> OperatingSnapshot {
        try await apiClient.send(.operatingCheckin, body: draft, idempotencyKey: idempotencyKey)
    }

    func createMoneyEntry(_ draft: MoneyEntryDraft, idempotencyKey: UUID) async throws -> OperatingSnapshot {
        try await apiClient.send(.operatingMoneyCreate, body: draft, idempotencyKey: idempotencyKey)
    }

    func updateServiceCell(
        slotID: String,
        request: ServiceCellUpdateRequest,
        idempotencyKey: UUID
    ) async throws -> OperatingSnapshot {
        try await apiClient.send(
            .operatingServiceCellUpdate(slotID: slotID),
            body: request,
            idempotencyKey: idempotencyKey
        )
    }

    func queueServiceRun(
        slotID: String,
        request: ServiceRunRequest,
        idempotencyKey: UUID
    ) async throws -> OperatingSnapshot {
        try await apiClient.send(
            .operatingServiceRun(slotID: slotID),
            body: request,
            idempotencyKey: idempotencyKey
        )
    }
}
