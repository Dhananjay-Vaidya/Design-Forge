import { Link } from "react-router-dom";

import { AuthLayout } from "@/components/AuthLayout";
import { LoginForm } from "@/features/auth/components/LoginForm";

export function LoginPage() {
  return (
    <AuthLayout
      title="Welcome back"
      subtitle={
        <>
          New here?{" "}
          <Link to="/register" className="font-medium text-primary underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthLayout>
  );
}
