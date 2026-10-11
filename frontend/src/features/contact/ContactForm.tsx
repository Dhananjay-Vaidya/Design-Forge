import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Check } from "lucide-react";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";

import { ApiError } from "@/api/client";
import { Button } from "@/components/Button";
import { FormField, TextAreaField } from "@/components/FormField";
import { about } from "@/content/about";
import { contactSchema, type ContactValues } from "@/schemas/contact";
import { submitContact } from "./contactApi";

const defaultValues: ContactValues = {
  name: "",
  email: "",
  reason: "general",
  message: "",
  consent: false,
  website: "",
};
const fieldNames = ["name", "email", "reason", "message", "consent"] as const;

export function ContactForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const receiptRef = useRef<HTMLDivElement>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ContactValues>({ resolver: zodResolver(contactSchema), defaultValues });
  const message = watch("message");

  async function send(values: ContactValues) {
    setNotice("");
    try {
      await submitContact(values);
      setSentTo(values.email);
      requestAnimationFrame(() => receiptRef.current?.focus());
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        setNotice(about.contact.rateLimited(error.retryAfterSeconds ?? 60));
      } else if (error instanceof ApiError && error.fields) {
        let focus = true;
        for (const field of fieldNames) {
          const errorMessage = error.fields[field]?.[0];
          if (errorMessage) {
            setError(field, { type: "server", message: errorMessage }, { shouldFocus: focus });
            focus = false;
          }
        }
        setNotice(about.contact.invalid);
      } else {
        setNotice(about.contact.error);
      }
    }
  }

  if (sentTo !== null)
    return (
      <div
        ref={receiptRef}
        tabIndex={-1}
        className="rounded-2xl border border-primary/25 bg-primary-soft p-6 sm:p-8"
      >
        <div role="status" aria-live="polite">
          <Check size={24} className="text-primary" aria-hidden="true" />
          <h3 className="mt-4 text-xl font-semibold">{about.contact.successTitle}</h3>
          <p className="mt-3 break-words text-sm leading-relaxed text-muted">
            {about.contact.successText(sentTo)}
          </p>
        </div>
        <Button
          variant="secondary"
          className="mt-6"
          onClick={() => {
            reset(defaultValues);
            setSentTo(null);
            setNotice("");
            requestAnimationFrame(() => document.getElementById("contact-name")?.focus());
          }}
        >
          {about.contact.another}
        </Button>
      </div>
    );

  return (
    <form
      aria-label="Contact DecisionForge"
      noValidate
      onSubmit={handleSubmit(send, () => setNotice(about.contact.invalid))}
      className="min-w-0 rounded-2xl border border-border bg-surface p-5 shadow-lift sm:p-8"
    >
      <fieldset disabled={isSubmitting} className="min-w-0 space-y-5">
        <legend className="sr-only">Send a message</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            id="contact-name"
            label={about.contact.fields.name}
            autoComplete="name"
            maxLength={80}
            required
            error={errors.name?.message}
            {...register("name")}
          />
          <FormField
            id="contact-email"
            label={about.contact.fields.email}
            type="email"
            autoComplete="email"
            maxLength={254}
            required
            error={errors.email?.message}
            {...register("email")}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="contact-reason" className="text-sm font-medium">
            {about.contact.fields.reason}
          </label>
          <select
            id="contact-reason"
            className="input-base min-h-11"
            aria-invalid={Boolean(errors.reason)}
            aria-describedby={errors.reason ? "contact-reason-error" : undefined}
            {...register("reason")}
          >
            {about.contact.reasons.map((reason) => (
              <option key={reason.value} value={reason.value}>
                {reason.label}
              </option>
            ))}
          </select>
          {errors.reason && (
            <p id="contact-reason-error" role="alert" className="text-[13px] text-danger">
              {errors.reason.message}
            </p>
          )}
        </div>
        <div>
          <TextAreaField
            id="contact-message"
            label={about.contact.fields.message}
            rows={6}
            maxLength={2000}
            required
            hint={about.contact.messageHint}
            error={errors.message?.message}
            {...register("message")}
          />
          <p
            className="mt-2 text-right font-mono text-xs text-muted"
            aria-label={`${message.length} of 2000 characters`}
          >
            {message.length} / 2,000
          </p>
        </div>
        <div className="sr-only" aria-hidden="true">
          <label htmlFor="contact-website">Website</label>
          <input
            id="contact-website"
            type="text"
            autoComplete="off"
            tabIndex={-1}
            maxLength={200}
            {...register("website")}
          />
        </div>
        <div>
          <label
            htmlFor="contact-consent"
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg text-sm leading-relaxed"
          >
            <input
              id="contact-consent"
              type="checkbox"
              required
              className="h-5 w-5 shrink-0 accent-primary"
              aria-invalid={Boolean(errors.consent)}
              aria-describedby={errors.consent ? "contact-consent-error" : undefined}
              {...register("consent")}
            />
            <span>{about.contact.consent}</span>
          </label>
          {errors.consent && (
            <p id="contact-consent-error" role="alert" className="mt-1 text-[13px] text-danger">
              {errors.consent.message}
            </p>
          )}
          <Link
            to="/privacy"
            className="ml-8 inline-flex min-h-11 items-center rounded-lg text-xs font-medium text-muted underline decoration-border underline-offset-4 hover:text-primary"
          >
            {about.contact.privacyLink}
          </Link>
        </div>
      </fieldset>
      {notice && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-danger/25 bg-danger/5 p-3 text-sm leading-relaxed text-danger"
        >
          {notice}
        </p>
      )}
      <div className="mt-5 flex justify-end border-t border-border pt-5">
        <Button type="submit" isLoading={isSubmitting}>
          {about.contact.submit}
          <ArrowRight size={16} aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}
