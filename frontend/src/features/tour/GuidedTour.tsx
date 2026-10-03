import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/Button";
import { trapDialogTab } from "@/lib/dialogKeyboard";
import { motionTiming } from "@/lib/motion";

export interface TourStep {
  /** CSS selector of the element to highlight (we use `[data-tour="…"]`). */
  target: string;
  title: string;
  body: string;
}

const PAD = 8;
const GAP = 14;
const POPOVER_W = 352;
const POPOVER_H = 220;
const NARROW = 640;

/** Finds and tracks a target; waits briefly for lazy-loaded pages, then falls back to no target. */
function useTargetRect(selector: string | null, reduced: boolean) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!selector) return;
    let el: Element | null = null;
    let timer = 0;
    let tries = 0;
    const measure = () => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      // A target that is display:none (e.g. the desktop tab strip on a phone) measures 0x0.
      setRect(r.width > 0 && r.height > 0 ? r : null);
    };
    const find = () => {
      el = document.querySelector(selector);
      if (el) {
        el.scrollIntoView?.({ block: "center", behavior: reduced ? "auto" : "smooth" });
        measure();
      } else if (tries++ < 20) {
        timer = window.setTimeout(find, 100);
      } else {
        setRect(null);
      }
    };
    setRect(null);
    find();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [selector, reduced]);

  return rect;
}

function placement(rect: DOMRect | null): React.CSSProperties | undefined {
  if (!rect || window.innerWidth < NARROW) return undefined; // bottom sheet via classes
  const width = Math.min(POPOVER_W, window.innerWidth - 32);
  const left = Math.min(Math.max(rect.left, 16), window.innerWidth - width - 16);
  const below = rect.bottom + PAD + GAP + POPOVER_H < window.innerHeight;
  return {
    width,
    left,
    ...(below
      ? { top: rect.bottom + PAD + GAP }
      : { bottom: window.innerHeight - rect.top + PAD + GAP }),
  };
}

interface GuidedTourProps {
  steps: TourStep[];
  open: boolean;
  onClose: (completed: boolean) => void;
}

/**
 * Lightweight product tour (FX-20). Modal while open: focus moves into the card, Tab is trapped,
 * ←/→ move between steps, Esc skips, and focus returns to where it was. Highlight and card jump
 * between steps instantly; only the card fades (reduced motion: no animation).
 */
export function GuidedTour({ steps, open, onClose }: GuidedTourProps) {
  const reduced = !!useReducedMotion();
  const [index, setIndex] = useState(0);
  // Stable identity: runs once per heading mount, so focus follows each step's NEW heading even
  // while the previous card is still animating out (and is never stolen back on re-render).
  const focusHeading = useCallback((el: HTMLHeadingElement | null) => el?.focus(), []);
  const titleId = useId();
  const bodyId = useId();
  const step = steps[index];
  const rect = useTargetRect(open ? (step?.target ?? null) : null, reduced);

  // Remember what had focus BEFORE the tour's heading takes it, and give it back on close.
  // Captured during render because child refs (our heading) attach before any effect runs.
  const origin = useRef<HTMLElement | null>(null);
  if (open && origin.current === null)
    origin.current = document.activeElement as HTMLElement | null;

  useEffect(() => {
    if (open) {
      setIndex(0);
    } else if (origin.current) {
      origin.current.focus?.();
      origin.current = null;
    }
  }, [open]);

  if (!open || !step) return null;

  const last = index === steps.length - 1;
  const next = () => (last ? onClose(true) : setIndex(index + 1));
  const back = () => setIndex(Math.max(index - 1, 0));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose(false);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      back();
    } else {
      trapDialogTab(e);
    }
  };

  const style = placement(rect);
  const sheetClasses = style
    ? "fixed"
    : "fixed inset-x-4 bottom-4 mx-auto max-w-sm sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:-translate-x-1/2 sm:-translate-y-1/2";

  return createPortal(
    <div className="fixed inset-0 z-50" onKeyDown={onKeyDown}>
      {/* Absorbs clicks so the page can't be changed mid-tour. */}
      <div className="absolute inset-0" aria-hidden="true" />
      {rect ? (
        <div
          aria-hidden="true"
          className="tour-spotlight pointer-events-none fixed rounded-xl"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-scrim/50" aria-hidden="true" />
      )}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={index}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          className={`glass-strong rounded-2xl p-5 ${sheetClasses}`}
          style={style}
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? undefined : { opacity: 0 }}
          transition={{ duration: reduced ? 0 : motionTiming.feedback, ease: motionTiming.ease }}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="eyebrow" aria-live="polite">
              Step {index + 1} of {steps.length}
            </p>
            <button
              type="button"
              onClick={() => onClose(false)}
              aria-label="Skip tour"
              className="-mr-2 -mt-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <h2
            id={titleId}
            ref={focusHeading}
            tabIndex={-1}
            className="mt-1 text-lg font-semibold tracking-tight outline-none"
          >
            {step.title}
          </h2>
          <p id={bodyId} className="mt-1.5 text-sm leading-relaxed text-muted">
            {step.body}
          </p>
          <div className="mt-5 flex items-center justify-between gap-3">
            <div className="flex gap-1.5" aria-hidden="true">
              {steps.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-[width,background-color] duration-base ${
                    i === index ? "w-5 bg-primary" : "w-1.5 bg-border-strong"
                  }`}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={back} disabled={index === 0}>
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Back
              </Button>
              <Button size="sm" onClick={next}>
                {last ? "Done" : "Next"}
                {!last && <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
              </Button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>,
    document.body,
  );
}
