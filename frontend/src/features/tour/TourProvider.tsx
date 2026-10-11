import {
  type ReactNode,
  Suspense,
  createContext,
  lazy,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { markTourSeen } from "./seen";
import { tours as defaultTours } from "./tours";
import type { TourId, TourStep } from "./types";

const loadOverlay = () => import("./TourOverlay");
const TourOverlay = lazy(() => loadOverlay().then((m) => ({ default: m.TourOverlay })));

/** Warm the overlay chunk (e.g. on hover or focus of a tour trigger) so the first step opens instantly. */
export function preloadTour() {
  void loadOverlay();
}

interface TourState {
  id: TourId | null;
  index: number;
  /** Direction of travel, so a missing target is skipped the way the user was going. */
  dir: 1 | -1;
  /** Steps whose target never appeared during this run. */
  missing: number[];
}

const IDLE: TourState = { id: null, index: 0, dir: 1, missing: [] };

const nextOf = (s: TourState, count: number) => {
  for (let i = s.index + 1; i < count; i++) if (!s.missing.includes(i)) return i;
  return -1;
};
const prevOf = (s: TourState) => {
  for (let i = s.index - 1; i >= 0; i--) if (!s.missing.includes(i)) return i;
  return -1;
};

export interface TourContextValue {
  /** The running tour, or null. */
  activeTour: TourId | null;
  steps: TourStep[];
  activeIndex: number;
  startTour: (id: TourId) => void;
  /** Alias of startTour. */
  start: (id: TourId) => void;
  next: () => void;
  back: () => void;
  /** Close without finishing. */
  skip: () => void;
  /** Close as finished. */
  end: () => void;
}

const noop = () => {};
const TourContext = createContext<TourContextValue>({
  activeTour: null,
  steps: [],
  activeIndex: 0,
  startTour: (id) => startTour(id),
  start: (id) => startTour(id),
  next: noop,
  back: noop,
  skip: noop,
  end: noop,
});

export const useTour = () => useContext(TourContext);

// The mounted provider registers itself here, so code outside React (e.g. the landing Guide's
// `start_tour` action) can launch a named tour.
let launcher: ((id: TourId) => void) | null = null;

/** Starts a named tour from anywhere. Returns false when no TourProvider is mounted. */
export function startTour(id: TourId): boolean {
  if (!launcher) return false;
  launcher(id);
  return true;
}

interface TourProviderProps {
  children: ReactNode;
  /** Override the registry (tests). */
  tours?: Record<TourId, TourStep[]>;
  /** How long to wait for a target that is still mounting before skipping it. */
  findTimeout?: number;
}

/**
 * Holds the one tour that can run at a time. Starting a tour remembers what had focus (the trigger);
 * closing it, by Done, Skip or Esc, marks the tour as seen and returns focus there.
 */
export function TourProvider({ children, tours = defaultTours, findTimeout = 1500 }: TourProviderProps) {
  const [state, setState] = useState<TourState>(IDLE);
  const origin = useRef<HTMLElement | null>(null);
  const running = useRef<TourId | null>(null);
  const steps = useMemo(() => (state.id ? tours[state.id] : []), [state.id, tours]);

  const close = useCallback(() => setState(IDLE), []);

  const begin = useCallback(
    (id: TourId) => {
      if (!tours[id]?.length) return;
      if (!running.current) {
        origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
      setState({ id, index: 0, dir: 1, missing: [] });
    },
    [tours],
  );

  const next = useCallback(
    () =>
      setState((s) => {
        if (!s.id) return s;
        const n = nextOf(s, tours[s.id].length);
        return n < 0 ? IDLE : { ...s, index: n, dir: 1 };
      }),
    [tours],
  );

  const back = useCallback(
    () =>
      setState((s) => {
        const p = prevOf(s);
        return !s.id || p < 0 ? s : { ...s, index: p, dir: -1 };
      }),
    [],
  );

  const onMissing = useCallback(
    (index: number) =>
      setState((s) => {
        if (!s.id || s.index !== index) return s;
        const marked = { ...s, missing: [...s.missing, index] };
        const count = tours[s.id].length;
        if (s.dir === -1) {
          const p = prevOf(marked);
          if (p >= 0) return { ...marked, index: p };
        }
        const n = nextOf(marked, count);
        return n < 0 ? IDLE : { ...marked, index: n, dir: 1 };
      }),
    [tours],
  );

  // Closing: remember the tour as seen and hand focus back to whatever launched it.
  useEffect(() => {
    if (state.id) {
      running.current = state.id;
      return;
    }
    if (!running.current) return;
    markTourSeen(running.current);
    running.current = null;
    const el = origin.current;
    origin.current = null;
    if (el?.isConnected) el.focus();
  }, [state.id]);

  useEffect(() => {
    launcher = begin;
    return () => {
      if (launcher === begin) launcher = null;
    };
  }, [begin]);

  const value = useMemo<TourContextValue>(
    () => ({
      activeTour: state.id,
      steps,
      activeIndex: state.index,
      startTour: begin,
      start: begin,
      next,
      back,
      skip: close,
      end: close,
    }),
    [state.id, state.index, steps, begin, next, back, close],
  );

  const total = steps.length - state.missing.length;
  const position = steps.slice(0, state.index + 1).filter((_, i) => !state.missing.includes(i)).length;

  return (
    <TourContext.Provider value={value}>
      {children}
      {state.id && (
        <Suspense fallback={null}>
          <TourOverlay
            steps={steps}
            index={state.index}
            position={position}
            total={total}
            canBack={prevOf(state) >= 0}
            isLast={nextOf(state, steps.length) < 0}
            onNext={next}
            onBack={back}
            onSkip={close}
            onMissing={onMissing}
            findTimeout={findTimeout}
          />
        </Suspense>
      )}
    </TourContext.Provider>
  );
}
