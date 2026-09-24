import Foundation

struct LMCopy {
    let locale: ProductLocale
    private var ja: Bool { locale == .ja }

    var previewBanner: String { ja ? "プレビューデータ・実アカウント未接続" : "PREVIEW DATA · NO REAL ACCOUNT CONNECTED" }
    var offline: String { ja ? "オフラインです。保存済みの内容を表示しています。" : "You are offline. Cached information remains visible." }
    var calendarConnecting: String { ja ? "Google カレンダーへ接続中" : "Connecting Google Calendar" }
    var welcomePromise: String { ja ? "一日は、もう整っています。" : "Your day, already handled." }
    var welcomeBody: String {
        ja
            ? "カレンダーを読み取り、移動時間を加え、動き出す時刻を伝えます。"
            : "Rockstar_ibot reads your calendar, adds travel time, and tells you exactly when to move."
    }
    var connectCalendar: String { ja ? "Google カレンダーを接続" : "Connect Google Calendar" }
    var previewCalendar: String { ja ? "接続フローをプレビュー" : "Preview Calendar connection" }
    var readOnly: String { ja ? "最初は読み取り専用です。いつでも管理できます。" : "Read-only access first. You stay in control." }
    var profileTitle: String { ja ? "あなたの一日を設定" : "Set up your day" }
    var profileBody: String { ja ? "最初の移動を計算するために必要です。住所が予定の参加者へ共有されることはありません。" : "This is required for your first trip. Your home is never shown to event attendees." }
    var name: String { ja ? "名前" : "Name" }
    var home: String { ja ? "自宅・通常の出発地点" : "Home or usual starting point" }
    var language: String { ja ? "表示言語" : "Product language" }
    var continueLabel: String { ja ? "続ける" : "Continue" }
    var phoneTitle: String { ja ? "電話番号" : "Phone number" }
    var phoneBody: String { ja ? "設定で明示的に有効にするまで、電話は発信されません。" : "Calls remain off until you enable them in Settings." }
    var addPhone: String { ja ? "電話番号を追加" : "Add phone number" }
    var skipPhone: String { ja ? "今はスキップ" : "Skip for now" }
    var phoneHint: String { ja ? "国番号を含む形式（例: +81…）" : "E.164 format, for example +1…" }
    var invalidPhone: String { ja ? "国番号を含む電話番号を入力してください。" : "Enter a phone number including the country code." }
    var analysisTitle: String { ja ? "次の行動を確認中" : "Checking your next action" }
    var analysisBody: String { ja ? "判断と外部操作は Rockstar_ibot のサーバーが行います。" : "Rockstar_ibot's backend owns every decision and side effect." }
    var readingEvents: String { ja ? "今後の予定を読み取り中" : "Reading upcoming events" }
    var checkingLocations: String { ja ? "場所を確認中" : "Checking locations" }
    var calculatingTrip: String { ja ? "次の移動を計算中" : "Calculating the next trip" }
    var chatTitle: String { ja ? "今日" : "Today" }
    var refresh: String { ja ? "更新" : "Refresh" }
    var settings: String { ja ? "設定" : "Settings" }
    var retry: String { ja ? "再試行" : "Try again" }
    var send: String { ja ? "送信" : "Send" }
    var replyPlaceholder: String { ja ? "質問に回答" : "Answer the open question" }
    var route: String { ja ? "経路" : "ROUTE" }
    var leave: String { ja ? "出発" : "Leave" }
    var arrive: String { ja ? "到着" : "Arrive" }
    var minutes: String { ja ? "分" : "min" }
    var buffer: String { ja ? "余裕" : "buffer" }
    var showFullRoute: String { ja ? "経路の詳細" : "Show full route" }
    var routeDetailTitle: String { ja ? "経路の詳細" : "Route details" }
    var close: String { ja ? "閉じる" : "Close" }
    var routeHonesty: String {
        ja
            ? "現在地は使用していません。提供元が返さない出入口、最適車両、混雑情報は表示しません。運休など重要な変更は公式情報を確認してください。"
            : "Live location is off. Entrance, exit, best-car, and crowding details are omitted when the provider does not return them. Confirm official service information when disruption matters."
    }
    var paywallTitle: String { ja ? "Rockstar_ibot をもっと活用" : "Make more of your day" }
    var paywallBody: String { ja ? "経路と会話は無料のまま利用できます。" : "Your route and conversation remain available on the free path." }
    var upgrade: String { ja ? "アップグレード" : "Upgrade" }
    var restore: String { ja ? "購入を復元" : "Restore purchases" }
    var continueFree: String { ja ? "無料で続ける" : "Continue free" }
    var purchasesUnavailable: String { ja ? "このプレビューでは購入処理を行いません。" : "Purchases are not connected in this preview build." }
    var calendar: String { ja ? "カレンダー" : "Calendar" }
    var connected: String { ja ? "接続済み" : "Connected" }
    var disconnected: String { ja ? "未接続" : "Disconnected" }
    var actionRequired: String { ja ? "操作が必要" : "Action required" }
    var error: String { ja ? "エラー" : "Error" }
    var calls: String { ja ? "電話" : "Calls" }
    var callsOff: String { ja ? "電話は無効です" : "Calls are disabled" }
    var callLanguage: String { ja ? "電話の言語" : "Call language" }
    var callNow: String { ja ? "今すぐ電話" : "Call me now" }
    var callConfirmation: String { ja ? "設定済みの番号へ発信しますか？" : "Call the configured number now?" }
    var confirm: String { ja ? "確認" : "Confirm" }
    var cancel: String { ja ? "キャンセル" : "Cancel" }
    var subscription: String { ja ? "サブスクリプション" : "Subscription" }
    var logout: String { ja ? "ログアウト" : "Log out" }
    var deleteAccount: String { ja ? "アカウントを削除" : "Delete account" }
    var deleteConfirmation: String { ja ? "接続とデータを削除します。この操作は取り消せません。" : "This removes your connections and data. This cannot be undone." }
    var previewScenario: String { ja ? "プレビュー状態" : "Preview scenario" }
    var routeReady: String { ja ? "経路あり" : "Route ready" }
    var needsInformation: String { ja ? "情報が必要" : "Needs information" }
    var noUpcomingEvent: String { ja ? "移動予定なし" : "No upcoming event" }
    var routeUnavailable: String { ja ? "経路取得不可" : "Route unavailable" }
    var failed: String { ja ? "失敗" : "Failed" }
    var previewDisclosure: String { ja ? "このビルドのデータは画面確認用です。実際のカレンダー、電話、購入、削除は実行されません。" : "This build uses screen-review fixtures. It never connects a real Calendar, places a call, makes a purchase, or deletes an account." }
}
