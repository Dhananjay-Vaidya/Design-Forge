import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "@/api/client";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { FormField, TextAreaField } from "@/components/FormField";
import { toast } from "@/stores/toastStore";
import type { Template } from "@/types/template";

import { useCreateFromTemplate } from "../hooks";

function UseTemplateForm({ template, onClose }: { template: Template; onClose: () => void }) {
  const navigate = useNavigate();
  const create = useCreateFromTemplate();
  const [title, setTitle] = useState(template.title_hint);
  const [optionsText, setOptionsText] = useState(template.option_hints.join("\n"));
  const [errors, setErrors] = useState<{ title?: string; options?: string }>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setErrors({ title: "Give the decision a title." });
    setErrors({});
    create.mutate(
      {
        template_id: template.id,
        title: title.trim(),
        options: optionsText
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      },
      {
        onSuccess: (decision) => {
          toast.success(
            "Decision created",
            `${template.criteria.length} criteria are ready to score.`,
          );
          onClose();
          navigate(`/app/decisions/${decision.id}`);
        },
        onError: (error) => {
          if (error instanceof ApiError && error.fields) {
            setErrors({ title: error.fields.title?.[0], options: error.fields.options?.[0] });
          } else {
            toast.error(
              "Couldn't create the decision",
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
        label="What are you deciding?"
        value={title}
        maxLength={200}
        autoFocus
        error={errors.title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <TextAreaField
        label="Your options"
        optional
        rows={4}
        value={optionsText}
        placeholder={"One per line, e.g.\nOffer A\nOffer B"}
        hint="You can add, rename or remove options later."
        error={errors.options}
        onChange={(e) => setOptionsText(e.target.value)}
      />
      <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
          Cancel
        </Button>
        <Button type="submit" isLoading={create.isPending}>
          {create.isPending ? "Creating…" : "Create decision"}
        </Button>
      </div>
    </form>
  );
}

interface UseTemplateDialogProps {
  template: Template | null;
  onClose: () => void;
}

export function UseTemplateDialog({ template, onClose }: UseTemplateDialogProps) {
  return (
    <Dialog
      open={template !== null}
      onClose={onClose}
      title={template ? `Use “${template.name}”` : "Use template"}
      description={
        template
          ? `Starts with ${template.criteria.length} criteria and sensible weights. You stay in control of every one.`
          : undefined
      }
    >
      {template && <UseTemplateForm key={template.id} template={template} onClose={onClose} />}
    </Dialog>
  );
}
