export type CapabilityStatus = 'hub' | 'core' | 'planned';

export type Capability = {
  id: string;
  name: string;
  description: string;
  status: CapabilityStatus;
};

export type CapabilityGroup = {
  id: string;
  label: string;
  name: string;
  description: string;
  capabilities: Capability[];
};

export type Connection = {
  id: string;
  name: string;
  description: string;
  status: 'hub' | 'core';
  href: string;
  action: string;
};

export const PRODUCT_SETUP_URL = '#connections';
export const TELEGRAM_SETUP_URL = '#connections';

export function productEntryUrl(value = process.env.NEXT_PUBLIC_LM_PRODUCT_URL): string {
  const candidate = String(value || '').trim();
  if (!candidate) return PRODUCT_SETUP_URL;

  try {
    const url = new URL(candidate);
    const loopback = url.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !loopback) || url.username || url.password) {
      return PRODUCT_SETUP_URL;
    }
    return url.toString();
  } catch {
    return PRODUCT_SETUP_URL;
  }
}

export const PRODUCT_ENTRY_URL = productEntryUrl();
const PRODUCT_ENTRY_CONFIGURED = PRODUCT_ENTRY_URL !== PRODUCT_SETUP_URL;

function configuredTelegramUsername(value: string | undefined): string {
  const username = String(value || '').trim().replace(/^@/, '');
  return /^[A-Za-z0-9_]{5,32}$/.test(username) && /bot$/i.test(username) ? username : '';
}

export function telegramEntryUrl(value = process.env.NEXT_PUBLIC_LM_TELEGRAM_BOT_USERNAME): string {
  const username = configuredTelegramUsername(value);
  return username ? `https://t.me/${username}?start=lp` : TELEGRAM_SETUP_URL;
}

export const TELEGRAM_ENTRY_URL = telegramEntryUrl();

export const capabilityGroups: CapabilityGroup[] = [
  {
    id: 'body',
    label: 'BODY',
    name: '身体',
    description: '体調を記録し、食事・移動・ケアの自動化へつなぐ。',
    capabilities: [
      { id: 'daily-body', name: '身体スコア', description: '毎日の状態を1〜5で記録', status: 'hub' },
      { id: 'diet', name: '食事サポート', description: '食事確認と行動ナッジ', status: 'core' },
      { id: 'care', name: 'ケア候補', description: '状態に応じた候補探索と予約支援', status: 'core' },
      { id: 'travel', name: '移動・交通', description: '予定に合わせた経路と遅延対応', status: 'core' },
    ],
  },
  {
    id: 'mind',
    label: 'MIND',
    name: '心',
    description: '気分とエネルギーを記録し、必要な介入だけを選ぶ。',
    capabilities: [
      { id: 'daily-mind', name: '心・エネルギー', description: '毎日の状態とメモを保存', status: 'hub' },
      { id: 'mental-trigger', name: 'Mental Trigger', description: '状態変化を検知して個別に支援', status: 'core' },
      { id: 'precepts', name: '振り返り', description: '価値観と行動のずれを見直す', status: 'core' },
      { id: 'relations', name: '関係性メモリ', description: '大切な人との予定と文脈を保持', status: 'core' },
    ],
  },
  {
    id: 'money',
    label: 'MONEY',
    name: 'お金',
    description: '収入と支出を事実ベースで記録し、次の判断へ変える。',
    capabilities: [
      { id: 'ledger', name: '収支台帳', description: '通貨別の収入・支出・残額', status: 'hub' },
      { id: 'financial-report', name: '財務レポート', description: '日次・週次のreceipt集計', status: 'core' },
      { id: 'wallet', name: 'Wallet・Payout', description: '残高と支払先の安全な管理', status: 'core' },
      { id: 'billing', name: '課金・請求', description: '利用量、返金、手数料の明示', status: 'planned' },
    ],
  },
  {
    id: 'work',
    label: 'WORK',
    name: '仕事',
    description: 'やること、機会、制作、販売、納品を一つの流れにする。',
    capabilities: [
      { id: 'work-items', name: '仕事リスト', description: '次の一手を追加・完了', status: 'hub' },
      { id: 'service-cells', name: '6 Service Cells', description: '制作・集客・公開・販売・学習・納品', status: 'hub' },
      { id: 'opportunities', name: 'Opportunity Engine', description: '案件・仕事候補を探索', status: 'core' },
      { id: 'browser-work', name: 'Browser Task', description: '許可されたWeb作業を実行', status: 'core' },
    ],
  },
  {
    id: 'system',
    label: 'SYSTEM',
    name: '運営・証拠',
    description: '何が動き、何が未完了かを履歴とreceiptで確認する。',
    capabilities: [
      { id: 'timeline', name: 'Today・Timeline', description: '今日の優先事項と状態', status: 'hub' },
      { id: 'audit', name: '監査履歴', description: '設定と操作の変更履歴', status: 'hub' },
      { id: 'receipts', name: 'Action Receipt', description: '外部操作の成功・失敗証拠', status: 'core' },
      { id: 'controls', name: 'Automation Control', description: '身体・心・お金・委任のON/OFF', status: 'core' },
    ],
  },
];

