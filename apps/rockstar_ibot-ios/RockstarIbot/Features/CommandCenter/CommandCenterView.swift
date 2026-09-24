import SwiftUI

enum HubDestination: Hashable {
    case today
    case wellbeing
    case money
    case work
    case services
    case connections
    case proof
}

struct CommandCenterView: View {
    @ObservedObject var model: OperatingHubViewModel
    let locale: ProductLocale
    @Environment(\.dismiss) private var dismiss

    private var copy: OperatingCopy { OperatingCopy(locale: locale) }

    var body: some View {
        VStack(spacing: 0) {
            previewBanner
            NavigationStack {
                HubHomeView(model: model, locale: locale)
                    .navigationDestination(for: HubDestination.self) { destination in
                        destinationView(destination)
                    }
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button(copy.close) { dismiss() }
                                .accessibilityIdentifier(AccessibilityID.hubClose)
                        }
                    }
            }
            .tint(LMTheme.ink)
        }
        .background(LMTheme.canvas)
        .preferredColorScheme(.light)
        .task { await model.load() }
    }

    private var previewBanner: some View {
        VStack(spacing: 3) {
            Text(copy.previewBanner)
                .font(.caption.weight(.black))
                .tracking(0.7)
            Text(copy.previewDisclosure)
                .font(.caption2)
                .multilineTextAlignment(.center)
        }
        .foregroundStyle(LMTheme.ink)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(LMTheme.lime)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(AccessibilityID.hubPreviewBanner)
    }

    @ViewBuilder
    private func destinationView(_ destination: HubDestination) -> some View {
        switch destination {
        case .today: TodayHubView(model: model, locale: locale)
        case .wellbeing: WellbeingHubView(model: model, locale: locale)
        case .money: MoneyHubView(model: model, locale: locale)
        case .work: WorkQueueHubView(model: model, locale: locale)
        case .services: ServiceCellsHubView(model: model, locale: locale)
        case .connections: ConnectionsHubView(model: model, locale: locale)
        case .proof: ProofHubView(model: model, locale: locale)
        }
    }
}

struct HubHomeView: View {
    @ObservedObject var model: OperatingHubViewModel
    let locale: ProductLocale
    private var copy: OperatingCopy { OperatingCopy(locale: locale) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 9) {
                    Text("ROCKSTAR_IBOT ONE")
                        .font(.caption.weight(.black))
                        .tracking(2)
                        .foregroundStyle(LMTheme.muted)
                    Text(copy.commandCenter)
                        .font(.system(.largeTitle, design: .rounded, weight: .black))
                    Text(copy.hubPromise)
                        .font(.title3)
                        .foregroundStyle(LMTheme.muted)
                }

                if model.isLoading {
                    ProgressView(copy.loading)
                        .frame(maxWidth: .infinity)
                        .lmCard()
                }

                if let error = model.errorMessage {
                    VStack(alignment: .leading, spacing: 10) {
                        Label(error, systemImage: "exclamationmark.triangle")
                        Button(copy.retry) { Task { await model.load(force: true) } }
                            .font(.headline)
                    }
                    .lmCard()
                }

                if model.noticeMessage != nil {
                    Label(copy.previewSaved, systemImage: "checkmark.circle")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(LMTheme.muted)
                        .lmCard(padding: 14)
                }

                destinationCard(
                    .today,
                    title: copy.today,
                    detail: copy.todayDescription,
                    icon: "checkmark.circle",
                    value: "\(model.snapshot.openTaskCount)",
                    identifier: AccessibilityID.hubToday
                )
                destinationCard(
                    .wellbeing,
                    title: copy.wellbeing,
                    detail: copy.wellbeingDescription,
                    icon: "heart.text.square",
                    value: model.snapshot.checkin?.day ?? "—",
                    identifier: AccessibilityID.hubWellbeing
                )
                destinationCard(
                    .money,
                    title: copy.money,
                    detail: copy.moneyDescription,
                    icon: "chart.bar",
                    value: "4",
                    identifier: AccessibilityID.hubMoney
                )
                destinationCard(
                    .work,
                    title: copy.workQueue,
                    detail: copy.workDescription,
                    icon: "briefcase",
                    value: "\(model.snapshot.openWorkTaskCount)",
                    identifier: AccessibilityID.hubWork
                )
                destinationCard(
                    .services,
                    title: copy.services,
                    detail: copy.servicesDescription,
                    icon: "shippingbox",
                    value: "6",
                    identifier: AccessibilityID.hubServices
                )
                destinationCard(
                    .connections,
                    title: copy.connections,
                    detail: copy.connectionsDescription,
                    icon: "link",
                    value: "\(model.snapshot.connections.count)",
                    identifier: AccessibilityID.hubConnections
                )
                destinationCard(
                    .proof,
                    title: copy.proof,
                    detail: copy.proofDescription,
                    icon: "checkmark.shield",
                    value: "\(model.snapshot.auditEvents.count)",
                    identifier: AccessibilityID.hubProof
                )
            }
            .padding(18)
            .frame(maxWidth: 720)
            .frame(maxWidth: .infinity)
        }
        .background(LMTheme.canvas)
        .navigationTitle(copy.hubTitle)
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier(AccessibilityID.hubHome)
    }

    private func destinationCard(
        _ destination: HubDestination,
        title: String,
        detail: String,
        icon: String,
        value: String,
        identifier: String
    ) -> some View {
        NavigationLink(value: destination) {
            HStack(spacing: 15) {
                Image(systemName: icon)
                    .font(.title2.weight(.bold))
                    .frame(width: 46, height: 46)
                    .background(LMTheme.lime)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.headline.weight(.black))
                        .foregroundStyle(LMTheme.ink)
                    Text(detail)
                        .font(.footnote)
                        .foregroundStyle(LMTheme.muted)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 8)
                Text(value)
                    .font(.caption.weight(.black))
                    .foregroundStyle(LMTheme.muted)
                Image(systemName: "chevron.right")
                    .font(.caption.bold())
                    .foregroundStyle(LMTheme.muted)
            }
            .lmCard(padding: 14)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(identifier)
    }
}

struct HubScreenIntro: View {
    let title: String
    let detail: String
    let icon: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: icon)
                .font(.title.weight(.black))
                .padding(13)
                .background(LMTheme.lime)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            Text(title)
                .font(.system(.title, design: .rounded, weight: .black))
            Text(detail)
                .font(.body)
                .foregroundStyle(LMTheme.muted)
                .lineSpacing(3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct HubNoticeView: View {
    @ObservedObject var model: OperatingHubViewModel
    let locale: ProductLocale

    var body: some View {
        if let error = model.errorMessage {
            Label(error, systemImage: "exclamationmark.triangle")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(LMTheme.danger)
                .lmCard(padding: 14)
        } else if model.noticeMessage != nil {
            Label(OperatingCopy(locale: locale).previewSaved, systemImage: "checkmark.circle")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(LMTheme.muted)
                .lmCard(padding: 14)
        }
    }
}
