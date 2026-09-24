"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";
import FloatingAvocados from "./FloatingAvocados";
import TOOL_CATALOG from "./doraemon-tool-catalog.json";

gsap.registerPlugin(ScrollTrigger);

type Tool = { no: string; code: string; actor: string; title: string; body: string; variant: string };

const tools: Tool[] = TOOL_CATALOG.map((tool, index) => ({
  no: String(index + 1).padStart(2, "0"),
  code: tool.key.toUpperCase(),
  actor: tool.actor,
  title: tool.marketingTitle,
  body: tool.marketingBody,
  variant: tool.key,
}));

function ToolVisual({ tool }: { tool: Tool }) {
  switch (tool.variant) {
    case "request": return <div className="tool-visual visual-request" data-visual="request">
      <div className="request-phone"><span className="request-app">Telegram</span><div className="request-bubble">この教材を売って</div><div className="request-reply"><i />受け付けました</div></div>
      <div className="request-command"><span>NEW COMMAND</span><strong>販売フローを開始</strong><small>素材 12件を検出</small></div><div className="request-pulse" />
    </div>;
    case "course": return <div className="tool-visual visual-course" data-visual="course">
      <div className="source-chip source-a">VOICE</div><div className="source-chip source-b">MEMO</div><div className="source-chip source-c">URL</div>
      <div className="course-page page-back" /><div className="course-page page-middle" /><div className="course-page page-front"><span>COURSE / 01</span><strong>売れる教材の設計</strong><i /><i /><i /><b>全6章</b></div><div className="course-bind">素材を統合中</div>
    </div>;
    case "check": return <div className="tool-visual visual-check" data-visual="check">
      <div className="check-document"><span>FACT CHECK</span><p>市場規模は前年比24%成長</p><p>導入企業の平均工数を削減</p><p>2024年の料金情報</p><div className="check-scan" /></div>
      <div className="check-status status-one">✓ 出典一致</div><div className="check-status status-two">✓ 表現を修正</div><div className="check-status status-three">! 更新が必要</div><div className="check-score"><strong>92</strong><span>/100</span><small>公開可能性</small></div>
    </div>;
    case "store": return <div className="tool-visual visual-store" data-visual="store">
      <div className="store-browser"><div className="browser-bar"><i /><i /><i /></div><div className="store-hero-block">3日で販売を自動化</div><div className="store-copy-block" /><div className="store-copy-block short" /><div className="store-offer"><span>限定特典つき</span><strong>¥9,800</strong></div><button type="button" tabIndex={-1}>今すぐはじめる</button></div>
      <div className="store-parts"><span>HEADLINE</span><span>PRICE</span><span>BENEFIT</span><span>CTA</span></div><div className="store-live"><i /> 公開準備完了</div>
    </div>;
    case "promote": return <div className="tool-visual visual-promote" data-visual="promote">
      <div className="post-card"><div className="post-avatar">D</div><b>@doraemonbottt</b><p>教材販売で最初に自動化すべきことを、10個に分解しました。</p><span>続きをツリーで読む ↓</span></div>
      <div className="post-ring ring-a">A案</div><div className="post-ring ring-b">B案</div><div className="post-ring ring-c">C案</div><div className="post-route route-a" /><div className="post-route route-b" /><div className="post-route route-c" /><div className="post-metric"><span>投稿案</span><strong>3本</strong></div>
    </div>;
    case "nurture": return <div className="tool-visual visual-nurture" data-visual="nurture">
      <div className="segment-stack"><div><i />未購入 <b>1,248</b></div><div><i />購入済み <b>382</b></div><div><i />休眠中 <b>91</b></div></div>
      <div className="nurture-rail rail-telegram"><span>TELEGRAM</span><i /></div><div className="nurture-rail rail-email"><span>EMAIL</span><i /></div><div className="message-out message-one">無料資料の案内案</div><div className="message-out message-two">活用案内の下書き</div><div className="duplicate-block">✓ 二重送信を事前確認</div>
    </div>;
    case "pay": return <div className="tool-visual visual-pay" data-visual="pay">
      <div className="pay-terminal"><span>PAYMENT</span><strong>¥9,800</strong><div className="pay-ring"><i /></div><b className="pay-approved">! 入金情報を要確認</b></div>
      <div className="ledger"><div><span>注文 #2048</span><b>確認待ち</b></div><div className="ledger-confirmed"><span>決済記録</span><b>未接続</b></div><div><span>売上計上</span><b>保留</b></div></div><div className="pay-receipt">WEBHOOK RECEIPT <b>REQUIRED</b></div>
    </div>;
    case "deliver": return <div className="tool-visual visual-deliver" data-visual="deliver">
      <div className="access-lock"><div className="lock-shackle" /><div className="lock-body"><i /></div><span>CHECK</span></div>
      <div className="entitlement entitlement-course"><i>01</i><span>教材</span><b>DRAFT</b></div><div className="entitlement entitlement-tool"><i>02</i><span>ツール</span><b>DRAFT</b></div><div className="entitlement entitlement-community"><i>03</i><span>コミュニティ</span><b>DRAFT</b></div><div className="delivery-user">購入者 #2048 <strong>3権限を確認</strong></div>
    </div>;
    case "measure": return <div className="tool-visual visual-measure" data-visual="measure">
      <div className="attribution-flow"><span>投稿A</span><i /><span>LP v3</span><i /><span>購入</span><i /><span>継続</span></div>
      <div className="measure-chart"><div className="chart-grid" /><div className="chart-bar bar-one"><b>投稿A</b><i /></div><div className="chart-bar bar-two"><b>投稿B</b><i /></div><div className="chart-bar bar-three"><b>メール</b><i /></div></div><div className="measure-result"><span>集計条件</span><strong>要確認</strong><small>入力データだけで比較</small></div>
    </div>;
    default: return <div className="tool-visual visual-split" data-visual="split">
      <div className="revenue-total"><span>売上入力例</span><strong>¥100,000</strong><div className="revenue-line"><i className="share-creator" /><i className="share-seller" /><i className="share-builder" /></div></div>
      <div className="recipient recipient-creator"><i>40%</i><span>教材制作者</span><b>¥40,000</b></div><div className="recipient recipient-seller"><i>45%</i><span>販売者</span><b>¥45,000</b></div><div className="recipient recipient-builder"><i>15%</i><span>BOT開発者</span><b>¥15,000</b></div><div className="settled-stamp">DRAFT</div>
    </div>;
  }
}

