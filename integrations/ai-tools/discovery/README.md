# Product Hunt discovery source

Product Huntを、外部AI package候補の発見元として使うための運営向けsourceです。Product Huntの画面をcrawl、scrape、spiderしません。公式GraphQL APIだけを使い、検索結果は承認済みpackageではなく`candidate_only`へ入れます。

## 現在の状態

`producthunt-source.json`の`commercialUse.state`は`permission_required`です。Product Hunt公式API文書は、APIの商用利用には`hello@producthunt.com`への連絡が必要と明記しています。Rockstar_ibotは商用サービスを前提にするため、default connectorはネットワーク要求前に停止します。

現在の`state` / `approvalReference` / runtime flag / token文字列の確認はローカルの事故防止用仮gateです。署名済み許諾record、Product Hunt client credentialsの交換、`public` scope確認、中央rate ledgerをまだ実装していないため、configと環境変数だけを手動で`approved`にして本番有効化してはいけません。

Product Huntの利用規約はWebページのcrawl、scrape、spiderも禁止しています。API失敗時のHTML scraping fallbackは実装しません。

## 本番有効化のrelease gate

1. Product HuntへRockstar_ibotの利用目的、取得field、頻度、保持期間、Product Huntへのattribution、商用サービスであることを伝え、APIの商用利用許可を取得する。
2. Product Huntへログイン後、公式Helpの案内どおり「My Apps」からserver-side applicationを作る。client credentialsはserver brokerだけに保存し、取得したcredentialの`scope === "public"`を確認する。developer tokenやuser tokenを本番で使わず、iOS/Webへ埋め込まない。
3. 運営署名済み許諾recordを中央backendで検証する。対象法人、app/client ID hash、用途、取得field、頻度、保持期間、地域、`issuedAt`、`expiresAt`、`revokedAt`、契約証拠SHA-256、規約versionを照合する。許諾本文やsecretはrepoへ記録しない。
4. 中央schedulerと排他lockが実行頻度、全run共通のGraphQL complexity budget、429 reset、成功・失敗の消費receiptを管理する。
5. repo外private queueの30日以内の実削除と削除receipt、許諾失効時のkill switchと一括purgeを接続する。
6. 上記をcontract canaryと運営reviewで確認した後だけ、中央backendが承認済みruntime sourceとcredentialをconnectorへ渡す。OSSのdefaultを`approved`で配布しない。

許諾依頼には、商用利用、First 3000から全世界への拡張、`topics`/`posts`で取得するfield（保存しない`description`も検索score計算中に一時取得）、最大1日1回の運営取得、30日以内の候補保持、Product Huntへのattribution、固定語彙の重なりによる決定論的score、ユーザー画面へ候補を直接再配布しないこと、削除・許諾終了時の処理を明記します。許諾範囲、期限、表示条件、rate limitを追跡可能なreferenceとして残します。

```bash
# CLI形式の確認用。現状のdefaultはpermission_requiredで通信前停止する
npm run ai-tools:discover:producthunt -- \
  --query "AI Agents" \
  --output /absolute/private/path/producthunt-candidates.json
```

`--query`は複数指定できますが、`producthunt-source.json` の`defaultQueries`にある審査済み公開taxonomyしか送信できません。省略時はその全default queryを使います。`--output`は必須で、実体パスがrepo外、親directoryが当該user所有の`0700`、新規fileが`0600`である場合だけ保存します。候補JSONをstdoutへ返しません。現行writerは同一local filesystemでのhard linkをatomic publishに使うため、対応するprivate local filesystemを使います。

## 検索契約

公式APIにはdocumentedなpost全文検索がないため、次のdocumented operationだけを使います。

```text
topics(query: ...)
→ 一致したtopic slug
→ posts(topic: ..., postedAfter: ..., order: NEWEST)
→ IDでdedupe
→ candidate_only queue
→ publisher / API / MCP / security review
→ 既存の2-manifest package gate
```

topicが見つからないqueryは0件として記録し、Web scrapingへ切り替えません。候補には最小metadataだけを保持し、maker個人情報、comment、画像、raw API response、tokenは保存しません。

1回のrunはquery最大8、topic/query最大5、post/topic最大20、候補最大100、1 response最大2MiB、run累積response最大8MiB、全体timeout最大60秒です。`X-Rate-Limit-Remaining`が安全残量100以下ならそのresponseを候補queueとして採用せず停止し、429を即時retryしません。公式制限はrequest数ではなくGraphQL complexity pointsなので、100は現段階の停止heuristicであり予算保証ではありません。本番では中央schedulerが実測したoperation complexityを予約し、一つの共有budgetとcacheを所有します。

候補JSONには30日後の`expiresAt`を記録しますが、実削除ではありません。また現行queueは`unsigned_operator_observation`で、候補dataは未信頼、website訪問は無効です。期限削除scheduler、署名/MAC付きreceipt、利用条件変更時のkill switchが接続されるまで後続consumerに信頼・実行させません。

候補をpackageへ昇格させるには、Product Hunt上の人気とは別に、公式publisher、実在API/MCP endpoint、利用規約、認証、データ処理、料金、receipt/readbackを確認する必要があります。Product Huntのvote数は発見順序の参考値であり、安全性・品質・採用可否の証明には使いません。

## Official sources

- Product Hunt API 2.0: https://api.producthunt.com/v2/docs — “The Product Hunt API must not be used for commercial purposes.”
- Product Hunt API Help / My Apps: https://help.producthunt.com/en/articles/484971-does-product-hunt-have-an-api
- Product Hunt GraphQL `topics`: https://api-v2-docs.producthunt.com/query/topics/ — “Select Topics whose name or aliases match the given string”
- Product Hunt GraphQL `posts`: https://api-v2-docs.producthunt.com/query/posts/
- Product Hunt API rate limits: https://api.producthunt.com/v2/docs/rate_limits/headers
- Product Hunt GraphQL reference: https://api-v2-docs.producthunt.com/
- Product Hunt Terms: https://www.producthunt.com/legal — “Crawls,” “scrapes,” or “spiders” any page, data, or portion of or relating to the Services or Content.
