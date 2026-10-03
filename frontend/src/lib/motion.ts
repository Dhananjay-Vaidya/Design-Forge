/**
 * Motion vocabulary. Everything animated in the app imports from here; nothing hand-rolls a
 * duration, easing or spring. Animate only `transform` and `opacity`, keep input available
 * throughout, and pass `reduced` (from useReducedMotion) so every preset can collapse to its
 * final state.
 */
export const motionTiming = {
  feedback: 0.14,
  component: 0.22,
  page: 0.32,
  ease: [0.16, 1, 0.3, 1] as const,
};

/** Named springs. Snappy = selection pills and toggles; soft = panels and lists; gentle = bars. */
export const springs = {
  snappy: { type: "spring", stiffness: 500, damping: 40 },
  soft: { type: "spring", stiffness: 260, damping: 30 },
  gentle: { type: "spring", stiffness: 180, damping: 26 },
} as const;
export const springSnappy = springs.snappy;
export const springSoft = springs.soft;
export const springGentle = springs.gentle;

/** Under reduced motion every transition is instant, so elements land in their final state. */
export function settle<T extends object>(reduced: boolean, transition: T) {
  return reduced ? ({ duration: 0 } as const) : transition;
}

export const motionPresets = {
  page: { duration: motionTiming.page, ease: motionTiming.ease },
  panel: { duration: motionTiming.component, ease: motionTiming.ease },
  feedback: { duration: motionTiming.feedback, ease: motionTiming.ease },
  stagger: { delayChildren: 0.03, staggerChildren: 0.04 },
  score: { duration: motionTiming.page, ease: motionTiming.ease },

  /** Scroll-into-view reveal (fade + rise). Reduced motion: visible immediately. */
  reveal: (reduced: boolean, { y = 18, delay = 0 }: { y?: number; delay?: number } = {}) => ({
    initial: reduced ? false : { opacity: 0, y },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "0px 0px -12% 0px" },
    transition: reduced
      ? { duration: 0 }
      : { duration: motionTiming.page, delay, ease: motionTiming.ease },
  }),

  /** Press feedback for motion elements (CSS elements use the `.pressable` class instead). */
  pressable: (reduced: boolean) =>
    reduced ? {} : { whileTap: { scale: 0.98 }, transition: springs.snappy },

  /** Pull toward the pointer on primary CTAs only; consumed by useMagnetic. */
  magnetic: { strength: 0.18, max: 6, spring: springs.snappy },
} as const;

export function entrance(reduced: boolean, distance = 10) {
  return {
    initial: { opacity: reduced ? 1 : 0, y: reduced ? 0 : distance },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: reduced ? 0 : -distance / 2 },
    transition: { duration: reduced ? 0.1 : motionTiming.component, ease: motionTiming.ease },
  };
}
