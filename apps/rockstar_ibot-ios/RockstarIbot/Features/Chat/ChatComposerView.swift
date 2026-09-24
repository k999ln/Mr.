import SwiftUI

struct ChatComposerView: View {
    @ObservedObject var model: AppViewModel
    @ObservedObject var chat: ChatViewModel
    private var copy: LMCopy { LMCopy(locale: model.locale) }

    var body: some View {
        HStack(alignment: .bottom, spacing: 10) {
            TextField(copy.replyPlaceholder, text: $chat.composerText, axis: .vertical)
                .lineLimit(1...5)
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(Color.white.opacity(0.78))
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 18).stroke(LMTheme.line))
                .accessibilityIdentifier(AccessibilityID.chatComposer)

            Button {
                Task { await chat.sendReply() }
            } label: {
                Image(systemName: "arrow.up")
                    .font(.headline.weight(.black))
                    .foregroundStyle(LMTheme.ink)
                    .frame(width: 46, height: 46)
                    .background(LMTheme.lime)
                    .clipShape(Circle())
            }
            .disabled(!chat.canReply || chat.isLoading)
            .opacity(chat.canReply ? 1 : 0.4)
            .accessibilityLabel(copy.send)
            .accessibilityIdentifier(AccessibilityID.chatSend)
        }
        .padding(.horizontal, 14)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .background(.ultraThinMaterial)
    }
}
