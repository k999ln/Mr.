export const PRIVACY_VERSION = "2026-09-01";
export const LEAD_ASSET_KEY = "sales-automation-checklist-v1";
export const LEAD_ASSET_PATH = "/resources/sales-automation-checklist-v1.pdf";

export const RESOURCE_CONSENT_TEXT =
  "入力したメールアドレスを、無料診断PDFの送付と送付記録の管理に利用することに同意します。";

export const NURTURE_SEQUENCE = [
  {
    key: "day-2-sales-leaks",
    days: 2,
    subject: "売れているのに利益が残らない、5つの販売事故",
    heading: "最初に塞ぐのは、集客不足ではなく売上漏れです。",
    body: "決済失敗、権限の付け忘れ、二重送信、返金後の権限残り、施策と売上の分断。avocadominiは、この5つを同じ実行記録でつなぐ設計です。",
  },
  {
    key: "day-5-approval-boundary",
    days: 5,
    subject: "完全自動化で、あえて人を残す場所",
    heading: "価格変更・返金・公開投稿は、承認境界を越えてから。",
    body: "速さより先に、誰が何を承認したかを残します。低リスク操作は自動、高リスク操作はTelegramで承認。この境界があるから、運用を広げられます。",
  },
  {
    key: "day-9-measurement-loop",
    days: 9,
    subject: "クリック数ではなく、継続と返金まで見る理由",
    heading: "短期売上だけを見ると、悪い施策が勝つことがあります。",
    body: "投稿、オファー、購入、納品、利用、更新、返金を同じIDで追います。何が売れたかではなく、何が長く価値を生んだかを判定します。",
  },
  {
    key: "day-14-pilot",
    days: 14,
    subject: "あなたの販売導線を、20分で一緒に分解します",
    heading: "自動化する前に、売上が漏れている場所を一つ決めます。",
    body: "教材・ツール・コミュニティを販売していて、3つ以上のサービスを手作業でつないでいる方向けです。返信で現在の販売商品と一番面倒な作業を教えてください。",
  },
] as const;
