import SwiftUI

struct TodayHubView: View {
    @ObservedObject var model: OperatingHubViewModel
    let locale: ProductLocale
    @State private var title = ""
    @State private var domain: TaskDomain = .today
    @FocusState private var titleFocused: Bool

    private var copy: OperatingCopy { OperatingCopy(locale: locale) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HubScreenIntro(title: copy.today, detail: copy.todayDescription, icon: "checkmark.circle")
                HubNoticeView(model: model, locale: locale)

                VStack(alignment: .leading, spacing: 14) {
                    Text(copy.taskTitle)
                        .font(.headline.weight(.black))
                    TextField(copy.taskPlaceholder, text: $title)
                        .textInputAutocapitalization(.sentences)
                        .submitLabel(.done)
                        .focused($titleFocused)
                        .padding(14)
                        .background(Color.white.opacity(0.72))
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(LMTheme.line))
                        .accessibilityIdentifier(AccessibilityID.hubTaskTitle)

                    Picker(copy.domain, selection: $domain) {
                        ForEach(TaskDomain.allCases) { item in
                            Text(copy.taskDomain(item)).tag(item)
                        }
                    }
                    .pickerStyle(.menu)

                    Button(copy.add) {
                        Task {
                            if await model.createTask(title: title, domain: domain) {
                                title = ""
                                titleFocused = false
                            }
                        }
                    }
                    .buttonStyle(LMPrimaryButtonStyle())
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 || model.busyAction != nil)
                    .accessibilityIdentifier(AccessibilityID.hubTaskAdd)
                }
                .lmCard()

                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text(copy.openItems).font(.headline.weight(.black))
                        Spacer()
                        Text("\(model.snapshot.openTaskCount)")
                            .font(.caption.weight(.black))
                            .foregroundStyle(LMTheme.muted)
                    }
                    if model.snapshot.tasks.isEmpty {
                        Text(copy.noItems)
                            .foregroundStyle(LMTheme.muted)
                    } else {
                        ForEach(model.snapshot.tasks) { task in
                            taskRow(task)
                        }
                    }
                }
            }
            .padding(18)
            .frame(maxWidth: 720)
            .frame(maxWidth: .infinity)
        }
        .background(LMTheme.canvas)
        .navigationTitle(copy.today)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func taskRow(_ task: LifeTask) -> some View {
        HStack(spacing: 12) {
            Button {
                Task { await model.setTaskCompleted(task, completed: !task.completed) }
            } label: {
                Image(systemName: task.completed ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .foregroundStyle(task.completed ? LMTheme.muted : LMTheme.ink)
            .accessibilityLabel(task.completed ? copy.reopen : copy.complete)

            VStack(alignment: .leading, spacing: 3) {
                Text(task.title)
                    .font(.body.weight(.semibold))
                    .strikethrough(task.completed)
                    .foregroundStyle(task.completed ? LMTheme.muted : LMTheme.ink)
                Text(copy.taskDomain(task.domain))
                    .font(.caption)
                    .foregroundStyle(LMTheme.muted)
            }
            Spacer()
        }
        .padding(12)
        .background(LMTheme.card)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .accessibilityElement(children: .contain)
    }
}

struct WorkQueueHubView: View {
    @ObservedObject var model: OperatingHubViewModel
    let locale: ProductLocale
    @State private var title = ""
    @FocusState private var titleFocused: Bool

    private var copy: OperatingCopy { OperatingCopy(locale: locale) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HubScreenIntro(title: copy.workQueue, detail: copy.workDescription, icon: "briefcase")
                HubNoticeView(model: model, locale: locale)

                VStack(alignment: .leading, spacing: 14) {
                    Text(copy.addWorkItem).font(.headline.weight(.black))
                    TextField(copy.workPlaceholder, text: $title)
                        .focused($titleFocused)
                        .submitLabel(.done)
                        .padding(14)
                        .background(Color.white.opacity(0.72))
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(LMTheme.line))
                        .accessibilityIdentifier(AccessibilityID.hubWorkTitle)
                    Button(copy.add) {
                        Task {
                            if await model.createTask(title: title, domain: .work) {
                                title = ""
                                titleFocused = false
                            }
                        }
                    }
                    .buttonStyle(LMPrimaryButtonStyle())
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 || model.busyAction != nil)
                    .accessibilityIdentifier(AccessibilityID.hubWorkAdd)
                }
                .lmCard()

                if model.workTasks.isEmpty {
                    Text(copy.noItems)
                        .foregroundStyle(LMTheme.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .lmCard()
                } else {
                    ForEach(model.workTasks) { task in
                        HStack(spacing: 12) {
                            Button {
                                Task { await model.setTaskCompleted(task, completed: !task.completed) }
                            } label: {
                                Image(systemName: task.completed ? "checkmark.circle.fill" : "circle")
                                    .font(.title2)
                                    .frame(width: 44, height: 44)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(task.completed ? copy.reopen : copy.complete)
                            Text(task.title)
                                .font(.body.weight(.semibold))
                                .strikethrough(task.completed)
                            Spacer()
                        }
                        .lmCard(padding: 12)
                    }
                }
            }
            .padding(18)
            .frame(maxWidth: 720)
            .frame(maxWidth: .infinity)
        }
        .background(LMTheme.canvas)
        .navigationTitle(copy.workQueue)
        .navigationBarTitleDisplayMode(.inline)
    }
}
