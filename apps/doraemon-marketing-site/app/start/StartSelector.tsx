"use client";

import { useMemo, useState } from "react";
import TOOLS from "../doraemon-tool-catalog.json";
const MIN_SELECTIONS = 1;
const MAX_SELECTIONS = 3;

function selectionPayload(keys: string[]) {
  const mask = TOOLS.reduce((value, tool, index) => keys.includes(tool.key) ? value | (1 << index) : value, 0);
  return `f2_${mask.toString(36)}`;
}

export default function StartSelector({ telegramBaseUrl }: { telegramBaseUrl: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [consented, setConsented] = useState(false);
  const telegramUrl = useMemo(() => {
    if (!telegramBaseUrl || selected.length === 0) return "";
    const username = telegramBaseUrl.match(/t\.me\/([A-Za-z][A-Za-z0-9_]{4,31})/i)?.[1];
    if (!username) return "";
    return `${telegramBaseUrl}?start=${selectionPayload(selected)}`;
  }, [telegramBaseUrl, selected]);

  function toggle(key: string) {
    if (!selected.includes(key) && selected.length >= MAX_SELECTIONS) return;
    setSelected((current) => current.includes(key)
      ? current.filter((item) => item !== key)
      : [...current, key]);
  }

  return <>
    <section className="start-selector" aria-labelledby="tool-picker-title">
      <div className="picker-heading">
        <div><span id="tool-picker-title">10個の道具</span><strong>{selected.length === 0 ? "1〜3個選んでください" : `${selected.length}個を選択中`}</strong></div>
        <div className={`picker-count ${selected.length >= MIN_SELECTIONS ? "is-ready" : ""}`} aria-live="polite"><b>{String(selected.length).padStart(2, "0")}</b><span>/ {MAX_SELECTIONS}</span></div>
      </div>

      <div className="start-tool-grid" role="group" aria-label="利用したい道具">
        {TOOLS.map((tool, index) => {
          const active = selected.includes(tool.key);
          return <button type="button" key={tool.key} className={`start-tool ${active ? "is-selected" : ""}`} aria-pressed={active} disabled={!active && selected.length >= MAX_SELECTIONS} onClick={() => toggle(tool.key)}>
            <span>{String(index + 1).padStart(2, "0")}</span><i aria-hidden="true">{active ? "✓" : "+"}</i><strong>{tool.verb}</strong><small>{tool.detail}</small>
          </button>;
        })}
      </div>

      <div className="start-consent">
        <input id="start-consent-checkbox" type="checkbox" aria-labelledby="start-consent-copy" checked={consented} onChange={(event) => setConsented(event.target.checked)} />
        <span id="start-consent-copy"><b>利用条件・データ利用・有料操作の条件に同意します</b><small><a href="/legal" target="_blank">利用条件</a>と<a href="/privacy" target="_blank">プライバシー方針</a>を確認しました。初期調査は無料です。後で金額入りの有料ボタンを押した場合だけTelegramの購入確認が開き、そこで承認した場合に限り課金・実行されます。</small></span>
      </div>
    </section>

    <div className="start-action">
      {consented && selected.length >= MIN_SELECTIONS && telegramUrl
        ? <a className="start-telegram-link" href={telegramUrl}>Telegramで使う<span>↗</span></a>
        : <button type="button" disabled>{selected.length < MIN_SELECTIONS ? "まず1つ選ぶ" : !consented ? "同意するとTelegramで使えます" : "Telegram接続を準備中"}<span>›</span></button>}
      <small>{telegramBaseUrl ? "1〜3つ選んで同意すると、選択内容を引き継いでTelegramを開きます。STARTを押すと反映されます。" : "Telegram接続を準備しています。"}</small>
    </div>
  </>;
}
