import Foundation

enum PreviewScenario: String, CaseIterable, Identifiable, Sendable {
    case routeReady
    case needsInformation
    case noUpcomingEvent
    case routeUnavailable
    case failed

    var id: String { rawValue }

    var status: AnalysisStatus {
        switch self {
        case .routeReady: .routeReady
        case .needsInformation: .needsInformation
        case .noUpcomingEvent: .noUpcomingEvent
        case .routeUnavailable: .routeUnavailable
        case .failed: .failed
        }
    }
}

enum PreviewFixtures {
    static func profile(locale: ProductLocale) -> UserProfile {
        UserProfile(
            id: "preview-user-not-authenticated",
            name: locale == .ja ? "プレビューユーザー" : "Preview User",
            productLocale: locale,
            timezone: "Asia/Tokyo",
            home: HomeProjection(status: .ready, display: locale == .ja ? "渋谷" : "Shibuya"),
            phone: PhoneProjection(status: .missing, masked: nil),
            callsEnabled: false,
            callLanguage: nil
        )
    }

    static func bootstrap(locale: ProductLocale) -> BootstrapResponse {
        BootstrapResponse(
            user: profile(locale: locale),
            calendar: CalendarProjection(status: .connected),
            offer: OfferProjection(status: .available),
            analysis: AnalysisProjection(status: .routeReady)
        )
    }

    static func analysis(_ scenario: PreviewScenario, locale: ProductLocale) -> AnalysisResponse {
        let message = message(for: scenario, locale: locale)
        return AnalysisResponse(status: scenario.status, message: message)
    }

    static func page(_ scenario: PreviewScenario, locale: ProductLocale) -> ChatPage {
        ChatPage(
            messages: [
                ChatMessage(
                    id: "preview-system-1",
                    cursor: "preview-cursor-1",
                    createdAt: "2026-08-28T04:00:00Z",
                    locale: locale,
                    type: .system,
                    text: locale == .ja
                        ? "カレンダーを読み取り専用で接続しました。"
                        : "Calendar is connected with read-only access.",
                    userContent: nil,
                    question: nil,
                    route: nil,
                    actions: []
                ),
                message(for: scenario, locale: locale)
            ],
            nextCursor: "preview-cursor-2"
        )
    }

    static func message(for scenario: PreviewScenario, locale: ProductLocale) -> ChatMessage {
        switch scenario {
        case .routeReady:
            return routeMessage(locale: locale)
        case .needsInformation:
            return ChatMessage(
                id: "preview-question-1",
                cursor: "preview-cursor-2",
                createdAt: "2026-08-28T04:01:00Z",
                locale: locale,
                type: .question,
                text: locale == .ja
                    ? "次の予定の出発地点が必要です。どこから向かいますか？"
                    : "I need an origin for your next event. Where will you leave from?",
                userContent: UserContentProjection(eventTitle: "Roppongi meeting", eventLocation: nil),
                question: QuestionProjection(
                    id: "preview-question-id",
                    prompt: locale == .ja ? "出発地点" : "Starting point"
                ),
                route: nil,
                actions: [ChatAction(id: .reply, label: locale == .ja ? "回答" : "Reply")]
            )
        case .noUpcomingEvent:
            return statusMessage(
                id: "preview-empty-1",
                locale: locale,
                text: locale == .ja
                    ? "カレンダーは同期済みです。移動が必要な予定はありません。"
                    : "Calendar is synced. No upcoming event requires travel."
            )
        case .routeUnavailable:
            return ChatMessage(
                id: "preview-unavailable-1",
                cursor: "preview-cursor-2",
                createdAt: "2026-08-28T04:01:00Z",
                locale: locale,
                type: .routeUnavailable,
                text: locale == .ja
                    ? "予定は見つかりましたが、経路提供元に接続できません。予定の情報は保持されています。"
                    : "I found the event, but the route provider is unavailable. Your event is preserved.",
                userContent: UserContentProjection(eventTitle: "Roppongi meeting", eventLocation: "Roppongi"),
                question: nil,
                route: nil,
                actions: [ChatAction(id: .refresh, label: locale == .ja ? "再試行" : "Try again")]
            )
        case .failed:
            return statusMessage(
                id: "preview-failed-1",
                locale: locale,
                text: locale == .ja
                    ? "解析を完了できませんでした。再試行できます。"
                    : "Analysis could not finish. You can try again."
            )
        }
    }

