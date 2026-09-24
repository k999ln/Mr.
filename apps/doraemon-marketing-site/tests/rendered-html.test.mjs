import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function renderPath(path, env = {}) {
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);
  try {
    return await worker.fetch(
      new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
      { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
      { waitUntil() {}, passThroughOnException() {} },
    );
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("server-renders the compact avocadomini launch page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /avocadomini — 10個の販売ツールを、Telegramからひとつに。/);
  assert.match(html, /選んで、/);
  assert.match(html, /無料で始める/);
  assert.match(html, /10の道具を、/);
  assert.match(html, /SCROLL TO OPEN/);
  assert.match(html, /avocado-print-overprint-v1\.png/);
  assert.doesNotMatch(html, /人間は、/);
  assert.doesNotMatch(html, /詳しく見る/);
  assert.match(html, /href="\/start"/);
});

test("preserves the former long-form home at details", async () => {
  const response = await renderPath("/details");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /外部操作は利用者が内容を確認するまで行いません/);
  assert.match(html, /AIは、下書きと確認を/);
  assert.match(html, /自動化で、いちばん大切なこと/);
  assert.match(html, /カードもメールも、いらない。/);
  assert.match(html, /無料で使える。/);
  assert.match(html, /1〜3つ。/);
  assert.match(html, /あなたの抱える問題を解決するツールを選ぶだけ。/);
  assert.doesNotMatch(html, /無料枠ではメール・カード情報を取得しません/);
  assert.match(html, /確認済み・未確認・次にすること/);
  assert.match(html, /10の道具。10の違う仕事。/);
  assert.match(html, /仕事ごとに/);
  assert.match(html, /散らばった素材を教材にする/);
  assert.match(html, /確定した金額を正しく分ける/);
  assert.match(html, /販売事故・売上漏れ診断/);
  assert.match(html, /無料診断PDFを今すぐダウンロード/);
  assert.match(html, /メール登録なし/);
  assert.doesNotMatch(html, /name="resourceConsent"/);
  assert.doesNotMatch(html, /name="marketingConsent"/);
  assert.match(html, /href="\/privacy"/);
  assert.match(html, /href="\/legal"/);
  assert.match(html, /href="\/start"/);
  assert.doesNotMatch(html, /先行案内を受け取る/);
  assert.doesNotMatch(html, /Stripeで購入する/);
  assert.doesNotMatch(html, /NOT A MARKETPLACE|Policy-bound orchestration|権利化の中心/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("explains the one-button Telegram handoff before opening the bot", async () => {
  const ready = await renderPath("/start", { DORAEMON_TELEGRAM_BOT_USERNAME: "DoraExampleBot" });
  assert.equal(ready.status, 200);
  const html = await ready.text();
  assert.match(html, /最初に使いたい道具を/);
  assert.match(html, /選んだ道具は、そのままTelegramへ反映されます/);
  assert.doesNotMatch(html, /選ぶだけでは課金されません/);
  assert.match(html, /1〜3つ選んで同意すると、選択内容を引き継いでTelegramを開きます。STARTを押すと反映されます/);
  const startSource = await readFile(new URL("../app/start/page.tsx", import.meta.url), "utf8");
  const selectorSource = await readFile(new URL("../app/start/StartSelector.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(startSource, /GitHub|API|Webhook/);
  assert.match(selectorSource, /\$\{telegramBaseUrl\}\?start=\$\{selectionPayload\(selected\)\}/);
  assert.match(selectorSource, /Telegramで使う/);
  assert.match(selectorSource, /selected\.length >= MIN_SELECTIONS/);
  assert.match(selectorSource, /disabled=\{!active && selected\.length >= MAX_SELECTIONS\}/);
  assert.doesNotMatch(selectorSource, /最終確認|この\{selected\.length\}個で|setReviewing|start-review/);
  assert.doesNotMatch(selectorSource, /所有確認が完了するまで開始できません/);
});

test("keeps all ten GSAP scenes, four distinct proof mechanisms, responsive motion, and product assets", async () => {
  const [story, catalogJson, motion, proof, flow, css, packageJson] = await Promise.all([
    readFile(new URL("../app/EffectStory.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/doraemon-tool-catalog.json", import.meta.url), "utf8"),
    readFile(new URL("../app/SiteMotion.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ProofMechanisms.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ActionEffectValue.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  const catalog = JSON.parse(catalogJson);
  assert.deepEqual(catalog.map((tool) => tool.key), ["request", "course", "check", "store", "promote", "nurture", "pay", "deliver", "measure", "split"]);
  assert.match(story, /String\(index \+ 1\)\.padStart\(2, "0"\)/);
  assert.match(story, /ScrollTrigger/);
  assert.match(story, /gsap\.matchMedia/);
  assert.match(story, /variant="print-leaf"/);
  assert.match(story, /prefers-reduced-motion/);
  assert.match(story, /window\.innerHeight \* 10/);
  for (const variant of ["request", "course", "check", "store", "promote", "nurture", "pay", "deliver", "measure", "split"]) {
    assert.match(story, new RegExp(`data-visual="${variant}"`));
  }
  for (const variant of ["request", "course", "check", "store", "promote", "nurture", "pay", "deliver", "measure"]) {
    assert.match(story, new RegExp(`variant === "${variant}"`));
  }
  assert.match(motion, /proof-visual img/);
  assert.match(motion, /floating-avocado/);
  for (const motionType of ["rain", "conveyor", "slide", "bloom"]) {
    assert.match(motion, new RegExp(`motion === "${motionType}"`));
  }
  for (const mechanism of ["manifest", "receipt", "provenance", "finality"]) {
    assert.match(proof, new RegExp(`card\\.dataset\\.mechanism === "${mechanism}"`));
  }
  assert.match(proof, /manifest-seal/);
  assert.match(proof, /receipt-packet/);
  assert.match(proof, /trace-dot/);
  assert.match(proof, /finality-arrow/);
  assert.match(proof, /prefers-reduced-motion: reduce/);
  for (const stage of ["request-rule", "run-id", "receipt-scan", "settlement-token"]) {
    assert.match(flow, new RegExp(stage));
  }
  assert.match(flow, /flow-link-one/);
  assert.match(flow, /flow-link-two/);
  assert.match(flow, /flow-link-three/);
  assert.match(flow, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.mobile-tool-card/);
  assert.match(css, /--avocado-lime: #d9ed76/);
  assert.match(css, /\.floating-avocados--whole/);
  assert.match(css, /\.floating-avocados--half/);
  assert.match(css, /\.floating-avocados--slices/);
  assert.match(css, /\.floating-avocados--print-half/);
  assert.match(css, /\.floating-avocados--print-whole/);
  assert.match(css, /\.floating-avocados--print-slices/);
  assert.match(css, /\.floating-avocados--print-leaf/);
  assert.match(css, /\.floating-avocados--print-overprint/);
  assert.match(css, /\.floating-avocados--emoji/);
  assert.match(css, /\.floating-motion--conveyor::before/);
  assert.match(css, /\.floating-motion--slide::before/);
  assert.match(css, /\.sale-bar span \{ color: var\(--blue\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(packageJson, /"gsap":/);

  await Promise.all([
    access(new URL("../public/og.png", import.meta.url)),
    access(new URL("../public/avocado-whole-v1.png", import.meta.url)),
    access(new URL("../public/avocado-half-pit-v1.png", import.meta.url)),
    access(new URL("../public/avocado-slices-v1.png", import.meta.url)),
    access(new URL("../public/avocado-print-half-v1.png", import.meta.url)),
    access(new URL("../public/avocado-print-whole-v1.png", import.meta.url)),
    access(new URL("../public/avocado-print-slices-v1.png", import.meta.url)),
    access(new URL("../public/avocado-print-leaf-v1.png", import.meta.url)),
    access(new URL("../public/avocado-print-overprint-v1.png", import.meta.url)),
    access(new URL("../public/resources/sales-automation-checklist-v1.pdf", import.meta.url)),
  ]);
});
