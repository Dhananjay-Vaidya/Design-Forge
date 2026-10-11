import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/api/client";
import { submitContact } from "@/features/contact/contactApi";

const values = {
  name: "Sam",
  email: "sam@example.com",
  reason: "general" as const,
  message: "A product question.",
  consent: true,
  website: "",
};
afterEach(() => vi.restoreAllMocks());

describe("public contact transport", () => {
  it("posts the complete consented payload to the API and accepts only an acknowledged receipt", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ data: { ok: true } });
    await expect(submitContact(values)).resolves.toBeUndefined();
    expect(post).toHaveBeenCalledWith("/contact", values, { timeout: 15_000 });
  });
  it("does not show success for an unexpected server response", async () => {
    vi.spyOn(apiClient, "post").mockResolvedValue({ data: {} });
    await expect(submitContact(values)).rejects.toThrow("Contact submission was not accepted.");
  });
});
