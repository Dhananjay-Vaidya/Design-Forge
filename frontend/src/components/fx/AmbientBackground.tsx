interface AmbientBackgroundProps {
  className?: string;
  /** "hero" is brighter and larger; "app" is a quiet wash behind working screens. */
  variant?: "hero" | "app";
}

/**
 * Slow-drifting aurora blobs + faint grid. Purely decorative (aria-hidden), GPU-only transforms,
 * and frozen by the global prefers-reduced-motion rule.
 */
export function AmbientBackground({ className = "", variant = "app" }: AmbientBackgroundProps) {
  const hero = variant === "hero";
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`}
    >
      <div
        className="aurora-blob aurora-a"
        style={{
          width: hero ? "46rem" : "38rem",
          height: hero ? "46rem" : "38rem",
          left: hero ? "-8rem" : "-12rem",
          top: hero ? "-14rem" : "-18rem",
          background: "rgb(var(--aurora-1))",
          opacity: "var(--aurora-opacity)",
        }}
      />
      <div
        className="aurora-blob aurora-b"
        style={{
          width: hero ? "40rem" : "32rem",
          height: hero ? "40rem" : "32rem",
          right: hero ? "-10rem" : "-14rem",
          top: hero ? "2rem" : "-6rem",
          background: "rgb(var(--aurora-2))",
          opacity: "calc(var(--aurora-opacity) * 0.8)",
        }}
      />
      <div className="grid-texture absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_70%_55%_at_50%_0%,black,transparent)]" />
    </div>
  );
}
