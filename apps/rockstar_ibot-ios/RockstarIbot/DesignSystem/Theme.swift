import SwiftUI

enum LMTheme {
    static let canvas = Color(red: 0.965, green: 0.949, blue: 0.902)
    static let card = Color(red: 0.996, green: 0.990, blue: 0.965)
    static let ink = Color(red: 0.055, green: 0.055, blue: 0.048)
    static let muted = Color(red: 0.36, green: 0.35, blue: 0.31)
    static let line = Color.black.opacity(0.12)
    static let lime = Color(red: 0.722, green: 0.945, blue: 0.286)
    static let warning = Color(red: 0.94, green: 0.66, blue: 0.18)
    static let danger = Color(red: 0.74, green: 0.14, blue: 0.12)
}

struct LMPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(LMTheme.ink)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(LMTheme.lime.opacity(configuration.isPressed ? 0.72 : 1))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
    }
}

struct LMSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(LMTheme.ink)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(LMTheme.card.opacity(configuration.isPressed ? 0.65 : 1))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(LMTheme.line, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

extension View {
    func lmCard(padding: CGFloat = 18) -> some View {
        self
            .padding(padding)
            .background(LMTheme.card)
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(LMTheme.line, lineWidth: 1)
            )
    }
}
