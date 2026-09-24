import SwiftUI

struct MoneyHubView: View {
    @ObservedObject var model: OperatingHubViewModel
    let locale: ProductLocale
    @State private var direction: MoneyDirection = .income
    @State private var currency: MoneyCurrency = .jpy
    @State private var amount = ""
    @State private var category = ""
    @State private var note = ""

    private var copy: OperatingCopy { OperatingCopy(locale: locale) }
    private var parsedAmount: Int64? { currency.minorUnits(from: amount) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HubScreenIntro(title: copy.money, detail: copy.moneyDescription, icon: "chart.bar")
                HubNoticeView(model: model, locale: locale)

                Text(copy.currencyBoundary)
                    .font(.footnote)
                    .foregroundStyle(LMTheme.muted)
                    .lmCard(padding: 14)

                VStack(spacing: 10) {
                    ForEach(model.snapshot.moneyTotals) { total in
                        totalRow(total)
                    }
                }

                VStack(alignment: .leading, spacing: 16) {
                    Text(copy.addLedgerEntry).font(.headline.weight(.black))

                    Picker(copy.direction, selection: $direction) {
                        Text(copy.income).tag(MoneyDirection.income)
                        Text(copy.expense).tag(MoneyDirection.expense)
                    }
                    .pickerStyle(.segmented)

                    Picker(copy.currency, selection: $currency) {
                        ForEach(MoneyCurrency.allCases) { item in
                            Text(item.rawValue).tag(item)
                        }
                    }
                    .pickerStyle(.segmented)

                    TextField(copy.amount, text: $amount)
                        .keyboardType(.decimalPad)
                        .padding(14)
                        .background(Color.white.opacity(0.72))
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(LMTheme.line))
                        .accessibilityIdentifier(AccessibilityID.hubMoneyAmount)

                    if !amount.isEmpty && parsedAmount == nil {
                        Text(copy.invalidAmount)
                            .font(.footnote)
                            .foregroundStyle(LMTheme.danger)
                    }

                    TextField(copy.categoryPlaceholder, text: $category)
                        .textInputAutocapitalization(.sentences)
                        .padding(14)
                        .background(Color.white.opacity(0.72))
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(LMTheme.line))
                        .accessibilityLabel(copy.category)
                        .accessibilityIdentifier(AccessibilityID.hubMoneyCategory)

                    TextField(copy.note, text: $note)
                        .padding(14)
                        .background(Color.white.opacity(0.72))
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(LMTheme.line))

                    Button(copy.addLedgerEntry) {
                        guard let parsedAmount else { return }
                        Task {
                            if await model.createMoneyEntry(
                                direction: direction,
                                amountMinor: parsedAmount,
                                currency: currency,
                                category: category,
                                note: note
                            ) {
                                amount = ""
                                category = ""
                                note = ""
                            }
                        }
                    }
                    .buttonStyle(LMPrimaryButtonStyle())
                    .disabled(parsedAmount == nil || category.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.busyAction != nil)
                    .accessibilityIdentifier(AccessibilityID.hubMoneyAdd)
                }
                .lmCard()

                VStack(alignment: .leading, spacing: 12) {
                    Text(copy.ledger).font(.headline.weight(.black))
                    if model.snapshot.moneyEntries.isEmpty {
                        Text(copy.noItems).foregroundStyle(LMTheme.muted)
                    } else {
                        ForEach(model.snapshot.moneyEntries) { entry in
                            entryRow(entry)
                        }
                    }
                }
            }
            .padding(18)
            .frame(maxWidth: 720)
            .frame(maxWidth: .infinity)
        }
        .background(LMTheme.canvas)
        .navigationTitle(copy.money)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func totalRow(_ total: MoneyTotal) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text("\(total.currency.rawValue) · \(copy.net)")
                    .font(.caption.weight(.black))
                    .foregroundStyle(LMTheme.muted)
                Text(total.currency.formatted(minorUnits: total.netMinor, locale: locale.locale))
                    .font(.title3.weight(.black))
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                Text("\(copy.income) \(total.currency.formatted(minorUnits: total.incomeMinor, locale: locale.locale))")
                Text("\(copy.expense) \(total.currency.formatted(minorUnits: total.expenseMinor, locale: locale.locale))")
            }
            .font(.caption)
            .foregroundStyle(LMTheme.muted)
        }
        .lmCard(padding: 14)
    }

    private func entryRow(_ entry: MoneyEntry) -> some View {
        HStack(spacing: 12) {
            Text(entry.direction == .income ? "+" : "−")
                .font(.title2.weight(.black))
                .foregroundStyle(entry.direction == .income ? LMTheme.ink : LMTheme.danger)
            VStack(alignment: .leading, spacing: 3) {
                Text(entry.category).font(.body.weight(.semibold))
                Text(entry.note.isEmpty ? entry.occurredAt : entry.note)
                    .font(.caption)
                    .foregroundStyle(LMTheme.muted)
            }
            Spacer()
            Text(entry.currency.formatted(minorUnits: entry.amountMinor, locale: locale.locale))
                .font(.subheadline.weight(.black))
        }
        .lmCard(padding: 12)
    }
}
