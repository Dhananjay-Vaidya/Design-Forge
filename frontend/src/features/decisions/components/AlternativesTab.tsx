import { ArrowDown, ArrowRight, ArrowUp, Check, Layers, Pencil, Plus, Trash2, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import { Button, ButtonLink } from "@/components/Button";
import { ConfirmDialog } from "@/components/Dialog";
import { FormField } from "@/components/FormField";
import { EmptyState, ErrorState, Skeleton } from "@/components/States";
import { toast } from "@/stores/toastStore";
import type { Alternative } from "@/types/decision";

import {
  useAlternatives,
  useCreateAlternative,
  useDeleteAlternative,
  useReorderAlternatives,
  useUpdateAlternative,
} from "../hooks";

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : "Check your connection and try again.");

function AddAlternativeForm({ decisionId, nextPosition }: { decisionId: string; nextPosition: number }) {
  const create = useCreateAlternative(decisionId);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Give the option a name.");
    create.mutate(
      { name: name.trim(), description: description.trim(), position: nextPosition },
      {
        onSuccess: () => {
          setName("");
          setDescription("");
          setError(null);
        },
        onError: (err) => setError(errorText(err)),
      },
    );
  };

  return (
    <form onSubmit={submit} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-start" noValidate>
      <div className="flex-1">
        <FormField
          label="Option name"
          placeholder="e.g. Offer C — agency"
          value={name}
          maxLength={200}
          error={error ?? undefined}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
      </div>
      <div className="flex-[1.3]">
        <FormField
          label="Short note"
          optional
          placeholder="Anything that sets it apart"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <Button type="submit" className="h-11 sm:mt-[26px]" isLoading={create.isPending}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add option
      </Button>
    </form>
  );
}

interface RowProps {
  alternative: Alternative;
  index: number;
  count: number;
  decisionId: string;
  onMove: (from: number, to: number) => void;
  onDelete: (alt: Alternative) => void;
  isReordering: boolean;
}

function AlternativeRow({ alternative, index, count, decisionId, onMove, onDelete, isReordering }: RowProps) {
  const update = useUpdateAlternative(decisionId);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(alternative.name);
  const [description, setDescription] = useState(alternative.description);

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    update.mutate(
      { altId: alternative.id, body: { name: name.trim(), description: description.trim() } },
      {
        onSuccess: () => setEditing(false),
        onError: (err) => toast.error("Couldn't save the option", errorText(err)),
      },
    );
  };

  const iconBtn =
    "flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-30";

  return (
    <li className="group card flex animate-rise items-start gap-4 p-4" style={{ animationDelay: `${index * 30}ms` }}>
      <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 font-mono text-xs text-muted">
        {index + 1}
      </span>
      {editing ? (
        <form onSubmit={save} className="flex flex-1 flex-col gap-2.5" noValidate>
          <input
            className="input-base min-h-10"
            value={name}
            maxLength={200}
            aria-label="Option name"
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
          />
          <input
            className="input-base min-h-10 text-sm"
            value={description}
            placeholder="Short note (optional)"
            aria-label="Short note"
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" isLoading={update.isPending} disabled={!name.trim()}>
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setName(alternative.name);
                setDescription(alternative.description);
                setEditing(false);
              }}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="font-medium">{alternative.name}</p>
            {alternative.description && <p className="mt-0.5 text-sm text-muted">{alternative.description}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              className={iconBtn}
              onClick={() => onMove(index, index - 1)}
              disabled={index === 0 || isReordering}
              aria-label={`Move ${alternative.name} up`}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={iconBtn}
              onClick={() => onMove(index, index + 1)}
              disabled={index === count - 1 || isReordering}
              aria-label={`Move ${alternative.name} down`}
            >
              <ArrowDown className="h-4 w-4" />
            </button>
            <button type="button" className={iconBtn} onClick={() => setEditing(true)} aria-label={`Edit ${alternative.name}`}>
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={`${iconBtn} hover:bg-danger/10 hover:text-danger`}
              onClick={() => onDelete(alternative)}
              aria-label={`Delete ${alternative.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </li>
  );
}

/** docs/07 §5 — alternatives editor (FR-004, BR-002). */
export function AlternativesTab() {
  const { decisionId = "" } = useParams();
  const { data: alternatives, isLoading, isError, error, refetch } = useAlternatives(decisionId);
  const reorder = useReorderAlternatives(decisionId);
  const remove = useDeleteAlternative(decisionId);
  const [pendingDelete, setPendingDelete] = useState<Alternative | null>(null);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-[90px] rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
      </div>
    );
  }
  if (isError || !alternatives) return <ErrorState error={error} onRetry={() => refetch()} />;

  const move = (from: number, to: number) => {
    const ordered = [...alternatives];
    const [item] = ordered.splice(from, 1);
    ordered.splice(to, 0, item);
    reorder.mutate(
      ordered.map((a) => ({ id: a.id, position: a.position })),
      { onError: (err) => toast.error("Couldn't reorder", errorText(err)) },
    );
  };

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

  const needed = Math.max(0, 2 - alternatives.length);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Options</h2>
          <p className="text-sm text-muted">The alternatives you're choosing between. Order is only for display.</p>
        </div>
        {needed === 0 && (
          <ButtonLink to="../criteria" variant="soft" size="sm">
            Next: criteria
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </ButtonLink>
        )}
      </div>

      <AddAlternativeForm
        decisionId={decisionId}
        nextPosition={alternatives.reduce((max, a) => Math.max(max, a.position + 1), alternatives.length)}
      />

      {alternatives.length === 0 ? (
        <EmptyState icon={Layers} title="No options yet" description="Add the alternatives you're weighing up. You need at least two to rank them." />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {alternatives.map((alt, i) => (
            <AlternativeRow
              key={alt.id}
              alternative={alt}
              index={i}
              count={alternatives.length}
              decisionId={decisionId}
              onMove={move}
              onDelete={setPendingDelete}
              isReordering={reorder.isPending}
            />
          ))}
        </ul>
      )}

      {needed > 0 && alternatives.length > 0 && (
        <p className="text-sm text-warning">Add {needed} more option to enable ranking.</p>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        isLoading={remove.isPending}
        title="Delete this option?"
        description={
          <>
            <span className="font-medium text-text">{pendingDelete?.name}</span> and every score you've given it will be
            removed.
          </>
        }
        confirmLabel="Delete option"
      />
    </div>
  );
}
