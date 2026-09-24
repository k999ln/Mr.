"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function ActionEffectValue() {
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!root.current) return;
    const mm = gsap.matchMedia();
    const ctx = gsap.context(() => {
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const q = gsap.utils.selector(root.current!);
        const tl = gsap.timeline({
          scrollTrigger: { trigger: root.current, start: "top 78%", once: true },
          defaults: { ease: "back.out(1.22)" },
        });

        tl.from(q(".flow-card"), { y: 34, scale: .965, autoAlpha: 0, stagger: .16, duration: .5 })
          .from(q(".request-rule"), { x: -18, autoAlpha: 0, stagger: .08, duration: .26 }, "-=.5")
          .from(q(".request-lock"), { scale: .4, rotation: -18, autoAlpha: 0, duration: .36 }, "-=.16")
          .to(q(".request-lock-ring"), { scale: 1.35, autoAlpha: 0, duration: .55, ease: "power2.out" }, "-=.2")
          .from(q(".flow-link-one"), { scaleX: 0, transformOrigin: "left center", duration: .35, ease: "power2.out" }, "-=.1")
          .from(q(".run-id"), { x: -16, autoAlpha: 0, stagger: .08, duration: .25 }, "-=.05")
          .from(q(".run-led"), { scale: 0, stagger: .08, duration: .2 }, "-=.22")
          .from(q(".flow-link-two"), { scaleX: 0, transformOrigin: "left center", duration: .35, ease: "power2.out" }, "-=.06")
          .fromTo(q(".receipt-scan"), { yPercent: -350, autoAlpha: 0 }, { yPercent: 320, autoAlpha: 1, duration: .7, ease: "power1.inOut" }, "-=.04")
          .from(q(".receipt-match"), { scale: .5, autoAlpha: 0, duration: .32 }, "-=.15")
          .from(q(".flow-link-three"), { scaleX: 0, transformOrigin: "left center", duration: .35, ease: "power2.out" }, "-=.04")
          .from(q(".settlement-hold"), { y: -12, autoAlpha: 0, duration: .26 }, "-=.1")
          .fromTo(q(".settlement-token"), { xPercent: -260, scale: .65, autoAlpha: 0 }, { xPercent: 0, scale: 1, autoAlpha: 1, stagger: .12, duration: .46, ease: "power3.inOut" }, "-=.06")
          .from(q(".settlement-total"), { y: 15, scale: .85, autoAlpha: 0, duration: .35 }, "-=.12")
          .to(q(".flow-progress"), { scaleX: 1, duration: 1.45, ease: "power1.inOut" }, .2);
      });
      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set(".flow-card, .flow-card *", { clearProps: "all" });
      });
    }, root);

    return () => {
      mm.revert();
      ctx.revert();
    };
  }, []);

  return (
    <div className="action-flow" ref={root} aria-label="成果確定の流れ">
      <div className="flow-progress" aria-hidden="true" />
      <article className="flow-card request-card">
        <header><span>A</span><div><strong>REQUEST</strong><small>運転条件を固定</small></div></header>
        <div className="flow-stage request-stage" aria-hidden="true">
          <div><i className="request-rule">ACTOR / KAI</i><i className="request-rule">LIMIT / ¥50K</i><i className="request-rule">ACTION / POST</i></div>
          <b className="request-lock"><em className="request-lock-ring" />✓<small>LOCKED</small></b>
        </div>
      </article>
      <i className="flow-link flow-link-one" aria-hidden="true">→</i>
      <article className="flow-card execution-card">
        <header><span>B</span><div><strong>EXECUTION</strong><small>BOT別の実行ID</small></div></header>
        <div className="flow-stage run-stage" aria-hidden="true">
          <i className="run-id"><b className="run-led" />BOT 03 <strong>#03–91</strong></i>
          <i className="run-id"><b className="run-led" />BOT 05 <strong>#05–A7</strong></i>
          <i className="run-id"><b className="run-led" />BOT 07 <strong>#07–F2</strong></i>
        </div>
      </article>
      <i className="flow-link flow-link-two" aria-hidden="true">→</i>
      <article className="flow-card receipt-card">
        <header><span>C</span><div><strong>RECEIPT</strong><small>外部効果を照合</small></div></header>
        <div className="flow-stage receipt-stage" aria-hidden="true">
          <div><i>ORDER</i><strong>#2048</strong><small>EXTERNAL STATE</small></div>
          <b className="receipt-scan" />
          <em className="receipt-match">✓ MATCHED</em>
        </div>
      </article>
      <i className="flow-link flow-link-three" aria-hidden="true">→</i>
      <article className="flow-card settlement-card">
        <header><span>D</span><div><strong>SETTLEMENT</strong><small>確定分のみ精算</small></div></header>
        <div className="flow-stage settlement-stage" aria-hidden="true">
          <span className="settlement-hold">PENDING / HOLD</span>
          <div><i className="settlement-token">¥</i><i className="settlement-token">¥</i><i className="settlement-token">¥</i></div>
          <strong className="settlement-total">¥2,400 <small>FINAL</small></strong>
        </div>
      </article>
    </div>
  );
}
