import { FlaskConical, Play, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "@/api/client";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/Dialog";
import { toast } from "@/stores/toastStore";

import { useCreateDemo, useDemoStatus } from "../hooks";

interface DemoBannerProps {
  decisionId: string;
  onStartTour: () => void;
}

/** Shown only on the user's own sample decision (FX-20): explains it and offers tour and reset. */
export function DemoBanner({ decisionId, onStartTour }: DemoBannerProps) {
  const navigate = useNavigate();
  const { data } = useDemoStatus();
  const reset = useCreateDemo();
  const [confirming, setConfirming] = useState(false);

  if (data?.decision_id !== decisionId) return null;

  // mutateAsync, not mutate(callbacks): the old sample no longer exists once this resolves, and
  // per-call callbacks are dropped if this component unmounts first.
  const doReset = async () => {
    try {
      const decision = await reset.mutateAsync();
      setConfirming(false);
      toast.success("Sample reset", "A fresh copy is ready to explore.");
      navigate(`/app/decisions/${decision.id}/ranking`);
    } catch (e) {
      toast.error("Couldn't reset the sample", e instanceof ApiError ? e.message : undefined);
    }
  };

  return (
    <>
      <div
        role="note"
        aria-label="Sample decision"
        className="glass flex flex-col gap-3 rounded-2xl px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="flex items-start gap-2.5 text-sm">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <span className="font-medium">This is a sample decision.</span>{" "}
            <span className="text-muted">Edit anything to see how the ranking responds.</span>
          </span>
        </p>
        <div className="flex gap-2">
          <Button variant="soft" size="sm" onClick={onStartTour}>
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            Take the tour
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset sample
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={doReset}
        isLoading={reset.isPending}
        tone="primary"
        title="Reset the sample decision?"
        description="Your changes to the sample will be discarded and a fresh copy created. Your own decisions are not affected."
        confirmLabel="Reset sample"
      />
    </>
  );
}
