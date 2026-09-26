import { Link } from "react-router-dom";

import { AuthLayout } from "@/components/AuthLayout";
import { RegisterForm } from "@/features/auth/components/RegisterForm";

export function RegisterPage() {
  return (
    <AuthLayout
      title="Create your account"
      subtitle={
        <>
          Already have one?{" "}
          <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthLayout>
  );
}
