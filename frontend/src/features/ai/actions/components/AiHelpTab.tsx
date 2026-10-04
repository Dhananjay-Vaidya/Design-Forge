import { FileText, GraduationCap, Info, type LucideIcon, Scale, Sparkles } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import { ErrorState, Skeleton } from "@/components/States";
import { useDecision } from "@/features/decisions/hooks";
import type { DecisionStatus } from "@/types/decision";

import { useAiStatus, useProposals, useRunAction } from "../hooks";
import { AiBadge, AiBudgetMeter, AiButton } from "./AiParts";
import { ProposalCard } from "./ProposalCard";

const SCORED: DecisionStatus[] = ["SCORED", "COMMITTED", "UNDER_REVIEW", "REVIEWED"];
const COMMITTED: DecisionStatus[] = ["COMMITTED", "UNDER_REVIEW", "REVIEWED"];

interface Capability {
  name: string;
  icon: LucideIcon;
  title: string;
  blurb: string;
  allowed: DecisionStatus[] | null;
  needs: string;
}

const CAPABILITIES: Capability[] = [
  {
    name: "devils_advocate",
    icon: Scale,
    title: "Challenge the leader",
    blurb:
      "The case against the top-ranked option, the case for the runner-up, and questions to answer first.",
    allowed: SCORED,
    needs: "Finish scoring first. This challenges a calculated ranking.",
  },
  {
    name: "decision_brief",
    icon: FileText,
    title: "Decision brief",
    blurb: "A short written summary of your committed decision. The facts in it are calculated.",
    allowed: COMMITTED,
    needs: "Commit to an option first.",
  },
  {
    name: "outcome_coach",
    icon: GraduationCap,
    title: "Outcome coach",
    blurb: "Reflect on how your confidence compared with the result, with questions to learn from.",
    allowed: ["REVIEWED"],
    needs: "Record how it turned out first.",
  },
];

function friendly(error: unknown): string {
  if (error instanceof ApiError) {
    const field = error.fields && Object.values(error.fields).flat()[0];
    return field ?? error.message;
  }
  return "Something went wrong reaching the assistant. Check your connection and try again.";
}

interface Notice {
  action: string;
  text: string;
}

function SetupCard({
  running,
  disabledReason,
  onRun,
}: {
  running: boolean;
  disabledReason: string | null;
  onRun: (description: string) => void;
}) {
  const [text, setText] = useState("");
  const short = text.trim().length < 10;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!short) onRun(text.trim());
  };
  return (
    <form onSubmit={submit} className="card flex flex-col gap-3 p-5 sm:p-6 md:col-span-2">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ai/10 text-ai">
          <Sparkles className="h-4.5 w-4.5" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-sm font-semibold">Draft options and criteria</h3>
          <p className="mt-0.5 text-sm text-muted">
            Describe the decision in your own words. You&apos;ll get a starting structure and accept
            it one item at a time. The AI never sets scores or weights.
          </p>
        </div>
      </div>
      <label htmlFor="setup-description" className="sr-only">
        Describe your decision
      </label>
      <textarea
        id="setup-description"
        className="input-base min-h-28 resize-y py-2.5"
        maxLength={2000}
        placeholder="e.g. I have two job offers: a startup paying more and a big company closer to home. I care about growth and not burning out."
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={running}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted">
          {short ? "A sentence or two is enough (at least 10 characters)." : `${text.length}/2000`}
          {" · Don't include email addresses or other personal details; they are removed anyway."}
        </span>
        <AiButton type="submit" isLoading={running} disabled={short || Boolean(disabledReason)}>
          Draft with AI
        </AiButton>
      </div>
    </form>
  );
}

