import Foundation

enum AIToolEffect: String, Codable, Sendable {
    case read
    case externalWrite = "external_write"
    case message
    case publish
    case money
}

enum AIToolValidationState: String, Codable, Sendable {
    case schemaValid = "schema_valid"
}

enum AIToolPublisherTrust: String, Codable, Sendable {
    case publisherUnverified = "publisher_unverified"
    case metadataReviewed = "metadata_reviewed"
}

enum AIToolRuntimeState: String, Codable, Sendable {
    case catalogOnly = "catalog_only"
}

struct AIToolCapabilityProjection: Codable, Sendable, Equatable, Identifiable {
    let id: String
    let title: String
    let description: String
    let effect: AIToolEffect
    let ownerApproval: String
}

struct AIToolPackageProjection: Codable, Sendable, Equatable, Identifiable {
    let id: String
    let serverName: String
    let title: String
    let description: String
    let version: String
    let kind: String
    let entryKind: String
    let validationState: AIToolValidationState
    let publisherTrust: AIToolPublisherTrust
    let runtimeState: AIToolRuntimeState
    let registryState: String
    let signatureState: String
    let publisherName: String
    let packageFormat: String
    let manifestSha256: String
    let capabilities: [AIToolCapabilityProjection]
}

struct AIToolCatalogProjection: Codable, Sendable, Equatable {
    let schemaVersion: Int
    let source: String
    let executionEnabled: Bool
    let supportedPackageTypes: [String]
    let packages: [AIToolPackageProjection]

    static let empty = AIToolCatalogProjection(
        schemaVersion: 1,
        source: "bundle-unavailable",
        executionEnabled: false,
        supportedPackageTypes: [],
        packages: []
    )
}
