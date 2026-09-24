import SwiftUI

struct WellbeingHubView: View {
    @ObservedObject var model: OperatingHubViewModel
    let locale: ProductLocale
    @State private var bodyScore = 3
    @State private var mindScore = 3
    @State private var energyScore = 3
    @State private var note = ""

    private var copy: OperatingCopy { OperatingCopy(locale: locale) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HubScreenIntro(title: copy.wellbeing, detail: copy.wellbeingDescription, icon: "heart.text.square")
                HubNoticeView(model: model, locale: locale)

                Label(copy.notMedicalAdvice, systemImage: "cross.case")
                    .font(.footnote)
                    .foregroundStyle(LMTheme.muted)
                    .lmCard(padding: 14)

                VStack(alignment: .leading, spacing: 20) {
                    Text(copy.dailyCheckin)
                        .font(.headline.weight(.black))
                    scorePicker(copy.bodyScore, selection: $bodyScore)
                    scorePicker(copy.mindScore, selection: $mindScore)
                    scorePicker(copy.energyScore, selection: $energyScore)

                    VStack(alignment: .leading, spacing: 8) {
                        Text(copy.note).font(.subheadline.weight(.semibold))
                        TextEditor(text: $note)
                            .frame(minHeight: 100)
                            .padding(8)
                            .scrollContentBackground(.hidden)
                            .background(Color.white.opacity(0.72))
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(LMTheme.line))
                            .accessibilityLabel(copy.notePlaceholder)
                        Text("\(note.count) / 500")
                            .font(.caption)
                            .foregroundStyle(note.count > 500 ? LMTheme.danger : LMTheme.muted)
                            .frame(maxWidth: .infinity, alignment: .trailing)
                    }

                    Button(model.busyAction == "checkin.save" ? copy.saving : copy.save) {
                        Task {
                            _ = await model.saveCheckin(
                                body: bodyScore,
                                mind: mindScore,
                                energy: energyScore,
                                note: note
                            )
                        }
                    }
                    .buttonStyle(LMPrimaryButtonStyle())
                    .disabled(note.count > 500 || model.busyAction != nil)
                    .accessibilityIdentifier(AccessibilityID.hubCheckinSave)
                }
                .lmCard()

                if let checkin = model.snapshot.checkin {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(checkin.day).font(.caption.weight(.black)).foregroundStyle(LMTheme.muted)
                        Text("\(copy.bodyScore) \(checkin.bodyScore) · \(copy.mindScore) \(checkin.mindScore) · \(copy.energyScore) \(checkin.energyScore)")
                            .font(.headline)
                        if !checkin.note.isEmpty {
                            Text(checkin.note).font(.body).foregroundStyle(LMTheme.muted)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .lmCard()
                }
            }
            .padding(18)
            .frame(maxWidth: 720)
            .frame(maxWidth: .infinity)
        }
        .background(LMTheme.canvas)
        .navigationTitle(copy.wellbeing)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { seedFromSnapshot() }
    }

    private func scorePicker(_ title: String, selection: Binding<Int>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title).font(.subheadline.weight(.semibold))
                Spacer()
                Text("\(selection.wrappedValue) / 5").font(.caption.weight(.black)).foregroundStyle(LMTheme.muted)
            }
            Picker(title, selection: selection) {
                ForEach(1...5, id: \.self) { score in
                    Text("\(score)").tag(score)
                }
            }
            .pickerStyle(.segmented)
        }
    }

    private func seedFromSnapshot() {
        guard let checkin = model.snapshot.checkin else { return }
        bodyScore = checkin.bodyScore
        mindScore = checkin.mindScore
        energyScore = checkin.energyScore
        note = checkin.note
    }
}
