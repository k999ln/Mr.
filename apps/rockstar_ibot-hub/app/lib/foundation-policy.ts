export const FOUNDATION_POLICY = {
  version: 'foundation-pilot-v1',
  operatingModel: 'formation_stage_stewardship',
  pilotMemberLimit: 3_000,
  maxRequestsPerOwner: 50,
  maxRequestedUnits: 20,
  decisionMode: 'human_review',
  cashValue: 'none',
  transferable: false,
  redeemable: false,
  automatedApproval: false,
} as const;

export const foundationRequestKinds = [
  'service_access',
  'ai_capacity',
  'essentials_support',
] as const;

export type FoundationRequestKind = (typeof foundationRequestKinds)[number];

export const foundationKindLabels: Record<FoundationRequestKind, string> = {
  service_access: 'サービス利用枠',
  ai_capacity: 'AI処理枠',
  essentials_support: '生活必需品支援',
};

export const foundationCategories = {
  service_access: [
    ['youtube_script', 'YouTube台本'],
    ['web_development', 'Web開発'],
    ['seo', 'SEO'],
    ['other_service', 'その他のService Cell'],
  ],
  ai_capacity: [
    ['research', '調査'],
    ['generation', '生成'],
    ['automation', '自動化'],
    ['accessibility', 'アクセシビリティ'],
  ],
  essentials_support: [
    ['food', '食料'],
    ['hygiene', '衛生用品'],
    ['clothing', '衣類'],
    ['shelter_supplies', '住居関連の必需品'],
    ['other_essential', 'その他の必需品'],
  ],
} as const satisfies Record<FoundationRequestKind, readonly (readonly [string, string])[]>;

export const foundationStatusLabels: Record<string, string> = {
  requested: '受付済み',
  needs_information: '追加情報待ち',
  under_review: '人による審査中',
  approved: '承認済み',
  allocated: '配給枠を確保済み',
  fulfilled: '提供完了',
  declined: '今回は見送り',
  cancelled: '取消済み',
};

export type FoundationRequestDraft = {
  kind: FoundationRequestKind;
  category: string;
  requestedUnits: number;
  purposeSummary: string;
};

export type FoundationValidationResult =
  | { ok: true; value: FoundationRequestDraft }
  | { ok: false; error: string };

export function isFoundationRequestKind(value: string): value is FoundationRequestKind {
  return foundationRequestKinds.some((kind) => kind === value);
}

export function foundationCategoriesForKind(
  kind: FoundationRequestKind,
): readonly (readonly [string, string])[] {
  return foundationCategories[kind];
}

export function foundationCategoryLabel(kind: FoundationRequestKind, category: string): string {
  return foundationCategoriesForKind(kind).find(([value]) => value === category)?.[1] ?? category;
}

function containsDirectIdentifier(value: string): boolean {
  return (
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value) ||
    /\b\d{3}-\d{4}\b/.test(value) ||
    /(?:^|\D)\d{10,16}(?:\D|$)/.test(value) ||
    /(住所|電話番号|口座番号|カード番号|マイナンバー|passport\s*(?:number|no\.?))/i.test(value)
  );
}

export function validateFoundationRequest(input: {
  kind: string;
  category: string;
  requestedUnits: number;
  purposeSummary: string;
  attested: boolean;
}): FoundationValidationResult {
  if (!isFoundationRequestKind(input.kind)) {
    return { ok: false, error: '配給の種類が正しくありません。' };
  }
  const category = input.category.trim();
  if (!foundationCategoriesForKind(input.kind).some(([value]) => value === category)) {
    return { ok: false, error: '配給の分類が正しくありません。' };
  }
  const purposeSummary = input.purposeSummary.trim();
  if (purposeSummary.length < 12 || purposeSummary.length > 800) {
    return { ok: false, error: '用途は12〜800文字で入力してください。' };
  }
  if (containsDirectIdentifier(purposeSummary)) {
    return {
      ok: false,
      error: 'この欄には住所、電話、メール、口座などの個人情報を入力しないでください。',
    };
  }
  if (!input.attested) {
    return { ok: false, error: '非換金・非譲渡の配給規約への確認が必要です。' };
  }
  if (input.kind === 'essentials_support') {
    if (input.requestedUnits !== 0) {
      return { ok: false, error: '生活必需品支援はunit数ではなく必要性を審査します。' };
    }
  } else if (
    !Number.isSafeInteger(input.requestedUnits) ||
    input.requestedUnits < 1 ||
    input.requestedUnits > FOUNDATION_POLICY.maxRequestedUnits
  ) {
    return {
      ok: false,
      error: `申請unitは1〜${FOUNDATION_POLICY.maxRequestedUnits}で入力してください。`,
    };
  }
  return {
    ok: true,
    value: {
      kind: input.kind,
      category,
      requestedUnits: input.kind === 'essentials_support' ? 0 : input.requestedUnits,
      purposeSummary,
    },
  };
}
