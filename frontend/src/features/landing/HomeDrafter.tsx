import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Info,
  LayoutTemplate,
  Lock,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "@/api/client";
import { ButtonLink } from "@/components/Button";
import { about } from "@/content/about";
import { AiBadge, AiButton } from "@/features/ai/actions/components/AiParts";

import { type DraftResponse, draftDecision, getGuideStatus, type GuideStatus } from "./draftApi";
import {
  clearDraft,
  loadDraft,
  type Scaffold,
  type ScaffoldCriterion,
  saveDraft,
  type StoredDraft,
} from "./draftStore";

const EXAMPLES = [
  "Two job offers: a startup that pays more, or a bigger company closer to home.",
  "Should I keep renting in the city or buy a smaller place in the suburbs?",
  "Which laptop for design work: a light one, or a heavier one with a better screen?",
];
const MIN_OPTIONS = 2;
const MIN_CRITERIA = 1;
const MAX_ITEMS = 10;

type Notice = { tone: "warning" | "info"; text: string; templates: boolean };

function noticeFor(res: DraftResponse): Notice | null {
  if (res.status === "ok") return null;
  return {
    tone: res.status === "refused" ? "info" : "warning",
    text: res.message ?? "The drafter couldn't help with that.",
    templates: res.status !== "refused",
  };
}

function DirectionLabel({ direction }: { direction: ScaffoldCriterion["direction"] }) {
  const Icon = direction === "benefit" ? ArrowUp : ArrowDown;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-normal text-muted">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {direction === "benefit" ? "Higher is better" : "Lower is better"}
    </span>
  );
}

function AddRow({
  label,
  disabled,
  withDirection,
  onAdd,
}: {
  label: string;
  disabled: boolean;
  withDirection?: boolean;
  onAdd: (name: string, direction: ScaffoldCriterion["direction"]) => void;
}) {
  const id = useId();
  const [name, setName] = useState("");
  const [direction, setDirection] = useState<ScaffoldCriterion["direction"]>("benefit");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(name.trim(), direction);
    setName("");
  };
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        className="input-base h-9 min-w-[10rem] flex-1 text-sm"
        placeholder={label}
        maxLength={80}
        value={name}
        disabled={disabled}
        onChange={(e) => setName(e.target.value)}
      />
      {withDirection && (
        <select
          aria-label="Direction"
          className="input-base h-9 w-auto text-sm"
          value={direction}
          disabled={disabled}
          onChange={(e) => setDirection(e.target.value as ScaffoldCriterion["direction"])}
        >
          <option value="benefit">Higher is better</option>
          <option value="cost">Lower is better</option>
        </select>
      )}
      <button
        type="submit"
        disabled={disabled || !name.trim()}
        className="inline-flex h-9 items-center gap-1 rounded-lg border border-border-strong px-3 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add
      </button>
    </form>
  );
}

function RemoveButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={disabled ? "Keep at least this many" : label}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-text disabled:pointer-events-none disabled:opacity-30"
    >
      <X className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

