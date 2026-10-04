import { zodResolver } from "@hookform/resolvers/zod";
import {
  Archive,
  BookmarkPlus,
  CalendarDays,
  Check,
  ChevronRight,
  FileQuestion,
  Flag,
  FlaskConical,
  Grid3x3,
  History,
  Layers,
  Pencil,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
  Trophy,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { motion } from "motion/react";
import { useForm } from "react-hook-form";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";

import { ApiError } from "@/api/client";
import { Button, ButtonLink } from "@/components/Button";
import { ConfirmDialog, Dialog } from "@/components/Dialog";
import { FormField, TextAreaField } from "@/components/FormField";
import { EmptyState, ErrorState, Skeleton } from "@/components/States";
import { AskAiPanel } from "@/features/ai/AskAiPanel";
import { StatusChip } from "@/features/decisions/components/StatusChip";
import {
  type Readiness,
  useDecision,
  useDeleteDecision,
  useReadiness,
  useUpdateDecision,
} from "@/features/decisions/hooks";
import { DemoBanner } from "@/features/templates/components/DemoBanner";
import { SaveTemplateDialog } from "@/features/templates/components/SaveTemplateDialog";
import { GuidedTour, type TourStep } from "@/features/tour/GuidedTour";
import { deadlineLabel, timeAgo } from "@/lib/format";
import {
  CATEGORY_SUGGESTIONS,
  type DecisionDetailsValues,
  decisionDetailsSchema,
} from "@/schemas/decision";
import { toast } from "@/stores/toastStore";
import type { Decision } from "@/types/decision";

/** Walks the ranking screen of the sample decision; targets are `data-tour` attributes. */
const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="stage-tabs"]',
    title: "Four stages, one flow",
    body: "Options, Criteria, Scores, then Ranking. The badges show what is complete and what still needs work.",
  },
  {
    target: '[data-tour="leader"]',
    title: "The calculated leader",
    body: "A weighted sum of your own scores. The same inputs always give the same answer, and no AI is involved.",
  },
  {
    target: '[data-tour="stability"]',
    title: "Is the lead safe?",
    body: "This sample is a deliberate close call: a small change to a weight or score could flip the winner.",
  },
  {
    target: '[data-tour="breakdown"]',
    title: "Why it ranks this way",
    body: "The points each criterion contributed to every option, so nothing is a black box.",
  },
  {
    target: '[data-tour="ask-ai"]',
    title: "Ask AI, as an advisor",
    body: "Optional questions, risks and counter-arguments. It is clearly marked advisory and can never change your ranking.",
  },
];

