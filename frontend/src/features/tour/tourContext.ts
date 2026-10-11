import { createContext, useContext } from "react";

import type { TourId, TourStep } from "./types";

export const loadOverlay = () => import("./TourOverlay");

/** Warm the overlay chunk (e.g. on hover or focus of a tour trigger) so the first step opens instantly. */
export function preloadTour() {
  void loadOverlay();
}

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

// The mounted provider registers itself here, so code outside React (e.g. the landing Guide's
// `start_tour` action) can launch a named tour.
let launcher: ((id: TourId) => void) | null = null;

export function registerLauncher(fn: (id: TourId) => void) {
  launcher = fn;
  return () => {
    if (launcher === fn) launcher = null;
  };
}

/** Starts a named tour from anywhere. Returns false when no TourProvider is mounted. */
export function startTour(id: TourId): boolean {
  if (!launcher) return false;
  launcher(id);
  return true;
}

const noop = () => {};
export const TourContext = createContext<TourContextValue>({
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
