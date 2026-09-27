import { CircleAlert, type LucideIcon, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { ApiError } from "@/api/client";

import { Button } from "./Button";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** docs/07 §7 — every empty view explains itself and offers the next action. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center rounded-xl border border-dashed border-border-strong bg-surface/60 px-6 py-12 text-center ${className}`}
    >
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  error?: unknown;
  onRetry?: () => void;
}

/** Page-level error with retry and a subtle correlation id (docs/07 §7). */
export function ErrorState({ title = "Something went wrong", error, onRetry }: ErrorStateProps) {
  const message =
    error instanceof ApiError && (error.status ?? 0) < 500
      ? error.message
      : "We couldn't reach the server. Check your connection and try again.";
  const requestId = error instanceof ApiError ? error.requestId : undefined;

  return (
    <div
      role="alert"
      className="flex flex-col items-center rounded-xl border border-danger/25 bg-danger/5 px-6 py-10 text-center"
    >
      <CircleAlert className="mb-3 h-6 w-6 text-danger" aria-hidden="true" />
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Try again
        </Button>
      )}
      {requestId && <p className="mt-3 font-mono text-[11px] text-muted/80">Ref {requestId}</p>}
    </div>
  );
}
