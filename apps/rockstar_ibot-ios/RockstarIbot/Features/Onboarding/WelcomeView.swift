import SwiftUI

struct WelcomeView: View {
    @ObservedObject var model: AppViewModel
    private var copy: LMCopy { LMCopy(locale: model.locale) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                Spacer(minLength: 54)

                Text("ROCKSTAR_IBOT")
                    .font(.caption.weight(.black))
                    .tracking(2.4)
                    .foregroundStyle(LMTheme.muted)

                VStack(alignment: .leading, spacing: 14) {
                    Text(copy.welcomePromise)
                        .font(.system(.largeTitle, design: .rounded, weight: .black))
                        .foregroundStyle(LMTheme.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(copy.welcomeBody)
                        .font(.title3)
                        .foregroundStyle(LMTheme.muted)
                        .lineSpacing(5)
                }

                if model.isPreview {
                    Label(copy.previewDisclosure, systemImage: "eye")
                        .font(.subheadline)
                        .foregroundStyle(LMTheme.ink)
                        .lmCard(padding: 16)
                }

                Spacer(minLength: 42)

                VStack(spacing: 14) {
                    Button {
                        Task { await model.connectCalendar() }
                    } label: {
                        Label(
                            model.isPreview ? copy.previewCalendar : copy.connectCalendar,
                            systemImage: "calendar.badge.plus"
                        )
                    }
                    .buttonStyle(LMPrimaryButtonStyle())
                    .accessibilityIdentifier(AccessibilityID.welcomeConnect)

                    Text(copy.readOnly)
                        .font(.footnote)
                        .foregroundStyle(LMTheme.muted)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 28)
            .frame(maxWidth: 640, minHeight: 700)
            .frame(maxWidth: .infinity)
        }
    }
}

struct CalendarConnectingView: View {
    let locale: ProductLocale
    private var copy: LMCopy { LMCopy(locale: locale) }

    var body: some View {
        VStack(spacing: 24) {
            ProgressView()
                .controlSize(.large)
                .tint(LMTheme.ink)
            Text(copy.calendarConnecting)
                .font(.title2.bold())
                .foregroundStyle(LMTheme.ink)
            Text(copy.readOnly)
                .font(.body)
                .foregroundStyle(LMTheme.muted)
        }
        .padding(28)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
