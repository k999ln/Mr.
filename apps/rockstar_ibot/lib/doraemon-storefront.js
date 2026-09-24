"use strict";

const { listDoraemonTools } = require("../doraemon-tools/registry.js");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function shell(title, body, script = "") {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#f5f5f7"><title>${title}</title><style>
  :root{color-scheme:light;--ink:#1d1d1f;--muted:#6e6e73;--blue:#0071e3;--paper:#f5f5f7;--line:#d2d2d7}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",sans-serif}main{min-height:100svh;display:grid;place-items:center;padding:32px 20px}.card{width:min(760px,100%);padding:clamp(32px,7vw,72px);background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:28px}h1{margin:0;font-size:clamp(42px,8vw,78px);line-height:.96;letter-spacing:-.06em}h2{margin:18px 0 0;font-size:clamp(22px,4vw,34px);letter-spacing:-.035em}.lede{margin:22px 0 0;color:var(--muted);font-size:17px;line-height:1.65}.tools{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:30px 0;padding:0;list-style:none}.tools li{padding:14px 16px;background:var(--paper);border-radius:14px;font-size:13px;font-weight:650}.cta{width:100%;min-height:56px;border:0;border-radius:999px;background:var(--blue);color:#fff;font-size:17px;font-weight:650;cursor:pointer;transition:transform .16s ease,opacity .16s}.cta:active{transform:scale(.97)}.cta:disabled{opacity:.55}.fine{margin:16px 4px 0;color:var(--muted);font-size:12px;line-height:1.55}.status{margin:28px 0;padding:18px;border-radius:18px;background:var(--paper);font-size:14px;line-height:1.6}.phone{width:190px;height:370px;margin:30px auto;border:8px solid var(--ink);border-radius:40px;padding:18px 12px;background:#fff;box-shadow:0 24px 60px rgba(0,0,0,.14)}.phone:before{content:"";display:block;width:64px;height:18px;margin:-10px auto 34px;border-radius:12px;background:var(--ink)}.bubble{padding:13px;border-radius:16px 16px 16px 5px;background:#e9f3ff;font-size:13px;line-height:1.45}.hidden{display:none}@media(max-width:520px){.card{padding:30px 22px;border-radius:22px}.tools{grid-template-columns:1fr}h1{font-size:52px}}
  </style></head><body><main>${body}</main>${script ? `<script>${script}</script>` : ""}</body></html>`;
}

function purchasePage(options = {}) {
  const botUsername = /^[A-Za-z0-9_]{5,32}$/.test(String(options.botUsername || ""))
    ? String(options.botUsername)
    : "";
  const cta = botUsername
    ? `<a class="cta" style="display:flex;align-items:center;justify-content:center;text-decoration:none" href="https://t.me/${botUsername}?start=free">Telegramで無料スタート</a>`
    : `<button class="cta" disabled>Telegram BOTを準備中</button>`;
  const tools = listDoraemonTools();
  const toolItems = tools.map((tool) => `<li data-tool-id="${escapeHtml(tool.id)}">${escapeHtml(tool.name)}</li>`).join("");
  return shell("ドラえもん — 3つまで無料。", `<section class="card"><h1>ドラえもん</h1><h2>好きな3つを、無料で同時に使う。</h2><p class="lede">メールもカードも登録せず、Telegramだけで開始できます。4つ目のツールを選んだ時にだけStarsの確認画面が開き、支払いを承認すると全${tools.length}ツールが解放されます。</p><ul class="tools">${toolItems}</ul>${cta}<p class="fine">無料枠の開始にメール・カード情報は不要です。Bot運営に必要なTelegramのユーザーID・チャットIDは処理します。最初の同意だけで無断課金されることはありません。</p></section>`);
}

function completePage() {
  const toolCount = listDoraemonTools().length;
  return shell("ドラえもん — Telegramを接続", `<section class="card"><h1>購入を確認中。</h1><p class="lede">Stripeから安全な支払完了通知を受け取ったら、あなた専用のTelegram接続ボタンが現れます。</p><div class="phone"><div class="bubble" id="bubble">ドラえもんが決済を確認しています…</div></div><p class="status" id="status" role="status">確認中です。この画面は閉じないでください。</p><a class="cta hidden" id="connect" style="display:none;align-items:center;justify-content:center;text-decoration:none" href="#">Telegramでドラえもんを接続</a></section>`, `
  const session=new URLSearchParams(location.search).get('session_id'),status=document.getElementById('status'),bubble=document.getElementById('bubble'),connect=document.getElementById('connect');let attempts=0;
  async function poll(){if(!session){status.textContent='Stripeの決済番号が見つかりません。決済完了画面から開き直してください。';return}try{const response=await fetch('/api/doraemon/purchase-status?session_id='+encodeURIComponent(session));const body=await response.json();if(body.status==='paid'&&body.telegramUrl){bubble.textContent='支払いを確認しました。次はTelegramで会いましょう。';status.textContent='下のボタンを押すとTelegramが開きます。Startを押せば接続完了です。';connect.href=body.telegramUrl;connect.style.display='flex';return}if(body.status==='connected'){bubble.textContent='接続できました。全${toolCount}ツールをここから動かせます。';status.textContent='Telegramとの接続が完了しました。';return}if(['expired','payment_incomplete','invalid'].includes(body.status)){status.textContent='自動確認できませんでした。決済メールを保管してサポートへ連絡してください。';return}}catch{}attempts++;if(attempts<60)setTimeout(poll,2000);else status.textContent='確認に時間がかかっています。数分後にこのページを再読み込みしてください。'}poll();
  `);
}

module.exports = { purchasePage, completePage };
