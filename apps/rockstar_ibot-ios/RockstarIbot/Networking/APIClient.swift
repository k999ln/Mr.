import Foundation

actor APIClient {
    private let configuration: AppConfiguration
    private let transport: any HTTPTransport
    private let sessionStore: any SessionStoring
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private var refreshTask: Task<MobileSession, Error>?

    init(
        configuration: AppConfiguration,
        transport: any HTTPTransport = URLSessionTransport(),
        sessionStore: any SessionStoring
    ) {
        self.configuration = configuration
        self.transport = transport
        self.sessionStore = sessionStore
        encoder = JSONEncoder()
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
    }

    func send<Response: Decodable & Sendable>(
        _ endpoint: APIEndpoint,
        body: (any Encodable & Sendable)? = nil,
        idempotencyKey: UUID? = nil,
        as responseType: Response.Type = Response.self
    ) async throws -> Response {
        let key = idempotencyKey
        if endpoint.requiresIdempotencyKey, key == nil {
            throw APIError.invalidConfiguration
        }

        var session = endpoint.requiresAuthentication ? try await sessionStore.load() : nil
        var request = try makeRequest(endpoint, body: body, session: session, idempotencyKey: key)
        var (data, response) = try await transport.data(for: request)

        if response.statusCode == 401, endpoint.requiresAuthentication {
            session = try await refreshSession()
            request = try makeRequest(endpoint, body: body, session: session, idempotencyKey: key)
            (data, response) = try await transport.data(for: request)
        }

        try validate(response, data: data)
        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw APIError.decoding
        }
    }

    func sendWithoutResponse(
        _ endpoint: APIEndpoint,
        body: (any Encodable & Sendable)? = nil,
        idempotencyKey: UUID? = nil
    ) async throws {
        let key = idempotencyKey
        if endpoint.requiresIdempotencyKey, key == nil {
            throw APIError.invalidConfiguration
        }
        let session = endpoint.requiresAuthentication ? try await sessionStore.load() : nil
        let request = try makeRequest(endpoint, body: body, session: session, idempotencyKey: key)
        let (data, response) = try await transport.data(for: request)
        try validate(response, data: data)
    }

    private func makeRequest(
        _ endpoint: APIEndpoint,
        body: (any Encodable & Sendable)?,
        session: MobileSession?,
        idempotencyKey: UUID?
    ) throws -> URLRequest {
        let base = configuration.apiBaseURL
            .appending(path: "api")
            .appending(path: "mobile")
            .appending(path: "v1")
        guard var components = URLComponents(url: base.appending(path: endpoint.path), resolvingAgainstBaseURL: false) else {
            throw APIError.invalidConfiguration
        }
        components.queryItems = endpoint.queryItems.isEmpty ? nil : endpoint.queryItems
        guard let url = components.url else { throw APIError.invalidConfiguration }

        var request = URLRequest(url: url)
        request.httpMethod = endpoint.method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let session {
            request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        }
        if let idempotencyKey {
            request.setValue(idempotencyKey.uuidString, forHTTPHeaderField: "Idempotency-Key")
        }
        if let body {
            request.httpBody = try encoder.encode(AnyEncodable(body))
        }
        return request
    }

    private func refreshSession() async throws -> MobileSession {
        if let refreshTask { return try await refreshTask.value }
        guard let existing = try await sessionStore.load() else {
            throw APIError.unauthorized
        }

        let task = Task<MobileSession, Error> {
            let request = try self.makeRequest(
                .sessionRefresh,
                body: RefreshSessionRequest(refreshToken: existing.refreshToken),
                session: nil,
                idempotencyKey: nil
            )
            let (data, response) = try await self.transport.data(for: request)
            try self.validate(response, data: data)
            do {
                return try self.decoder.decode(MobileSession.self, from: data)
            } catch {
                throw APIError.decoding
            }
        }
        refreshTask = task
        do {
            let refreshed = try await task.value
            try await sessionStore.save(refreshed)
            refreshTask = nil
            return refreshed
        } catch {
            refreshTask = nil
            try? await sessionStore.clear()
            throw APIError.unauthorized
        }
    }

    private func validate(_ response: HTTPURLResponse, data: Data) throws {
        guard (200..<300).contains(response.statusCode) else {
            let envelope = try? decoder.decode(APIErrorEnvelope.self, from: data)
            switch response.statusCode {
            case 401: throw APIError.unauthorized
            case 409: throw APIError.conflict
            default:
                throw APIError.server(
                    status: response.statusCode,
                    code: envelope?.code,
                    message: envelope?.message
                )
            }
        }
    }
}

private struct AnyEncodable: Encodable {
    private let encodeValue: (Encoder) throws -> Void

    init(_ value: any Encodable) {
        encodeValue = value.encode
    }

    func encode(to encoder: Encoder) throws {
        try encodeValue(encoder)
    }
}
