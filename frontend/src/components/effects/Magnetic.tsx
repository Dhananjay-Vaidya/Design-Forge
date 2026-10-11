import { motion, useMotionValue, useSpring } from "motion/react";
import type { PointerEvent, ReactNode } from "react";

import { motionPresets } from "@/lib/motion";

import { useFineMotion } from "./useFineMotion";

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

/**
 * A small magnetic pull toward the cursor for PRIMARY CTAs only (doc 22). The pull is a fraction of
 * the cursor's offset, capped at a few pixels, and only while the pointer is over the button. It
 * springs back on leave, and stays still for keyboard focus, touch, small screens and reduced motion,
 * so activation is never affected.
 */
export function Magnetic({
  children,
  className = "",
  max = 4,
}: {
  children: ReactNode;
  className?: string;
  /** Maximum travel in pixels. */
  max?: number;
}) {
  const enabled = useFineMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const { strength, spring } = motionPresets.magnetic;
  const smoothX = useSpring(x, spring);
  const smoothY = useSpring(y, spring);

  if (!enabled) return <span className={`inline-flex ${className}`}>{children}</span>;

  const reset = () => {
    x.set(0);
    y.set(0);
  };
  const onPointerMove = (event: PointerEvent<HTMLSpanElement>) => {
    if (event.pointerType !== "mouse") return;
    const box = event.currentTarget.getBoundingClientRect();
    x.set(clamp((event.clientX - (box.left + box.width / 2)) * strength, max));
    y.set(clamp((event.clientY - (box.top + box.height / 2)) * strength, max));
  };

  return (
    <motion.span
      className={`inline-flex ${className}`}
      style={{ x: smoothX, y: smoothY }}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      onFocusCapture={reset}
    >
      {children}
    </motion.span>
  );
}
