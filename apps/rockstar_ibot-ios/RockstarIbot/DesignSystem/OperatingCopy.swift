import Foundation

struct OperatingCopy {
    let locale: ProductLocale
    private var ja: Bool { locale == .ja }

    var hubTitle: String { ja ? "Life Hub" : "Life Hub" }
    var commandCenter: String { ja ? "コマンドセンター" : "Command Center" }
    var previewBanner: String { ja ? "PREVIEW · 外部サービス未接続" : "PREVIEW · EXTERNAL SERVICES NOT CONNECTED" }
    var previewDisclosure: String {
        ja
            ? "この画面の保存・連携・受付は現在の起動中だけ保持するPreviewです。アプリを閉じると消えます。実API、外部実行、決済、納品は行いません。"
            : "Saves, connections, and queue receipts last only for this preview session and disappear when the app closes. No live API, external execution, payment, or delivery occurs."
    }
    var hubPromise: String { ja ? "身体・心・お金・仕事を、一つの入口から。" : "Body, mind, money, and work from one entry point." }
    var today: String { ja ? "今日" : "Today" }
    var todayDescription: String { ja ? "次の一手を追加し、終わった事実を残す。" : "Add the next action and record what is finished." }
    var wellbeing: String { ja ? "身体・心" : "Body + Mind" }
    var wellbeingDescription: String { ja ? "診断ではない、1〜5の日次チェックイン。" : "A daily 1–5 check-in, not a diagnosis." }
    var money: String { ja ? "お金" : "Money" }
    var moneyDescription: String { ja ? "4通貨の収支を、混ぜずに集計。" : "Track four currencies without mixing totals." }
    var workQueue: String { ja ? "仕事キュー" : "Work Queue" }
    var workDescription: String { ja ? "受託とサービス化の次の一手。" : "Next actions for client work and productized services." }
    var services: String { ja ? "6 Service Cells" : "6 Service Cells" }
    var servicesDescription: String { ja ? "接続とqueued受付まで。実行完了ではありません。" : "Preview connection and queued receipt only—not completed execution." }
    var connections: String { ja ? "接続" : "Connections" }
    var connectionsDescription: String { ja ? "Hub・Core・計画中を混ぜずに表示。" : "Keep Hub, Core, and planned capabilities distinct." }
    var aiToolPackages: String { ja ? "AIツール・パッケージ" : "AI Tool Packages" }
    var aiToolPackageDescription: String {
        ja
            ? "公式MCP配布形式とRockstar_ibot権限契約を同時に検証します。現在はカタログのみで、インストール・認証・実行・課金は行いません。"
            : "Validate the official MCP distribution manifest and the Rockstar_ibot permission contract together. Catalog only: no install, authentication, execution, or billing."
    }
    var schemaValid: String { ja ? "形式検証済み" : "Schema valid" }
    var publisherUnverified: String { ja ? "提供元未確認" : "Publisher unverified" }
    var metadataReviewed: String { ja ? "提供者metadata確認済み" : "Publisher metadata reviewed" }
    var catalogOnly: String { ja ? "カタログのみ・実行未接続" : "Catalog only · execution disconnected" }
    var supportedFormats: String { ja ? "対応manifest" : "Supported manifests" }
    var noPackageExecution: String {
        ja
            ? "表示は接続成功や安全認定を意味しません。外部へは何も送信しません。"
            : "Listing does not mean connected or certified safe. Nothing is sent externally."
    }
    func aiToolEffect(_ effect: AIToolEffect) -> String {
        switch effect {
        case .read: "READ"
        case .externalWrite: "EXTERNAL WRITE"
        case .message: "MESSAGE"
        case .publish: "PUBLISH"
        case .money: "MONEY"
        }
    }
    var proof: String { ja ? "証拠・監査" : "Proof + Audit" }
    var proofDescription: String { ja ? "操作履歴とqueued受付を後から確認。" : "Review local actions and queued preview receipts." }
    var openItems: String { ja ? "未完了" : "Open" }
    var loading: String { ja ? "読み込み中…" : "Loading…" }
    var retry: String { ja ? "再試行" : "Retry" }
    var close: String { ja ? "閉じる" : "Close" }
    var add: String { ja ? "追加" : "Add" }
    var save: String { ja ? "保存" : "Save" }
    var saving: String { ja ? "保存中…" : "Saving…" }
    var noItems: String { ja ? "まだ記録はありません。" : "No records yet." }
    var previewSaved: String { ja ? "このPreviewセッションへ保存しました。外部には送信していません。" : "Saved for this preview session. Nothing was sent externally." }

