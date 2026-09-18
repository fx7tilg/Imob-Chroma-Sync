import { useEffect, useRef } from "react";

/**
 * Fluid, mouse-reactive aurora backdrop for the dark sections.
 * Animated colour blobs drift on their own; an aurora glow follows the cursor.
 * Renders behind the section content. Motion is disabled under reduced-motion / touch.
 */
export default function FluidBackdrop() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const section = el?.parentElement;
    if (!el || !section) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(hover: none)").matches) return;

    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = section.getBoundingClientRect();
        el.style.setProperty("--fx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(2)}%`);
        el.style.setProperty("--fy", `${(((e.clientY - r.top) / r.height) * 100).toFixed(2)}%`);
        el.classList.add("is-active");
      });
    };
    const onLeave = () => el.classList.remove("is-active");

    section.addEventListener("pointermove", onMove, { passive: true });
    section.addEventListener("pointerleave", onLeave);
    return () => {
      section.removeEventListener("pointermove", onMove);
      section.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return <div ref={ref} className="cs-fluid" aria-hidden="true" />;
}
