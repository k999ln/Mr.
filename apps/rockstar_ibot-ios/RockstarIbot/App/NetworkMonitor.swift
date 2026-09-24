import Network
import SwiftUI

@MainActor
final class NetworkMonitor: ObservableObject {
    @Published private(set) var isConnected = true
    @Published private(set) var isExpensive = false

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "rockstar_ibot.network")

    init(startImmediately: Bool = true) {
        if startImmediately { start() }
    }

    func start() {
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                self?.isConnected = path.status == .satisfied
                self?.isExpensive = path.isExpensive
            }
        }
        monitor.start(queue: queue)
    }

    deinit {
        monitor.cancel()
    }
}
