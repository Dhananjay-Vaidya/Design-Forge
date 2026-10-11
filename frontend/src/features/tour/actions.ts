import { startTour } from "./tourContext";
import { tours } from "./tours";
import type { TourId } from "./types";

const isTourId = (value: unknown): value is TourId =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(tours, value);

/**
 * Entry point for the landing Guide's `start_tour` action (doc 19). The tour id comes from model
 * output, so it is checked against the registry; anything else is ignored. Returns whether a tour
 * started.
 */
export function startTourAction(tour: unknown = "landing"): boolean {
  return isTourId(tour) && startTour(tour);
}
