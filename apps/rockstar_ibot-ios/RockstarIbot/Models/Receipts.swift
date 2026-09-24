import Foundation

struct EmptyRequest: Codable, Sendable, Equatable {}

struct DeviceRegistrationRequest: Codable, Sendable, Equatable {
    let token: String
}

struct CallReceipt: Codable, Sendable, Equatable {
    let status: String
    let message: String
    let retryAfterSeconds: Int?
}

struct DeletionReceipt: Codable, Sendable, Equatable {
    let receiptID: String
    let deletedAt: String
    let message: String
}

struct AccountDeletionRequest: Codable, Sendable, Equatable {
    let confirmation: String
}
