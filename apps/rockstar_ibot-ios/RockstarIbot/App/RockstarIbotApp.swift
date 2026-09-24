import SwiftUI

@main
struct RockstarIbotApp: App {
    @StateObject private var model: AppViewModel
    @StateObject private var networkMonitor = NetworkMonitor()

    init() {
        let environment = AppEnvironment.bundled()
        _model = StateObject(wrappedValue: AppViewModel(environment: environment))
    }

    var body: some Scene {
        WindowGroup {
            RootView(model: model, networkMonitor: networkMonitor)
                .environment(\.locale, model.locale.locale)
                .preferredColorScheme(.light)
                .task { await model.start() }
        }
    }
}
