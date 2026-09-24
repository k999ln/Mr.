"use client";

import { ReactNode, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function SiteMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!root.current) return;
    const mm = gsap.matchMedia();
    const context = gsap.context(() => {
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
        intro
          .from(".site-header", { y: -70, autoAlpha: 0, duration: 0.65 })
          .from(".hero-kicker", { y: 16, autoAlpha: 0, duration: 0.5 }, "-=0.15")
          .from(".hero-copy h1", { y: 44, autoAlpha: 0, duration: 0.9 }, "-=0.2")
          .from(".hero-lead", { y: 24, autoAlpha: 0, duration: 0.7 }, "-=0.5")
          .from(".hero-actions", { y: 18, autoAlpha: 0, duration: 0.55 }, "-=0.42")
          .from(".hero-phone", { y: 90, scale: 0.9, autoAlpha: 0, duration: 1, ease: "power4.out" }, "-=0.72")
          .from(".hero-tool-dock i", { y: 20, scale: 0.4, autoAlpha: 0, stagger: 0.045, duration: 0.42, ease: "back.out(1.8)" }, "-=0.48");

        gsap.utils.toArray<HTMLElement>(".floating-avocados", root.current).forEach((field) => {
          const avocados = gsap.utils.toArray<HTMLElement>(".floating-avocado", field);
          const section = field.closest("section");
          const motion = field.dataset.avocadoMotion || "drift";

          if (motion === "rain") {
            avocados.forEach((avocado, index) => {
              gsap.set(avocado, {
                left: `${91 - (index % 4) * 19}%`,
                right: "auto",
                top: `${-24 - (index % 3) * 17}%`,
                bottom: "auto",
                scale: 0.72 + (index % 4) * 0.13,
              });
              gsap.fromTo(avocado, {
                x: 140 + (index % 3) * 45,
                y: -120,
                rotation: -18 + index * 7,
              }, {
                x: () => -(field.clientWidth * (0.92 + (index % 3) * 0.16)),
                y: () => field.clientHeight * (1.22 + (index % 2) * 0.16),
                rotation: 150 + index * 24,
                duration: 8.4 + (index % 4) * 1.25,
                delay: -index * 1.42,
                repeat: -1,
                ease: "none",
              });
            });
          } else if (motion === "conveyor") {
            avocados.forEach((avocado, index) => {
              gsap.set(avocado, { left: "-18%", right: "auto", top: `${29 + (index % 2) * 19}%`, bottom: "auto", scale: 0.72 + (index % 3) * 0.13 });
              gsap.fromTo(avocado, { x: -220, rotation: -8 }, {
                x: () => field.clientWidth + 340,
                rotation: 352,
                duration: 12 + (index % 3) * 1.4,
                delay: -index * 1.7,
                repeat: -1,
                ease: "none",
              });
            });
          } else if (motion === "slide") {
            avocados.forEach((avocado, index) => {
              const slide = gsap.timeline({ repeat: -1, delay: -index * 1.65, defaults: { ease: "sine.inOut" } });
              slide
                .fromTo(avocado, {
                  left: 0,
                  right: "auto",
                  top: 0,
                  bottom: "auto",
                  x: () => field.clientWidth * 0.94,
                  y: -120,
                  rotation: -18,
                  scale: 0.68 + (index % 3) * 0.12,
                }, {
                  x: () => field.clientWidth * 0.7,
                  y: () => field.clientHeight * 0.17,
                  rotation: 18,
                  duration: 1.7,
                })
                .to(avocado, {
                  x: () => field.clientWidth * 0.43,
                  y: () => field.clientHeight * 0.46,
                  rotation: 74,
                  duration: 1.9,
                })
                .to(avocado, {
                  x: () => field.clientWidth * 0.08,
                  y: () => field.clientHeight * 0.9,
                  rotation: 148,
                  duration: 2.25,
                });
            });
          } else if (motion === "bloom") {
            avocados.forEach((avocado, index) => {
              if (index === 0 && section) {
                gsap.fromTo(avocado, { scale: 0.22, rotation: -18, autoAlpha: 0.28 }, {
                  scale: 4.1,
                  rotation: 24,
                  autoAlpha: 0.48,
                  ease: "none",
                  scrollTrigger: { trigger: section, start: "top bottom", end: "bottom top", scrub: 0.75 },
                });
              } else {
                const direction = index % 2 === 0 ? 1 : -1;
                gsap.to(avocado, { y: 28 * direction, rotation: 7 * direction, duration: 4.8 + index * 0.6, repeat: -1, yoyo: true, ease: "sine.inOut" });
              }
            });
          } else {
            avocados.forEach((avocado, index) => {
              const direction = index % 2 === 0 ? 1 : -1;
              gsap.fromTo(avocado, { y: -12 * direction, x: -5 * direction, rotation: -4 * direction }, {
                y: 24 * direction,
                x: 11 * direction,
                rotation: 6 * direction,
                duration: 4.2 + (index % 4) * 0.8,
                delay: -(index % 4) * 0.65,
                repeat: -1,
                yoyo: true,
                ease: "sine.inOut",
              });
              if (section) {
                gsap.to(avocado, { yPercent: 18 * direction, ease: "none", scrollTrigger: { trigger: section, start: "top bottom", end: "bottom top", scrub: 0.8 } });
              }
            });
          }
        });

        gsap.utils.toArray<HTMLElement>(".site-reveal", root.current).forEach((element) => {
          gsap.from(element, {
            y: 46,
            autoAlpha: 0,
            duration: 0.85,
            ease: "power3.out",
            scrollTrigger: { trigger: element, start: "top 88%", once: true },
          });
        });

        gsap.utils.toArray<HTMLElement>(".step", root.current).forEach((row, index) => {
          gsap.from(row, {
            x: index % 2 ? 28 : -28,
            autoAlpha: 0,
            duration: 0.58,
            ease: "power2.out",
            scrollTrigger: { trigger: row, start: "top 92%", once: true },
          });
        });

        gsap.to(".proof-visual img", {
          yPercent: 9,
          ease: "none",
          scrollTrigger: { trigger: ".proof", start: "top bottom", end: "bottom top", scrub: true },
        });

        gsap.from(".chain h2", {
          xPercent: -26,
          ease: "none",
          scrollTrigger: { trigger: ".chain", start: "top bottom", end: "center center", scrub: 0.6 },
        });

        const manifesto = gsap.timeline({
          scrollTrigger: { trigger: ".manifesto-demo", start: "top 82%", once: true },
          defaults: { ease: "power3.out" },
        });
        manifesto
          .from(".manifesto-demo", { y: 42, scale: 0.965, autoAlpha: 0, duration: 0.75 })
          .from(".manifesto-request", { x: -36, autoAlpha: 0, duration: 0.55 }, "-=0.25")
          .from(".manifesto-core", { scale: 0.55, autoAlpha: 0, duration: 0.55, ease: "back.out(1.65)" }, "-=0.22")
          .from(".manifesto-tool", {
            x: (index) => (index % 2 ? 42 : -42),
            y: (index) => (index < 5 ? -26 : 26),
            rotation: (index) => (index % 2 ? 4 : -4),
            scale: 0.78,
            autoAlpha: 0,
            stagger: 0.055,
            duration: 0.48,
            ease: "back.out(1.35)",
          }, "-=0.2")
          .from(".manifesto-rail", { scaleX: 0, transformOrigin: "left center", duration: 0.72 }, "-=0.38")
          .from(".manifesto-result", { x: 36, scale: 0.94, autoAlpha: 0, duration: 0.62, ease: "back.out(1.25)" }, "-=0.18")
          .from(".manifesto-demo-bottom > *", { y: 10, autoAlpha: 0, stagger: 0.045, duration: 0.32 }, "-=0.25");

        gsap.from(".manifesto-finale > p", {
          y: 30,
          autoAlpha: 0,
          stagger: 0.13,
          duration: 0.72,
          ease: "power3.out",
          scrollTrigger: { trigger: ".manifesto-finale", start: "top 84%", once: true },
        });

        gsap.to(".manifesto-core span", { scale: 1.08, duration: 0.75, repeat: -1, yoyo: true, ease: "sine.inOut" });
        gsap.to(".manifesto-pulse", { xPercent: 1050, duration: 2.8, repeat: -1, ease: "none" });
      });
    }, root);

    return () => {
      mm.revert();
      context.revert();
    };
  }, []);

  return <div ref={root}>{children}</div>;
}
