import {
  ArrowUpRight,
  Calculator,
  CalendarDays,
  CircleCheck,
  CircleDashed,
  FolderOpen,
  FolderKanban,
  LayoutGrid,
  List,
  type LucideIcon,
  Plus,
  Search,
  Tag,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { forwardRef, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { ButtonLink } from "@/components/Button";
import { EmptyState, ErrorState, Skeleton } from "@/components/States";
import { CountUp } from "@/components/fx/CountUp";
import { trackSpotlight } from "@/components/fx/spotlight";
import { StatusChip } from "@/features/decisions/components/StatusChip";
import { useDecisions } from "@/features/decisions/hooks";
import { ACTIVE_STATUSES, COMPLETED_STATUSES } from "@/features/decisions/status";
import { daysUntil, deadlineLabel, parseLocalDate, timeAgo } from "@/lib/format";
import { useAuthStore } from "@/stores/authStore";
import type { Decision } from "@/types/decision";

type Filter = "all" | "active" | "completed" | "archived";
type Sort = "updated" | "created" | "title" | "deadline";
type View = "grid" | "list";

const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "In progress" },
  { value: "completed", label: "Committed" },
  { value: "archived", label: "Archived" },
];

const sorts: { value: Sort; label: string }[] = [
  { value: "updated", label: "Recently updated" },
  { value: "created", label: "Newest first" },
  { value: "deadline", label: "Deadline soonest" },
  { value: "title", label: "Title A–Z" },
];

const VIEW_KEY = "df-dashboard-view";

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

function matchesFilter(decision: Decision, filter: Filter) {
  if (filter === "archived") return decision.status === "ARCHIVED";
  if (filter === "active") return ACTIVE_STATUSES.includes(decision.status);
  if (filter === "completed") return COMPLETED_STATUSES.includes(decision.status);
  return decision.status !== "ARCHIVED";
}

function compare(sort: Sort) {
  return (a: Decision, b: Decision) => {
    if (sort === "title") return a.title.localeCompare(b.title);
    if (sort === "created") return b.created_at.localeCompare(a.created_at);
    if (sort === "deadline") {
      // Decisions without a deadline go last.
      if (!a.deadline) return b.deadline ? 1 : 0;
      if (!b.deadline) return -1;
      return parseLocalDate(a.deadline).getTime() - parseLocalDate(b.deadline).getTime();
    }
    return b.updated_at.localeCompare(a.updated_at);
  };
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function Meta({ decision }: { decision: Decision }) {
  const overdue =
    decision.deadline &&
    ACTIVE_STATUSES.includes(decision.status) &&
    daysUntil(decision.deadline) < 0;
  return (
    <>
      {decision.category && (
        <span className="inline-flex items-center gap-1.5">
          <Tag className="h-3.5 w-3.5" aria-hidden="true" />
          {decision.category}
        </span>
      )}
      {decision.deadline && (
        <span
          className={`inline-flex items-center gap-1.5 ${overdue ? "font-medium text-danger" : ""}`}
        >
          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
          {deadlineLabel(decision.deadline)}
        </span>
      )}
    </>
  );
}

const itemMotion = {
  layout: true,
  initial: { opacity: 0, y: 12, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.15 } },
  transition: { type: "spring" as const, stiffness: 420, damping: 34 },
};

