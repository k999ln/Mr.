"use client";

import Script from "next/script";
import { FormEvent, useEffect, useState } from "react";

declare global {
  interface Window {
    turnstile?: { reset: () => void };
    onDoraemonTurnstile?: (token: string) => void;
  }
}

type LeadCaptureProps = { turnstileSiteKey: string };

export default function LeadCapture({ turnstileSiteKey }: LeadCaptureProps) {
  const [token, setToken] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");

  useEffect(() => {
    window.onDoraemonTurnstile = setToken;
    return () => { delete window.onDoraemonTurnstile; };
  }, []);

  if (!turnstileSiteKey) {
    return (
      <div className="lead-form lead-direct-download">
        <p className="lead-message done is-wide" role="status">公開ベータ中は、メール登録なしで無料資料を受け取れます。</p>
        <a className="lead-download is-wide" href="/resources/sales-automation-checklist-v1.pdf" download>無料診断PDFを今すぐダウンロード ↓</a>
        <p className="fine is-wide">メール配信の受付を開始するまでは、ここで個人情報を入力する必要はありません。</p>
      </div>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const params = new URLSearchParams(window.location.search);
    setState("sending");
    setMessage("");

    const response = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: data.get("email"),
        businessType: data.get("businessType"),
        monthlyOrders: data.get("monthlyOrders"),
        channels: data.getAll("channels"),
        primaryBottleneck: data.get("primaryBottleneck"),
        telegramUsage: data.get("telegramUsage"),
        resourceConsent: data.get("resourceConsent") === "yes",
        marketingConsent: data.get("marketingConsent") === "yes",
        turnstileToken: token,
        utm: {
          source: params.get("utm_source"),
          medium: params.get("utm_medium"),
          campaign: params.get("utm_campaign"),
          content: params.get("utm_content"),
          term: params.get("utm_term"),
        },
      }),
    });
    const payload = (await response.json()) as { ok?: boolean; message?: string; downloadUrl?: string; delivery?: string };
    if (!response.ok || !payload.ok) {
      setState("error");
      setMessage(payload.message || "送信できませんでした。時間を置いて再度お試しください。");
      window.turnstile?.reset();
      setToken("");
      return;
    }
    setDownloadUrl(payload.downloadUrl || "");
    setState("done");
    setMessage(payload.message || "メールを送信しました。この画面からもPDFを受け取れます。");
    form.reset();
  }

  return (
    <form className="lead-form" onSubmit={submit}>
      <div className="lead-field is-wide">
        <label htmlFor="lead-email">受取用メールアドレス <b>必須</b></label>
        <input id="lead-email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      </div>
      <div className="lead-field">
        <label htmlFor="business-type">販売しているもの</label>
        <select id="business-type" name="businessType" defaultValue="">
          <option value="">選択しない</option><option>教材・講座</option><option>ツール・SaaS</option><option>有料コミュニティ</option><option>物販</option><option>その他</option>
        </select>
      </div>
      <div className="lead-field">
        <label htmlFor="monthly-orders">月間注文数</label>
        <select id="monthly-orders" name="monthlyOrders" defaultValue="">
          <option value="">選択しない</option><option>0〜10件</option><option>11〜50件</option><option>51〜200件</option><option>201件以上</option>
        </select>
      </div>
      <fieldset className="lead-field is-wide lead-channels">
        <legend>現在使っている販売チャネル</legend>
        {['X', 'Telegram', 'メール', 'LINE', '自社LP'].map((channel) => <label key={channel}><input type="checkbox" name="channels" value={channel} /> {channel}</label>)}
      </fieldset>
      <div className="lead-field">
        <label htmlFor="bottleneck">一番時間がかかる作業</label>
        <select id="bottleneck" name="primaryBottleneck" defaultValue="">
          <option value="">選択しない</option><option>教材・投稿づくり</option><option>集客・見込み客管理</option><option>決済・失敗回収</option><option>納品・権限付与</option><option>継続・解約対応</option><option>効果測定</option>
        </select>
      </div>
      <div className="lead-field">
        <label htmlFor="telegram-usage">Telegramの利用状況</label>
        <select id="telegram-usage" name="telegramUsage" defaultValue="">
          <option value="">選択しない</option><option>販売に利用中</option><option>個人利用のみ</option><option>これから使いたい</option><option>利用予定なし</option>
        </select>
      </div>
      <label className="consent is-wide"><input type="checkbox" name="resourceConsent" value="yes" required /> メールアドレスを診断PDFの送付と送付記録の管理に利用することに同意します。 <a href="/privacy" target="_blank">プライバシー情報</a></label>
      <label className="consent is-wide"><input type="checkbox" name="marketingConsent" value="yes" /> 販売自動化の実践情報と案内をメールで受け取る（任意・いつでも解除できます）</label>
      <div className="is-wide turnstile-wrap">
        <><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" /><div className="cf-turnstile" data-sitekey={turnstileSiteKey} data-callback="onDoraemonTurnstile" /></>
      </div>
      <button className="lead-submit is-wide" disabled={state === "sending" || !token}>{state === "sending" ? "送信中…" : "無料診断PDFを受け取る"}</button>
      {message && <p className={`lead-message is-wide ${state}`} role="status">{message}</p>}
      {downloadUrl && <a className="lead-download is-wide" href={downloadUrl}>今すぐPDFをダウンロード ↓</a>}
    </form>
  );
}
