import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, type PanInfo } from "motion/react";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { springs } from "@/lib/motion";

import { useFineMotion } from "./useFineMotion";

interface CoverflowCarouselProps<T> {
  items: T[];
  getKey: (item: T) => string;
  /** Short name used in slide labels and the live announcement. */
  getLabel: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  /** Accessible name for the carousel, e.g. "Built-in templates". */
  label: string;
  /** What one slide is called in button labels, e.g. "template". */
  itemNoun?: string;
  /** Height of the coverflow stage (slides are absolutely positioned). */
  height?: string;
}

const CARD_WIDTH = 340; // px, the centred slide
const SPACING = 290; // px between slide centres (less overlap reads calmer)
const VISIBLE = 2; // slides shown either side of the centre

function ArrowButton({
  direction,
  disabled,
  label,
  onClick,
}: {
  direction: "prev" | "next";
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface text-text shadow-soft transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40"
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

/**
 * A browseable gallery (doc 22). On desktop with a mouse it is a subtle coverflow: the focused card
 * is centred and its neighbours step back with a slight turn. Everywhere else (touch, small screens,
 * reduced motion) it is a plain horizontal scroll-snap list that swipes natively.
 *
 * Accessibility: the region is announced as a carousel; Left/Right arrows move between slides; only
 * the centred slide is interactive (the others are `inert`, so Tab never lands on a hidden button);
 * the slide change is announced politely. There is no autoplay.
 */
export function CoverflowCarousel<T>({
  items,
  getKey,
  getLabel,
  renderItem,
  label,
  itemNoun = "item",
  height = "21rem",
}: CoverflowCarouselProps<T>) {
  const coverflow = useFineMotion();
  const regionId = useId();
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const count = items.length;
  const current = Math.min(index, Math.max(count - 1, 0));

  useEffect(() => {
    if (index > count - 1) setIndex(Math.max(count - 1, 0));
  }, [count, index]);

  // Only the centred slide may take focus or clicks. Synced here (not in a ref callback): motion
  // components keep the first ref callback they receive, so a callback would never see the change.
  useLayoutEffect(() => {
    slideRefs.current.forEach((el, i) => {
      if (el) el.inert = i !== current;
    });
  }, [current, count, coverflow]);

  if (count === 0) return null;

  const go = (next: number) => setIndex(Math.max(0, Math.min(count - 1, next)));
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(current + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(current - 1);
    }
  };
  const slideLabel = (i: number) => `${i + 1} of ${count}: ${getLabel(items[i])}`;

  // ---- static list: touch, small screens, reduced motion -------------------------------------------
  if (!coverflow) {
    const scrollByCard = (dir: 1 | -1) => {
      const list = listRef.current;
      const card = list?.querySelector("li");
      if (!list || !card) return;
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      list.scrollBy({ left: dir * (card.clientWidth + 16), behavior: reduced ? "auto" : "smooth" });
    };
    return (
      <div role="region" aria-roledescription="carousel" aria-label={label}>
        <ul
          ref={listRef}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 [scrollbar-width:thin]"
        >
          {items.map((item, i) => (
            <li
              key={getKey(item)}
              role="group"
              aria-roledescription="slide"
              aria-label={slideLabel(i)}
              className="w-[min(20rem,82vw)] shrink-0 snap-start"
            >
              {renderItem(item)}
            </li>
          ))}
        </ul>
        {count > 1 && (
          <div className="mt-2 flex justify-end gap-2">
            <ArrowButton
              direction="prev"
              disabled={false}
              label={`Previous ${itemNoun}`}
              onClick={() => scrollByCard(-1)}
            />
            <ArrowButton
              direction="next"
              disabled={false}
              label={`Next ${itemNoun}`}
              onClick={() => scrollByCard(1)}
            />
          </div>
        )}
      </div>
    );
  }

  // ---- coverflow: desktop with a mouse ---------------------------------------------------------
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -60) go(current + 1);
    else if (info.offset.x > 60) go(current - 1);
  };

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <motion.div
        className="relative cursor-grab touch-pan-y overflow-hidden active:cursor-grabbing"
        style={{ height, perspective: 1200 }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.12}
        dragMomentum={false}
        onDragEnd={onDragEnd}
      >
        {items.map((item, i) => {
          const offset = i - current;
          const distance = Math.abs(offset);
          const active = offset === 0;
          return (
            <motion.div
              key={getKey(item)}
              role="group"
              aria-roledescription="slide"
              aria-label={slideLabel(i)}
              aria-hidden={!active || undefined}
              ref={(el) => {
                slideRefs.current[i] = el;
              }}
              className="absolute top-2 h-[calc(100%-1rem)]"
              style={{
                left: "50%",
                width: CARD_WIDTH,
                marginLeft: -CARD_WIDTH / 2,
                zIndex: 20 - distance,
              }}
              initial={false}
              animate={{
                x: offset * SPACING,
                scale: 1 - Math.min(distance, VISIBLE + 1) * 0.07,
                rotateY: Math.max(-1, Math.min(1, offset)) * -12,
                opacity: distance > VISIBLE ? 0 : 1 - distance * 0.4,
              }}
              transition={springs.soft}
              onClick={() => !active && go(i)}
            >
              <div className={`h-full ${active ? "" : "pointer-events-none"}`}>
                {renderItem(item)}
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      <div className="mt-3 flex items-center justify-between gap-4">
        <ArrowButton
          direction="prev"
          disabled={current === 0}
          label={`Previous ${itemNoun}`}
          onClick={() => go(current - 1)}
        />
        <div
          className="flex flex-wrap justify-center gap-1"
          aria-label={`Choose ${itemNoun}`}
          role="group"
        >
          {items.map((item, i) => (
            <button
              key={getKey(item)}
              type="button"
              onClick={() => go(i)}
              aria-label={`Go to ${itemNoun} ${slideLabel(i)}`}
              aria-current={i === current || undefined}
              className="group inline-flex h-11 w-7 items-center justify-center"
            >
              <span
                className={`block h-2 rounded-full transition-[width,background-color] duration-base ${
                  i === current ? "w-5 bg-primary" : "w-2 bg-border-strong group-hover:bg-muted"
                }`}
              />
            </button>
          ))}
        </div>
        <ArrowButton
          direction="next"
          disabled={current === count - 1}
          label={`Next ${itemNoun}`}
          onClick={() => go(current + 1)}
        />
      </div>
      <p id={`${regionId}-status`} className="sr-only" aria-live="polite" aria-atomic="true">
        {`${itemNoun[0].toUpperCase()}${itemNoun.slice(1)} ${slideLabel(current)}`}
      </p>
    </div>
  );
}
