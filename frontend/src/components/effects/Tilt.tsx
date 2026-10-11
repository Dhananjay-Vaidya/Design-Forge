import { motion, useMotionValue, useSpring } from "motion/react";
import { type PointerEvent, type ReactNode, useRef } from "react";

import { springs } from "@/lib/motion";

import { useFineMotion } from "./useFineMotion";

interface TiltProps {
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
  /** Maximum rotation in degrees at the card's edge. Keep it small: this is a hint, not a show. */
  max?: number;
}

/**
 * A restrained 3D tilt toward the cursor (doc 22), meant to sit around an existing `.spotlight`
 * card so the glow and the tilt read as one effect. Transform-only, spring-smoothed, mouse-only:
 * touch, keyboard focus, small screens and reduced motion get a plain wrapper. Nothing runs between
 * pointer events, so there is no loop to pause when the tab is hidden or the card is offscreen.
 */
export function Tilt({ children, max = 3, className = "", "data-testid": testId }: TiltProps) {
  const enabled = useFineMotion();
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const smoothX = useSpring(rotateX, springs.soft);
  const smoothY = useSpring(rotateY, springs.soft);
  const rect = useRef<DOMRect | null>(null);

  if (!enabled) {
    return (
      <div className={className} data-testid={testId}>
        {children}
      </div>
    );
  }

  const reset = () => {
    rotateX.set(0);
    rotateY.set(0);
    rect.current = null;
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    // Measured once per hover, not per move, so pointer tracking never forces a layout.
    const box = (rect.current ??= event.currentTarget.getBoundingClientRect());
    // Clamped: a rect cached before a scroll must never push the card past `max`.
    const px = Math.max(-0.5, Math.min(0.5, (event.clientX - box.left) / box.width - 0.5));
    const py = Math.max(-0.5, Math.min(0.5, (event.clientY - box.top) / box.height - 0.5));
    rotateY.set(px * 2 * max);
    rotateX.set(-py * 2 * max);
  };

  return (
    <motion.div
      className={className}
      style={{ rotateX: smoothX, rotateY: smoothY, transformPerspective: 900 }}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      onFocusCapture={reset}
      data-testid={testId}
    >
      {children}
    </motion.div>
  );
}
