import SwiftUI

struct RootView: View {
    @ObservedObject var model: AppViewModel
    @ObservedObject var networkMonitor: NetworkMonitor

    private var copy: LMCopy { LMCopy(locale: model.locale) }

    var body: some View {
        ZStack {
            LMTheme.canvas.ignoresSafeArea()
            VStack(spacing: 0) {
                if model.isPreview {
                    previewBanner
                }
                if !networkMonitor.isConnected {
                    statusBanner(text: copy.offline, color: LMTheme.warning)
                }
                content
            }
        }
        .environment(\.locale, model.locale.locale)
        .alert(item: $model.errorState) { error in
            Alert(
                title: Text(copy.error),
                message: Text(error.message),
                dismissButton: .default(Text(copy.close))
            )
        }
    }

    @ViewBuilder
    private var content: some View {
        switch model.route {
        case .restoring:
            ProgressView()
                .tint(LMTheme.ink)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .welcome:
            WelcomeView(model: model)
        case .calendarConnecting:
            CalendarConnectingView(locale: model.locale)
        case .profile:
            ProfileConfirmationView(model: model)
        case .phone:
            PhoneSetupView(model: model)
        case .analyzing:
            FirstAnalysisView(model: model)
        case .chat:
            ChatView(model: model)
        }
    }

    private var previewBanner: some View {
        statusBanner(text: copy.previewBanner, color: LMTheme.lime)
            .accessibilityIdentifier(AccessibilityID.previewBanner)
    }

    private func statusBanner(text: String, color: Color) -> some View {
        Text(text)
            .font(.caption.weight(.bold))
            .tracking(0.7)
            .foregroundStyle(LMTheme.ink)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 7)
            .padding(.horizontal, 12)
            .background(color)
            .accessibilityLabel(text)
    }
}

#Preview {
    let model = AppViewModel(environment: .preview())
    return RootView(model: model, networkMonitor: NetworkMonitor(startImmediately: false))
}