export const connections: Connection[] = [
  {
    id: 'hub',
    name: 'avocadomini Bot',
    description: 'Today、チェックイン、台帳、仕事、Service Cellsをこの画面で利用できます。',
    status: 'hub',
    href: '#today',
    action: '利用中',
  },
  {
    id: 'calendar',
    name: 'Google Calendar',
    description: '予定、空き時間、移動、次の行動をavocadomini Coreと同期します。',
    status: 'core',
    href: PRODUCT_ENTRY_URL,
    action: PRODUCT_ENTRY_CONFIGURED ? 'Coreで接続' : 'Core接続URLを設定',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: '専用credentialと固定した安定版モデルをreadbackします。実生成は別の承認まで停止します。',
    status: 'core',
    href: PRODUCT_ENTRY_URL,
    action: PRODUCT_ENTRY_CONFIGURED ? 'Coreで確認' : 'Core接続URLを設定',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    description: '自分が所有するBotFather Botで、通知、質問、承認、日次レポートを受け取ります。',
    status: 'core',
    href: TELEGRAM_ENTRY_URL,
    action: TELEGRAM_ENTRY_URL === TELEGRAM_SETUP_URL ? '独自Botの接続手順' : '自分のBotを開く',
  },
  {
    id: 'gmail',
    name: 'Gmail',
    description: '許可したメールから予定と必要な対応を抽出します。',
    status: 'core',
    href: PRODUCT_ENTRY_URL,
    action: PRODUCT_ENTRY_CONFIGURED ? 'Coreで接続' : 'Core接続URLを設定',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'avocadominiのサービス利用料を受け取り、署名済みWebhookから利用状態を同期します。配給・寄付・受益者振込には使いません。',
    status: 'core',
    href: PRODUCT_ENTRY_URL,
    action: PRODUCT_ENTRY_CONFIGURED ? 'Coreで接続' : 'Core接続URLを設定',
  },
  {
    id: 'voice',
    name: 'Voice・Call',
    description: 'Kai所有Telnyxの番号・接続先・署名Webhookを照合します。実発信は別の承認まで停止します。',
    status: 'core',
    href: PRODUCT_ENTRY_URL,
    action: PRODUCT_ENTRY_CONFIGURED ? 'Coreで設定' : 'Core接続URLを設定',
  },
  {
    id: 'social',
    name: 'SNS・Postiz',
    description: '本人所有のSNS integrationをPostizから読み取り照合します。投稿は個別承認まで無効です。',
    status: 'core',
    href: PRODUCT_ENTRY_URL,
    action: PRODUCT_ENTRY_CONFIGURED ? 'Coreで確認' : 'Core接続URLを設定',
  },
  {
    id: 'vendor-bank',
    name: '業者振込・法人口座',
    description: '本人名義のGMOあおぞら法人口座を読み取り照合します。振込実行は承認台帳が完成するまで無効です。',
    status: 'core',
    href: PRODUCT_ENTRY_URL,
    action: PRODUCT_ENTRY_CONFIGURED ? 'Coreで確認' : 'Core接続URLを設定',
  },
  {
    id: 'browser',
    name: 'Cloudflare Browser',
    description: '本人Cloudflare accountとBrowser Rendering専用tokenをread-onlyで照合します。セッション実行は別の承認まで無効です。',
    status: 'core',
    href: PRODUCT_ENTRY_URL,
    action: PRODUCT_ENTRY_CONFIGURED ? 'Coreで確認' : 'Core接続URLを設定',
  },
  {
    id: 'location',
    name: 'Location・Maps',
    description: 'Maps専用credentialをserver-only proxyで使い、座標を保存せず距離と所要時間だけ返します。',
    status: 'core',
    href: PRODUCT_ENTRY_URL,
    action: PRODUCT_ENTRY_CONFIGURED ? 'Coreで接続' : 'Core接続URLを設定',
  },
  {
    id: 'wallet',
    name: 'Wallet',
    description: '残高と支払先を読み取り、不可逆操作は別途承認します。',
    status: 'core',
    href: PRODUCT_ENTRY_URL,
    action: PRODUCT_ENTRY_CONFIGURED ? 'Coreで接続' : 'Core接続URLを設定',
  },
];

export const taskDomains = ['today', 'body', 'mind', 'money', 'work'] as const;
export type TaskDomain = (typeof taskDomains)[number];

export const taskDomainLabels: Record<TaskDomain, string> = {
  today: '今日',
  body: '身体',
  mind: '心',
  money: 'お金',
  work: '仕事',
};
