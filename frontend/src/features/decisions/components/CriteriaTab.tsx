import { ArrowRight, Check, Pencil, Plus, SlidersHorizontal, Trash2, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import { Button, ButtonLink } from "@/components/Button";
import { ConfirmDialog } from "@/components/Dialog";
import { FormField } from "@/components/FormField";
import { EmptyState, ErrorState, Skeleton } from "@/components/States";
import { toast } from "@/stores/toastStore";
import type { Criterion, Direction } from "@/types/decision";

import { useCreateCriterion, useCriteria, useDeleteCriterion, useUpdateCriterion } from "../hooks";
import { DirectionToggle, WeightBar, WeightStepper } from "./CriterionControls";

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : "Check your connection and try again.");
const cleanWeight = (w: string) => String(Number(w));

function AddCriterionForm({ decisionId, nextPosition }: { decisionId: string; nextPosition: number }) {
  const create = useCreateCriterion(decisionId);
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("3");
  const [direction, setDirection] = useState<Direction>("benefit");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Name the criterion.");
    if (!(Number(weight) > 0)) return setError("Weight must be greater than zero.");
    create.mutate(
      { name: name.trim(), weight: Number(weight), direction, position: nextPosition },
      {
        onSuccess: () => {
          setName("");
          setWeight("3");
          setDirection("benefit");
          setError(null);
        },
        onError: (err) => setError(errorText(err)),
      },
    );
  };

  return (
    <form onSubmit={submit} className="card flex flex-col gap-4 p-4" noValidate>
      <FormField
        label="Criterion"
        placeholder="e.g. Total cost, growth potential"
        value={name}
        maxLength={200}
        error={error ?? undefined}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <DirectionToggle value={direction} onChange={setDirection} label="New criterion direction" />
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">Weight</span>
            <WeightStepper label="New criterion weight" value={weight} onChange={setWeight} invalid={!(Number(weight) > 0)} />
          </div>
        </div>
        <Button type="submit" isLoading={create.isPending}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add criterion
        </Button>
      </div>
    </form>
  );
}