function animateVisual(timeline: gsap.core.Timeline, visual: HTMLElement, variant: string) {
  const q = (selector: string) => visual.querySelectorAll(selector);
  const spring = "back.out(1.45)";
  if (variant === "request") {
    timeline.fromTo(q(".request-phone"), { y: 34, scale: .92 }, { y: 0, scale: 1, duration: .45, ease: spring }).fromTo(q(".request-bubble"), { x: 38, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: .32 }, "<.08").fromTo(q(".request-reply"), { x: -26, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: .32 }, ">-.04").fromTo(q(".request-command"), { y: -26, scale: .9, autoAlpha: 0 }, { y: 0, scale: 1, autoAlpha: 1, duration: .38, ease: spring }, "<").fromTo(q(".request-pulse"), { scale: .2, autoAlpha: .9 }, { scale: 5, autoAlpha: 0, duration: .65, ease: "power2.out" }, "<.05");
  } else if (variant === "course") {
    timeline.fromTo(q(".source-a"), { x: -110, y: -60, rotation: -14, autoAlpha: 0 }, { x: 0, y: 0, rotation: 0, autoAlpha: 1, duration: .42, ease: spring }).fromTo(q(".source-b"), { x: 100, y: -70, rotation: 12, autoAlpha: 0 }, { x: 0, y: 0, rotation: 0, autoAlpha: 1, duration: .42, ease: spring }, "<.08").fromTo(q(".source-c"), { x: -90, y: 70, rotation: 10, autoAlpha: 0 }, { x: 0, y: 0, rotation: 0, autoAlpha: 1, duration: .42, ease: spring }, "<.08").fromTo(q(".course-page"), { y: 70, rotation: 8, autoAlpha: 0 }, { y: 0, rotation: 0, autoAlpha: 1, stagger: .08, duration: .48, ease: spring }, ">-.12").fromTo(q(".page-front i"), { scaleX: 0 }, { scaleX: 1, stagger: .06, duration: .24, transformOrigin: "left" }, "<.16").fromTo(q(".course-bind"), { scale: .65, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: .3, ease: spring }, ">-.08");
  } else if (variant === "check") {
    timeline.fromTo(q(".check-document"), { y: 35, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .4, ease: spring }).fromTo(q(".check-scan"), { y: -120, autoAlpha: 0 }, { y: 165, autoAlpha: 1, duration: .85, ease: "none" }, ">-.08").fromTo(q(".check-status"), { x: 35, scale: .86, autoAlpha: 0 }, { x: 0, scale: 1, autoAlpha: 1, stagger: .13, duration: .28, ease: spring }, "<.18").fromTo(q(".status-three"), { x: 10 }, { x: -5, repeat: 3, yoyo: true, duration: .06 }, ">-.06").fromTo(q(".check-score"), { scale: .72, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: .34, ease: spring }, "<");
  } else if (variant === "store") {
    timeline.fromTo(q(".store-browser"), { y: 45, scale: .94, autoAlpha: 0 }, { y: 0, scale: 1, autoAlpha: 1, duration: .46, ease: spring }).fromTo(q(".store-hero-block, .store-copy-block, .store-offer, .store-browser button"), { y: 20, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: .08, duration: .28 }, "<.15").fromTo(q(".store-parts span"), { x: 55, autoAlpha: 0 }, { x: 0, autoAlpha: 1, stagger: .07, duration: .25 }, "<").fromTo(q(".store-live"), { scale: .7, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: .32, ease: spring }, ">-.04");
  } else if (variant === "promote") {
    timeline.fromTo(q(".post-card"), { y: 46, rotation: -3, scale: .92, autoAlpha: 0 }, { y: 0, rotation: 0, scale: 1, autoAlpha: 1, duration: .46, ease: spring }).fromTo(q(".post-route"), { scaleX: 0 }, { scaleX: 1, stagger: .08, duration: .32, transformOrigin: "left" }, ">-.06").fromTo(q(".post-ring"), { scale: .2, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, stagger: .09, duration: .32, ease: spring }, "<.08").fromTo(q(".post-metric"), { y: -20, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .28 }, ">-.05");
  } else if (variant === "nurture") {
    timeline.fromTo(q(".segment-stack > div"), { x: -48, autoAlpha: 0 }, { x: 0, autoAlpha: 1, stagger: .11, duration: .34, ease: spring }).fromTo(q(".nurture-rail i"), { scaleX: 0 }, { scaleX: 1, stagger: .1, duration: .38, transformOrigin: "left" }, "<.14").fromTo(q(".message-out"), { x: 45, autoAlpha: 0 }, { x: 0, autoAlpha: 1, stagger: .12, duration: .32, ease: spring }, "<.12").fromTo(q(".duplicate-block"), { scale: .72, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: .32, ease: spring }, ">-.05");
  } else if (variant === "pay") {
    timeline.fromTo(q(".pay-terminal"), { y: 40, scale: .92, autoAlpha: 0 }, { y: 0, scale: 1, autoAlpha: 1, duration: .42, ease: spring }).fromTo(q(".pay-ring i"), { rotation: 0 }, { rotation: 320, duration: .62, transformOrigin: "center", ease: "power2.inOut" }, ">-.05").fromTo(q(".pay-approved"), { scale: .6, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: .3, ease: spring }, ">-.08").fromTo(q(".ledger > div"), { x: 45, autoAlpha: 0 }, { x: 0, autoAlpha: 1, stagger: .09, duration: .3 }, "<").fromTo(q(".pay-receipt"), { y: 22, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .3 }, ">-.02");
  } else if (variant === "deliver") {
    timeline.fromTo(q(".access-lock"), { scale: .76, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: .4, ease: spring }).to(q(".lock-shackle"), { rotation: -34, y: -8, duration: .34, transformOrigin: "left bottom", ease: spring }, ">-.04").fromTo(q(".entitlement-course"), { x: -80, y: 35, autoAlpha: 0 }, { x: 0, y: 0, autoAlpha: 1, duration: .34, ease: spring }, "<.08").fromTo(q(".entitlement-tool"), { x: 80, y: -20, autoAlpha: 0 }, { x: 0, y: 0, autoAlpha: 1, duration: .34, ease: spring }, "<.08").fromTo(q(".entitlement-community"), { x: 70, y: 45, autoAlpha: 0 }, { x: 0, y: 0, autoAlpha: 1, duration: .34, ease: spring }, "<.08").fromTo(q(".delivery-user"), { y: 20, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .28 }, ">-.05");
  } else if (variant === "measure") {
    timeline.fromTo(q(".attribution-flow span"), { y: -20, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: .08, duration: .28 }).fromTo(q(".attribution-flow i"), { scaleX: 0 }, { scaleX: 1, stagger: .08, duration: .24, transformOrigin: "left" }, "<.08").fromTo(q(".chart-bar i"), { scaleY: 0 }, { scaleY: 1, stagger: .12, duration: .52, transformOrigin: "bottom", ease: spring }, ">-.04").fromTo(q(".chart-bar b"), { autoAlpha: 0 }, { autoAlpha: 1, stagger: .1, duration: .2 }, "<.2").fromTo(q(".measure-result"), { x: 40, scale: .85, autoAlpha: 0 }, { x: 0, scale: 1, autoAlpha: 1, duration: .36, ease: spring }, ">-.08");
  } else {
    timeline.fromTo(q(".revenue-total"), { y: -30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .34, ease: spring }).fromTo(q(".revenue-line"), { scaleX: 0 }, { scaleX: 1, duration: .48, transformOrigin: "left" }, ">-.02").fromTo(q(".recipient-creator"), { x: -70, y: 35, autoAlpha: 0 }, { x: 0, y: 0, autoAlpha: 1, duration: .34, ease: spring }, "<.14").fromTo(q(".recipient-seller"), { y: 60, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .34, ease: spring }, "<.08").fromTo(q(".recipient-builder"), { x: 70, y: 35, autoAlpha: 0 }, { x: 0, y: 0, autoAlpha: 1, duration: .34, ease: spring }, "<.08").fromTo(q(".settled-stamp"), { scale: 1.5, rotation: -9, autoAlpha: 0 }, { scale: 1, rotation: -5, autoAlpha: 1, duration: .38, ease: spring }, ">-.03");
  }
}

