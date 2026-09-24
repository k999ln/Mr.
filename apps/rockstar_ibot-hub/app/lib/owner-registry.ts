export type OwnerStatus = 'live' | 'implemented' | 'partial' | 'blocked';

export type OwnerChange = {
  id: string;
  date: string;
  title: string;
  summary: string;
  surfaces: string[];
  status: OwnerStatus;
  evidence: string;
};

export type OwnerCapability = {
  area: string;
  surface: string;
  status: OwnerStatus;
  current: string;
  next: string;
};

export const ownerProduct = {
  name: 'avocadomini',
  consoleName: 'Owner Console',
  release: 'owner-pilot / 2026.09',
  updatedAt: '2026-09-05',
  promise: '生活と仕事を整え、作る・売る・届けるまで動かすAIパートナー。',
};

export const ownerLayers = [
  {
    code: 'HUB',
    name: 'avocadomini Hub',
    description: '利用者が今日の行動、状態、お金、仕事、サービスを扱う画面。',
  },
  {
    code: 'CORE',
    name: 'avocadomini Core',
    description: '判断、権限、外部接続、キュー、receiptを共有する共通エンジン。',
  },
  {
    code: 'BOT',
    name: 'avocadomini Bot',
    description: 'Telegramから依頼、承認、状態確認、結果通知を行う入口。',
  },
  {
    code: 'TOOLS',
    name: 'avocadomini Tools',
    description: '作成、確認、販売、配信、決済、納品、分析を担う独立機能。',
  },
  {
    code: 'PROOF',
    name: 'avocadomini Proof',
    description: '誰が何を承認し、何が実行され、何が未完了かを残す証拠層。',
  },
] as const;

export const ownerChanges: OwnerChange[] = [
  {
    id: 'chg-owner-console',
    date: '2026-09-05',
    title: '所有者専用の管理画面を追加',
    summary: '追加内容、機能の現在地、接続待ち、証拠、次の作業を一般向け画面から分離して確認できるようにした。',
    surfaces: ['Owner Console', 'ChatGPT認証', '変更台帳'],
    status: 'implemented',
    evidence: '/owner の実装とビルド確認済み・公開反映待ち',
  },
  {
    id: 'chg-brand-unification',
    date: '2026-09-05',
    title: '公開ブランドをavocadominiへ統一',
    summary: 'Life Manager Core、One Hub、Mr.Bot、Service Cellsを、avocadominiの内部レイヤーとして再整理した。',
    surfaces: ['Hub', 'Core', 'Bot', 'Tools', 'Proof'],
    status: 'implemented',
    evidence: '画面、manifest、製品文書を同じ名称へ更新',
  },
  {
    id: 'chg-owner-hub',
    date: '2026-08-28',
    title: '生活・仕事のOwner Hubを実装',
    summary: 'Today、身体・心、収支、仕事、配給申請、Service Cell、Core接続、監査、JSON出力を一つのレスポンシブ画面へ統合した。',
    surfaces: ['Hub', 'D1', 'R2', 'Core connections', 'Audit'],
    status: 'live',
    evidence: 'ChatGPT認証、D1/R2保存、接続readbackを実装済み',
  },
  {
    id: 'chg-telegram-core',
    date: '2026-09-04',
    title: 'Telegram BotとCoreを所有者環境へ接続',
    summary: 'avocadominibotのWebhookをCoreへ接続し、getMeとWebhook設定を確認した。実メッセージの最終確認は残している。',
    surfaces: ['Telegram', 'Core', 'Railway'],
    status: 'partial',
    evidence: 'Webhook接続確認済み・実送信receipt待ち',
  },
  {
    id: 'chg-supabase-entry',
    date: '2026-09-04',
    title: '無料開始用のデータ基盤を追加',
    summary: '無料同意と最初の3ツール選択に必要な最小schemaを所有者のSupabaseへ追加した。',
    surfaces: ['Supabase', 'Free tier', 'Tool selection'],
    status: 'partial',
    evidence: '入口schemaは反映済み・Core全体schemaは未完成',
  },
  {
    id: 'chg-ai-catalog',
    date: '2026-08-28',
    title: '外部AIツールの安全なカタログを追加',
    summary: '形式、提供者確認、権限、effect、digestを分けて表示し、実行や課金は接続しないcatalog-only境界を作った。',
    surfaces: ['MCP catalog', 'Permissions', 'Digest'],
    status: 'partial',
    evidence: 'カタログ表示のみ・executorは停止',
  },
];

export const ownerCapabilities: OwnerCapability[] = [
  {
    area: '利用者画面',
    surface: 'avocadomini Hub',
    status: 'live',
    current: 'Today、状態、収支、仕事、配給申請、サービス構成、接続、監査をChatGPT認証後に利用可能。',
    next: 'Site全体を所有者限定へ戻し、統一identityを完成する。',
  },
  {
    area: '運営管理',
    surface: 'Owner Console',
    status: 'implemented',
    current: '変更内容、実装状態、未完了、証拠を別画面として実装済み。',
    next: '所有者限定accessで公開し、Gitと配備receiptの自動取り込みを追加する。',
  },
  {
    area: '共通エンジン',
    surface: 'avocadomini Core',
    status: 'partial',
    current: 'Telegram、予定、Gmail、Resend、Stripe、Telnyx、Gemini、Maps等の検証済みreadback経路を保持。',
    next: 'Hubのoutbox consumerと統一account gatewayを接続する。',
  },
  {
    area: '会話入口',
    surface: 'avocadomini Bot',
    status: 'partial',
    current: 'BotとWebhookは接続済み。',
    next: '/start実送信と3ツール選択反映のreceiptを確認する。',
  },
  {
    area: '制作・販売',
    surface: 'avocadomini Tools',
    status: 'partial',
    current: '6制作Cellと10販売ツールの定義・受付・registryを保持。',
    next: '最初の3ツールだけexecutorから納品まで閉じる。',
  },
  {
    area: '証拠',
    surface: 'avocadomini Proof',
    status: 'partial',
    current: 'Hub内のaudit、outbox、受付receiptを保存。',
    next: 'Core、Telegram、決済、納品のreceiptを同じ画面へ統合する。',
  },
  {
    area: '課金',
    surface: 'Telegram Stars / Stripe',
    status: 'blocked',
    current: '無料3ツールの境界と公開Payment Linkを保持。',
    next: '価格、法定表示、返金、決済E2Eを確認してから有効化する。',
  },
  {
    area: '外部AI',
    surface: 'AI Tool Catalog',
    status: 'blocked',
    current: 'metadataと権限だけを表示。実行は安全停止。',
    next: '隔離executor、credential broker、readbackを実装する。',
  },
];

export const ownerBlockers = [
  'ChatGPT、Telegram、Supabase、mobileを結ぶcanonical accountが未完成。',
  'Hubのintegration_outboxをCoreへ届けるconsumerが未配備。',
  'Service Cellの成果物返却、品質判定、納品receiptが未接続。',
  'Core全体を再現できるfresh Supabase baseline schemaが未完成。',
  '統一export・完全削除・retentionはD1/R2のHub範囲に限定されている。',
  'Site accessは現在publicのため、Owner Hubとして公開する前に所有者限定へ戻す必要がある。',
  '本番課金、返金、一般公開、3,000人規模の負荷・分離試験は未承認。',
] as const;
