"use client";
import { useState } from "react";
import Link from "next/link";

export default function UnsubscribeClient({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  async function unsubscribe() {
    setState("sending");
    const response = await fetch("/api/unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    setState(response.ok ? "done" : "error");
  }
  return <main className="legal-page"><Link className="wordmark" href="/">avocadomini<span>/</span>10</Link><h1>メール配信を停止する</h1>{state === "done" ? <p>配信停止を受け付けました。</p> : <><p>販売自動化に関する任意の案内メールを停止します。診断PDFの取得記録は、法令対応と不正防止に必要な期間のみ保持します。</p><button className="lead-submit" onClick={unsubscribe} disabled={state === "sending" || !token}>{state === "sending" ? "処理中…" : "配信を停止する"}</button>{state === "error" && <p>リンクを確認できませんでした。</p>}</>}</main>;
}
