import SwiftUI

struct FirstAnalysisView: View {
    @ObservedObject var model: AppViewModel
    private var copy: LMCopy { LMCopy(locale: model.locale) }

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            Spacer()
            ProgressView()
                .controlSize(.large)
                .tint(LMTheme.ink)
            Text(copy.analysisTitle)
                .font(.system(.largeTitle, design: .rounded, weight: .black))
                .foregroundStyle(LMTheme.ink)
            Text(copy.analysisBody)
                .font(.title3)
                .foregroundStyle(LMTheme.muted)
            Label(phaseLabel, systemImage: "sparkles")
                .font(.headline)
                .foregroundStyle(LMTheme.ink)
                .lmCard()
                .accessibilityIdentifier(AccessibilityID.analysisPhase)
            Spacer()
        }
        .padding(28)
        .frame(maxWidth: 640)
        .frame(maxWidth: .infinity)
    }

    private var phaseLabel: String {
        switch model.analysisPhase {
        case .readingEvents: copy.readingEvents
        case .checkingLocations: copy.checkingLocations
        case .calculatingTrip: copy.calculatingTrip
        }
    }
}
