import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import { Button } from "@/components/Button";
import { FormField } from "@/components/FormField";
import { type LoginFormValues, loginSchema } from "@/schemas/auth";
import { useAuthStore } from "@/stores/authStore";

import { loginRequest } from "../api";

/** Only same-origin app paths are honoured for `?next=` so it can't become an open redirect. */
function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/app";
}

export function LoginForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  const mutation = useMutation({
    mutationFn: loginRequest,
    onMutate: () => setFormError(null),
    onSuccess: ({ user, access }) => {
      setAuth(user, access);
      navigate(safeNext(searchParams.get("next")), { replace: true });
    },
    onError: (error: unknown) => {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "We couldn't reach the server. Check your connection and try again.",
      );
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      className="flex flex-col gap-5"
      noValidate
    >
      {formError && (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger/5 px-3.5 py-3 text-sm text-danger">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {formError}
        </div>
      )}
      <FormField
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        error={errors.email?.message}
        {...register("email")}
      />
      <FormField
        label="Password"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register("password")}
      />
      <Button type="submit" size="lg" className="mt-1 w-full" isLoading={mutation.isPending}>
        {mutation.isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
