import SwiftUI

struct MessageBubbleView: View {
    let message: ChatMessage
    @ObservedObject var model: AppViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(message.text)
                .font(.body)
                .foregroundStyle(LMTheme.ink)
                .lineSpacing(4)
                .textSelection(.enabled)

            if let route = message.route {
                RouteMessageView(
                    messageID: message.id,
                    route: route,
                    locale: model.locale,
                    showDetails: { model.showRoute(route) }
                )
            } else if message.actions.contains(where: { $0.id == .refresh }) {
                Button(LMCopy(locale: model.locale).retry) {
                    Task { await model.refreshChat() }
                }
                .font(.subheadline.weight(.bold))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .lmCard()
        .accessibilityElement(children: .contain)
    }
}
