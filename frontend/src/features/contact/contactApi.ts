import { apiClient } from "@/api/client";
import type { ContactValues } from "@/schemas/contact";

/** A public endpoint; contact content stays in the product database. */
export async function submitContact(values: ContactValues): Promise<void> {
  const response = await apiClient.post<{ ok: boolean }>("/contact", values, { timeout: 15_000 });
  if (response.data.ok !== true) throw new Error("Contact submission was not accepted.");
}
