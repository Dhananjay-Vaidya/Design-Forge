import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "@/api/client";
import { decisionKeys } from "@/features/decisions/hooks";
import { toast } from "@/stores/toastStore";

import { saveScaffold } from "./draftApi";
import { clearDraft, loadDraft } from "./draftStore";

/**
 * Mounted in the signed-in shell: right after sign-up or log-in, a home-page draft waiting in this tab
 * becomes a real decision and the person lands on its Scores tab. Renders nothing.
 */
export function DraftHandoff() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const draft = loadDraft();
    if (!draft) return;

    saveScaffold(draft.scaffold, draft.token)
      .then(async (decision) => {
        clearDraft();
        await qc.invalidateQueries({ queryKey: decisionKeys.list() });
        toast.success("Your draft is saved", "Now score each option. Weights start equal.");
        navigate(`/app/decisions/${decision.id}/scores`, { replace: true });
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 400) {
          // Expired, already saved, or no longer valid: don't retry it forever.
          clearDraft();
          toast.info("That draft had expired", "Here's a fresh decision to start from.");
          navigate("/app/decisions/new", { replace: true });
        } else {
          // Network or server trouble: keep the draft so the next visit can try again.
          toast.error(
            "Couldn't save your draft yet",
            "It's kept in this tab. Reload to try again.",
          );
        }
      });
  }, [navigate, qc]);

  return null;
}
