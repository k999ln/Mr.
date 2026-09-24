"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const items = [
  {
    id: "manifest",
    number: "01",
    title: "MANIFEST",
    body: "誰が、何を、どの権限で動かすかを固定",
  },
  {
    id: "receipt",
    number: "02",
    title: "EFFECT RECEIPT",
    body: "外部サービス上の変化を実行IDへ接続",
  },
  {
    id: "provenance",
    number: "03",
    title: "PROVENANCE",
    body: "BOTの入力・出力・寄与を一本の経路で再現",
  },
  {
    id: "finality",
    number: "04",
    title: "FINALITY",
    body: "確定・取消・返金に合わせて報酬を反転",
  },
];

export default function ProofMechanisms() {
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!root.current) return;
    const mm = gsap.matchMedia();
    const ctx = gsap.context(() => {
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const cards = gsap.utils.toArray<HTMLElement>(".mechanism-card", root.current);
        cards.forEach((card) => {
          const q = gsap.utils.selector(card);
          const tl = gsap.timeline({
            scrollTrigger: { trigger: card, start: "top 82%", once: true },
            defaults: { ease: "back.out(1.25)" },
          });
          tl.from(card, { y: 36, autoAlpha: 0, duration: 0.62 })
            .from(q(".mechanism-copy > *"), { y: 12, autoAlpha: 0, stagger: 0.06, duration: 0.3 }, "-=.34");

          if (card.dataset.mechanism === "manifest") {
            tl.from(q(".manifest-chip"), { x: (i) => (i - 1) * 42, y: -18, scale: 0.72, autoAlpha: 0, stagger: 0.1, duration: 0.38 }, "-=.12")
              .from(q(".manifest-line"), { scaleX: 0, transformOrigin: "left center", duration: 0.38, ease: "power2.out" }, "-=.08")
              .from(q(".manifest-seal"), { scale: 0.35, rotation: -24, autoAlpha: 0, duration: 0.45 }, "-=.06")
              .to(q(".manifest-seal-ring"), { scale: 1.16, autoAlpha: 0, duration: 0.65, ease: "power2.out" }, "-=.18");
          }

          if (card.dataset.mechanism === "receipt") {
            tl.from(q(".external-state"), { x: -20, autoAlpha: 0, duration: 0.35 }, "-=.1")
              .from(q(".receipt-track"), { scaleX: 0, transformOrigin: "left center", duration: 0.42, ease: "power2.out" }, "-=.05")
              .fromTo(q(".receipt-packet"), { xPercent: -270, autoAlpha: 0 }, { xPercent: 0, autoAlpha: 1, duration: 0.62, ease: "power3.inOut" }, "-=.18")
              .from(q(".execution-id"), { scale: 0.72, autoAlpha: 0, duration: 0.34 }, "-=.08")
              .from(q(".verified-stamp"), { scale: 1.5, rotation: -8, autoAlpha: 0, duration: 0.38 }, "-=.06");
          }

          if (card.dataset.mechanism === "provenance") {
            tl.from(q(".provenance-node"), { scale: 0.6, autoAlpha: 0, stagger: 0.12, duration: 0.34 }, "-=.08")
              .from(q(".provenance-path"), { scaleX: 0, transformOrigin: "left center", stagger: 0.08, duration: 0.38, ease: "power2.out" }, "-=.18")
              .fromTo(q(".trace-dot"), { xPercent: -360, autoAlpha: 0 }, { xPercent: 370, autoAlpha: 1, duration: 1.05, ease: "power1.inOut" }, "-=.42")
              .to(q(".provenance-node"), { boxShadow: "0 0 0 5px rgba(23,58,227,.12)", stagger: 0.08, duration: 0.18, yoyo: true, repeat: 1 }, "-=.78");
          }

          if (card.dataset.mechanism === "finality") {
            tl.from(q(".ledger-entry"), { x: -22, autoAlpha: 0, stagger: 0.1, duration: 0.35 }, "-=.1")
              .from(q(".finality-arrow"), { scaleX: 0, transformOrigin: "left center", duration: 0.35, ease: "power2.out" }, "-=.05")
              .from(q(".settled-value"), { y: 16, autoAlpha: 0, duration: 0.3 }, "-=.08")
              .to(q(".finality-arrow"), { scaleX: -1, color: "#d24141", duration: 0.48, ease: "back.inOut(1.5)" }, "+=.18")
              .to(q(".settled-value"), { y: -8, autoAlpha: 0, duration: 0.22 }, "-=.34")
              .fromTo(q(".reversed-value"), { y: 10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.32 }, "-=.04")
              .from(q(".refund-badge"), { scale: 0.55, autoAlpha: 0, duration: 0.34 }, "-=.16");
          }
        });
      });

      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set(".mechanism-card, .mechanism-card *", { clearProps: "all" });
      });
    }, root);

    return () => {
      mm.revert();
      ctx.revert();
    };
  }, []);

  return (
    <div className="mechanisms" ref={root}>
      {items.map((item) => (
        <article className="mechanism-card" data-mechanism={item.id} key={item.id}>
          <div className="mechanism-copy">
            <span>{item.number}</span>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </div>
          <div className={`mechanism-visual ${item.id}-visual`} aria-hidden="true">
            {item.id === "manifest" && (
              <>
                <div className="manifest-chips">
                  <i className="manifest-chip">KAI</i><i className="manifest-chip">POST</i><i className="manifest-chip">¥50K</i>
                </div>
                <div className="manifest-line" />
                <div className="manifest-seal"><span className="manifest-seal-ring" />✓<small>LOCKED</small></div>
              </>
            )}
            {item.id === "receipt" && (
              <>
                <div className="external-state"><small>EXTERNAL</small><strong>ORDER PAID</strong></div>
                <div className="receipt-track" />
                <div className="receipt-packet">↗</div>
                <div className="execution-id"><small>RUN ID</small><strong>#A7F9</strong></div>
                <div className="verified-stamp">VERIFIED</div>
              </>
            )}
            {item.id === "provenance" && (
              <>
                <div className="provenance-node"><small>INPUT</small><strong>01</strong></div>
                <div className="provenance-path" />
                <div className="provenance-node bot-node"><small>BOT</small><strong>07</strong></div>
                <div className="provenance-path" />
                <div className="provenance-node"><small>OUTPUT</small><strong>12</strong></div>
                <i className="trace-dot" />
              </>
            )}
            {item.id === "finality" && (
              <>
                <div className="ledger-stack">
                  <i className="ledger-entry"><small>SALE</small><strong>¥12,000</strong></i>
                  <i className="ledger-entry"><small>SHARE</small><strong>20%</strong></i>
                </div>
                <div className="finality-arrow">→</div>
                <div className="value-stack">
                  <strong className="settled-value">+ ¥2,400</strong>
                  <strong className="reversed-value">− ¥2,400</strong>
                </div>
                <span className="refund-badge">REFUNDED</span>
              </>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