function CapabilityCard({
  capability,
  status,
  running,
  aiOff,
  onRun,
}: {
  capability: Capability;
  status: DecisionStatus;
  running: boolean;
  aiOff: boolean;
  onRun: () => void;
}) {
  const ready = capability.allowed === null || capability.allowed.includes(status);
  return (
    <div className="card flex flex-col gap-3 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ai/10 text-ai">
          <capability.icon className="h-4.5 w-4.5" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-sm font-semibold">{capability.title}</h3>
          <p className="mt-0.5 text-sm text-muted">{capability.blurb}</p>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        {!ready && <span className="text-xs text-muted">{capability.needs}</span>}
        <AiButton
          variant="quiet"
          className="ml-auto"
          isLoading={running}
          disabled={!ready || aiOff}
          onClick={onRun}
        >
          {capability.title === "Decision brief" ? "Write brief" : "Run"}
        </AiButton>
      </div>
    </div>
  );
}

/** AX-01/07/08/09 — one place for the AI capabilities. Everything here is a violet, advisory draft. */
export function AiHelpTab() {
  const { decisionId = "" } = useParams();
  const { data: decision, isLoading, error, refetch } = useDecision(decisionId);
  const { data: status } = useAiStatus();
  const proposals = useProposals(decisionId);
  const run = useRunAction(decisionId);
  const [running, setRunning] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  if (isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (error || !decision) {
    return (
      <ErrorState title="Couldn't load this decision" error={error} onRetry={() => refetch()} />
    );
  }

  const aiOff = status ? !status.enabled : false;
  const start = async (action: string, input: Record<string, unknown> = {}) => {
    setNotice(null);
    setRunning(action);
    try {
      const result = await run.mutateAsync({ action, input });
      if (result.status === "FAILED") {
        setNotice({
          action,
          text: `${result.message ?? "The AI's answer couldn't be used."} It didn't use any of your daily AI actions.`,
        });
      }
    } catch (e) {
      setNotice({ action, text: friendly(e) });
    } finally {
      setRunning(null);
    }
  };

  const all = proposals.data ?? [];
  const open = all.filter((p) => p.status === "READY");
  const earlier = all.filter((p) => p.status !== "READY").slice(0, 10);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col items-start gap-2">
          <AiBadge>AI · Advisory</AiBadge>
          <p className="max-w-xl text-sm text-muted">
            These suggestions are drafts. Nothing changes your decision until you accept an item,
            and nothing here changes your calculated scores, weights or ranking.
          </p>
        </div>
        <AiBudgetMeter />
      </div>

      {aiOff && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-border bg-surface-2 p-3 text-sm"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
          AI suggestions are switched off on this server. Everything else works the same.
        </p>
      )}

      <div aria-live="polite" aria-atomic="true">
        {running && (
          <p role="status" className="flex items-center gap-2 text-sm text-ai">
            <Sparkles className="h-4 w-4 animate-pulse" aria-hidden="true" />
            Thinking… this can take up to 20 seconds.
          </p>
        )}
        {notice && (
          <p role="alert" className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
            {notice.text}
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SetupCard
          running={running === "setup_draft"}
          disabledReason={aiOff ? "AI suggestions are switched off on this server." : null}
          onRun={(description) => start("setup_draft", { description })}
        />
        {CAPABILITIES.map((c) => (
          <CapabilityCard
            key={c.name}
            capability={c}
            status={decision.status}
            running={running === c.name}
            aiOff={aiOff}
            onRun={() => start(c.name)}
          />
        ))}
      </div>

      {proposals.isLoading ? (
        <Skeleton className="h-32 rounded-xl" />
      ) : (
        <>
          {open.length > 0 && (
            <section aria-label="Suggestions to review" className="flex flex-col gap-4">
              {open.map((p) => (
                <ProposalCard key={p.id} proposal={p} decisionId={decisionId} />
              ))}
            </section>
          )}
          {earlier.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium text-muted hover:text-text">
                Earlier suggestions ({earlier.length})
              </summary>
              <div className="mt-3 flex flex-col gap-4">
                {earlier.map((p) => (
                  <ProposalCard key={p.id} proposal={p} decisionId={decisionId} />
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
