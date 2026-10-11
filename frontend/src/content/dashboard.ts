export const dashboardCopy = {
  title: "Your decisions",
  newDecision: "New decision",
  template: "Use a template",
  sample: "Try a sample",
  stats: {
    open: "Open",
    draft: "Drafting",
    ready: "Ready to rank",
    committed: "Committed",
    reviewDue: "Review due",
  },
  empty: {
    title: "Frame your first decision.",
    text: "Start with a real one you're sitting on. Build a clear ranking from your options and priorities, no AI required.",
  },
  noMatches: {
    title: "Nothing matches that.",
    text: "Try a different word, or clear the filter.",
    action: "Clear search and filters",
  },
  reviews: {
    title: "Outcome reviews",
    emptyTitle: "Nothing to review yet.",
    emptyText:
      "When a committed decision comes due, it'll show up here so you can see how it actually turned out.",
    action: "Review outcome",
  },
  calibration: {
    title: "Calibration",
    text: "How your confidence compares with how things actually turned out.",
    action: "View calibration",
  },
  error: "Couldn't load your decisions",
  sampleError: "Couldn't create the sample",
  filters: { all: "All", active: "In progress", completed: "Committed", archived: "Archived" },
  sorts: {
    updated: "Recently updated",
    created: "Newest first",
    deadline: "Deadline soonest",
    title: "Title A–Z",
  },
  sortBy: "Sort by",
  search: "Search decisions",
  scope: "Counts and reviews reflect the decisions in this loaded page.",
};

export const dashboardQuotes = [
  "AI advises. You decide.",
  "The math is the machine's. The judgment is yours.",
  "Answers are cheap. Good decisions are earned.",
  "Not a smarter guess. A clearer method.",
  "Decisions, made legible.",
  "Decide like you'll have to explain it, because you will.",
  "Every hard choice deserves a method, not a mood.",
  "From gut feeling to clear reasoning.",
  "Confidence you can audit.",
  "Weigh it. Score it. Rank it. Own it.",
  "The best time to be honest with yourself is before you choose.",
  "A decision you can't explain is one you can't learn from.",
  "Good judgment is just a method you kept honest.",
];

/** Browser-local time: the greeting follows the viewer, not the server. */
export function dashboardGreeting(name?: string, hour = new Date().getHours()) {
  const person = name ? `, ${name}` : "";
  if (hour < 12) return `Good morning${person}. What are you deciding today?`;
  if (hour < 18) return `Good afternoon${person}. Pick up where you left off.`;
  return `Evening${person}. One clear decision beats ten open tabs.`;
}
