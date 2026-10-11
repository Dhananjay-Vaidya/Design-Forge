import { Calculator, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import {
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/Button";
import { trapDialogTab } from "@/lib/dialogKeyboard";
import { motionPresets, springs } from "@/lib/motion";

import type { TourStep } from "./types";

/** Ring padding around the target, gap to the card, viewport margin, and the bottom-sheet breakpoint. */
const PAD = 8;
const GAP = 12;
const MARGIN = 16;
const NARROW = 620;
/** Clear of the sticky headers when deciding whether a target is already in view. */
const TOP_CLEARANCE = 80;

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** First element carrying this `data-tour` id that is actually rendered (not display:none). */
export function findTourTarget(id: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour~="${id}"]`)) {
    if (typeof el.checkVisibility !== "function" || el.checkVisibility()) return el;
  }
  return null;
}

const toBox = (r: DOMRect): Box => ({
  top: r.top,
  left: r.left,
  width: r.width,
  height: r.height,
});
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Scrolls the target into the free part of the viewport (above the bottom sheet on phones). */
function revealTarget(el: HTMLElement, reduced: boolean, reservedBottom: number) {
  const behavior: ScrollBehavior = reduced ? "instant" : "smooth";
  // A tab inside a horizontally scrolling strip: bring it into that strip first.
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    if (p.scrollWidth > p.clientWidth && /auto|scroll/.test(getComputedStyle(p).overflowX)) {
      const pr = p.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      if (er.left < pr.left || er.right > pr.right) {
        p.scrollBy({ left: er.left - pr.left - (pr.width - er.width) / 2, behavior });
      }
    }
  }
  const r = el.getBoundingClientRect();
  const top = TOP_CLEARANCE;
  const bottom = window.innerHeight - reservedBottom;
  if (r.top >= top && r.bottom <= bottom) return;
  const room = bottom - top;
  const want = r.height <= room ? top + (room - r.height) / 2 : top;
  window.scrollTo({ top: window.scrollY + r.top - want, behavior });
}

/** Below the target, else above, else beside it, else pinned to the bottom of the viewport. */
function placeCard(t: Box, card: { width: number; height: number }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = clamp(t.left + t.width / 2 - card.width / 2, MARGIN, vw - card.width - MARGIN);
  const below = t.top + t.height + PAD + GAP;
  if (below + card.height <= vh - MARGIN) return { x: left, y: below };
  const above = t.top - PAD - GAP - card.height;
  if (above >= MARGIN) return { x: left, y: above };
  const y = clamp(t.top + t.height / 2 - card.height / 2, MARGIN, vh - card.height - MARGIN);
  const right = t.left + t.width + PAD + GAP;
  if (right + card.width <= vw - MARGIN) return { x: right, y };
  const leftSide = t.left - PAD - GAP - card.width;
  if (leftSide >= MARGIN) return { x: leftSide, y };
  return { x: left, y: vh - card.height - MARGIN };
}

export interface TourOverlayProps {
  steps: TourStep[];
  index: number;
  /** 1-based position and total, both excluding steps already skipped as missing. */
  position: number;
  total: number;
  canBack: boolean;
  isLast: boolean;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  /** The target for `index` never appeared; the engine moves past it. */
  onMissing: (index: number) => void;
  /** How long to wait for a target that is still mounting (lazy routes) before skipping it. */
  findTimeout: number;
}

/**
 * The tour's dim layer, highlight ring and info card. The page underneath is inert for the duration:
 * clicks are absorbed, body scroll is locked (programmatic scrolling to each target still works), and
 * focus is held in the card. Reduced motion: the ring, card and scrolling jump instead of gliding.
 */
export function TourOverlay({
  steps,
  index,
  position,
  total,
  canBack,
  isLast,
  onNext,
  onBack,
  onSkip,
  onMissing,
  findTimeout,
}: TourOverlayProps) {
  const reduced = !!useReducedMotion();
  const titleId = useId();
  const bodyId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const missingRef = useRef(onMissing);
  missingRef.current = onMissing;
  // The step on show and its target's box; it only changes once the new target has been found, so a
  // skipped step never flashes up or gets announced.
  const [shown, setShown] = useState<{ index: number; box: Box; glide: boolean } | null>(null);
  const [cardSize, setCardSize] = useState({ width: 360, height: 220 });
  const [narrow, setNarrow] = useState(() => window.innerWidth <= NARROW);

  // Lock body scroll for the duration, keeping the scrollbar's width so nothing shifts.
  useLayoutEffect(() => {
    const html = document.documentElement;
    const prev = { overflow: html.style.overflow, paddingRight: html.style.paddingRight };
    const gutter = window.innerWidth - html.clientWidth;
    html.style.overflow = "hidden";
    if (gutter > 0) html.style.paddingRight = `${gutter}px`;
    html.setAttribute("data-tour-active", "");
    return () => {
      html.style.overflow = prev.overflow;
      html.style.paddingRight = prev.paddingRight;
      html.removeAttribute("data-tour-active");
    };
  }, []);

  // Focus moves into the card on open and is held there: anything that pulls it out puts it back.
  useEffect(() => {
    const card = cardRef.current;
    card?.focus({ preventScroll: true });
    const hold = (e: FocusEvent) => {
      if (card && e.target instanceof Node && !card.contains(e.target)) card.focus({ preventScroll: true });
    };
    document.addEventListener("focusin", hold);
    return () => document.removeEventListener("focusin", hold);
  }, []);

  // Find the step's target (waiting briefly for lazy screens), scroll it into view, then track it.
  useEffect(() => {
    const step = steps[index];
    if (!step) return;
    let el: HTMLElement | null = null;
    let timer = 0;
    let frame = 0;
    let observer: ResizeObserver | undefined;
    const started = Date.now();

    const measure = (glide: boolean) => {
      if (!el?.isConnected) el = findTourTarget(step.target) ?? el;
      if (!el) return;
      setNarrow(window.innerWidth <= NARROW);
      setShown({ index, box: toBox(el.getBoundingClientRect()), glide });
    };
    const onViewportChange = () => {
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          measure(false);
        });
      }
    };
    const find = () => {
      el = findTourTarget(step.target);
      if (el) {
        const docked = window.innerWidth <= NARROW;
        const reserved = docked ? (cardRef.current?.offsetHeight ?? 220) + MARGIN * 2 : 0;
        revealTarget(el, reduced, reserved);
        measure(true);
        observer = typeof ResizeObserver === "function" ? new ResizeObserver(onViewportChange) : undefined;
        observer?.observe(el);
      } else if (Date.now() - started < findTimeout) {
        timer = window.setTimeout(find, 100);
      } else {
        missingRef.current(index);
      }
    };

    find();
    window.addEventListener("scroll", onViewportChange, { capture: true, passive: true });
    window.addEventListener("resize", onViewportChange);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("scroll", onViewportChange, { capture: true });
      window.removeEventListener("resize", onViewportChange);
    };
  }, [steps, index, reduced, findTimeout]);

  // The card's own size decides where it fits; re-measure whenever its content changes.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const size = { width: card.offsetWidth, height: card.offsetHeight };
    setCardSize((s) => (s.width === size.width && s.height === size.height ? s : size));
    // A Back button that just became disabled drops focus to <body>; keep it in the card.
    if (!card.contains(document.activeElement)) card.focus({ preventScroll: true });
  }, [shown?.index, narrow]);

  const step = shown ? steps[shown.index] : undefined;
  const ai = step?.tone === "ai";
  const glide = !reduced && !!shown?.glide;
  const move = glide ? springs.soft : { duration: 0 };
  const spot = shown?.box;
  const at = spot && !narrow ? placeCard(spot, cardSize) : null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const onControl = e.target instanceof Element && !!e.target.closest("button, a, input, select, textarea");
    if (e.key === "Escape") {
      e.preventDefault();
      onSkip();
    } else if (e.key === "ArrowRight" || (e.key === "Enter" && !onControl)) {
      e.preventDefault();
      onNext();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (canBack) onBack();
    } else {
      trapDialogTab(e);
    }
  };
  // Clicking the dimmed page must not steal focus from the card.
  const keepFocus = (e: MouseEvent) => e.preventDefault();

  return createPortal(
    <div className="fixed inset-0 z-50" data-testid="tour-overlay">
      <div
        aria-hidden="true"
        className={`absolute inset-0 touch-none ${spot ? "" : "bg-scrim/50"}`}
        onMouseDown={keepFocus}
      />
      {spot && (
        <motion.div
          aria-hidden="true"
          data-tour-ring=""
          data-tone={ai ? "ai" : "calc"}
          data-motion={glide ? "glide" : "instant"}
          className="tour-spotlight pointer-events-none fixed left-0 top-0 rounded-xl"
          initial={false}
          animate={{
            x: spot.left - PAD,
            y: spot.top - PAD,
            width: spot.width + PAD * 2,
            height: spot.height + PAD * 2,
          }}
          transition={move}
        />
      )}
      <motion.div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`glass-strong fixed rounded-2xl p-5 outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
          narrow ? "tour-dock inset-x-4 mx-auto max-w-md" : "left-0 top-0 w-[min(22.5rem,calc(100vw-2rem))]"
        }`}
        // Hidden (but focusable) until the first target is found and the card has a place.
        style={{ visibility: step ? "visible" : "hidden" }}
        initial={false}
        animate={at ? { x: at.x, y: at.y } : { x: 0, y: 0 }}
        transition={move}
      >
        {step && shown && (
          <>
            <motion.div
              key={shown.index}
              aria-live="polite"
              aria-atomic="true"
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={reduced ? { duration: 0 } : motionPresets.feedback}
            >
              <div className="flex items-center justify-between gap-3">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    ai ? "bg-ai/10 text-ai" : "bg-primary-soft text-primary"
                  }`}
                >
                  {ai ? (
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <Calculator className="h-3 w-3" aria-hidden="true" />
                  )}
                  {ai ? "AI · advisory" : "Calculated"}
                </span>
                <span className="flex gap-1.5" aria-hidden="true">
                  {Array.from({ length: total }, (_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 rounded-full transition-[width,background-color] duration-base ${
                        i === position - 1
                          ? `w-5 ${ai ? "bg-ai" : "bg-primary"}`
                          : "w-1.5 bg-border-strong"
                      }`}
                    />
                  ))}
                </span>
              </div>
              <p className="mt-3 font-mono text-xs text-muted">
                Step {position} of {total}
              </p>
              <h2 id={titleId} className="mt-1 text-lg font-semibold tracking-tight">
                {step.title}
              </h2>
              <p id={bodyId} className="mt-1.5 text-sm leading-relaxed text-muted">
                {step.body}
              </p>
            </motion.div>
            <div className="mt-5 flex items-center justify-between gap-2">
              <Button variant="ghost" className="h-11 px-3" onClick={onSkip}>
                Skip
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" className="h-11" onClick={onBack} disabled={!canBack}>
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  Back
                </Button>
                <Button className="h-11" onClick={onNext}>
                  {isLast ? "Done" : "Next"}
                  {!isLast && <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                </Button>
              </div>
            </div>
          </>
        )}
      </motion.div>
    </div>,
    document.body,
  );
}