export default function EffectStory() {
  const root = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const scope = root.current;
    if (!scope) return;
    const mm = gsap.matchMedia();
    const context = gsap.context(() => {
      mm.add("(min-width: 801px) and (prefers-reduced-motion: no-preference)", () => {
        const scenes = gsap.utils.toArray<HTMLElement>(".story-scene", scope);
        const visuals = gsap.utils.toArray<HTMLElement>(".desktop-story .story-visual", scope);
        const progress = scope.querySelector<HTMLElement>(".story-progress-fill");
        gsap.set(scenes, { autoAlpha: 0, y: 24 }); gsap.set(visuals, { autoAlpha: 0, scale: .97 }); gsap.set([scenes[0], visuals[0]], { autoAlpha: 1, y: 0, scale: 1 });
        const timeline = gsap.timeline({ scrollTrigger: { trigger: scope, start: "top top", end: () => `+=${window.innerHeight * 10}`, pin: ".story-pin", scrub: .72, anticipatePin: 1, invalidateOnRefresh: true } });
        animateVisual(timeline, visuals[0], tools[0].variant); timeline.to(progress, { scaleX: .1, duration: .18 }, "<").to({}, { duration: .28 });
        tools.slice(1).forEach((tool, offset) => { const index = offset + 1; timeline.to([scenes[index - 1], visuals[index - 1]], { autoAlpha: 0, y: -18, scale: .97, duration: .22 }).set(visuals[index], { y: 0, scale: 1 }).to([scenes[index], visuals[index]], { autoAlpha: 1, y: 0, duration: .28 }, ">-.02"); animateVisual(timeline, visuals[index], tool.variant); timeline.to(progress, { scaleX: (index + 1) / tools.length, duration: .22 }, "<").to({}, { duration: .24 }); });
      });
      mm.add("(max-width: 800px) and (prefers-reduced-motion: no-preference)", () => {
        gsap.utils.toArray<HTMLElement>(".mobile-tool-card", scope).forEach((card) => { const visual = card.querySelector<HTMLElement>(".tool-visual"); if (!visual) return; const timeline = gsap.timeline({ scrollTrigger: { trigger: card, start: "top 72%", once: true } }); gsap.set(visual, { autoAlpha: 1 }); animateVisual(timeline, visual, visual.dataset.visual || "request"); });
      });
    }, scope);
    return () => { mm.revert(); context.revert(); };
  }, []);

  return <section className="effect-story" id="story" ref={root} aria-labelledby="story-title">
    <FloatingAvocados variant="print-leaf" count={6} motion="slide" />
    <div className="story-pin">
    <div className="story-topline"><p className="eyebrow">10の道具。10の違う仕事。</p><div className="story-progress" aria-hidden="true"><span className="story-progress-fill" /></div><span>スクロールして実演 ↓</span></div>
    <div className="story-heading"><h2 id="story-title">頼むだけ。仕事ごとに、<br /><em>返す下書きが変わる。</em></h2><p>各道具が何を受け取り、どんな下書きや確認結果を返すかを一つずつ紹介します。公開・送信・決済・納品・送金は別途確認が必要です。</p></div>
    <div className="desktop-story"><div className="story-canvas" aria-hidden="true">{tools.map((tool) => <div className="story-visual" key={tool.no}><ToolVisual tool={tool} /></div>)}</div><div className="story-copy-stack">{tools.map((tool) => <article className="story-scene" key={tool.no}><span>{tool.no} / 10 · {tool.actor}</span><h3>{tool.code}</h3><h4>{tool.title}</h4><p>{tool.body}</p></article>)}</div></div>
    <ol className="mobile-story">{tools.map((tool) => <li className={`mobile-tool-card mobile-${tool.variant}`} key={tool.no}><div className="mobile-card-top"><span>{tool.no} / 10</span><strong>{tool.actor}</strong></div><div className="story-visual" aria-hidden="true"><ToolVisual tool={tool} /></div><h3>{tool.title}</h3><p>{tool.body}</p></li>)}</ol>
    <ol className="sr-only">{tools.map((tool) => <li key={tool.no}>{tool.no} {tool.title}：{tool.body}</li>)}</ol>
  </div></section>;
}