// forwardRef: AnimatePresence "popLayout" measures each exiting item through its ref.
const DecisionCard = forwardRef<HTMLLIElement, { decision: Decision }>(({ decision }, ref) => {
  return (
    <motion.li ref={ref} {...itemMotion}>
      <Link
        to={`/app/decisions/${decision.id}`}
        onPointerMove={trackSpotlight}
        className="spotlight group flex h-full flex-col rounded-2xl border border-border bg-surface/80 p-5 backdrop-blur-sm transition-[transform,box-shadow,border-color] duration-base ease-out hover:-translate-y-1 hover:border-primary/30 hover:shadow-lift"
      >
        <div className="flex items-start justify-between gap-3">
          <StatusChip status={decision.status} />
          <ArrowUpRight
            className="h-4 w-4 -translate-x-1 translate-y-1 text-muted opacity-0 transition-all duration-base group-hover:translate-x-0 group-hover:translate-y-0 group-hover:text-primary group-hover:opacity-100"
            aria-hidden="true"
          />
        </div>
        <h3 className="mt-4 line-clamp-2 font-semibold leading-snug tracking-tight transition-colors group-hover:text-primary">
          {decision.title}
        </h3>
        {decision.context && (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">
            {decision.context}
          </p>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-5 text-xs text-muted">
          <Meta decision={decision} />
          <span className="ml-auto">{timeAgo(decision.updated_at)}</span>
        </div>
      </Link>
    </motion.li>
  );
});
DecisionCard.displayName = "DecisionCard";

const DecisionRow = forwardRef<HTMLLIElement, { decision: Decision }>(({ decision }, ref) => {
  return (
    <motion.li ref={ref} {...itemMotion}>
      <Link
        to={`/app/decisions/${decision.id}`}
        onPointerMove={trackSpotlight}
        className="spotlight group flex flex-col gap-2 rounded-xl border border-border bg-surface/80 px-4 py-3.5 backdrop-blur-sm transition-[border-color,box-shadow] duration-base hover:border-primary/30 hover:shadow-soft sm:flex-row sm:items-center sm:gap-4"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium transition-colors group-hover:text-primary">
            {decision.title}
          </span>
          <span className="mt-0.5 flex flex-wrap gap-x-4 text-xs text-muted">
            <Meta decision={decision} />
          </span>
        </span>
        <span className="flex items-center gap-4">
          <StatusChip status={decision.status} />
          <span className="w-24 text-right text-xs text-muted">{timeAgo(decision.updated_at)}</span>
          <ArrowUpRight
            className="h-4 w-4 text-muted transition-colors group-hover:text-primary max-sm:hidden"
            aria-hidden="true"
          />
        </span>
      </Link>
    </motion.li>
  );
});
DecisionRow.displayName = "DecisionRow";

function StatTile({
  label,
  value,
  icon: Icon,
  tone,
  index,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: string;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
      onPointerMove={trackSpotlight}
      className="glass spotlight group rounded-2xl px-5 py-4 transition-transform duration-base hover:-translate-y-0.5"
    >
      <dt className="flex items-center justify-between text-xs font-medium text-muted">
        {label}
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-lg transition-transform duration-base group-hover:scale-110 ${tone}`}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </dt>
      <dd className="mt-1 font-mono text-3xl font-semibold tabular-nums tracking-tight">
        <CountUp value={value} />
      </dd>
    </motion.div>
  );
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading, isError, error, refetch } = useDecisions();
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("updated");
  const [view, setViewState] = useState<View>(readView);
  const [query, setQuery] = useState("");

  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Preference only; ignore storage failures.
    }
  };

  const decisions = useMemo(() => data?.results ?? [], [data]);
  const counts = useMemo(
    () => ({
      all: decisions.filter((d) => matchesFilter(d, "all")).length,
      active: decisions.filter((d) => matchesFilter(d, "active")).length,
      completed: decisions.filter((d) => matchesFilter(d, "completed")).length,
      archived: decisions.filter((d) => matchesFilter(d, "archived")).length,
      draft: decisions.filter((d) => d.status === "DRAFT").length,
      ready: decisions.filter((d) => d.status === "SCORED").length,
    }),
    [decisions],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return decisions
      .filter(
        (d) =>
          matchesFilter(d, filter) &&
          (!q || `${d.title} ${d.context} ${d.category}`.toLowerCase().includes(q)),
      )
      .sort(compare(sort));
  }, [decisions, filter, query, sort]);

  const name = user?.profile.display_name || user?.email.split("@")[0];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-muted">
            {greeting()}
            {name ? `, ${name}` : ""}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Your decisions</h1>
          <p className="mt-2 max-w-lg text-sm text-muted">
            A working library of questions, evidence, and reasoned choices.
          </p>
        </div>
        <ButtonLink
          to="/app/decisions/new"
          className="group shadow-[0_8px_24px_-10px_rgb(var(--color-primary)/0.7)]"
        >
          <Plus
            className="h-4 w-4 transition-transform duration-base group-hover:rotate-90"
            aria-hidden="true"
          />
          New decision
        </ButtonLink>
      </div>

      {isLoading ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[92px] rounded-2xl" />
            ))}
          </div>
          <div
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            role="status"
            aria-label="Loading decisions"
          >
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" />
            ))}
          </div>
        </>
      ) : isError ? (
        <ErrorState title="Couldn't load your decisions" error={error} onRetry={() => refetch()} />
      ) : decisions.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="Frame your first decision"
          description="Name what you're deciding, list the options, choose the criteria that matter, and get a ranking you can explain."
          action={
            <ButtonLink to="/app/decisions/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create your first decision
            </ButtonLink>
          }
          className="glass py-16"
        />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              index={0}
              label="Open decisions"
              value={counts.all}
              icon={FolderKanban}
              tone="bg-surface-2 text-text"
            />
            <StatTile
              index={1}
              label="Drafting"
              value={counts.draft}
              icon={CircleDashed}
              tone="bg-surface-2 text-muted"
            />
            <StatTile
              index={2}
              label="Ready to rank"
              value={counts.ready}
              icon={Calculator}
              tone="bg-primary-soft text-primary"
            />
            <StatTile
              index={3}
              label="Committed"
              value={counts.completed}
              icon={CircleCheck}
              tone="bg-success/10 text-success"
            />
          </dl>

          <div className="glass flex flex-col gap-3 rounded-2xl p-2 lg:flex-row lg:items-center lg:justify-between">
            <div role="group" aria-label="Filter decisions" className="flex gap-1 overflow-x-auto">
              {filters.map((f) => {
                const selected = filter === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setFilter(f.value)}
                    className={`relative inline-flex h-9 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors ${
                      selected ? "text-text" : "text-muted hover:text-text"
                    }`}
                  >
                    {selected && (
                      <motion.span
                        layoutId="filter-pill"
                        className="absolute inset-0 rounded-lg bg-surface shadow-soft"
                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                      />
                    )}
                    <span className="relative">{f.label}</span>
                    <span className="relative font-mono text-xs tabular-nums text-muted">
                      {counts[f.value]}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1 lg:w-60 lg:flex-none">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search decisions"
                  aria-label="Search decisions"
                  className="input-base min-h-9 bg-surface/70 pl-9 text-sm"
                />
              </div>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                aria-label="Sort decisions"
                className="input-base min-h-9 w-auto cursor-pointer bg-surface/70 pr-8 text-sm"
              >
                {sorts.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <div
                role="group"
                aria-label="Layout"
                className="flex rounded-lg border border-border bg-surface/70 p-0.5"
              >
                {(
                  [
                    ["grid", LayoutGrid, "Grid view"],
                    ["list", List, "List view"],
                  ] as const
                ).map(([v, Icon, label]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    aria-label={label}
                    title={label}
                    onClick={() => setView(v)}
                    className={`relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors ${
                      view === v ? "text-primary" : "text-muted hover:text-text"
                    }`}
                  >
                    {view === v && (
                      <motion.span
                        layoutId="view-pill"
                        className="absolute inset-0 rounded-md bg-primary-soft"
                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                      />
                    )}
                    <Icon className="relative h-4 w-4" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={Search}
              title="Nothing matches"
              description={
                query
                  ? `No decisions match “${query}” in this view.`
                  : "There are no decisions in this view yet."
              }
              action={
                <button
                  type="button"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-primary hover:bg-primary-soft"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  Clear search and filters
                </button>
              }
              className="glass"
            />
          ) : (
            <motion.ul
              layout
              className={
                view === "grid" ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-2"
              }
              aria-label={`${visible.length} decisions`}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                {visible.map((d) =>
                  view === "grid" ? (
                    <DecisionCard key={`g-${d.id}`} decision={d} />
                  ) : (
                    <DecisionRow key={`l-${d.id}`} decision={d} />
                  ),
                )}
              </AnimatePresence>
            </motion.ul>
          )}
        </>
      )}
    </div>
  );
}
