import Foundation

enum TaskDomain: String, Codable, CaseIterable, Sendable, Identifiable {
    case today
    case body
    case mind
    case money
    case work

    var id: String { rawValue }
}

struct LifeTask: Codable, Sendable, Equatable, Identifiable {
    let id: String
    let domain: TaskDomain
    let title: String
    var completed: Bool
    let dueAt: String?
    let createdAt: String
    var updatedAt: String
}

struct DailyCheckin: Codable, Sendable, Equatable {
    let day: String
    let bodyScore: Int
    let mindScore: Int
    let energyScore: Int
    let note: String
    let updatedAt: String
}

struct DailyCheckinDraft: Codable, Sendable, Equatable {
    let day: String
    let bodyScore: Int
    let mindScore: Int
    let energyScore: Int
    let note: String
}

enum MoneyDirection: String, Codable, CaseIterable, Sendable, Identifiable {
    case income
    case expense

    var id: String { rawValue }
}

enum MoneyCurrency: String, Codable, CaseIterable, Sendable, Identifiable {
    case jpy = "JPY"
    case usd = "USD"
    case eur = "EUR"
    case gbp = "GBP"

    var id: String { rawValue }
    var fractionDigits: Int { self == .jpy ? 0 : 2 }

    func minorUnits(from input: String) -> Int64? {
        let normalized = input
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: ",", with: "")
        guard !normalized.isEmpty else { return nil }

        let pieces = normalized.split(separator: ".", omittingEmptySubsequences: false)
        guard pieces.count <= 2, let whole = pieces.first, !whole.isEmpty else { return nil }
        guard whole.allSatisfy(\.isNumber), let wholeValue = Int64(whole) else { return nil }

        let fraction: String
        if pieces.count == 2 {
            guard fractionDigits > 0 else { return nil }
            fraction = String(pieces[1])
            guard !fraction.isEmpty, fraction.count <= fractionDigits, fraction.allSatisfy(\.isNumber) else {
                return nil
            }
        } else {
            fraction = ""
        }

        let factor = Int64(pow(10.0, Double(fractionDigits)))
        let (wholeMinor, overflow) = wholeValue.multipliedReportingOverflow(by: factor)
        guard !overflow else { return nil }
        let paddedFraction = fraction.padding(toLength: fractionDigits, withPad: "0", startingAt: 0)
        let fractionValue = paddedFraction.isEmpty ? 0 : (Int64(paddedFraction) ?? -1)
        guard fractionValue >= 0 else { return nil }
        let (result, additionOverflow) = wholeMinor.addingReportingOverflow(fractionValue)
        guard !additionOverflow, result > 0 else { return nil }
        return result
    }

    func formatted(minorUnits: Int64, locale: Locale) -> String {
        let formatter = NumberFormatter()
        formatter.locale = locale
        formatter.numberStyle = .currency
        formatter.currencyCode = rawValue
        formatter.minimumFractionDigits = fractionDigits
        formatter.maximumFractionDigits = fractionDigits
        let factor = Decimal(Int(pow(10.0, Double(fractionDigits))))
        let amount = Decimal(minorUnits) / factor
        return formatter.string(from: NSDecimalNumber(decimal: amount)) ?? "\(rawValue) \(amount)"
    }
}

struct MoneyEntry: Codable, Sendable, Equatable, Identifiable {
    let id: String
    let direction: MoneyDirection
    let amountMinor: Int64
    let currency: MoneyCurrency
    let category: String
    let note: String
    let occurredAt: String
    let createdAt: String
}

struct MoneyEntryDraft: Codable, Sendable, Equatable {
    let direction: MoneyDirection
    let amountMinor: Int64
    let currency: MoneyCurrency
    let category: String
    let note: String
    let occurredAt: String
}

struct MoneyTotal: Codable, Sendable, Equatable, Identifiable {
    let currency: MoneyCurrency
    let incomeMinor: Int64
    let expenseMinor: Int64
    let netMinor: Int64

    var id: String { currency.rawValue }
}

struct ServiceCellState: Codable, Sendable, Equatable, Identifiable {
    let slotID: String
    var selectedCellID: String
    var enabled: Bool

    var id: String { slotID }
}

enum ServiceRunStatus: String, Codable, Sendable {
    case queued
}

struct ServiceRun: Codable, Sendable, Equatable, Identifiable {
    let id: String
    let slotID: String
    let cellID: String
    let summary: String
    let status: ServiceRunStatus
    let createdAt: String
}

enum ConnectionTier: String, Codable, CaseIterable, Sendable {
    case hub
    case core
    case planned
}

enum ConnectionState: String, Codable, Sendable {
    case previewOnly
    case separateAuthentication
    case notConnected
    case planned
}