    static func routeMessage(locale: ProductLocale) -> ChatMessage {
        let isJapanese = locale == .ja
        let route = RouteProjection(
            status: .routeReady,
            provider: .transit,
            providerAttribution: isJapanese ? "経路情報提供: Transit API（非公式）" : "Route data: Transit API (unofficial)",
            computedAt: "2026-08-28T04:00:00Z",
            timezone: "Asia/Tokyo",
            eventId: "preview-event-1",
            origin: RoutePlace(displayName: isJapanese ? "渋谷" : "Shibuya", userContent: nil),
            destination: RoutePlace(displayName: isJapanese ? "六本木" : "Roppongi", userContent: nil),
            leaveAt: "2026-08-28T04:40:00Z",
            arriveAt: "2026-08-28T05:07:00Z",
            durationSeconds: 1_620,
            bufferSeconds: 180,
            transferCount: 0,
            fare: RouteFare(currency: "JPY", amount: 210, medium: "IC"),
            steps: [
                RouteStep(
                    sequence: 1,
                    mode: .walk,
                    instruction: isJapanese ? "渋谷駅まで500メートル歩く" : "Walk 500 m to Shibuya Station",
                    from: nil,
                    to: isJapanese ? "渋谷駅" : "Shibuya Station",
                    service: nil,
                    headsign: nil,
                    platform: nil,
                    departAt: "2026-08-28T04:40:00Z",
                    arriveAt: "2026-08-28T04:47:00Z",
                    durationSeconds: 420
                ),
                RouteStep(
                    sequence: 2,
                    mode: .bus,
                    instruction: isJapanese ? "新橋駅前行きの都01に乗る" : "Take Toei Bus To 01 toward Shimbashi Station",
                    from: isJapanese ? "渋谷駅" : "Shibuya Station",
                    to: isJapanese ? "六本木駅前" : "Roppongi Station",
                    service: isJapanese ? "都01" : "Toei Bus To 01",
                    headsign: isJapanese ? "新橋駅前" : "Shimbashi Station",
                    platform: "51",
                    departAt: "2026-08-28T04:47:00Z",
                    arriveAt: "2026-08-28T05:01:00Z",
                    durationSeconds: 840
                ),
                RouteStep(
                    sequence: 3,
                    mode: .walk,
                    instruction: isJapanese ? "目的地まで450メートル歩く" : "Walk 450 m to the destination",
                    from: isJapanese ? "六本木駅前" : "Roppongi Station",
                    to: isJapanese ? "六本木" : "Roppongi",
                    service: nil,
                    headsign: nil,
                    platform: nil,
                    departAt: "2026-08-28T05:01:00Z",
                    arriveAt: "2026-08-28T05:07:00Z",
                    durationSeconds: 360
                )
            ]
        )

        return ChatMessage(
            id: "preview-route-1",
            cursor: "preview-cursor-2",
            createdAt: "2026-08-28T04:01:00Z",
            locale: locale,
            type: .route,
            text: isJapanese
                ? "次の予定は14時10分の六本木でのミーティングです。3分前に到着するには13時40分までに出発してください。"
                : "Your next event is Roppongi meeting at 2:10 PM. Leave by 1:40 PM to arrive with 3 minutes of buffer.",
            userContent: UserContentProjection(eventTitle: "Roppongi meeting", eventLocation: "Roppongi"),
            question: nil,
            route: route,
            actions: [ChatAction(id: .showRoute, label: isJapanese ? "経路の詳細" : "Show full route")]
        )
    }

    private static func statusMessage(id: String, locale: ProductLocale, text: String) -> ChatMessage {
        ChatMessage(
            id: id,
            cursor: "preview-cursor-2",
            createdAt: "2026-08-28T04:01:00Z",
            locale: locale,
            type: .analysis,
            text: text,
            userContent: nil,
            question: nil,
            route: nil,
            actions: [ChatAction(id: .refresh, label: locale == .ja ? "更新" : "Refresh")]
        )
    }
}
