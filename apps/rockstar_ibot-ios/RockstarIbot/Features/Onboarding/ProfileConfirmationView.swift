import SwiftUI

struct ProfileConfirmationView: View {
    @ObservedObject var model: AppViewModel
    @FocusState private var focusedField: Field?

    private enum Field { case name, home }
    private var copy: LMCopy { LMCopy(locale: model.locale) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Spacer(minLength: 24)
                Text(copy.profileTitle)
                    .font(.system(.largeTitle, design: .rounded, weight: .black))
                    .foregroundStyle(LMTheme.ink)
                Text(copy.profileBody)
                    .font(.body)
                    .foregroundStyle(LMTheme.muted)
                    .lineSpacing(4)

                VStack(spacing: 18) {
                    field(title: copy.name, text: $model.name, field: .name)
                        .accessibilityIdentifier(AccessibilityID.profileName)
                    field(title: copy.home, text: $model.homeAddress, field: .home)
                        .accessibilityIdentifier(AccessibilityID.profileHome)

                    VStack(alignment: .leading, spacing: 9) {
                        Text(copy.language)
                            .font(.subheadline.weight(.semibold))
                        Picker(copy.language, selection: $model.locale) {
                            Text("English").tag(ProductLocale.en)
                            Text("日本語").tag(ProductLocale.ja)
                        }
                        .pickerStyle(.segmented)
                    }
                }
                .lmCard()

                Button {
                    Task { await model.saveProfile() }
                } label: {
                    Text(copy.continueLabel)
                }
                .buttonStyle(LMPrimaryButtonStyle())
                .disabled(!model.canContinueProfile)
                .opacity(model.canContinueProfile ? 1 : 0.45)
                .accessibilityIdentifier(AccessibilityID.profileContinue)
            }
            .padding(24)
            .frame(maxWidth: 640)
            .frame(maxWidth: .infinity)
        }
    }

    private func field(title: String, text: Binding<String>, field: Field) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(title)
                .font(.subheadline.weight(.semibold))
            TextField(title, text: text)
                .textInputAutocapitalization(.words)
                .submitLabel(field == .name ? .next : .done)
                .focused($focusedField, equals: field)
                .padding(14)
                .background(Color.white.opacity(0.72))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(LMTheme.line)
                )
                .onSubmit {
                    focusedField = field == .name ? .home : nil
                }
        }
    }
}
