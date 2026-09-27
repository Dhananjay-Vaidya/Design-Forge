import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Plus, X } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";

import { ApiError } from "@/api/client";
import { Button } from "@/components/Button";
import { FormField, TextAreaField } from "@/components/FormField";
import * as api from "@/features/decisions/api";
import {
  DirectionToggle,
  WeightBar,
  WeightStepper,
} from "@/features/decisions/components/CriterionControls";
import { decisionKeys } from "@/features/decisions/hooks";
import {
  CATEGORY_SUGGESTIONS,
  type DecisionDetailsValues,
  decisionDetailsSchema,
} from "@/schemas/decision";
import { toast } from "@/stores/toastStore";
import type { Direction } from "@/types/decision";

const STEPS = ["Details", "Options", "Criteria"] as const;

interface DraftOption {
  key: string;
  name: string;
}

interface DraftCriterion {
  key: string;
  name: string;
  weight: string;
  direction: Direction;
}

let keySeq = 0;
const nextKey = () => `k${++keySeq}`;

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Progress">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={label}
            className="flex flex-1 items-center gap-2 last:flex-none"
            aria-current={active ? "step" : undefined}
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                done
                  ? "bg-primary text-on-primary"
                  : active
                    ? "bg-primary-soft text-primary ring-2 ring-primary"
                    : "bg-surface-2 text-muted"
              }`}
            >
              {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
            </span>
            <span
              className={`text-sm font-medium ${active ? "text-text" : "text-muted"} max-sm:sr-only`}
            >
              {label}
              {done && <span className="sr-only"> (completed)</span>}
            </span>
            {i < STEPS.length - 1 && (
              <span
                className={`mx-1 h-px flex-1 ${done ? "bg-primary" : "bg-border"}`}
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function DetailsStep({
  initial,
  onNext,
}: {
  initial: DecisionDetailsValues;
  onNext: (values: DecisionDetailsValues) => void;
}) {
  const listId = useId();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DecisionDetailsValues>({
    resolver: zodResolver(decisionDetailsSchema),
    defaultValues: initial,
  });

  return (
    <form
      id="wizard-details"
      onSubmit={handleSubmit(onNext)}
      className="flex flex-col gap-5"
      noValidate
    >
      <FormField
        label="What are you deciding?"
        placeholder="e.g. Which job offer should I accept?"
        autoFocus
        error={errors.title?.message}
        {...register("title")}
      />
      <TextAreaField
        label="Context"
        optional
        placeholder="What's driving this decision? Any constraints worth remembering later?"
        hint="Future you will thank you for writing down why this mattered."
        {...register("context")}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <FormField
            label="Category"
            optional
            list={listId}
            placeholder="e.g. Career"
            error={errors.category?.message}
            {...register("category")}
          />
          <datalist id={listId}>
            {CATEGORY_SUGGESTIONS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <FormField label="Decide by" optional type="date" {...register("deadline")} />
      </div>
    </form>
  );
}

function OptionsStep({
  options,
  setOptions,
  onNext,
  error,
}: {
  options: DraftOption[];
  setOptions: (o: DraftOption[]) => void;
  onNext: () => void;
  error: string | null;
}) {
  const [name, setName] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const add = () => {
    const trimmed = name.trim();
    if (!trimmed) return setInputError("Type an option name first.");
    if (options.some((o) => o.name.toLowerCase() === trimmed.toLowerCase())) {
      return setInputError("You've already added that option.");
    }
    setOptions([...options, { key: nextKey(), name: trimmed.slice(0, 200) }]);
    setName("");
    setInputError(null);
    inputRef.current?.focus();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onNext();
  };

  return (
    <form id="wizard-options" onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <FormField
            ref={inputRef}
            label="Add an option"
            placeholder="e.g. Offer A — enterprise"
            value={name}
            error={inputError ?? undefined}
            onChange={(e) => {
              setName(e.target.value);
              setInputError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
        </div>
        <Button variant="secondary" className="mt-[26px] h-11" onClick={add}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add
        </Button>
      </div>

      {options.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="Options">
          {options.map((opt, i) => (
            <li
              key={opt.key}
              className="flex animate-rise items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-2 font-mono text-xs text-muted">
                {i + 1}
              </span>
              <span className="flex-1 truncate text-sm font-medium">{opt.name}</span>
              <button
                type="button"
                onClick={() => setOptions(options.filter((o) => o.key !== opt.key))}
                aria-label={`Remove ${opt.name}`}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-danger/10 hover:text-danger"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted">
          Add at least two options you're choosing between.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

function CriteriaStep({
  criteria,
  setCriteria,
  onNext,
  error,
}: {
  criteria: DraftCriterion[];
  setCriteria: (c: DraftCriterion[]) => void;
  onNext: () => void;
  error: string | null;
}) {
  const [name, setName] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const add = () => {
    const trimmed = name.trim();
    if (!trimmed) return setInputError("Type a criterion first.");
    if (criteria.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      return setInputError("You've already added that criterion.");
    }
    setCriteria([
      ...criteria,
      { key: nextKey(), name: trimmed.slice(0, 200), weight: "3", direction: "benefit" },
    ]);
    setName("");
    setInputError(null);
    inputRef.current?.focus();
  };

  const update = (key: string, patch: Partial<DraftCriterion>) =>
    setCriteria(criteria.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  return (
    <form
      id="wizard-criteria"
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
      className="flex flex-col gap-5"
      noValidate
    >
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <FormField
            ref={inputRef}
            label="Add a criterion"
            placeholder="e.g. Salary, commute, growth"
            value={name}
            error={inputError ?? undefined}
            onChange={(e) => {
              setName(e.target.value);
              setInputError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
        </div>
        <Button variant="secondary" className="mt-[26px] h-11" onClick={add}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add
        </Button>
      </div>

      {criteria.length > 0 ? (
        <>
          <ul className="flex flex-col gap-2" aria-label="Criteria">
            {criteria.map((c) => {
              const invalid = !(Number(c.weight) > 0);
              return (
                <li
                  key={c.key}
                  className="flex animate-rise flex-wrap items-center gap-x-3 gap-y-2.5 rounded-lg border border-border bg-surface px-3 py-2.5"
                >
                  <span className="min-w-0 flex-1 basis-40 truncate text-sm font-medium">
                    {c.name}
                  </span>
                  <DirectionToggle
                    size="sm"
                    label={`${c.name} direction`}
                    value={c.direction}
                    onChange={(direction) => update(c.key, { direction })}
                  />
                  <WeightStepper
                    label={`${c.name} weight`}
                    value={c.weight}
                    invalid={invalid}
                    onChange={(weight) => update(c.key, { weight })}
                  />
                  <button
                    type="button"
                    onClick={() => setCriteria(criteria.filter((x) => x.key !== c.key))}
                    aria-label={`Remove ${c.name}`}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-danger/10 hover:text-danger"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="rounded-lg bg-surface-2/70 p-4">
            <p className="mb-3 text-xs font-medium text-muted">How much each criterion counts</p>
            <WeightBar
              items={criteria.map((c) => ({
                key: c.key,
                name: c.name,
                weight: Number(c.weight) || 0,
              }))}
            />
          </div>
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted">
          What matters when comparing your options? Add at least one criterion.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

const STEP_COPY = [
  {
    title: "Frame the decision",
    text: "Start with the question. You can refine everything later.",
  },
  {
    title: "List your options",
    text: "The real alternatives on the table. You need at least two to rank.",
  },
  {
    title: "Choose your criteria",
    text: "What should the options be judged on, and how much does each matter?",
  },
];

/** docs/07 §5 — decision creation wizard (FR-003, BR-002/003). */
export function NewDecisionPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [details, setDetails] = useState<DecisionDetailsValues>({
    title: "",
    context: "",
    category: "",
    deadline: "",
  });
  const [options, setOptions] = useState<DraftOption[]>([]);
  const [criteria, setCriteria] = useState<DraftCriterion[]>([]);
  const [stepError, setStepError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (step > 0) headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  const goToOptions = (values: DecisionDetailsValues) => {
    setDetails(values);
    setStep(1);
  };

  const goToCriteria = () => {
    if (options.length < 2) return setStepError("Add at least two options to compare.");
    setStepError(null);
    setStep(2);
  };

  const create = async () => {
    if (criteria.length < 1) return setStepError("Add at least one criterion.");
    if (criteria.some((c) => !(Number(c.weight) > 0)))
      return setStepError("Every weight must be greater than zero.");
    setStepError(null);
    setIsCreating(true);

    let decisionId: string | null = null;
    try {
      const decision = await api.createDecision({
        title: details.title.trim(),
        context: details.context.trim(),
        category: details.category.trim(),
        deadline: details.deadline || null,
      });
      decisionId = decision.id;
      for (const [position, opt] of options.entries()) {
        await api.createAlternative(decision.id, { name: opt.name, position });
      }
      for (const [position, c] of criteria.entries()) {
        await api.createCriterion(decision.id, {
          name: c.name,
          weight: Number(c.weight),
          direction: c.direction,
          position,
        });
      }
      await qc.invalidateQueries({ queryKey: decisionKeys.all });
      toast.success("Decision created", "Now score each option against your criteria.");
      navigate(`/app/decisions/${decision.id}/scores`);
    } catch (error) {
      setIsCreating(false);
      const message =
        error instanceof ApiError ? error.message : "Check your connection and try again.";
      if (decisionId) {
        // The decision exists but setup was partial — hand over to the workspace to finish it.
        await qc.invalidateQueries({ queryKey: decisionKeys.all });
        toast.error("Some items weren't saved", `${message} You can finish setting up here.`);
        navigate(`/app/decisions/${decisionId}`);
      } else {
        toast.error("Couldn't create the decision", message);
      }
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        to="/app"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-text"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Dashboard
      </Link>

      <div className="mt-6">
        <Stepper current={step} />
      </div>

      <div className="card mt-6 p-6 shadow-soft sm:p-8">
        <div>
          <p className="eyebrow">
            Step {step + 1} of {STEPS.length}
          </p>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="mt-2 text-2xl font-semibold tracking-tight outline-none"
          >
            {STEP_COPY[step].title}
          </h1>
          <p className="mt-1.5 text-[15px] text-muted">{STEP_COPY[step].text}</p>
          <div className="mt-7">
            <div hidden={step !== 0}>
              <DetailsStep initial={details} onNext={goToOptions} />
            </div>
            <div hidden={step !== 1}>
              <OptionsStep
                options={options}
                setOptions={setOptions}
                onNext={goToCriteria}
                error={stepError}
              />
            </div>
            <div hidden={step !== 2}>
              <CriteriaStep
                criteria={criteria}
                setCriteria={setCriteria}
                onNext={create}
                error={stepError}
              />
              <section
                aria-label="Setup review"
                className="mt-6 rounded-xl border border-primary/20 bg-primary-soft/40 p-4"
              >
                <h2 className="text-sm font-semibold">Ready for the scoring table</h2>
                <p className="mt-2 text-sm">{details.title}</p>
                <p className="mt-1 text-xs text-muted">
                  {options.length} options · {criteria.length} criteria. You can refine these in the
                  workspace.
                </p>
              </section>
            </div>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-6">
          {step === 0 ? (
            <Link to="/app" className="text-sm font-medium text-muted hover:text-text">
              Cancel
            </Link>
          ) : (
            <Button
              variant="ghost"
              disabled={isCreating}
              onClick={() => {
                setStepError(null);
                setStep(step - 1);
              }}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </Button>
          )}
          <Button
            type="submit"
            form={["wizard-details", "wizard-options", "wizard-criteria"][step]}
            isLoading={isCreating}
          >
            {step === 2 ? (isCreating ? "Creating…" : "Create decision") : "Continue"}
            {step < 2 && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
