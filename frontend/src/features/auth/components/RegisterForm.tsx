import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";

import { ApiError } from "@/api/client";
import { Button } from "@/components/Button";
import { FormField } from "@/components/FormField";
import { type RegisterFormValues, registerSchema } from "@/schemas/auth";
import { useAuthStore } from "@/stores/authStore";

import { registerRequest } from "../api";

const MIN_PASSWORD = 10;

export function RegisterForm() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<RegisterFormValues>({ resolver: zodResolver(registerSchema) });
  const passwordLength = watch("password")?.length ?? 0;
  const lengthMet = passwordLength >= MIN_PASSWORD;

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
      } else {
        setError("email", { message: "We couldn't reach the server. Try again." });
      }
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      className="flex flex-col gap-5"
      noValidate
    >
      <FormField
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        error={errors.email?.message}
        {...register("email")}
      />
      <div className="flex flex-col gap-2">
        <FormField
          label="Password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register("password")}
        />
        {!errors.password && (
          <p
            className={`flex items-center gap-1.5 text-[13px] transition-colors ${lengthMet ? "text-success" : "text-muted"}`}
          >
            <Check
              className={`h-3.5 w-3.5 transition-opacity ${lengthMet ? "opacity-100" : "opacity-40"}`}
              aria-hidden="true"
            />
            At least {MIN_PASSWORD} characters
          </p>
        )}
      </div>
      <Button type="submit" size="lg" className="mt-1 w-full" isLoading={mutation.isPending}>
        {mutation.isPending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
