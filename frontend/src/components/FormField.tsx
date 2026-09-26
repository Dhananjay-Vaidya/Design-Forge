import { Eye, EyeOff } from "lucide-react";
import {
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  forwardRef,
  useId,
  useState,
} from "react";

interface FieldChromeProps {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
}

function describedBy(id: string, error?: string, hint?: string) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

function FieldMessages({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (error) {
    return (
      <p id={`${id}-error`} role="alert" className="text-[13px] font-medium text-danger">
        {error}
      </p>
    );
  }
  if (hint) {
    return (
      <p id={`${id}-hint`} className="text-[13px] text-muted">
        {hint}
      </p>
    );
  }
  return null;
}

function FieldLabel({ htmlFor, label, optional }: { htmlFor: string; label: string; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="flex items-baseline justify-between text-sm font-medium text-text">
      {label}
      {optional && <span className="text-xs font-normal text-muted">Optional</span>}
    </label>
  );
}

type FormFieldProps = FieldChromeProps & InputHTMLAttributes<HTMLInputElement>;

/**
 * NFR-005: every control has a programmatic label; errors are announced via aria-describedby.
 * Password inputs get a show/hide toggle.
 */
export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, error, hint, optional, id, type, className = "", ...props }, ref) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    const [revealed, setRevealed] = useState(false);
    const isPassword = type === "password";

    return (
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={inputId} label={label} optional={optional} />
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={isPassword && revealed ? "text" : type}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy(inputId, error, hint)}
            className={`input-base ${isPassword ? "pr-11" : ""} ${className}`}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              aria-label={revealed ? "Hide password" : "Show password"}
              aria-pressed={revealed}
              className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-lg text-muted transition-colors hover:text-text"
            >
              {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
        <FieldMessages id={inputId} error={error} hint={hint} />
      </div>
    );
  },
);
FormField.displayName = "FormField";

type TextAreaFieldProps = FieldChromeProps & TextareaHTMLAttributes<HTMLTextAreaElement>;

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  ({ label, error, hint, optional, id, className = "", ...props }, ref) => {
    const autoId = useId();
    const inputId = id ?? autoId;

    return (
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={inputId} label={label} optional={optional} />
        <textarea
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy(inputId, error, hint)}
          className={`input-base min-h-24 resize-y py-2.5 leading-relaxed ${className}`}
          {...props}
        />
        <FieldMessages id={inputId} error={error} hint={hint} />
      </div>
    );
  },
);
TextAreaField.displayName = "TextAreaField";
