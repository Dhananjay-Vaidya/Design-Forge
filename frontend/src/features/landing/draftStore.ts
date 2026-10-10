/**
 * The home-page draft lives ONLY in this browser tab (sessionStorage) until the visitor creates an
 * account (doc 20, AX-22). Nothing is saved server-side before then. The TTL matches the server's
 * draft-token lifetime, so an expired draft is dropped here rather than failing at save time.
 */

export interface ScaffoldOption {
  name: string;
  note: string;
}

export interface ScaffoldCriterion {
  name: string;
  description: string;
  direction: "benefit" | "cost";
}

export interface Scaffold {
  title: string;
  category: string;
  options: ScaffoldOption[];
  criteria: ScaffoldCriterion[];
}

export interface StoredDraft {
  scaffold: Scaffold;
  token: string;
  savedAt: number;
}

const KEY = "df-home-draft";
export const DRAFT_TTL_MS = 2 * 60 * 60 * 1000;

function isDraft(value: unknown): value is StoredDraft {
  const d = value as StoredDraft | null;
  return Boolean(
    d &&
    typeof d.token === "string" &&
    typeof d.savedAt === "number" &&
    d.scaffold &&
    typeof d.scaffold.title === "string" &&
    Array.isArray(d.scaffold.options) &&
    Array.isArray(d.scaffold.criteria),
  );
}

/** Storage can be unavailable (private mode, blocked site data); the drafter then simply forgets. */
export function loadDraft(now = Date.now()): StoredDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isDraft(parsed) || now - parsed.savedAt > DRAFT_TTL_MS) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft(draft: StoredDraft): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    /* storage unavailable: the preview still works for this page view */
  }
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