/** The drafted structure as it will look in the product: options × criteria, nothing scored yet. */
export function ScaffoldPreview({
  draft,
  onChange,
  onReset,
}: {
  draft: StoredDraft;
  onChange: (scaffold: Scaffold) => void;
  onReset: () => void;
}) {
  const { scaffold } = draft;
  const share = Math.round(100 / scaffold.criteria.length);
  const update = (patch: Partial<Scaffold>) => onChange({ ...scaffold, ...patch });
  const taken = (list: { name: string }[], name: string) =>
    list.some((x) => x.name.toLowerCase() === name.toLowerCase());

  return (
    <section
      aria-labelledby="draft-title"
      className="rounded-2xl border border-primary/25 bg-surface/80 p-5 shadow-lift backdrop-blur sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AiBadge>AI-drafted · you review everything</AiBadge>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Start over
        </button>
      </div>
      <h3 id="draft-title" className="mt-4 text-xl font-semibold tracking-tight">
        {scaffold.title}
      </h3>
      {scaffold.category && (
        <p className="mt-1 text-sm text-muted">Category: {scaffold.category}</p>
      )}

      <div
        className="mt-5 overflow-x-auto rounded-xl border border-border"
        role="region"
        aria-label="Decision matrix preview; scroll for all criteria"
        tabIndex={0}
      >
        <table className="w-full min-w-[32rem] border-collapse text-sm">
          <caption className="sr-only">
            Options in rows, criteria in columns. No scores yet: you score after you save.
          </caption>
          <thead>
            <tr className="border-b border-border bg-primary-soft/40">
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted">
                Option
              </th>
              {scaffold.criteria.map((c) => (
                <th key={c.name} scope="col" className="px-3 py-3 text-left align-top font-medium">
                  <span className="flex items-start justify-between gap-2">
                    <span>
                      <span className="block text-text">{c.name}</span>
                      <DirectionLabel direction={c.direction} />
                    </span>
                    <RemoveButton
                      label={`Remove criterion ${c.name}`}
                      disabled={scaffold.criteria.length <= MIN_CRITERIA}
                      onClick={() =>
                        update({ criteria: scaffold.criteria.filter((x) => x.name !== c.name) })
                      }
                    />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scaffold.options.map((o) => (
              <tr key={o.name} className="border-b border-border last:border-0">
                <th scope="row" className="min-w-[10rem] px-4 py-3 text-left font-medium">
                  <span className="flex items-start justify-between gap-2">
                    <span>
                      <span className="block">{o.name}</span>
                      {o.note && (
                        <span className="block text-xs font-normal text-muted">{o.note}</span>
                      )}
                    </span>
                    <RemoveButton
                      label={`Remove option ${o.name}`}
                      disabled={scaffold.options.length <= MIN_OPTIONS}
                      onClick={() =>
                        update({ options: scaffold.options.filter((x) => x.name !== o.name) })
                      }
                    />
                  </span>
                </th>
                {scaffold.criteria.map((c) => (
                  <td key={c.name} className="px-3 py-3 font-mono text-muted">
                    <span aria-hidden="true">—</span>
                    <span className="sr-only">Not scored yet</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-muted">
          Weights start equal ({share}% each). You decide what matters after you save.
        </p>
        <div className="mt-1.5 flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
          {scaffold.criteria.map((c) => (
            <span key={c.name} className="h-full flex-1 bg-primary/70" />
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <AddRow
          label="Add an option"
          disabled={scaffold.options.length >= MAX_ITEMS}
          onAdd={(name) =>
            !taken(scaffold.options, name) &&
            update({ options: [...scaffold.options, { name, note: "" }] })
          }
        />
        <AddRow
          label="Add a criterion"
          withDirection
          disabled={scaffold.criteria.length >= MAX_ITEMS}
          onAdd={(name, direction) =>
            !taken(scaffold.criteria, name) &&
            update({ criteria: [...scaffold.criteria, { name, description: "", direction }] })
          }
        />
      </div>

      <p className="mt-5 flex items-start gap-2 text-sm text-muted">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <strong className="font-medium text-text">Nothing is saved yet.</strong> This draft lives
          only in this browser tab until you create an account.
        </span>
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <ButtonLink to="/register" size="lg" className="group">
          Save &amp; start scoring
          <ArrowRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </ButtonLink>
        <p className="text-sm text-muted">
          Creates a free account.{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Already have one? Log in
          </Link>
        </p>
      </div>
    </section>
  );
}

/** AX-22 — the public "describe a decision" drafter on the home page. */
export function HomeDrafter() {
  const inputId = useId();
  const [status, setStatus] = useState<GuideStatus | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [draft, setDraft] = useState<StoredDraft | null>(() => loadDraft());

  useEffect(() => {
    getGuideStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const off = status !== null && !status.enabled;
  const short = text.trim().length < 10;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (short || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await draftDecision(text.trim());
      if (status && res.drafts_remaining !== null) {
        setStatus({ ...status, drafts_remaining: res.drafts_remaining });
      }
      if (res.status === "ok" && res.scaffold && res.draft_token) {
        const next = { scaffold: res.scaffold, token: res.draft_token, savedAt: Date.now() };
        saveDraft(next);
        setDraft(next);
      } else {
        setNotice(noticeFor(res));
      }
    } catch (err) {
      setNotice({
        tone: "warning",
        text:
          err instanceof ApiError && err.status === 429
            ? err.message
            : "The drafter couldn't be reached. You can start from a template instead.",
        templates: true,
      });
    } finally {
      setBusy(false);
    }
  };

  const change = (scaffold: Scaffold) => {
    if (!draft) return;
    const next = { ...draft, scaffold };
    saveDraft(next);
    setDraft(next);
  };

  const reset = () => {
    clearDraft();
    setDraft(null);
    setNotice(null);
  };

  if (draft) return <ScaffoldPreview draft={draft} onChange={change} onReset={reset} />;

  return (
    <div className="rounded-2xl border border-ai/25 bg-surface/80 p-5 shadow-lift backdrop-blur sm:p-6">
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={inputId} className="text-base font-semibold">
            Describe a decision you&apos;re facing
          </label>
          <AiBadge>AI drafts · you decide</AiBadge>
        </div>
        <textarea
          id={inputId}
          className="input-base min-h-28 resize-y py-2.5"
          maxLength={1000}
          placeholder={EXAMPLES[0]}
          value={text}
          disabled={busy || off}
          aria-describedby={`${inputId}-hint`}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Example decisions">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              disabled={busy || off}
              onClick={() => setText(example)}
              className="rounded-full border border-border px-3 py-1 text-left text-xs text-muted transition-colors hover:border-ai/40 hover:text-text disabled:opacity-50"
            >
              {example}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p id={`${inputId}-hint`} className="flex items-start gap-1.5 text-xs text-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Skip names and contact details; they&apos;re removed anyway. Nothing is saved until
              you create an account.
              {status?.enabled && ` ${status.drafts_remaining} free drafts left today.`}
            </span>
          </p>
          <AiButton type="submit" isLoading={busy} disabled={short || off}>
            Draft it for me
          </AiButton>
        </div>
      </form>

      <Link
        to="/about"
        className="mt-2 inline-flex min-h-11 items-center rounded-lg text-xs font-medium text-muted hover:text-primary"
      >
        {about.guideLink}
      </Link>

      <div aria-live="polite" aria-atomic="true" className="mt-3">
        {busy && (
          <p role="status" className="text-sm text-ai">
            Drafting your options and criteria… usually under 10 seconds.
          </p>
        )}
        {(notice || off) && (
          <div
            role={notice ? "alert" : "status"}
            className={`flex flex-col gap-3 rounded-lg border p-4 text-sm sm:flex-row sm:items-center sm:justify-between ${
              notice?.tone === "info"
                ? "border-border bg-surface-2"
                : "border-warning/30 bg-warning/5"
            }`}
          >
            <span>{notice?.text ?? "The AI drafter is switched off right now."}</span>
            {(notice?.templates ?? true) && (
              <ButtonLink to="/app/templates" variant="secondary" size="sm">
                <LayoutTemplate className="h-4 w-4" aria-hidden="true" />
                Start from a template
              </ButtonLink>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
