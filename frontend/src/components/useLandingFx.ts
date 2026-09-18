import { useEffect } from "react";

/**
 * Stripe-style pointer-reactive motion for the landing page.
 * - 3D tilt on cards (leans toward the pointer).
 * - Magnetic primary buttons that drift toward the cursor.
 * All effects are disabled when the user prefers reduced motion.
 */

const CARD_SELECTOR = [
  ".cs-mock",
  ".cs-metric",
  ".cs-brand-tile",
  ".cs-role",
  ".cs-arch-col",
  ".cs-report",
  ".cs-conflict",
  ".cs-material",
  ".cs-matrix",
  ".cs-ai-card",
  ".cs-gov-card",
  ".cs-model",
  ".cs-record-grid",
  ".cs-exec-frame",
  ".cs-auth-card",
  ".cs-streams-hub",
].join(",");

const MAGNET_SELECTOR = ".cs-btn.primary";

export function useLandingFx() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    if (window.matchMedia("(hover: none)").matches) return; // skip on touch

    const root = document.querySelector<HTMLElement>(".cs-scope");
    if (!root) return;

    const cleanups: Array<() => void> = [];

    /* ---- fluid gradient background follows the cursor ---- */
    let rafBg = 0;
    const onBgMove = (e: PointerEvent) => {
      if (rafBg) return;
      rafBg = requestAnimationFrame(() => {
        rafBg = 0;
        root.style.setProperty("--cs-px", (e.clientX / window.innerWidth).toFixed(4));
        root.style.setProperty("--cs-py", (e.clientY / window.innerHeight).toFixed(4));
      });
    };
    window.addEventListener("pointermove", onBgMove, { passive: true });
    cleanups.push(() => {
      window.removeEventListener("pointermove", onBgMove);
      if (rafBg) cancelAnimationFrame(rafBg);
    });

    /* ---- 3D tilt on cards ---- */
    const cards = Array.from(root.querySelectorAll<HTMLElement>(CARD_SELECTOR));
    cards.forEach((card) => {
      card.classList.add("cs-fx");
      let raf = 0;
      const move = (e: PointerEvent) => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const r = card.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width; // 0..1
          const y = (e.clientY - r.top) / r.height;
          card.style.setProperty("--rx", `${((0.5 - y) * 6).toFixed(2)}deg`);
          card.style.setProperty("--ry", `${((x - 0.5) * 8).toFixed(2)}deg`);
        });
      };
      const enter = () => card.classList.add("cs-fx-on");
      const leave = () => {
        card.classList.remove("cs-fx-on");
        card.style.setProperty("--rx", "0deg");
        card.style.setProperty("--ry", "0deg");
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      };
      card.addEventListener("pointerenter", enter);
      card.addEventListener("pointermove", move, { passive: true });
      card.addEventListener("pointerleave", leave);
      cleanups.push(() => {
        card.removeEventListener("pointerenter", enter);
        card.removeEventListener("pointermove", move);
        card.removeEventListener("pointerleave", leave);
        card.classList.remove("cs-fx", "cs-fx-on");
      });
    });

    /* ---- magnetic primary buttons ---- */
    const magnets = Array.from(root.querySelectorAll<HTMLElement>(MAGNET_SELECTOR));
    magnets.forEach((btn) => {
      const move = (e: PointerEvent) => {
        const r = btn.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
        const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        btn.style.setProperty("--tx", `${(dx * 8).toFixed(2)}px`);
        btn.style.setProperty("--ty", `${(dy * 8).toFixed(2)}px`);
      };
      const leave = () => {
        btn.style.setProperty("--tx", "0px");
        btn.style.setProperty("--ty", "0px");
      };
      btn.classList.add("cs-magnetic");
      btn.addEventListener("pointermove", move, { passive: true });
      btn.addEventListener("pointerleave", leave);
      cleanups.push(() => {
        btn.removeEventListener("pointermove", move);
        btn.removeEventListener("pointerleave", leave);
        btn.classList.remove("cs-magnetic");
      });
    });

    return () => cleanups.forEach((fn) => fn());
  }, []);
}
