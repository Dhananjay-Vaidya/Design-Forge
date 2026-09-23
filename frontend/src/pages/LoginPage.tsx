import { Link } from "react-router-dom";

import { LoginForm } from "@/features/auth/components/LoginForm";

export function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-text/60">
          New here?{" "}
          <Link to="/register" className="text-primary underline">
            Create an account
          </Link>
        </p>
      </div>
      <LoginForm />
    </main>
  );
}
