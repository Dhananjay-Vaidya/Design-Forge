import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

interface CountUpProps {
  value: number;
  decimals?: number;
  duration?: number;
  className?: string;
}

/**
 * Animates from the previously shown value to the new one. The final number is always what
 * screen readers get (aria-label), never an intermediate frame.
 */
export function CountUp({ value, decimals = 0, duration = 0.9, className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  const reduce = useReducedMotion();
  const text = value.toFixed(decimals);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.textContent = text;
      from.current = value;
      return;
    }
    const controls = animate(from.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        el.textContent = v.toFixed(decimals);
      },
    });
    from.current = value;
    return () => controls.stop();
  }, [value, decimals, duration, reduce, text]);

  return (
    <span ref={ref} className={className} aria-label={text}>
      {reduce ? text : (0).toFixed(decimals)}
    </span>
  );
}
