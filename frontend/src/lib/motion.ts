/** Shared feedback vocabulary. Keep input available throughout every transition. */
export const motionTiming = {
  feedback: 0.14,
  component: 0.22,
  page: 0.32,
  ease: [0.16, 1, 0.3, 1] as const,
};

export const motionPresets = {
  page: { duration: motionTiming.page, ease: motionTiming.ease },
  panel: { duration: motionTiming.component, ease: motionTiming.ease },
  feedback: { duration: motionTiming.feedback, ease: motionTiming.ease },
  stagger: { delayChildren: 0.03, staggerChildren: 0.04 },
  score: { duration: motionTiming.page, ease: motionTiming.ease },
};

export function entrance(reduced: boolean, distance = 10) {
  return {
    initial: { opacity: reduced ? 1 : 0, y: reduced ? 0 : distance },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: reduced ? 0 : -distance / 2 },
    transition: { duration: reduced ? 0.1 : motionTiming.component, ease: motionTiming.ease },
  };
}
