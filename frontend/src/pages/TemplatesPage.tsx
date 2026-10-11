import { FlaskConical, LayoutTemplate } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "@/api/client";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/Dialog";
import { CoverflowCarousel } from "@/components/effects/CoverflowCarousel";
import { Tilt } from "@/components/effects/Tilt";
import { EmptyState, ErrorState, Skeleton } from "@/components/States";
import { TemplateCard } from "@/features/templates/components/TemplateCard";
import { UseTemplateDialog } from "@/features/templates/components/UseTemplateDialog";
import { useCreateDemo, useDeleteTemplate, useTemplates } from "@/features/templates/hooks";
import { toast } from "@/stores/toastStore";
import type { Template } from "@/types/template";

function Grid({ children, label }: { children: ReactNode; label: string }) {
  return (
    <ul aria-label={label} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {children}
    </ul>
  );
}

/** FX-01 / FX-16 / FX-20 — start from a catalogue or personal template, or explore the sample. */
export function TemplatesPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useTemplates();
  const remove = useDeleteTemplate();
  const demo = useCreateDemo();
  const [using, setUsing] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);

  const builtin = (data ?? []).filter((t) => t.kind === "builtin");
  const mine = (data ?? []).filter((t) => t.kind === "mine");

  const startDemo = () =>
    demo.mutate(undefined, {
      onSuccess: (decision) => navigate(`/app/decisions/${decision.id}/ranking?tour=1`),
      onError: (e) =>
        toast.error("Couldn't create the sample", e instanceof ApiError ? e.message : undefined),
    });

  const confirmDelete = () => {
    if (!deleting) return;
    remove.mutate(deleting.id, {
      onSuccess: () => {
        toast.success(`Deleted “${deleting.name}”`);
        setDeleting(null);
      },
      onError: (e) => toast.error("Couldn't delete", e instanceof ApiError ? e.message : undefined),
    });
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Templates</p>
          <h1 className="mt-2 text-title">Start from a template</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Pre-built criteria, weights and directions for common decisions. You add the options and
            adjust anything you like.
          </p>
        </div>
        <Button variant="secondary" onClick={startDemo} isLoading={demo.isPending}>
          <FlaskConical className="h-4 w-4" aria-hidden="true" />
          Try the sample decision
        </Button>
      </div>

      {isLoading ? (
        <Grid label="Loading templates">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i}>
              <Skeleton className="h-64 rounded-xl" />
            </li>
          ))}
        </Grid>
      ) : isError ? (
        <ErrorState title="Couldn't load templates" error={error} onRetry={() => refetch()} />
      ) : (
        <>
          <section aria-labelledby="builtin-heading">
            <h2 id="builtin-heading" className="mb-4 text-lg font-semibold tracking-tight">
              Built-in
            </h2>
            {/* TODO: reuse CoverflowCarousel for example gallery when FX-21 lands */}
            <CoverflowCarousel
              items={builtin}
              getKey={(t) => t.id}
              getLabel={(t) => t.name}
              label="Built-in templates"
              itemNoun="template"
              height="22rem"
              renderItem={(t) => <TemplateCard template={t} onUse={setUsing} />}
            />
          </section>

          <section aria-labelledby="mine-heading">
            <h2 id="mine-heading" className="mb-4 text-lg font-semibold tracking-tight">
              My templates
            </h2>
            {mine.length === 0 ? (
              <EmptyState
                icon={LayoutTemplate}
                title="No saved templates yet"
                description="Open any decision and choose “Save as template” to reuse its criteria and weights."
              />
            ) : (
              <Grid label="My templates">
                {mine.map((t) => (
                  <li key={t.id}>
                    <Tilt className="h-full">
                      <TemplateCard template={t} onUse={setUsing} onDelete={setDeleting} />
                    </Tilt>
                  </li>
                ))}
              </Grid>
            )}
          </section>
        </>
      )}

      <UseTemplateDialog template={using} onClose={() => setUsing(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        isLoading={remove.isPending}
        title="Delete this template?"
        description={
          <>
            <span className="font-medium text-text">{deleting?.name}</span> will be removed.
            Decisions you already created from it are not affected.
          </>
        }
        confirmLabel="Delete template"
      />
    </div>
  );
}
