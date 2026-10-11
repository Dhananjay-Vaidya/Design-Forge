/** Teal for steps about calculated output, violet for steps about AI-advisory features. */
export type TourTone = "calc" | "ai";

export interface TourStep {
  /**
   * The `data-tour` id of the element to highlight. An element may carry several ids separated by
   * spaces (e.g. a phone-only control standing in for several desktop tabs); the first VISIBLE
   * match wins, and a step whose target never appears is skipped.
   */
  target: string;
  title: string;
  body: string;
  tone: TourTone;
  /** Only "auto" today: below the target, else above, else beside, else docked. */
  placement?: "auto";
}

export type TourId = "landing" | "workspace";