function EditDecisionDialog({
  decision,
  open,
  onClose,
}: {
  decision: Decision;
  open: boolean;
  onClose: () => void;
}) {
  const listId = useId();
  const update = useUpdateDecision(decision.id);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<DecisionDetailsValues>({
    resolver: zodResolver(decisionDetailsSchema),
    values: {
      title: decision.title,
      context: decision.context,
      category: decision.category,
      deadline: decision.deadline ?? "",
    },
  });

  const submit = handleSubmit((values) =>
    update.mutate(
      {
        title: values.title.trim(),
        context: values.context.trim(),
        category: values.category.trim(),
        deadline: values.deadline || null,
      },
      {
        onSuccess: () => {
          toast.success("Details updated");
          onClose();
        },
        onError: (error) => {
          if (error instanceof ApiError && error.fields) {
            for (const [field, messages] of Object.entries(error.fields)) {
              setError(field as keyof DecisionDetailsValues, { message: messages[0] });
            }
          } else {
            toast.error(
              "Couldn't save changes",
              error instanceof ApiError ? error.message : undefined,
            );
          }
        },
      },
    ),
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit details"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="edit-decision" isLoading={update.isPending}>
            Save changes
          </Button>
        </>
      }
    >
      <form id="edit-decision" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FormField label="Title" error={errors.title?.message} {...register("title")} />
        <TextAreaField label="Context" optional {...register("context")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FormField
              label="Category"
              optional
              list={listId}
              error={errors.category?.message}
              {...register("category")}
            />
            <datalist id={listId}>
              {CATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <FormField label="Decide by" optional type="date" {...register("deadline")} />
        </div>
      </form>
    </Dialog>
  );
}

function TabBadge({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] tabular-nums ${
        done ? "bg-success/10 text-success" : "bg-surface-2 text-muted"
      }`}
    >
      {done && <Check className="h-3 w-3" aria-hidden="true" />}
      {children}
    </span>
  );
}

function WorkspaceTabs({ readiness }: { readiness: Readiness }) {
  const navigate = useNavigate();
  const location = useLocation();
  const tabs = [
    {
      to: "alternatives",
      label: "Options",
      icon: Layers,
      badge: <TabBadge done={readiness.hasAlternatives}>{readiness.alternatives}</TabBadge>,
      sr: readiness.hasAlternatives ? "complete" : "needs at least two",
    },
    {
      to: "criteria",
      label: "Criteria",
      icon: SlidersHorizontal,
      badge: <TabBadge done={readiness.hasCriteria}>{readiness.activeCriteria}</TabBadge>,
      sr: readiness.hasCriteria ? "complete" : "needs at least one",
    },
    {
      to: "scores",
      label: "Scores",
      icon: Grid3x3,
      badge: (
        <TabBadge done={readiness.isScored}>
          {readiness.filledCells}/{readiness.totalCells}
        </TabBadge>
      ),
      sr: readiness.isScored
        ? "complete"
        : `${readiness.filledCells} of ${readiness.totalCells} filled`,
    },
    {
      to: "ranking",
      label: "Ranking",
      icon: Trophy,
      badge: null,
      sr: readiness.isReady ? "ready" : "not ready yet",
    },
    {
      to: "what-if",
      label: "What-if",
      icon: FlaskConical,
      badge: null,
      sr: readiness.isReady ? "explore sensitivity" : "needs a complete ranking",
    },
    { to: "versions", label: "Versions", icon: History, badge: null, sr: "saved copies and diffs" },
    {
      to: "commit",
      label: "Commit",
      icon: Flag,
      badge: null,
      sr: "record your choice and review it later",
    },
    { to: "ai", label: "AI help", icon: Sparkles, badge: null, sr: "advisory suggestions" },
  ];

  return (
    <>
      <label className="flex flex-col gap-2 text-xs font-medium text-muted sm:hidden">
        Decision stage
        <select
          className="input-base text-sm"
          value={location.pathname.split("/").at(-1)}
          onChange={(event) => navigate(event.target.value)}
        >
          {tabs.map((tab) => (
            <option key={tab.to} value={tab.to}>
              {tab.label} — {tab.sr}
            </option>
          ))}
        </select>
      </label>
      <nav
        aria-label="Decision stages"
        data-tour="stage-tabs"
        className="hidden overflow-x-auto sm:block"
      >
        <ol className="flex min-w-max items-center gap-1 border-b border-border">
          {tabs.map((tab, i) => (
            <li key={tab.to} className="flex items-center">
              <NavLink
                to={tab.to}
                className={({ isActive }) =>
                  `group relative -mb-px inline-flex h-11 items-center gap-2 px-3 text-sm font-medium transition-colors ${
                    isActive ? "text-text" : "text-muted hover:text-text"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <tab.icon
                      className={`h-4 w-4 transition-transform duration-base group-hover:-translate-y-0.5 ${isActive ? "text-primary" : ""}`}
                      aria-hidden="true"
                    />
                    {tab.label}
                    {!readiness.isLoading && tab.badge}
                    <span className="sr-only">({tab.sr})</span>
                    {isActive && (
                      <motion.span
                        layoutId="workspace-tab"
                        className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary shadow-glow-line"
                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                      />
                    )}
                  </>
                )}
              </NavLink>
              {i < tabs.length - 1 && (
                <ChevronRight className="h-3.5 w-3.5 text-border-strong" aria-hidden="true" />
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}

function HeaderSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading decision">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="mt-4 h-11 w-full" />
    </div>
  );
}

