import SwiftUI

struct ServiceCellsHubView: View {
    @ObservedObject var model: OperatingHubViewModel
    let locale: ProductLocale
    private var copy: OperatingCopy { OperatingCopy(locale: locale) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HubScreenIntro(title: copy.services, detail: copy.servicesDescription, icon: "shippingbox")
                HubNoticeView(model: model, locale: locale)

                Label(copy.queuedOnly, systemImage: "exclamationmark.shield")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(LMTheme.ink)
                    .lmCard(padding: 14)

                ForEach(Array(ServiceCellCatalog.all.enumerated()), id: \.element.id) { index, definition in
                    NavigationLink {
                        ServiceCellDetailView(model: model, locale: locale, definition: definition)
                    } label: {
                        serviceCard(index: index, definition: definition)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("hub.service.\(definition.slotID)")
                }
            }
            .padding(18)
            .frame(maxWidth: 720)
            .frame(maxWidth: .infinity)
        }
        .background(LMTheme.canvas)
        .navigationTitle(copy.services)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func serviceCard(index: Int, definition: ServiceCellDefinition) -> some View {
        let state = model.cellState(for: definition.slotID)
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(String(format: "%02d · %@", index + 1, definition.label))
                    .font(.caption.weight(.black))
                    .tracking(1)
                    .foregroundStyle(LMTheme.muted)
                Spacer()
                Text(state?.enabled == true ? copy.connectedPreview : copy.disconnected)
                    .font(.caption2.weight(.black))
                    .padding(.horizontal, 9)
                    .padding(.vertical, 5)
                    .background(state?.enabled == true ? LMTheme.lime : LMTheme.line)
                    .clipShape(Capsule())
            }
            Text(copy.cellName(definition.slotID))
                .font(.title3.weight(.black))
                .foregroundStyle(LMTheme.ink)
            Text(copy.cellPromise(definition.slotID))
                .font(.footnote)
                .foregroundStyle(LMTheme.muted)
            HStack {
                Text("\(definition.targetMinutes) MIN")
                    .font(.caption.weight(.black))
                Spacer()
                Image(systemName: "chevron.right")
            }
            .foregroundStyle(LMTheme.muted)
        }
        .lmCard()
    }
}

struct ServiceCellDetailView: View {
    @ObservedObject var model: OperatingHubViewModel
    let locale: ProductLocale
    let definition: ServiceCellDefinition
    @State private var selectedCellID: String
    @State private var summary = ""

    private var copy: OperatingCopy { OperatingCopy(locale: locale) }
    private var state: ServiceCellState? { model.cellState(for: definition.slotID) }

    init(model: OperatingHubViewModel, locale: ProductLocale, definition: ServiceCellDefinition) {
        self.model = model
        self.locale = locale
        self.definition = definition
        _selectedCellID = State(initialValue: model.cellState(for: definition.slotID)?.selectedCellID ?? definition.defaultCellID)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HubScreenIntro(
                    title: copy.cellName(definition.slotID),
                    detail: copy.cellPromise(definition.slotID),
                    icon: "shippingbox"
                )
                HubNoticeView(model: model, locale: locale)

                VStack(alignment: .leading, spacing: 14) {
                    Text(copy.variant).font(.headline.weight(.black))
                    Picker(copy.variant, selection: $selectedCellID) {
                        ForEach(definition.variantIDs, id: \.self) { variantID in
                            Text(copy.variantName(variantID)).tag(variantID)
                        }
                    }
                    .pickerStyle(.menu)
                    .onChange(of: selectedCellID) { _, newValue in
                        guard let state else { return }
                        Task {
                            _ = await model.updateServiceCell(
                                slotID: definition.slotID,
                                cellID: newValue,
                                enabled: state.enabled
                            )
                        }
                    }

                    Toggle(copy.connectedPreview, isOn: previewConnectionBinding)
                        .disabled(model.busyAction != nil)
                        .accessibilityIdentifier("hub.service.connect.\(definition.slotID)")

                    Text(copy.previewDisclosure)
                        .font(.footnote)
                        .foregroundStyle(LMTheme.muted)
                }
                .lmCard()

                VStack(alignment: .leading, spacing: 10) {
                    Text(copy.deliverables).font(.headline.weight(.black))
                    ForEach(copy.deliverables(for: definition.slotID), id: \.self) { item in
                        Label(item, systemImage: "checkmark")
                            .font(.subheadline)
                    }
                }
                .lmCard()

                VStack(alignment: .leading, spacing: 12) {
                    Text(copy.requestSummary).font(.headline.weight(.black))
                    TextEditor(text: $summary)
                        .frame(minHeight: 130)
                        .padding(8)
                        .scrollContentBackground(.hidden)
                        .background(Color.white.opacity(0.72))
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(LMTheme.line))
                        .accessibilityIdentifier("hub.service.summary.\(definition.slotID)")
                    Text("\(summary.count) / 5,000")
                        .font(.caption)
                        .foregroundStyle(LMTheme.muted)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                    Button(copy.queueRequest) {
                        Task {
                            if await model.queueServiceRun(slotID: definition.slotID, summary: summary) {
                                summary = ""
                            }
                        }
                    }
                    .buttonStyle(LMPrimaryButtonStyle())
                    .disabled(state?.enabled != true || !(3...5_000).contains(summary.trimmingCharacters(in: .whitespacesAndNewlines).count) || model.busyAction != nil)
                    .accessibilityIdentifier("hub.service.queue.\(definition.slotID)")
                    Text(copy.queuedOnly)
                        .font(.footnote)
                        .foregroundStyle(LMTheme.muted)
                }
                .lmCard()
            }
            .padding(18)
            .frame(maxWidth: 720)
            .frame(maxWidth: .infinity)
        }
        .background(LMTheme.canvas)
        .navigationTitle(definition.label)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var previewConnectionBinding: Binding<Bool> {
        Binding(
            get: { state?.enabled ?? false },
            set: { enabled in
                Task {
                    _ = await model.updateServiceCell(
                        slotID: definition.slotID,
                        cellID: selectedCellID,
                        enabled: enabled
                    )
                }
            }
        )
    }
}
