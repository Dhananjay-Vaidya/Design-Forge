import { z } from "zod";
import { about } from "@/content/about";

const messages = about.contact.validation;
export const contactSchema = z.object({
  name: z.string().trim().min(1, messages.nameRequired).max(80, messages.nameLength),
  email: z.string().trim().email(messages.email).max(254, messages.emailLength),
  reason: z.enum(["general", "feedback", "partnership", "support", "press"]),
  message: z.string().trim().min(1, messages.messageRequired).max(2000, messages.messageLength),
  consent: z.boolean().refine((value) => value, messages.consent),
  website: z.string().trim().max(200),
});

export type ContactValues = z.infer<typeof contactSchema>;