struct ConnectionProjection: Codable, Sendable, Equatable, Identifiable {
    let id: String
    let tier: ConnectionTier
    let state: ConnectionState
}

struct OperatingAuditEvent: Codable, Sendable, Equatable, Identifiable {
    let id: String
    let action: String
    let createdAt: String
}

struct OperatingSnapshot: Codable, Sendable, Equatable {
    var tasks: [LifeTask]
    var checkin: DailyCheckin?
    var moneyEntries: [MoneyEntry]
    var moneyTotals: [MoneyTotal]
    var serviceCells: [ServiceCellState]
    var serviceRuns: [ServiceRun]
    var connections: [ConnectionProjection]
    var auditEvents: [OperatingAuditEvent]

    var openTaskCount: Int { tasks.filter { !$0.completed }.count }
    var openWorkTaskCount: Int { tasks.filter { $0.domain == .work && !$0.completed }.count }

    static let previewEmpty = OperatingSnapshot(
        tasks: [],
        checkin: nil,
        moneyEntries: [],
        moneyTotals: MoneyCurrency.allCases.map {
            MoneyTotal(currency: $0, incomeMinor: 0, expenseMinor: 0, netMinor: 0)
        },
        serviceCells: ServiceCellCatalog.all.map {
            ServiceCellState(slotID: $0.slotID, selectedCellID: $0.defaultCellID, enabled: false)
        },
        serviceRuns: [],
        connections: OperatingPreviewCatalog.connections,
        auditEvents: []
    )
}

struct CreateTaskRequest: Codable, Sendable, Equatable {
    let domain: TaskDomain
    let title: String
    let dueAt: String?
}

struct TaskCompletionRequest: Codable, Sendable, Equatable {
    let completed: Bool
}

struct ServiceCellUpdateRequest: Codable, Sendable, Equatable {
    let cellID: String
    let enabled: Bool
}

struct ServiceRunRequest: Codable, Sendable, Equatable {
    let summary: String
}

struct ServiceCellDefinition: Sendable, Equatable, Identifiable {
    let slotID: String
    let label: String
    let defaultCellID: String
    let variantIDs: [String]
    let targetMinutes: Int

    var id: String { slotID }
}

enum ServiceCellCatalog {
    static let all: [ServiceCellDefinition] = [
        ServiceCellDefinition(
            slotID: "slot.create",
            label: "CREATE",
            defaultCellID: "youtube-script-writer",
            variantIDs: ["youtube-script-writer", "short-video-script-writer", "article-renewal"],
            targetMinutes: 10
        ),
        ServiceCellDefinition(
            slotID: "slot.grow",
            label: "GROW",
            defaultCellID: "seo-blueprint",
            variantIDs: ["seo-blueprint", "seo-article-renewal", "content-repurpose"],
            targetMinutes: 15
        ),
        ServiceCellDefinition(
            slotID: "slot.launch",
            label: "LAUNCH",
            defaultCellID: "landing-page-sprint",
            variantIDs: ["landing-page-sprint", "portfolio-site-sprint", "lead-magnet-page"],
            targetMinutes: 45
        ),
        ServiceCellDefinition(
            slotID: "slot.sell",
            label: "SELL",
            defaultCellID: "sales-objection-reply-builder",
            variantIDs: ["sales-objection-reply-builder", "estimate-builder", "proposal-builder"],
            targetMinutes: 3
        ),
        ServiceCellDefinition(
            slotID: "slot.learn",
            label: "LEARN",
            defaultCellID: "user-interview-synthesizer",
            variantIDs: ["user-interview-synthesizer", "support-theme-miner", "offer-insight-digest"],
            targetMinutes: 15
        ),
        ServiceCellDefinition(
            slotID: "slot.deliver",
            label: "DELIVER",
            defaultCellID: "gig-delivery-verifier",
            variantIDs: ["gig-delivery-verifier", "web-delivery-verifier", "document-delivery-verifier"],
            targetMinutes: 10
        )
    ]
}

enum OperatingPreviewCatalog {
    static let connections: [ConnectionProjection] = [
        ConnectionProjection(id: "life-hub", tier: .hub, state: .previewOnly),
        ConnectionProjection(id: "google-calendar", tier: .core, state: .separateAuthentication),
        ConnectionProjection(id: "telegram", tier: .core, state: .notConnected),
        ConnectionProjection(id: "voice", tier: .core, state: .notConnected),
        ConnectionProjection(id: "ai-tool-packages", tier: .planned, state: .planned),
        ConnectionProjection(id: "unified-account", tier: .planned, state: .planned),
        ConnectionProjection(id: "apns", tier: .planned, state: .planned),
        ConnectionProjection(id: "storekit", tier: .planned, state: .planned)
    ]
}
