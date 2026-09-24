import SwiftUI

struct PhoneSetupView: View {
    @ObservedObject var model: AppViewModel
    @State private var attemptedAdd = false
    private var copy: LMCopy { LMCopy(locale: model.locale) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                Spacer(minLength: 42)
                Image(systemName: "phone.badge.checkmark")
                    .font(.system(size: 42, weight: .semibold))
                    .foregroundStyle(LMTheme.ink)
                    .padding(18)
                    .background(LMTheme.lime)
                    .clipShape(Circle())

                Text(copy.phoneTitle)
                    .font(.system(.largeTitle, design: .rounded, weight: .black))
                    .foregroundStyle(LMTheme.ink)
                Text(copy.phoneBody)
                    .font(.title3)
                    .foregroundStyle(LMTheme.muted)

                VStack(alignment: .leading, spacing: 10) {
                    TextField(copy.phoneHint, text: $model.phoneNumber)
                        .keyboardType(.phonePad)
                        .textContentType(.telephoneNumber)
                        .padding(15)
                        .background(Color.white.opacity(0.72))
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(LMTheme.line))
                        .accessibilityIdentifier(AccessibilityID.phoneNumber)
                    if attemptedAdd && !model.isValidPhone {
                        Text(copy.invalidPhone)
                            .font(.footnote)
                            .foregroundStyle(LMTheme.danger)
                    }
                }
                .lmCard()

                VStack(spacing: 12) {
                    Button(copy.addPhone) {
                        attemptedAdd = true
                        Task { await model.addPhone() }
                    }
                    .buttonStyle(LMPrimaryButtonStyle())
                    .accessibilityIdentifier(AccessibilityID.phoneAdd)

                    Button(copy.skipPhone) {
                        Task { await model.skipPhone() }
                    }
                    .buttonStyle(LMSecondaryButtonStyle())
                    .accessibilityIdentifier(AccessibilityID.phoneSkip)
                }
            }
            .padding(24)
            .frame(maxWidth: 640)
            .frame(maxWidth: .infinity)
        }
    }
}