    var taskTitle: String { ja ? "タスク" : "Task" }
    var taskPlaceholder: String { ja ? "次にやること" : "Next action" }
    var domain: String { ja ? "領域" : "Area" }
    var complete: String { ja ? "完了にする" : "Mark complete" }
    var reopen: String { ja ? "未完了へ戻す" : "Reopen" }
    func taskDomain(_ domain: TaskDomain) -> String {
        switch domain {
        case .today: today
        case .body: ja ? "身体" : "Body"
        case .mind: ja ? "心" : "Mind"
        case .money: money
        case .work: ja ? "仕事" : "Work"
        }
    }

    var dailyCheckin: String { ja ? "今日のチェックイン" : "Today's check-in" }
    var bodyScore: String { ja ? "身体" : "Body" }
    var mindScore: String { ja ? "心" : "Mind" }
    var energyScore: String { ja ? "エネルギー" : "Energy" }
    var note: String { ja ? "メモ（任意）" : "Note (optional)" }
    var notePlaceholder: String { ja ? "睡眠、気分、気になること" : "Sleep, mood, or anything notable" }
    var notMedicalAdvice: String { ja ? "医療診断ではありません。緊急時は地域の緊急窓口へ連絡してください。" : "This is not medical advice. Contact local emergency services in an emergency." }

    var ledger: String { ja ? "収支台帳" : "Ledger" }
    var direction: String { ja ? "種類" : "Type" }
    var income: String { ja ? "収入" : "Income" }
    var expense: String { ja ? "支出" : "Expense" }
    var currency: String { ja ? "通貨" : "Currency" }
    var amount: String { ja ? "金額" : "Amount" }
    var category: String { ja ? "分類" : "Category" }
    var categoryPlaceholder: String { ja ? "仕事、交通、生活など" : "Work, travel, living, etc." }
    var net: String { ja ? "差引" : "Net" }
    var addLedgerEntry: String { ja ? "台帳へ追加" : "Add ledger entry" }
    var invalidAmount: String { ja ? "この通貨の小数桁に合う正の金額を入力してください。" : "Enter a positive amount using the currency's supported decimal places." }
    var currencyBoundary: String { ja ? "JPYは0桁、USD・EUR・GBPは2桁。通貨間の換算はしません。" : "JPY uses 0 decimals; USD, EUR, and GBP use 2. Currency totals are never converted or mixed." }

    var addWorkItem: String { ja ? "仕事の一手を追加" : "Add work item" }
    var workPlaceholder: String { ja ? "例: LPの要件を確定する" : "Example: finalize landing-page scope" }

    var connectedPreview: String { ja ? "Preview接続中" : "Preview connected" }
    var disconnected: String { ja ? "未接続" : "Not connected" }
    var connectPreview: String { ja ? "Previewで接続" : "Connect in preview" }
    var disconnectPreview: String { ja ? "Preview接続を解除" : "Disconnect preview" }
    var variant: String { ja ? "サービス内容" : "Service variant" }
    var deliverables: String { ja ? "想定成果物" : "Expected deliverables" }
    var requestSummary: String { ja ? "何を完成させたいですか？" : "What should this service produce?" }
    var queueRequest: String { ja ? "queuedとして受付" : "Queue preview request" }
    var queuedOnly: String { ja ? "受付状態はqueuedのみで、完了ではありません。consumer・成果物・外部receiptは未接続です。" : "The only accepted state is queued, never completed. No consumer, deliverable, or external receipt is connected." }
    var queued: String { ja ? "受付済み · queued" : "Received · queued" }

