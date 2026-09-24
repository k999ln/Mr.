import SwiftUI

struct RouteDetailSheet: View {
    let route: RouteProjection
    let locale: ProductLocale
    @Environment(\.dismiss) private var dismiss

    private var copy: LMCopy { LMCopy(locale: locale) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    routeHeader

                    VStack(spacing: 0) {
                        ForEach(Array(route.steps.enumerated()), id: \.element.id) { index, step in
                            stepRow(step, isLast: index == route.steps.count - 1)
                        }
                    }
                    .lmCard(padding: 16)

                    Label(copy.routeHonesty, systemImage: "checkmark.shield")
                        .font(.footnote)
                        .foregroundStyle(LMTheme.muted)
                        .lineSpacing(3)
                        .lmCard(padding: 16)
                }
                .padding(18)
            }
            .background(LMTheme.canvas)
            .navigationTitle(copy.routeDetailTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(copy.close) { dismiss() }
                        .accessibilityIdentifier(AccessibilityID.routeDetailClose)
                }
            }
        }
        .tint(LMTheme.ink)
    }

    private var routeHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("\(route.origin.displayName) → \(route.destination.displayName)")
                .font(.title2.weight(.black))
            Text("\(copy.leave) \(route.formattedTime(route.leaveAt, locale: locale.locale))  ·  \(copy.arrive) \(route.formattedTime(route.arriveAt, locale: locale.locale))")
                .font(.headline)
            Text(route.providerAttribution)
                .font(.caption)
                .foregroundStyle(LMTheme.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .lmCard()
    }

    private func stepRow(_ step: RouteStep, isLast: Bool) -> some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(spacing: 0) {
                ZStack {
                    Circle().fill(LMTheme.lime).frame(width: 28, height: 28)
                    Text("\(step.sequence)").font(.caption.bold())
                }
                if !isLast {
                    Rectangle()
                        .fill(LMTheme.line)
                        .frame(width: 2, height: 54)
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                if let departAt = step.departAt {
                    Text(route.formattedTime(departAt, locale: locale.locale))
                        .font(.caption.weight(.bold))
                        .foregroundStyle(LMTheme.muted)
                }
                Text(step.instruction)
                    .font(.body.weight(.semibold))
                if let platform = step.platform {
                    Text(locale == .ja ? "乗り場 \(platform)" : "Platform \(platform)")
                        .font(.caption)
                        .foregroundStyle(LMTheme.muted)
                }
            }
            .padding(.bottom, isLast ? 0 : 18)
            Spacer(minLength: 0)
        }
    }
}
