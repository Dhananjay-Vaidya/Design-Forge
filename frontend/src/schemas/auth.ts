import { z } from "zod";

/** Mirrors apps/accounts/serializers.py RegisterSerializer — VLD-01/VLD-02. */
export const registerSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(10, "Password must be at least 10 characters."),
});
export type RegisterFormValues = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});
export type LoginFormValues = z.infer<typeof loginSchema>;
