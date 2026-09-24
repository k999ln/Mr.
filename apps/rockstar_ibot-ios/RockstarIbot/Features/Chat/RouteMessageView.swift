import SwiftUI

struct RouteMessageView: View {
    let messageID: String
    let route: RouteProjection
    let locale: ProductLocale
    let showDetails: () -> Void

    private var copy: LMCopy { LMCopy(locale: locale) }
    private var localeValue: Locale { locale.locale }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text(copy.route)
                    .font(.caption2.weight(.black))
                    .tracking(1.4)
                Spacer()
                Text(route.providerAttribution)
                    .font(.caption2)
                    .foregroundStyle(LMTheme.muted)
            }

            HStack(spacing: 8) {
                Text(route.origin.displayName.uppercased())
                Image(systemName: "arrow.right")
                Text(route.destination.displayName.uppercased())
            }
            .font(.headline.weight(.black))

            HStack(alignment: .firstTextBaseline) {
                Text("\(route.durationMinutes)")
                    .font(.system(size: 34, weight: .black, design: .rounded))
                Text(copy.minutes)
                    .font(.headline)
                Spacer()
                VStack(alignment: .trailing, spacing: 3) {
                    Text("\(copy.arrive) \(route.formattedTime(route.arriveAt, locale: localeValue))")
                        .font(.headline)
                    Text("\(route.bufferMinutes) \(copy.minutes) \(copy.buffer)")
                        .font(.caption)
                        .foregroundStyle(LMTheme.muted)
                }
            }

            Text(stepSummary)
                .font(.subheadline)
                .foregroundStyle(LMTheme.muted)
                .lineLimit(3)

            if let fare = route.fare {
                Text(fareText(fare))
                    .font(.subheadline.weight(.bold))
            }

            Button(action: showDetails) {
                Label(copy.showFullRoute, systemImage: "list.number")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(LMSecondaryButtonStyle())
            .accessibilityIdentifier(AccessibilityID.routeShowDetails)
        }
        .padding(16)
        .background(LMTheme.lime.opacity(0.28))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(LMTheme.ink.opacity(0.15)))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("route.card.\(messageID)")
    }

    private var stepSummary: String {
        route.steps.map { step in
            if let service = step.service { return service }
            return step.instruction
        }.joined(separator: "  →  ")
    }

    private func fareText(_ fare: RouteFare) -> String {
        let amount = NSDecimalNumber(decimal: fare.amount).stringValue
        let medium = fare.medium.map { "\($0) " } ?? ""
        if fare.currency == "JPY" { return "\(medium)¥\(amount)" }
        return "\(medium)\(fare.currency) \(amount)"
    }
}
