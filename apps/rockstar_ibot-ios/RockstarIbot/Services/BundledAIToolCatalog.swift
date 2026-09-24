import Foundation

enum BundledAIToolCatalog {
    static let current = load()

    static func load(bundle: Bundle = .main) -> AIToolCatalogProjection {
        guard let url = bundle.url(forResource: "AIToolCatalog", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let catalog = try? JSONDecoder().decode(AIToolCatalogProjection.self, from: data),
              catalog.schemaVersion == 1,
              catalog.executionEnabled == false,
              catalog.packages.allSatisfy({
                  $0.validationState == .schemaValid && $0.runtimeState == .catalogOnly
              }) else {
            return .empty
        }
        return catalog
    }
}
