"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

export default function CompactHome() {
  const storyRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const story = storyRef.current;
    if (!story) return;

    const fruit = story.querySelector<HTMLElement>("[data-story-fruit]");
    const seed = story.querySelector<HTMLElement>("[data-story-seed]");
    const copy = story.querySelector<HTMLElement>("[data-story-copy]");
    const progress = story.querySelector<HTMLElement>("[data-story-progress]");
    if (!fruit || !seed || !copy || !progress) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let target = 0;
    let current = 0;
    let animationFrame = 0;
    let navigating = false;

    const measure = () => {
      const rect = story.getBoundingClientRect();
      const distance = Math.max(1, rect.height - window.innerHeight);
      target = Math.min(1, Math.max(0, -rect.top / distance));
      if (target >= 0.985 && !navigating) {
        navigating = true;
        window.location.assign("/details");
      }
    };

    const render = () => {
      current += (target - current) * (reduceMotion ? 1 : 0.12);
      const eased = 1 - Math.pow(1 - current, 3);
      const travelX = Math.min(window.innerWidth * 0.46, 520);
      const travelY = Math.min(window.innerHeight * 0.34, 330);

      fruit.style.transform = `translate3d(${current * 18}px, ${current * 42}px, 0) rotate(${4 - current * 9}deg) scale(${1 - current * 0.06})`;
      seed.style.transform = `translate3d(${-eased * travelX}px, ${-eased * travelY}px, 0) rotate(${-eased * 42}deg) scale(${1 - eased * 0.32})`;
      seed.style.opacity = String(1 - Math.max(0, (current - 0.82) / 0.18));
      copy.style.transform = `translate3d(0, ${-current * 34}px, 0)`;
      copy.style.opacity = String(1 - Math.max(0, (current - 0.7) / 0.3));
      progress.style.transform = `scaleX(${Math.min(1, eased * 1.08)})`;
      animationFrame = window.requestAnimationFrame(render);
    };

    measure();
    render();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <main className="compact-home">
      <header className="compact-header">
        <span className="compact-brand" aria-label="avocadomini">
          <span className="compact-brand-mark" aria-hidden="true">a</span>
          <span>avocadomini</span>
        </span>
        <span className="compact-edition">10 TOOLS · SAFETY GATE</span>
      </header>

      <section className="compact-console" aria-labelledby="compact-title">
        <div className="compact-copy">
          <p className="compact-eyebrow">LESS TO DO. MORE TAKEN CARE OF.</p>
          <h1 id="compact-title"><span>選んで、</span><em>ON。</em></h1>
          <p className="compact-lead">
            <span>10の販売ツールから、使いたいものを1〜3つ選ぶ。</span>
            <span>Telegramで頼むと、まず使える下書きが届く。</span>
          </p>
          <div className="compact-safety" aria-label="全ツール共通の安全機能">
            <span><i aria-hidden="true" />画面ジャックなし</span>
            <span><i aria-hidden="true" />一時的な問題は自動修復</span>
            <span><i aria-hidden="true" />認証・送信・決済は止めて確認</span>
          </div>
          <a className="compact-avocado-start" href="/start" aria-label="アボカドを押して無料で始める">
            <span className="compact-start-fruit" aria-hidden="true">
              <Image src="/avocado-half-pit-v1.png" width={1024} height={1024} alt="" priority />
              <span>ON</span>
            </span>
            <span className="compact-start-copy"><b>アボカドを押して始める</b><small>無料 · カード登録不要 · 1〜3ツール</small></span>
          </a>
        </div>
      </section>

      <section className="compact-story-transition" ref={storyRef} aria-labelledby="compact-story-title">
        <div className="compact-story-stage">
          <div className="compact-story-copy" data-story-copy>
            <p>THE FULL STORY</p>
            <h2 id="compact-story-title"><span>10の道具を、</span><span>もっと詳しく。</span></h2>
            <small>SCROLL TO OPEN</small>
          </div>
          <div className="compact-retro-avocado" data-story-fruit aria-hidden="true">
            <Image src="/avocado-print-overprint-v1.png" width={1200} height={1800} alt="" priority />
            <span className="compact-seed-cavity" />
            <span className="compact-flying-seed" data-story-seed>
              <Image src="/avocado-print-overprint-v1.png" width={1200} height={1800} alt="" />
            </span>
          </div>
          <p className="compact-scroll-cue" aria-hidden="true"><span /> 上へスワイプして開く</p>
          <span className="compact-gate-track" aria-hidden="true"><span data-story-progress /></span>
        </div>
      </section>
    </main>
  );
}