/** docs/07 §5 — decision workspace hosting the stage tabs. */
export function DecisionWorkspacePage() {
  const { decisionId = "" } = useParams();
  const navigate = useNavigate();
  const { data: decision, isLoading, isError, error, refetch } = useDecision(decisionId);
  const readiness = useReadiness(decisionId);
  const update = useUpdateDecision(decisionId);
  const remove = useDeleteDecision(decisionId);
  const [dialog, setDialog] = useState<"edit" | "archive" | "delete" | "template" | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const ready = !isLoading && !!decision;

  // Arriving from "Try a sample" (?tour=1) starts the tour once the screen has loaded.
  useEffect(() => {
    if (ready && searchParams.get("tour") === "1") {
      setTourOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [ready, searchParams, setSearchParams]);

  const startTour = () => {
    if (!location.pathname.endsWith("/ranking")) navigate("ranking");
    setTourOpen(true);
  };

  if (isLoading) return <HeaderSkeleton />;

  if (isError || !decision) {
    if (error instanceof ApiError && error.status === 404) {
      return (
        <EmptyState
          icon={FileQuestion}
          title="Decision not found"
          description="It may have been deleted, or the link is wrong."
          action={
            <ButtonLink to="/app" variant="secondary">
              Back to dashboard
            </ButtonLink>
          }
        />
      );
    }
    return (
      <ErrorState title="Couldn't load this decision" error={error} onRetry={() => refetch()} />
    );
  }

  const archive = () =>
    update.mutate(
      { status: "ARCHIVED" },
      {
        onSuccess: () => {
          setDialog(null);
          toast.success("Decision archived", "You'll find it under Archived on the dashboard.");
        },
        onError: (e) =>
          toast.error("Couldn't archive", e instanceof ApiError ? e.message : undefined),
      },
    );

  const destroy = () =>
    remove.mutate(undefined, {
      onSuccess: () => {
        toast.success("Decision deleted");
        navigate("/app", { replace: true });
      },
      onError: (e) => toast.error("Couldn't delete", e instanceof ApiError ? e.message : undefined),
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-in">
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link to="/app" className="transition-colors hover:text-text">
                Dashboard
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight className="h-3.5 w-3.5" />
            </li>
            <li aria-current="page" className="truncate text-text">
              {decision.title}
            </li>
          </ol>
        </nav>

        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {decision.title}
              </h1>
              <StatusChip status={decision.status} />
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              {decision.category && (
                <span className="inline-flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                  {decision.category}
                </span>
              )}
              {decision.deadline && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                  {deadlineLabel(decision.deadline)}
                </span>
              )}
              <span>Updated {timeAgo(decision.updated_at)}</span>
            </div>
            {decision.context && (
              <p className="mt-3 max-w-3xl whitespace-pre-line text-[15px] leading-relaxed text-muted">
                {decision.context}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              data-tour="ask-ai"
              onClick={() => setAiOpen(true)}
              className="group relative inline-flex h-9 cursor-pointer items-center gap-1.5 overflow-hidden rounded-lg border border-ai/30 bg-ai/10 px-3 text-sm font-medium text-ai transition-colors hover:bg-ai/20 active:scale-[0.98]"
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-highlight/30 to-transparent transition-transform duration-700 group-hover:translate-x-full"
              />
              <Sparkles className="relative h-3.5 w-3.5" aria-hidden="true" />
              <span className="relative">Ask AI</span>
            </button>
            <Button variant="secondary" size="sm" onClick={() => setDialog("template")}>
              <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
              Save as template
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setDialog("edit")}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Edit
            </Button>
            {decision.status !== "ARCHIVED" && (
              <Button variant="secondary" size="sm" onClick={() => setDialog("archive")}>
                <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                Archive
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-danger hover:bg-danger/10 hover:text-danger"
              onClick={() => setDialog("delete")}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      <DemoBanner decisionId={decision.id} onStartTour={startTour} />
      <WorkspaceTabs readiness={readiness} />

      <div className="animate-fade-in">
        <Outlet />
      </div>

      <SaveTemplateDialog
        decisionId={decision.id}
        decisionTitle={decision.title}
        open={dialog === "template"}
        onClose={() => setDialog(null)}
      />
      <GuidedTour steps={TOUR_STEPS} open={tourOpen} onClose={() => setTourOpen(false)} />
      <AskAiPanel
        decisionId={decision.id}
        decisionTitle={decision.title}
        open={aiOpen}
        onClose={() => setAiOpen(false)}
      />
      <EditDecisionDialog
        decision={decision}
        open={dialog === "edit"}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === "archive"}
        onClose={() => setDialog(null)}
        onConfirm={archive}
        isLoading={update.isPending}
        tone="primary"
        title="Archive this decision?"
        description="It will move out of your active list. Archiving can't be undone from the app yet."
        confirmLabel="Archive"
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onClose={() => setDialog(null)}
        onConfirm={destroy}
        isLoading={remove.isPending}
        title="Delete this decision?"
        description={
          <>
            <span className="font-medium text-text">{decision.title}</span> and all its options,
            criteria and scores will be permanently deleted.
          </>
        }
        confirmLabel="Delete permanently"
      />
    </div>
  );
}
