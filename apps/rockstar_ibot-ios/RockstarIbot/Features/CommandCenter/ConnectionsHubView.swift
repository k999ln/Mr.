import SwiftUI

struct ConnectionsHubView: View {
    @ObservedObject var model: OperatingHubViewModel
    let locale: ProductLocale
    private var copy: OperatingCopy { OperatingCopy(locale: locale) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HubScreenIntro(title: copy.connections, detail: copy.connectionsDescription, icon: "link")

                Label(copy.previewDisclosure, systemImage: "person.badge.shield.checkmark")
                    .font(.footnote)
                    .foregroundStyle(LMTheme.muted)
                    .lmCard(padding: 14)

                ForEach(ConnectionTier.allCases, id: \.rawValue) { tier in
                    let items = model.snapshot.connections.filter { $0.tier == tier }
                    if !items.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(copy.connectionTier(tier))
                                .font(.caption.weight(.black))
                                .tracking(1.2)
                                .foregroundStyle(LMTheme.muted)
                            ForEach(items) { connection in
                                connectionRow(connection)
                            }
                        }
                    }
                }

                aiToolPackageSection
            }
            .padding(18)
            .frame(maxWidth: 720)
            .frame(maxWidth: .infinity)
        }
        .background(LMTheme.canvas)
        .navigationTitle(copy.connections)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var aiToolPackageSection: some View {
        let catalog = BundledAIToolCatalog.current
        return VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 7) {
                Text(copy.aiToolPackages)
                    .font(.title2.weight(.black))
                Text(copy.aiToolPackageDescription)
                    .font(.footnote)
                    .foregroundStyle(LMTheme.muted)
                    .lineSpacing(3)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text(copy.supportedFormats)
                    .font(.caption2.weight(.black))
                    .foregroundStyle(LMTheme.muted)
                Text(catalog.supportedPackageTypes.joined(separator: " · "))
                    .font(.caption.monospaced().weight(.semibold))
                    .foregroundStyle(LMTheme.ink)
            }
            .lmCard(padding: 14)

            ForEach(catalog.packages) { toolPackage in
                aiToolPackageRow(toolPackage)
            }
        }
    }

    private func aiToolPackageRow(_ toolPackage: AIToolPackageProjection) -> some View {
        VStack(alignment: .leading, spacing: 11) {
            HStack(spacing: 6) {
                packageBadge(copy.schemaValid, color: LMTheme.lime)
                packageBadge(
                    toolPackage.publisherTrust == .metadataReviewed ? copy.metadataReviewed : copy.publisherUnverified,
                    color: LMTheme.warning.opacity(0.55)
                )
            }
            packageBadge(copy.catalogOnly, color: LMTheme.line)

            Text(toolPackage.title)
                .font(.headline.weight(.black))
            Text(toolPackage.description)
                .font(.footnote)
                .foregroundStyle(LMTheme.muted)
                .lineSpacing(3)
            Text("\(toolPackage.packageFormat) · v\(toolPackage.version) · \(toolPackage.manifestSha256.prefix(12))…")
                .font(.caption2.monospaced())
                .foregroundStyle(LMTheme.muted)

            ForEach(toolPackage.capabilities) { capability in
                HStack(spacing: 10) {
                    packageBadge(copy.aiToolEffect(capability.effect), color: effectColor(capability.effect))
                    Text(capability.title)
                        .font(.caption.weight(.semibold))
                    Spacer()
                }
                .padding(.vertical, 2)
            }

            Label(copy.noPackageExecution, systemImage: "exclamationmark.shield")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(LMTheme.muted)
        }
        .lmCard(padding: 14)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("hub.ai-tool-package.\(toolPackage.serverName)")
    }

    private func packageBadge(_ value: String, color: Color) -> some View {
        Text(value)
            .font(.caption2.weight(.black))
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(color)
            .clipShape(Capsule())
    }

    private func effectColor(_ effect: AIToolEffect) -> Color {
        effect == .read ? LMTheme.lime : LMTheme.warning.opacity(0.55)
    }

    private func connectionRow(_ connection: ConnectionProjection) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Text(copy.connectionName(connection.id))
                    .font(.headline.weight(.black))
                Spacer()
                Text(copy.connectionState(connection.state))
                    .font(.caption2.weight(.black))
                    .padding(.horizontal, 9)
                    .padding(.vertical, 5)
                    .background(badgeColor(connection.state))
                    .clipShape(Capsule())
            }
            Text(copy.connectionDescription(connection.id))
                .font(.footnote)
                .foregroundStyle(LMTheme.muted)
                .lineSpacing(3)
        }
        .lmCard(padding: 14)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("hub.connection.\(connection.id)")
    }

    private func badgeColor(_ state: ConnectionState) -> Color {
        switch state {
        case .previewOnly: LMTheme.lime
        case .separateAuthentication: LMTheme.warning.opacity(0.55)
        case .notConnected, .planned: LMTheme.line
        }
    }
}

