import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";

import { ApiError } from "@/api/client";
import { Button } from "@/components/Button";
import { FormField } from "@/components/FormField";
import { type RegisterFormValues, registerSchema } from "@/schemas/auth";
import { useAuthStore } from "@/stores/authStore";

import { registerRequest } from "../api";

export function RegisterForm() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterFormValues>({ resolver: zodResolver(registerSchema) });

  const mutation = useMutation({
    mutationFn: registerRequest,
    onSuccess: ({ user, access }) => {
      setAuth(user, access);
      navigate("/app", { replace: true });
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.fields) {
        for (const [field, messages] of Object.entries(error.fields)) {
          setError(field as keyof RegisterFormValues, { message: messages[0] });
        }
      } else if (error instanceof ApiError) {
        setError("email", { message: error.message });
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
        autoComplete="new-password"
        hint="At least 10 characters."
        error={errors.password?.message}
        {...register("password")}
      />
      <Button type="submit" isLoading={mutation.isPending}>
        Create account
      </Button>
    </form>
  );
}
