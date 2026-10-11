import type { TourId } from "./types";

const key = (id: TourId) => `df-tour-seen:${id}`;

/** Per-tour "seen" flag for opt-in first-run nudges. Storage can be unavailable; treat as unseen. */
export function hasSeenTour(id: TourId): boolean {
  try {
    return localStorage.getItem(key(id)) === "1";
  } catch {
    return false;
  }
}

export function markTourSeen(id: TourId) {
  try {
    localStorage.setItem(key(id), "1");
  } catch {
    // Preference only; the nudge may show again.
  }
}
