import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import { Button } from "@/components/Button";
import { FormField } from "@/components/FormField";
import { type LoginFormValues, loginSchema } from "@/schemas/auth";
import { useAuthStore } from "@/stores/authStore";

import { loginRequest } from "../api";

export function LoginForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  const mutation = useMutation({
    mutationFn: loginRequest,
    onSuccess: ({ user, access }) => {
      setAuth(user, access);
      navigate(searchParams.get("next") ?? "/app", { replace: true });
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError) {
        setError("password", { message: error.message });
      }
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      className="flex flex-col gap-4"
      noValidate
    >
      <FormField
        label="Email"
        type="email"
        autoComplete="email"
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
      <Button type="submit" isLoading={mutation.isPending}>
        Sign in
      </Button>
    </form>
  );
}
