import SwiftUI

struct SoftPaywallView: View {
    @ObservedObject var model: AppViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var statusMessage: String?

    private var copy: LMCopy { LMCopy(locale: model.locale) }

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            Capsule()
                .fill(LMTheme.line)
                .frame(width: 42, height: 5)
                .frame(maxWidth: .infinity)

            Image(systemName: "sparkles")
                .font(.system(size: 34, weight: .black))
                .foregroundStyle(LMTheme.ink)
                .padding(16)
                .background(LMTheme.lime)
                .clipShape(Circle())

            Text(copy.paywallTitle)
                .font(.system(.largeTitle, design: .rounded, weight: .black))
            Text(copy.paywallBody)
                .font(.title3)
                .foregroundStyle(LMTheme.muted)

            if let statusMessage {
                Text(statusMessage)
                    .font(.footnote)
                    .foregroundStyle(LMTheme.muted)
            }

            Spacer(minLength: 8)

            Button(copy.upgrade) {
                statusMessage = copy.purchasesUnavailable
                model.showPurchaseUnavailable()
            }
            .buttonStyle(LMPrimaryButtonStyle())
            .accessibilityIdentifier(AccessibilityID.paywallUpgrade)

            Button(copy.restore) {
                statusMessage = copy.purchasesUnavailable
                model.showPurchaseUnavailable()
            }
            .buttonStyle(LMSecondaryButtonStyle())
            .accessibilityIdentifier(AccessibilityID.paywallRestore)

            Button(copy.continueFree) {
                model.dismissPaywall()
                dismiss()
            }
            .font(.headline)
            .foregroundStyle(LMTheme.ink)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .accessibilityIdentifier(AccessibilityID.paywallContinue)
        }
        .padding(24)
        .background(LMTheme.canvas)
    }
}
