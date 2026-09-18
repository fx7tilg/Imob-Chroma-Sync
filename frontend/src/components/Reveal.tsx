import { useEffect, useRef, useState } from "react";
import type { PropsWithChildren } from "react";

type RevealDirection = "up" | "left" | "right" | "scale";

/** Wraps children and adds the `is-visible` class once scrolled into view. */
export default function Reveal({
  children,
  className = "",
  delay = 0,
  direction = "up"
}: PropsWithChildren<{ className?: string; delay?: number; direction?: RevealDirection }>) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`cs-reveal cs-reveal--${direction} ${visible ? "is-visible" : ""} ${className}`}
      style={{ transitionDelay: visible ? `${delay}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}