    func cellName(_ slotID: String) -> String {
        switch slotID {
        case "slot.create": ja ? "YouTube台本" : "YouTube Script"
        case "slot.grow": ja ? "SEO設計" : "SEO Blueprint"
        case "slot.launch": ja ? "ランディングページ" : "Landing Page"
        case "slot.sell": ja ? "商談返信" : "Sales Desk"
        case "slot.learn": ja ? "顧客インサイト" : "Customer Intel"
        case "slot.deliver": ja ? "納品チェック" : "Delivery Guard"
        default: slotID
        }
    }

    func cellPromise(_ slotID: String) -> String {
        switch slotID {
        case "slot.create": ja ? "アイデアを、撮影できる台本へ。" : "Turn an idea into a shoot-ready script."
        case "slot.grow": ja ? "検索意図を、発見される設計へ。" : "Turn search intent into a discoverable plan."
        case "slot.launch": ja ? "オファーを、公開前のページへ。" : "Turn an offer into a launch-ready page."
        case "slot.sell": ja ? "問い合わせを、誠実で強い返信へ。" : "Turn an inquiry into a clear, honest reply."
        case "slot.learn": ja ? "顧客の声を、次の意思決定へ。" : "Turn customer language into the next decision."
        case "slot.deliver": ja ? "約束と成果物のズレを、納品前に止める。" : "Catch promise–deliverable gaps before delivery."
        default: slotID
        }
    }

    func variantName(_ id: String) -> String {
        let japanese: [String: String] = [
            "youtube-script-writer": "YouTube台本", "short-video-script-writer": "ショート動画台本", "article-renewal": "記事リニューアル",
            "seo-blueprint": "SEO設計", "seo-article-renewal": "SEO記事改善", "content-repurpose": "コンテンツ再利用",
            "landing-page-sprint": "LPスプリント", "portfolio-site-sprint": "ポートフォリオサイト", "lead-magnet-page": "リード獲得ページ",
            "sales-objection-reply-builder": "商談返信", "estimate-builder": "見積もり作成", "proposal-builder": "提案文作成",
            "user-interview-synthesizer": "インタビュー分析", "support-theme-miner": "問い合わせ分析", "offer-insight-digest": "オファー改善メモ",
            "gig-delivery-verifier": "受託納品チェック", "web-delivery-verifier": "Web納品チェック", "document-delivery-verifier": "文書納品チェック"
        ]
        let english: [String: String] = [
            "youtube-script-writer": "YouTube script", "short-video-script-writer": "Short-video script", "article-renewal": "Article renewal",
            "seo-blueprint": "SEO blueprint", "seo-article-renewal": "SEO article renewal", "content-repurpose": "Content repurpose",
            "landing-page-sprint": "Landing-page sprint", "portfolio-site-sprint": "Portfolio site", "lead-magnet-page": "Lead-magnet page",
            "sales-objection-reply-builder": "Sales reply", "estimate-builder": "Estimate builder", "proposal-builder": "Proposal builder",
            "user-interview-synthesizer": "Interview synthesis", "support-theme-miner": "Support theme mining", "offer-insight-digest": "Offer insight digest",
            "gig-delivery-verifier": "Client delivery check", "web-delivery-verifier": "Web delivery check", "document-delivery-verifier": "Document delivery check"
        ]
        return (ja ? japanese[id] : english[id]) ?? id
    }