struct ProofHubView: View {
    @ObservedObject var model: OperatingHubViewModel
    let locale: ProductLocale
    private var copy: OperatingCopy { OperatingCopy(locale: locale) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HubScreenIntro(title: copy.proof, detail: copy.proofDescription, icon: "checkmark.shield")

                Label(copy.noExternalReceipt, systemImage: "exclamationmark.shield")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(LMTheme.ink)
                    .lmCard(padding: 14)

                VStack(alignment: .leading, spacing: 12) {
                    Text(copy.queuedRuns).font(.headline.weight(.black))
                    if model.snapshot.serviceRuns.isEmpty {
                        Text(copy.noItems).foregroundStyle(LMTheme.muted)
                    } else {
                        ForEach(model.snapshot.serviceRuns) { run in
                            runRow(run)
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 12) {
                    Text(copy.auditTrail).font(.headline.weight(.black))
                    if model.snapshot.auditEvents.isEmpty {
                        Text(copy.noItems).foregroundStyle(LMTheme.muted)
                    } else {
                        ForEach(model.snapshot.auditEvents) { event in
                            auditRow(event)
                        }
                    }
                }
            }
            .padding(18)
            .frame(maxWidth: 720)
            .frame(maxWidth: .infinity)
        }
        .background(LMTheme.canvas)
        .navigationTitle(copy.proof)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func runRow(_ run: ServiceRun) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(copy.queued)
                    .font(.caption2.weight(.black))
                    .padding(.horizontal, 9)
                    .padding(.vertical, 5)
                    .background(LMTheme.warning.opacity(0.55))
                    .clipShape(Capsule())
                Spacer()
                Text(formatted(run.createdAt)).font(.caption).foregroundStyle(LMTheme.muted)
            }
            Text(copy.variantName(run.cellID)).font(.headline)
            Text(run.summary).font(.body).foregroundStyle(LMTheme.muted)
            Text("Preview ID · \(run.id)")
                .font(.caption2.monospaced())
                .foregroundStyle(LMTheme.muted)
        }
        .lmCard(padding: 14)
    }

    private func auditRow(_ event: OperatingAuditEvent) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "clock.arrow.circlepath")
                .frame(width: 34, height: 34)
                .background(LMTheme.line)
                .clipShape(Circle())
            VStack(alignment: .leading, spacing: 4) {
                Text(copy.auditLabel(event.action)).font(.subheadline.weight(.semibold))
                Text(formatted(event.createdAt)).font(.caption).foregroundStyle(LMTheme.muted)
            }
            Spacer()
        }
        .lmCard(padding: 12)
    }

    private func formatted(_ value: String) -> String {
        guard let date = ISO8601DateFormatter().date(from: value) else { return value }
        let formatter = DateFormatter()
        formatter.locale = locale.locale
        formatter.dateStyle = .short
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}
