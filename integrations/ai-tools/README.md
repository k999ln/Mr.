# Rockstar_ibot AI Tool Packages

外部AIツールをRockstar_ibotへ持ち込むための、metadata-only package gateです。現在できるのはscaffold、形式検証、権限表示、運営registryへのdigest固定、Web/iOSカタログ生成までです。インストール、認証、外部実行、成果物完成、課金はまだ有効化しません。

## Package = two manifests

```text
my-ai-tool/
├── server.json
└── rockstar_ibot-tool.json
```

- `server.json`: MCP Registryの公式配布manifest。remote MCP、npm、PyPI、Cargo、OCI、NuGet、MCPBを表します。
- `rockstar_ibot-tool.json`: Rockstar_ibot固有の最小権限、data class、外部effect、実行上限、価格境界、receipt契約です。
- `registry.json`: 運営だけが編集する審査面です。publisher trust、signature状態、manifest SHA-256、enabled capabilityをpackage自身から分離します。

OpenAPIだけを提供するツールは、初期版ではremote MCP serverで包んでから登録します。既存Coreのhost subprocess、親process environment、`auth.json`、D1/R2 bindingへ第三者packageを直接渡してはいけません。

## Quick start

```bash
npm run ai-tools:scaffold -- integrations/ai-tools/candidates/my-tool \
  --name io.github.publisher/my-tool \
  --title "My AI Tool" \
  --remote https://api.publisher.example/mcp

npm run ai-tools:validate -- integrations/ai-tools/candidates/my-tool
```

提出者はcredentialの「値」ではなくslotだけを宣言します。wildcard host、HTTP、localhost/IP、`latest`やversion range、secret value、未知field、外部effectの包括承認は検証で拒否されます。

運営登録後は次を実行します。

```bash
npm run ai-tools:validate
npm run ai-tools:catalog
npm run test:ai-tools
```

`ai-tools:catalog`は同一projectionを以下へ生成します。

- `apps/rockstar_ibot-hub/app/generated/ai-tool-catalog.json`
- `apps/rockstar_ibot-ios/RockstarIbot/Resources/AIToolCatalog.json`

## Product Hunt discovery

Product Huntはpackage registryではなく、運営専用の発見sourceです。公式GraphQL APIのdocumented operationだけを固定queryで呼び、検索語はsource configで審査済みの公開taxonomyから選びGraphQL variablesとして渡します。候補は[`discovery/producthunt-candidate-queue.schema.json`](discovery/producthunt-candidate-queue.schema.json)を構造contractにする`candidate_only` JSONで、runtimeはそれ以上の相互整合性をsemantic validatorで再検証します。CIはDraft 2020-12 schemaと合成fixtureも別経路で検証し、`registry.json`やWeb/iOS catalogへ自動追加しません。

```text
Product Hunt official API
→ topics(query:)
→ posts(topic:, postedAfter:, postedBefore:)
→ minimal candidate metadata + receipt
→ publisher / API / MCP / terms / security review
→ scaffold + validate + operator registry
```

現在のconfig reference、runtime flag、tokenの確認は、未許諾のdefaultをfetch 0回で停止させるローカル事故防止gateです。署名済み許諾recordやtoken scopeを証明する本番許諾gateではありません。Web scraping fallbackもありません。設定とrelease gateは[`discovery/README.md`](discovery/README.md)を参照してください。

## Trust and execution boundary

状態は混ぜません。

- `validationState`: manifestの形式が正しいか
- `publisherTrust`: 提供者metadataを運営が確認したか
- `registryState`: catalog候補、承認、停止、失効のどれか
- `runtimeState`: 現在は必ず`catalog_only`
- `effect`: read、external write、message、publish、moneyのどれか

形式検証済みは「安全」「接続済み」「動作確認済み」を意味しません。`approved`へ進めるにはpublisher確認、security review、外部署名、exact digest、capabilityごとの運営承認が必要です。その後もtenant別install grantと、外部effectごとのcurrent approvalが必要です。

## Next runtime phase (not implemented)

```text
digest-pinned package
→ tenant install grant
→ quote / current approval
→ isolated executor or remote gateway
→ credential broker + exact-host egress
→ schema validation + authoritative readback
→ signed action / usage / billing receipts
```

Rockstar_ibotが課金quoteとplatform feeを所有し、packageの自己申告だけで請求または`completed`にしてはいけません。

## Upstream standards

- MCP Registry `server.json`: https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/server-json/draft/server.schema.json
- MCP package types: https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/package-types.mdx
- MCP authorization: https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
- Sigstore verification: https://docs.sigstore.dev/cosign/verifying/verify/
