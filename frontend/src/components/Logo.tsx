interface LogoProps {
  className?: string;
  withWordmark?: boolean;
}

/** Stacked bars narrowing to a point: many options weighed down to one choice. */
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path
        d="M9 22h14M11 18h10M13 14h6M15 10h2"
        className="stroke-on-primary"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({ className = "", withWordmark = true }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark />
      {withWordmark && (
        <span className="text-[15px] font-semibold tracking-tight text-text">
          DecisionForge<span className="text-muted"> AI</span>
        </span>
      )}
    </span>
  );
}
