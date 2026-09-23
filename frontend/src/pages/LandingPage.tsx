import { Link } from "react-router-dom";

import { Button } from "@/components/Button";

export function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-3xl font-semibold sm:text-4xl">
        Turn a hard decision into a transparent, repeatable process.
      </h1>
      <p className="max-w-xl text-text/70">
        Score alternatives against weighted criteria and get a deterministic ranking. Optionally
        add Gemini-powered questions, risks, and scenarios — advisory only, never the final word.
      </p>
      <div className="flex gap-3">
        <Link to="/register">
          <Button>Get started</Button>
        </Link>
        <Link to="/login">
          <Button variant="secondary">Sign in</Button>
        </Link>
      </div>
    </main>
  );
}