    func deliverables(for slotID: String) -> [String] {
        switch slotID {
        case "slot.create": ja ? ["タイトル案", "冒頭フック", "完成台本", "撮影キュー"] : ["Title options", "Opening hook", "Finished script", "Shoot cues"]
        case "slot.grow": ja ? ["検索意図", "キーワード群", "構成案", "改善優先度"] : ["Search intent", "Keyword clusters", "Outline", "Priorities"]
        case "slot.launch": ja ? ["情報設計", "コピー", "レスポンシブUI", "公開前チェック"] : ["Information design", "Copy", "Responsive UI", "Pre-launch check"]
        case "slot.sell": ja ? ["返信文", "確認事項", "次の一手", "リスク表示"] : ["Reply", "Questions", "Next action", "Risk notes"]
        case "slot.learn": ja ? ["共通テーマ", "顧客の言葉", "仮説", "次の検証"] : ["Themes", "Customer language", "Hypotheses", "Next test"]
        case "slot.deliver": ja ? ["要件照合", "不足一覧", "品質チェック", "納品判定"] : ["Requirement match", "Gaps", "Quality check", "Delivery verdict"]
        default: []
        }
    }

    func connectionTier(_ tier: ConnectionTier) -> String {
        switch tier {
        case .hub: "HUB"
        case .core: "CORE"
        case .planned: ja ? "計画中" : "PLANNED"
        }
    }

    func connectionState(_ state: ConnectionState) -> String {
        switch state {
        case .previewOnly: ja ? "Previewのみ" : "Preview only"
        case .separateAuthentication: ja ? "別認証 · 未統合" : "Separate auth · not unified"
        case .notConnected: ja ? "未接続" : "Not connected"
        case .planned: ja ? "計画中" : "Planned"
        }
    }

    func connectionName(_ id: String) -> String {
        switch id {
        case "life-hub": "Rockstar_ibot One"
        case "google-calendar": "Google Calendar"
        case "telegram": "Telegram"
        case "voice": ja ? "Voice・Call" : "Voice + Call"
        case "ai-tool-packages": aiToolPackages
        case "unified-account": ja ? "統一アカウント" : "Unified account"
        case "apns": "APNs"
        case "storekit": "StoreKit"
        default: id
        }
    }

    func connectionDescription(_ id: String) -> String {
        switch id {
        case "life-hub": ja ? "このiOS画面は端末内Previewです。Hub本番データとは同期していません。" : "This iOS surface is local preview data and is not synced with live Hub data."
        case "google-calendar": ja ? "CoreのCalendar認証は存在しますが、Hubの統一アカウントとはまだ別です。" : "Core Calendar auth exists, but it is not yet unified with the Hub account."
        case "telegram": ja ? "通知・質問・承認用。iOS Hubとは未接続です。" : "For notifications, questions, and approval; not connected to the iOS Hub."
        case "voice": ja ? "電話設定とreceiptは本番API配備後に接続します。" : "Call settings and receipts will connect after production API deployment."
        case "ai-tool-packages": aiToolPackageDescription
        case "unified-account": ja ? "Web・Core・Telegram・iOSのidentity bridgeは未実装です。" : "The identity bridge across Web, Core, Telegram, and iOS is not implemented."
        case "apns": ja ? "device token登録・通知outbox・deep linkは未実装です。" : "Device registration, notification outbox, and deep links are not implemented."
        case "storekit": ja ? "購入・復元・entitlement検証は未実装です。" : "Purchase, restore, and entitlement validation are not implemented."
        default: ""
        }
    }

    var queuedRuns: String { ja ? "Service受付" : "Service receipts" }
    var auditTrail: String { ja ? "監査履歴" : "Audit trail" }
    var noExternalReceipt: String { ja ? "外部成功receiptはまだありません。queuedは完了を意味しません。" : "No external success receipt exists. Queued never means completed." }
    func auditLabel(_ action: String) -> String {
        switch action {
        case "task.created": ja ? "タスクを追加" : "Task added"
        case "task.status_changed": ja ? "タスク状態を変更" : "Task status changed"
        case "checkin.saved": ja ? "身体・心のチェックインを保存" : "Body + Mind check-in saved"
        case "money.entry_created": ja ? "収支を記録" : "Ledger entry added"
        case "portfolio.slot_changed": ja ? "Previewサービス構成を変更" : "Preview Service Cell changed"
        case "service.run_queued": ja ? "サービス実行をqueued受付" : "Service request queued"
        default: action
        }
    }
}
