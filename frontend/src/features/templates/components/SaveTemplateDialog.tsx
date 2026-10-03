import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "@/api/client";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { FormField, TextAreaField } from "@/components/FormField";
import { toast } from "@/stores/toastStore";

import { useSaveTemplate } from "../hooks";

function SaveTemplateForm({
  decisionId,
  decisionTitle,
  onClose,
}: {
  decisionId: string;
  decisionTitle: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const save = useSaveTemplate();
  const [name, setName] = useState(decisionTitle.slice(0, 120));
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<{ name?: string; decision_id?: string }>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setErrors({ name: "Give the template a name." });
    setErrors({});
    save.mutate(
      { decision_id: decisionId, name: name.trim(), description: description.trim() },
      {
        onSuccess: () => {
          toast.success("Template saved", "Find it under Templates.");
          onClose();
          navigate("/app/templates");
        },
        onError: (error) => {
          if (error instanceof ApiError && error.fields) {
            setErrors({ name: error.fields.name?.[0], decision_id: error.fields.decision_id?.[0] });
          } else {
            toast.error(
              "Couldn't save the template",
              error instanceof ApiError ? error.message : undefined,
            );
          }
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormField
        label="Template name"
        value={name}
        maxLength={120}
        autoFocus
        error={errors.name ?? errors.decision_id}
        onChange={(e) => setName(e.target.value)}
      />
      <TextAreaField
        label="Description"
        optional
        rows={3}
        maxLength={500}
        value={description}
        hint="Saves this decision's active criteria, weights and directions. Options and scores stay with the decision."
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" isLoading={save.isPending}>
          Save template
        </Button>
      </div>
    </form>
  );
}

interface SaveTemplateDialogProps {
  decisionId: string;
  decisionTitle: string;
  open: boolean;
  onClose: () => void;
}

export function SaveTemplateDialog({
  decisionId,
  decisionTitle,
  open,
  onClose,
}: SaveTemplateDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Save as template">
      <SaveTemplateForm decisionId={decisionId} decisionTitle={decisionTitle} onClose={onClose} />
    </Dialog>
  );
}
