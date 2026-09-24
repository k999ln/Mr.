import SwiftUI

struct ChatView: View {
    @ObservedObject var model: AppViewModel
    @ObservedObject private var chat: ChatViewModel
    private var copy: LMCopy { LMCopy(locale: model.locale) }

    init(model: AppViewModel) {
        self.model = model
        chat = model.chat
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().overlay(LMTheme.line)
            messageList
            if chat.openQuestion?.id != nil {
                ChatComposerView(model: model, chat: chat)
            }
        }
        .background(LMTheme.canvas)
        .sheet(isPresented: $model.isRouteDetailPresented) {
            if let route = model.selectedRoute {
                RouteDetailSheet(route: route, locale: model.locale)
            }
        }
        .sheet(isPresented: $model.isPaywallPresented) {
            SoftPaywallView(model: model)
                .presentationDetents([.medium, .large])
                .interactiveDismissDisabled(false)
        }
        .sheet(isPresented: $model.isSettingsPresented) {
            SettingsView(model: model)
        }
        .sheet(isPresented: $model.isCommandCenterPresented) {
            CommandCenterView(model: model.operatingHub, locale: model.locale)
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text("ROCKSTAR_IBOT")
                    .font(.caption2.weight(.black))
                    .tracking(1.5)
                    .foregroundStyle(LMTheme.muted)
                Text(copy.chatTitle)
                    .font(.title2.weight(.black))
                    .foregroundStyle(LMTheme.ink)
            }
            Spacer()
            Button {
                model.showCommandCenter()
            } label: {
                Image(systemName: "square.grid.2x2")
                    .frame(width: 42, height: 42)
            }
            .buttonStyle(.plain)
            .foregroundStyle(LMTheme.ink)
            .accessibilityLabel(OperatingCopy(locale: model.locale).commandCenter)
            .accessibilityIdentifier(AccessibilityID.chatCommandCenter)

            Button {
                Task { await model.refreshChat() }
            } label: {
                Image(systemName: "arrow.clockwise")
                    .frame(width: 42, height: 42)
            }
            .buttonStyle(.plain)
            .foregroundStyle(LMTheme.ink)
            .disabled(chat.isLoading)
            .accessibilityLabel(copy.refresh)
            .accessibilityIdentifier(AccessibilityID.chatRefresh)

            Button {
                model.isSettingsPresented = true
            } label: {
                Image(systemName: "slider.horizontal.3")
                    .frame(width: 42, height: 42)
            }
            .buttonStyle(.plain)
            .foregroundStyle(LMTheme.ink)
            .accessibilityLabel(copy.settings)
            .accessibilityIdentifier(AccessibilityID.chatSettings)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .background(LMTheme.canvas)
    }

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 14) {
                    if let error = chat.errorMessage {
                        errorRow(error)
                    }
                    ForEach(chat.messages) { message in
                        MessageBubbleView(message: message, model: model)
                            .id(message.id)
                    }
                    if chat.isLoading {
                        ProgressView()
                            .tint(LMTheme.ink)
                            .padding()
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 18)
            }
            .accessibilityIdentifier(AccessibilityID.chatList)
            .refreshable { await model.refreshChat() }
            .onChange(of: chat.messages.count) { _, _ in
                guard let last = chat.messages.last else { return }
                withAnimation(.easeOut(duration: 0.25)) {
                    proxy.scrollTo(last.id, anchor: .bottom)
                }
            }
        }
    }

    private func errorRow(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(message, systemImage: "exclamationmark.triangle")
                .font(.subheadline)
            Button(copy.retry) {
                Task { await model.refreshChat() }
            }
            .font(.subheadline.bold())
        }
        .foregroundStyle(LMTheme.ink)
        .frame(maxWidth: .infinity, alignment: .leading)
        .lmCard()
    }
}
