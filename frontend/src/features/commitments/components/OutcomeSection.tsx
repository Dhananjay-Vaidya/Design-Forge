import {
  Ban,
  CalendarClock,
  CalendarPlus,
  CircleCheck,
  CircleDashed,
  ClipboardCheck,
  type LucideIcon,
} from "lucide-react";
import { type FormEvent, useState } from "react";

import { ApiError } from "@/api/client";
import { Button } from "@/components/Button";
import { EmptyState, Skeleton } from "@/components/States";
import { timeAgo } from "@/lib/format";
import { toast } from "@/stores/toastStore";
import type { OutcomeReview, OutcomeStatus } from "@/types/commitment";

import { useCancelOutcome, useCreateOutcome, useOutcomes, useSubmitOutcome } from "../hooks";

export const SATISFACTION_LABELS = [
  "Very unhappy",
  "Unhappy",
  "Neutral",
  "Happy",
  "Very happy",
] as const;

const statusMeta: Record<OutcomeStatus, { label: string; icon: LucideIcon; className: string }> = {
  SCHEDULED: { label: "Scheduled", icon: CalendarClock, className: "text-muted" },
  DUE: { label: "Review due", icon: CalendarClock, className: "text-warning" },
  SUBMITTED: { label: "Recorded", icon: CircleCheck, className: "text-success" },
  CANCELLED: { label: "Cancelled", icon: Ban, className: "text-muted" },
};

function localDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return localDateInput(d);
}

/** A date picked in the user's own time zone, at 09:00 local, sent as an unambiguous instant. */
function toDueAt(dateValue: string): string {
  return new Date(`${dateValue}T09:00:00`).toISOString();
}

