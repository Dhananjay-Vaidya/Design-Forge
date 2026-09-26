import { ArrowLeft } from "lucide-react";

import { ButtonLink } from "@/components/Button";
import { Logo } from "@/components/Logo";

export function NotFoundPage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div
        className="grid-texture absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_65%)]"
        aria-hidden="true"
      />
      <Logo withWordmark={false} />
      <p className="mt-8 font-mono text-sm text-primary">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">This page doesn't exist</h1>
      <p className="mt-3 max-w-sm text-muted">
        The link may be broken, or the page may have moved. Let's get you back on track.
      </p>
      <ButtonLink to="/" variant="secondary" className="mt-8">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to home
      </ButtonLink>
    </main>
  );
}
