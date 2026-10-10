import { Ban, Calculator, CircleCheck, Clock, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "@/api/client";
import { Button } from "@/components/Button";
import { timeAgo } from "@/lib/format";
import { toast } from "@/stores/toastStore";
import type { AdvisorySection, ItemResolution, Proposal, ProposalItem } from "@/types/aiActions";

import { useAcceptProposal, useRejectProposal } from "../hooks";
import { AiBadge, AiButton } from "./AiParts";

const KIND_HEADINGS: Record<string, string> = { option: "Options", criterion: "Criteria" };

function Provenance({ proposal }: { proposal: Proposal }) {
  return (
    <p className="text-xs text-muted">
      Suggested {timeAgo(proposal.created_at)} by{" "}
      <span className="font-mono">{proposal.model}</span> · prompt {proposal.prompt_version}
      {proposal.cache_hit && " · reused from an identical earlier request"}
    </p>
  );
}

function ClosedNote({ proposal }: { proposal: Proposal }) {
  const meta = {
    ACCEPTED: { icon: CircleCheck, text: "Reviewed", className: "text-success" },
    REJECTED: { icon: Ban, text: "Dismissed", className: "text-muted" },
    EXPIRED: { icon: Clock, text: "Expired", className: "text-muted" },
    QUEUED: { icon: Clock, text: "Queued", className: "text-muted" },
    READY: null,
  }[proposal.status];
  if (!meta) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.className}`}>
      <meta.icon className="h-3.5 w-3.5" aria-hidden="true" />
      {meta.text}
    </span>
  );
}

function ResolutionLine({ resolution }: { resolution: ItemResolution }) {
  if (resolution.status === "accepted") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
        <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
        Added to your decision
      </span>
    );
  }
  if (resolution.status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning">
        <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
        Couldn&apos;t add: {resolution.message}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
      <Ban className="h-3.5 w-3.5" aria-hidden="true" />
      Dismissed
    </span>
  );
}

/** A proposal of options/criteria: nothing is added until the person ticks items and confirms. */
function ItemReview({ proposal, decisionId }: { proposal: Proposal; decisionId: string }) {
  const accept = useAcceptProposal(decisionId);
  const reject = useRejectProposal(decisionId);
  const items = proposal.payload.items ?? [];
  const pending = items.filter((i) => !proposal.resolution[i.id]);
  const open = proposal.status === "READY";
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const chosen = pending.filter((i) => !unticked.has(i.id));

  const toggle = (id: string) =>
    setUnticked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const add = () =>
    accept.mutate(
      { proposalId: proposal.id, itemIds: chosen.map((i) => i.id) },
      {
        onSuccess: (updated) => {
          const failed = Object.values(updated.resolution).filter(
            (r) => r.status === "failed",
          ).length;
          const added = chosen.length - failed;
          toast.success(
            `Added ${added} ${added === 1 ? "item" : "items"}`,
            failed ? `${failed} couldn't be added.` : "They're now ordinary, editable entries.",
          );
        },
        onError: (e) =>
          toast.error("Couldn't add those", e instanceof ApiError ? e.message : undefined),
      },
    );

  const groups = Object.entries(KIND_HEADINGS)
    .map(([kind, heading]) => ({ heading, items: items.filter((i) => i.kind === kind) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      {groups.map((g) => (
        <section key={g.heading} aria-label={g.heading} className="mt-4">
          <h4 className="eyebrow">{g.heading}</h4>
          <ul className="mt-2 flex flex-col gap-2">
            {g.items.map((item: ProposalItem) => {
              const decided = proposal.resolution[item.id];
              return (
                <li
                  key={item.id}
                  className="rounded-lg border border-ai/20 bg-surface/70 px-3 py-2.5 text-sm"
                >
                  {decided || !open ? (
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="font-medium">{item.label}</span>
                      {decided ? (
                        <ResolutionLine resolution={decided} />
                      ) : (
                        <ClosedNote proposal={proposal} />
                      )}
                    </div>
                  ) : (
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 accent-ai"
                        checked={!unticked.has(item.id)}
                        onChange={() => toggle(item.id)}
                      />
                      <span className="min-w-0">
                        <span className="block font-medium">{item.label}</span>
                        {item.detail && <span className="block text-muted">{item.detail}</span>}
                      </span>
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {open && pending.length > 0 && (
        <div className="mt-5 flex flex-col gap-3 border-t border-ai/20 pt-4">
          <p className="text-xs text-muted">
            Added items become ordinary entries you can edit or delete. Criteria start with equal
            weight; set what matters to you on the{" "}
            <Link to="../criteria" className="font-medium text-primary hover:underline">
              Criteria tab
            </Link>
            .
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="ghost"
              isLoading={reject.isPending}
              onClick={() => reject.mutate({ proposalId: proposal.id })}
            >
              Dismiss all
            </Button>
            <AiButton isLoading={accept.isPending} disabled={chosen.length === 0} onClick={add}>
              Add selected ({chosen.length})
            </AiButton>
          </div>
        </div>
      )}
    </>
  );
}

function SectionBlock({ section }: { section: AdvisorySection }) {
  const calculated = section.source === "calculated";
  return (
    <section
      aria-label={section.heading}
      className={`mt-4 rounded-lg border p-4 ${
        calculated ? "border-primary/25 bg-primary-soft/40" : "border-ai/20 bg-surface/70"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{section.heading}</h4>
        {calculated && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
            <Calculator className="h-3.5 w-3.5" aria-hidden="true" />
            Calculated from your data
          </span>
        )}
      </div>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
        {section.bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
    </section>
  );
}

/** One proposal, advisory or item-by-item. AI text is rendered as plain text, never as HTML. */
export function ProposalCard({ proposal, decisionId }: { proposal: Proposal; decisionId: string }) {
  const reject = useRejectProposal(decisionId);
  const advisory = proposal.kind === "advisory";
  const open = proposal.status === "READY";

  return (
    <article
      id={`proposal-${proposal.id}`}
      tabIndex={-1}
      aria-label={`${proposal.action} suggestion`}
      className="scroll-mt-24 rounded-2xl border border-ai/25 bg-ai/5 p-5 outline-none focus-visible:ring-2 focus-visible:ring-ai/40 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AiBadge />
        <ClosedNote proposal={proposal} />
      </div>
      <p className="mt-3 text-base font-medium">{proposal.payload.summary}</p>

      {advisory ? (
        <>
          {(proposal.payload.sections ?? []).map((s) => (
            <SectionBlock key={s.heading} section={s} />
          ))}
          <p className="mt-4 text-xs text-muted">
            Advisory only. Your calculated ranking and scores are unchanged by this.
          </p>
          {open && (
            <div className="mt-3 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                isLoading={reject.isPending}
                onClick={() => reject.mutate({ proposalId: proposal.id })}
              >
                Dismiss
              </Button>
            </div>
          )}
        </>
      ) : (
        <ItemReview proposal={proposal} decisionId={decisionId} />
      )}
      <div className="mt-4">
        <Provenance proposal={proposal} />
      </div>
    </article>
  );
}
