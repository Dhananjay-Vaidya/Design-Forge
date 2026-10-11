import { Compass, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "@/api/client";
import { Button } from "@/components/Button";
import { useCreateDemo, useDemoStatus } from "@/features/templates/hooks";
import { toast } from "@/stores/toastStore";

import { hasSeenTour, markTourSeen } from "./seen";

/**
 * Opt-in first-run nudge on the dashboard: a dismissible "Take a quick tour" button, never an
 * overlay. The workspace tour runs on the sample decision (FX-20), so this opens the user's existing
 * sample (creating one would replace it and lose their edits) or creates one, and the workspace page
 * starts the tour from ?tour=1. Hidden once the tour has been seen or the nudge dismissed.
 */
export function WorkspaceTourNudge() {
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(() => hasSeenTour("workspace"));
  const demo = useDemoStatus();
  const create = useCreateDemo();

  if (hidden) return null;

  const open = (id: string) => navigate(`/app/decisions/${id}/ranking?tour=1`);
  const start = () => {
    const existing = demo.data?.decision_id;
    if (existing) return open(existing);
    create.mutate(undefined, {
      onSuccess: (decision) => open(decision.id),
      onError: (e) =>
        toast.error("Couldn't open the sample", e instanceof ApiError ? e.message : undefined),
    });
  };
  const dismiss = () => {
    markTourSeen("workspace");
    setHidden(true);
  };

  return (
    <div
      role="note"
      aria-label="Quick tour"
      className="glass flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl py-2 pl-4 pr-2"
    >
      <p className="flex min-w-0 flex-1 basis-56 items-center gap-2.5 text-sm">
        <Compass className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span>
          <span className="font-medium">New here?</span>{" "}
          <span className="text-muted">A one-minute walk through a sample decision.</span>
        </span>
      </p>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <Button
          variant="soft"
          size="sm"
          className="h-11 sm:h-9"
          onClick={start}
          isLoading={create.isPending}
          disabled={demo.isLoading}
        >
          Take a quick tour
        </Button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss the tour suggestion"
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-text sm:h-9 sm:w-9"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