function ActiveSwitch({ checked, onChange, label, disabled }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-base disabled:cursor-wait disabled:opacity-60 ${
        checked ? "bg-primary" : "bg-border-strong"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow-soft transition-transform duration-base ease-out ${
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

interface RowProps {
  criterion: Criterion;
  share: number | null;
  decisionId: string;
  onDelete: (c: Criterion) => void;
  index: number;
}

function CriterionRow({ criterion, share, decisionId, onDelete, index }: RowProps) {
  const update = useUpdateCriterion(decisionId);
  const [weight, setWeight] = useState(cleanWeight(criterion.weight));
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(criterion.name);

  // Keep the local draft in sync when the server value changes underneath us.
  useEffect(() => setWeight(cleanWeight(criterion.weight)), [criterion.weight]);

  const patch = (body: Parameters<typeof update.mutate>[0]["body"], onDone?: () => void) =>
    update.mutate(
      { critId: criterion.id, body },
      {
        onSuccess: onDone,
        onError: (err) => {
          setWeight(cleanWeight(criterion.weight));
          toast.error("Couldn't update the criterion", errorText(err));
        },
      },
    );

  const commitWeight = (value: string) => {
    const n = Number(value);
    if (!(n > 0)) {
      setWeight(cleanWeight(criterion.weight));
      toast.error("Weight must be greater than zero");
      return;
    }
    if (n !== Number(criterion.weight)) patch({ weight: n });
  };

  const saveName = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    patch({ name: name.trim() }, () => setEditing(false));
  };

  return (
    <li
      className={`card flex animate-rise flex-col gap-4 p-4 transition-opacity lg:flex-row lg:items-center ${
        criterion.is_active ? "" : "bg-surface/60"
      }`}
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <ActiveSwitch
          checked={criterion.is_active}
          label={`Include ${criterion.name} in ranking`}
          disabled={update.isPending}
          onChange={() =>
            patch({ is_active: !criterion.is_active }, () =>
              toast.info(criterion.is_active ? `“${criterion.name}” excluded` : `“${criterion.name}” included`),
            )
          }
        />
        {editing ? (
          <form onSubmit={saveName} className="flex flex-1 items-center gap-2" noValidate>
            <input
              className="input-base min-h-9"
              value={name}
              maxLength={200}
              aria-label="Criterion name"
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
            />
            <Button type="submit" size="icon" className="h-9 w-9" aria-label="Save name" isLoading={update.isPending}>
              {!update.isPending && <Check className="h-4 w-4" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9"
              aria-label="Cancel editing"
              onClick={() => {
                setName(criterion.name);
                setEditing(false);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </form>
        ) : (
          <div className="min-w-0">
            <p className={`truncate font-medium ${criterion.is_active ? "" : "text-muted line-through decoration-muted/50"}`}>
              {criterion.name}
            </p>
            <p className="text-xs text-muted">
              {criterion.is_active ? (
                <>
                  Counts for <span className="font-mono tabular-nums text-text">{share !== null ? `${Math.round(share * 100)}%` : "—"}</span> of the total
                </>
              ) : (
                "Excluded from ranking"
              )}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2.5 max-lg:pl-[52px]">
        <DirectionToggle
          size="sm"
          label={`${criterion.name} direction`}
          value={criterion.direction}
          onChange={(direction) => direction !== criterion.direction && patch({ direction })}
        />
        <WeightStepper
          label={`${criterion.name} weight`}
          value={weight}
          invalid={!(Number(weight) > 0)}
          onChange={setWeight}
          onCommit={commitWeight}
        />
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Rename ${criterion.name}`}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(criterion)}
            aria-label={`Delete ${criterion.name}`}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </li>
  );
}

/** docs/07 §5 — criteria & weights editor (FR-005, BR-003/004). */
export function CriteriaTab() {
  const { decisionId = "" } = useParams();
  const { data: criteria, isLoading, isError, error, refetch } = useCriteria(decisionId);
  const remove = useDeleteCriterion(decisionId);
  const [pendingDelete, setPendingDelete] = useState<Criterion | null>(null);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-[74px] rounded-xl" />
        <Skeleton className="h-[74px] rounded-xl" />
      </div>
    );
  }
  if (isError || !criteria) return <ErrorState error={error} onRetry={() => refetch()} />;

  const active = criteria.filter((c) => c.is_active);
  const totalWeight = active.reduce((sum, c) => sum + Number(c.weight), 0);

  const confirmDelete = () => {
    if (!pendingDelete) return;
    remove.mutate(pendingDelete.id, {
      onSuccess: () => {
        toast.success(`Removed “${pendingDelete.name}”`);
        setPendingDelete(null);
      },
      onError: (err) => toast.error("Couldn't delete", errorText(err)),
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Criteria & weights</h2>
          <p className="text-sm text-muted">Weights are relative — they're normalised to 100% automatically.</p>
        </div>
        {active.length > 0 && (
          <ButtonLink to="../scores" variant="soft" size="sm">
            Next: scores
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </ButtonLink>
        )}
      </div>

      {active.length > 0 && (
        <div className="card p-5">
          <p className="mb-3 text-sm font-medium">Weight distribution</p>
          <WeightBar items={active.map((c) => ({ key: c.id, name: c.name, weight: Number(c.weight) }))} />
        </div>
      )}

      <AddCriterionForm
        decisionId={decisionId}
        nextPosition={criteria.reduce((max, c) => Math.max(max, c.position + 1), criteria.length)}
      />

      {criteria.length === 0 ? (
        <EmptyState
          icon={SlidersHorizontal}
          title="No criteria yet"
          description="What should your options be judged on? Add at least one criterion to rank."
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {criteria.map((c, i) => (
            <CriterionRow
              key={c.id}
              criterion={c}
              index={i}
              share={c.is_active && totalWeight > 0 ? Number(c.weight) / totalWeight : null}
              decisionId={decisionId}
              onDelete={setPendingDelete}
            />
          ))}
        </ul>
      )}

      {criteria.length > 0 && active.length === 0 && (
        <p className="text-sm text-warning">Every criterion is switched off. Include at least one to rank.</p>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        isLoading={remove.isPending}
        title="Delete this criterion?"
        description={
          <>
            <span className="font-medium text-text">{pendingDelete?.name}</span> and all scores given against it will be
            removed. To keep the scores, switch it off instead.
          </>
        }
        confirmLabel="Delete criterion"
      />
    </div>
  );
}
