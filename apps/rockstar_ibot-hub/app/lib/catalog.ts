export type CoreComponent = {
  id: string;
  label: string;
  name: string;
  description: string;
};

export type ServiceVariant = {
  id: string;
  name: string;
};

export type ServiceCell = {
  slotId: string;
  label: string;
  name: string;
  promise: string;
  target: string;
  defaultCellId: string;
  variants: ServiceVariant[];
  deliverables: string[];
};

export const PORTFOLIO_ID = 'life-manager-one.default-3000.v1';

export const coreComponents: CoreComponent[] = [
  {
    id: 'command',
    label: 'PLAN',
    name: 'Command',
    description: '目標と今やる一手を、全サービスで共有します。',
  },
  {
    id: 'proof-vault',
    label: 'PROVE',
    name: 'Proof Vault',
    description: '実績・根拠・添付をユーザー単位で分離します。',
  },
  {
    id: 'money-lens',
    label: 'EARN',
    name: 'Money Lens',
    description: '売上につながる行動と結果を同じ流れで追います。',
  },
  {
    id: 'life-guard',
    label: 'PROTECT',
    name: 'Life Guard',
    description: '身体・心・お金の無理を検知し、実行量を守ります。',
  },
];

export const serviceCells: ServiceCell[] = [
  {
    slotId: 'slot.create',
    label: 'CREATE',
    name: 'YouTube Script',
    promise: 'アイデアを、撮影できる台本へ。',
    target: '10 MIN',
    defaultCellId: 'youtube-script-writer',
    variants: [
      { id: 'youtube-script-writer', name: 'YouTube台本' },
      { id: 'short-video-script-writer', name: 'ショート動画台本' },
      { id: 'article-renewal', name: '記事リニューアル' },
    ],
    deliverables: ['タイトル案', '冒頭フック', '完成台本', '撮影キュー'],
  },
  {
    slotId: 'slot.grow',
    label: 'GROW',
    name: 'SEO Blueprint',
    promise: '顧客の検索意図を、発見される設計へ。',
    target: '15 MIN',
    defaultCellId: 'seo-blueprint',
    variants: [
      { id: 'seo-blueprint', name: 'SEO設計' },
      { id: 'seo-article-renewal', name: 'SEO記事改善' },
      { id: 'content-repurpose', name: 'コンテンツ再利用' },
    ],
    deliverables: ['検索意図', 'キーワード群', '構成案', '改善優先度'],
  },
  {
    slotId: 'slot.launch',
    label: 'LAUNCH',
    name: 'Landing Page',
    promise: 'オファーを、公開できる最初のページへ。',
    target: '45 MIN',
    defaultCellId: 'landing-page-sprint',
    variants: [
      { id: 'landing-page-sprint', name: 'LPスプリント' },
      { id: 'portfolio-site-sprint', name: 'ポートフォリオサイト' },
      { id: 'lead-magnet-page', name: 'リード獲得ページ' },
    ],
    deliverables: ['情報設計', 'コピー', 'レスポンシブUI', '公開前チェック'],
  },
  {
    slotId: 'slot.sell',
    label: 'SELL',
    name: 'Sales Desk',
    promise: '問い合わせを、誠実で強い返信へ。',
    target: '3 MIN',
    defaultCellId: 'sales-objection-reply-builder',
    variants: [
      { id: 'sales-objection-reply-builder', name: '商談返信' },
      { id: 'estimate-builder', name: '見積もり作成' },
      { id: 'proposal-builder', name: '提案文作成' },
    ],
    deliverables: ['返信文', '確認事項', '次の一手', 'リスク表示'],
  },
  {
    slotId: 'slot.learn',
    label: 'LEARN',
    name: 'Customer Intel',
    promise: '顧客の声を、次の意思決定へ。',
    target: '15 MIN',
    defaultCellId: 'user-interview-synthesizer',
    variants: [
      { id: 'user-interview-synthesizer', name: 'インタビュー分析' },
      { id: 'support-theme-miner', name: '問い合わせ分析' },
      { id: 'offer-insight-digest', name: 'オファー改善メモ' },
    ],
    deliverables: ['共通テーマ', '顧客の言葉', '仮説', '次の検証'],
  },
  {
    slotId: 'slot.deliver',
    label: 'DELIVER',
    name: 'Delivery Guard',
    promise: '約束と成果物のズレを、納品前に止める。',
    target: '10 MIN',
    defaultCellId: 'gig-delivery-verifier',
    variants: [
      { id: 'gig-delivery-verifier', name: '受託納品チェック' },
      { id: 'web-delivery-verifier', name: 'Web納品チェック' },
      { id: 'document-delivery-verifier', name: '文書納品チェック' },
    ],
    deliverables: ['要件照合', '不足一覧', '品質チェック', '納品判定'],
  },
];

export function cellForSlot(slotId: string): ServiceCell | undefined {
  return serviceCells.find((cell) => cell.slotId === slotId);
}

export function variantAllowed(slotId: string, cellId: string): boolean {
  return Boolean(
    cellForSlot(slotId)?.variants.some((variant) => variant.id === cellId),
  );
}
