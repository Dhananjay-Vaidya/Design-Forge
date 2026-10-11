/** First element carrying this `data-tour` id that is actually rendered (not display:none). */
export function findTourTarget(id: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour~="${id}"]`)) {
    if (typeof el.checkVisibility !== "function" || el.checkVisibility()) return el;
  }
  return null;
}