function SatisfactionPicker({
  name,
  value,
  onChange,
}: {
  name: string;
  value: number | null;
  onChange: (n: number) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">How did it turn out?</legend>
      <div className="mt-2 grid grid-cols-5 gap-1.5 sm:gap-2">
        {SATISFACTION_LABELS.map((label, i) => {
          const n = i + 1;
          return (
            <label
              key={n}
              className={`flex min-h-14 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-2 text-center text-xs transition-colors focus-within:ring-2 focus-within:ring-primary/40 ${
                value === n
                  ? "border-primary bg-primary-soft font-medium text-primary"
                  : "border-border-strong hover:bg-surface-2"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={n}
                checked={value === n}
                onChange={() => onChange(n)}
                className="sr-only"
              />
              <span className="font-mono text-base tabular-nums">{n}</span>
              <span className="leading-tight">{label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function OutcomeForm({
  idPrefix,
  submitLabel,
  isLoading,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  submitLabel: string;
  isLoading: boolean;
  onSubmit: (satisfaction: number, notes: string) => void;
  onCancel?: () => void;
}) {
  const [satisfaction, setSatisfaction] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string>();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (satisfaction === null) return setError("Pick how it turned out.");
    setError(undefined);
    onSubmit(satisfaction, notes);
  };

  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-3" noValidate>
      <SatisfactionPicker
        name={`${idPrefix}-sat`}
        value={satisfaction}
        onChange={setSatisfaction}
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor={`${idPrefix}-notes`}>
        What happened? <span className="text-xs font-normal text-muted">Optional</span>
      </label>
      <textarea
        id={`${idPrefix}-notes`}
        className="input-base min-h-20 resize-y py-2.5"
        maxLength={2000}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={isLoading}>
            Not now
          </Button>
        )}
        <Button type="submit" isLoading={isLoading}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function ReviewRow({ review, decisionId }: { review: OutcomeReview; decisionId: string }) {
  const submit = useSubmitOutcome(decisionId);
  const cancel = useCancelOutcome(decisionId);
  const [recording, setRecording] = useState(false);
  const meta = statusMeta[review.status];
  const open = review.status === "SCHEDULED" || review.status === "DUE";

  return (
    <li className="rounded-lg border border-border bg-bg/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className={`inline-flex items-center gap-1.5 font-medium ${meta.className}`}>
          <meta.icon className="h-4 w-4" aria-hidden="true" />
          {meta.label}
        </span>
        <span className="text-muted">
          {review.status === "SUBMITTED" && review.submitted_at
            ? `Recorded ${timeAgo(review.submitted_at)}`
            : `Review ${timeAgo(review.due_at)}`}
        </span>
      </div>
      {review.status === "SUBMITTED" && review.satisfaction !== null && (
        <p className="mt-2 text-sm">
          <span className="font-mono tabular-nums">{review.satisfaction}/5</span> ·{" "}
          {SATISFACTION_LABELS[review.satisfaction - 1]}
          {review.result_notes && <span className="block text-muted">{review.result_notes}</span>}
        </p>
      )}
      {open &&
        (recording ? (
          <OutcomeForm
            idPrefix={`review-${review.id}`}
            submitLabel="Record outcome"
            isLoading={submit.isPending}
            onCancel={() => setRecording(false)}
            onSubmit={(satisfaction, notes) =>
              submit.mutate(
                { outcomeId: review.id, satisfaction, result_notes: notes },
                {
                  onSuccess: () =>
                    toast.success("Outcome recorded", "It now feeds your calibration."),
                  onError: (e) =>
                    toast.error(
                      "Couldn't record the outcome",
                      e instanceof ApiError ? e.message : undefined,
                    ),
                },
              )
            }
          />
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setRecording(true)}>
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              Record outcome
            </Button>
            <Button
              size="sm"
              variant="ghost"
              isLoading={cancel.isPending}
              onClick={() =>
                cancel.mutate(review.id, {
                  onSuccess: () => toast.info("Review cancelled"),
                })
              }
            >
              Cancel review
            </Button>
          </div>
        ))}
    </li>
  );
}

/** FR-014 — schedule a look-back and record how it actually went. */
export function OutcomeSection({ decisionId }: { decisionId: string }) {
  const { data: reviews, isLoading } = useOutcomes(decisionId);
  const create = useCreateOutcome(decisionId);
  const [date, setDate] = useState(addMonths(3));
  const [dateError, setDateError] = useState<string>();
  const [recordingNow, setRecordingNow] = useState(false);

  const schedule = (e: FormEvent) => {
    e.preventDefault();
    if (!date) return setDateError("Choose a date for the review.");
    setDateError(undefined);
    create.mutate(
      { due_at: toDueAt(date) },
      {
        onSuccess: () => toast.success("Review scheduled", "It will show as due on that date."),
        onError: (err) =>
          setDateError(
            err instanceof ApiError
              ? (err.fields?.due_at?.[0] ?? err.message)
              : "Couldn't schedule it.",
          ),
      },
    );
  };

  return (
    <section aria-labelledby="outcome-heading" className="card p-6">
      <h2 id="outcome-heading" className="text-sm font-semibold">
        Look back on it
      </h2>
      <p className="mt-1 text-sm text-muted">
        Schedule a review, then record how it turned out. Over time this shows how well your
        confidence matches reality.
      </p>

      <form
        onSubmit={schedule}
        className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
        noValidate
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="review-date" className="text-sm font-medium">
            Review on
          </label>
          <input
            id="review-date"
            type="date"
            className="input-base"
            min={localDateInput(new Date())}
            value={date}
            aria-invalid={Boolean(dateError)}
            aria-describedby={dateError ? "review-date-error" : undefined}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick review dates">
          {[1, 3, 6, 12].map((m) => (
            <Button key={m} size="sm" variant="secondary" onClick={() => setDate(addMonths(m))}>
              {m === 12 ? "1 year" : `${m} mo`}
            </Button>
          ))}
        </div>
        <Button type="submit" isLoading={create.isPending}>
          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          Schedule review
        </Button>
      </form>
      {dateError && (
        <p id="review-date-error" role="alert" className="mt-2 text-sm text-danger">
          {dateError}
        </p>
      )}

      <div className="mt-6">
        {isLoading ? (
          <Skeleton className="h-20 rounded-lg" />
        ) : reviews && reviews.length > 0 ? (
          <ul className="flex flex-col gap-3" aria-label="Outcome reviews">
            {reviews.map((r) => (
              <ReviewRow key={r.id} review={r} decisionId={decisionId} />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={CircleDashed}
            title="No reviews yet"
            description="Schedule one above, or record the outcome right now if you already know how it went."
            className="py-8"
          />
        )}
      </div>

      <div className="mt-4 border-t border-border pt-4">
        {recordingNow ? (
          <OutcomeForm
            idPrefix="now"
            submitLabel="Record outcome"
            isLoading={create.isPending}
            onCancel={() => setRecordingNow(false)}
            onSubmit={(satisfaction, notes) =>
              create.mutate(
                { satisfaction, result_notes: notes },
                {
                  onSuccess: () => {
                    setRecordingNow(false);
                    toast.success("Outcome recorded", "It now feeds your calibration.");
                  },
                  onError: (e) =>
                    toast.error(
                      "Couldn't record the outcome",
                      e instanceof ApiError ? e.message : undefined,
                    ),
                },
              )
            }
          />
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setRecordingNow(true)}>
            <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
            Record the outcome now
          </Button>
        )}
      </div>
    </section>
  );
}
