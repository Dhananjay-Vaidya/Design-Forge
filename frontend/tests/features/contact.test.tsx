import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
import { ContactEmail } from "@/features/contact/ContactEmail";
import { ContactForm } from "@/features/contact/ContactForm";
import * as api from "@/features/contact/contactApi";
import { contactSchema } from "@/schemas/contact";

vi.mock("@/features/contact/contactApi");
const valid = {
  name: "Sam",
  email: "sam@example.com",
  reason: "feedback" as const,
  message: "Please add shared reviews.",
  consent: true,
  website: "",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.submitContact).mockResolvedValue();
});

function renderForm() {
  return render(
    <MemoryRouter>
      <ContactForm />
    </MemoryRouter>,
  );
}
async function fillForm() {
  fireEvent.change(screen.getByLabelText("Name", { exact: true }), {
    target: { value: valid.name },
  });
  fireEvent.change(screen.getByLabelText("Email", { exact: true }), {
    target: { value: valid.email },
  });
  fireEvent.change(screen.getByLabelText("Reason", { exact: true }), {
    target: { value: valid.reason },
  });
  fireEvent.change(screen.getByLabelText("Message", { exact: true }), {
    target: { value: valid.message },
  });
  await userEvent.click(screen.getByRole("checkbox"));
}

describe("contact validation", () => {
  it("trims text and preserves the opt-in", () => {
    expect(
      contactSchema.parse({ ...valid, name: "  Sam  ", message: "  Feedback  " }),
    ).toMatchObject({ name: "Sam", message: "Feedback", consent: true });
  });
  it.each([
    { name: " " },
    { name: "a".repeat(81) },
    { email: "bad-address" },
    { message: "  " },
    { message: "a".repeat(2001) },
    { reason: "sales" },
    { consent: false },
    { consent: "true" },
    { website: "a".repeat(201) },
  ])("rejects invalid fields: %j", (invalid) => {
    expect(contactSchema.safeParse({ ...valid, ...invalid }).success).toBe(false);
  });
  it("accepts the message limit and includes the honeypot for server screening", () => {
    expect(
      contactSchema.safeParse({ ...valid, message: "a".repeat(2000), website: "bot.example" })
        .success,
    ).toBe(true);
  });
});

describe("contact form", () => {
  it("requires consent and valid fields before making a request", async () => {
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(api.submitContact).not.toHaveBeenCalled();
    expect(await screen.findByText("Enter your name.")).toBeVisible();
    expect(screen.getByText("Please agree to being contacted about this message.")).toBeVisible();
    const input = screen.getByLabelText("Name", { exact: true });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById(input.getAttribute("aria-describedby")!)).toHaveTextContent(
      "Enter your name.",
    );
  });
  it("sends the real payload, announces receipt, and can start another message", async () => {
    renderForm();
    await fillForm();
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(api.submitContact).toHaveBeenCalledWith(valid));
    expect(
      await screen.findByRole("heading", { name: "Thanks — your message is in." }),
    ).toBeVisible();
    expect(screen.getByText(/sam@example.com/)).toBeVisible();
    expect(screen.queryByText(/couple of days/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Send another message" }));
    expect(screen.getByLabelText("Message", { exact: true })).toHaveValue("");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
  it("disables fields and the send button while awaiting the server", async () => {
    let finish!: () => void;
    vi.mocked(api.submitContact).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    renderForm();
    await fillForm();
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled(),
    );
    expect(screen.getByLabelText("Email", { exact: true })).toBeDisabled();
    finish();
    await screen.findByRole("heading", { name: "Thanks — your message is in." });
  });
  it("maps server field errors, focuses the input, and keeps the message", async () => {
    vi.mocked(api.submitContact).mockRejectedValue(
      new ApiError(
        {
          code: "validation_error",
          message: "Invalid fields",
          fields: { email: ["Check this email address."] },
        },
        400,
      ),
    );
    renderForm();
    await fillForm();
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByText("Check this email address.")).toBeVisible();
    expect(screen.getByLabelText("Email", { exact: true })).toHaveFocus();
    expect(screen.getByLabelText("Message", { exact: true })).toHaveValue(valid.message);
  });
  it("shows the server retry interval and preserves input after a 429", async () => {
    vi.mocked(api.submitContact).mockRejectedValue(
      new ApiError(
        { code: "rate_limited", message: "Too many messages", retry_after_seconds: 42 },
        429,
      ),
    );
    renderForm();
    await fillForm();
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please wait 42 seconds");
    expect(screen.getByLabelText("Message", { exact: true })).toHaveValue(valid.message);
    expect(screen.getByRole("checkbox")).toBeChecked();
  });
  it("supports retry after a network failure without exposing the error detail", async () => {
    vi.mocked(api.submitContact).mockRejectedValueOnce(new Error("Internal connection detail"));
    renderForm();
    await fillForm();
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That didn't send.");
    expect(screen.queryByText("Internal connection detail")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(
      await screen.findByRole("heading", { name: "Thanks — your message is in." }),
    ).toBeVisible();
  });
  it("keeps the honeypot outside the keyboard sequence and links to real privacy information", () => {
    const { container } = renderForm();
    const trap = container.querySelector<HTMLInputElement>('input[name="website"]')!;
    expect(trap).toHaveAttribute("tabindex", "-1");
    expect(trap.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByRole("link", { name: "How this data is used" })).toHaveAttribute(
      "href",
      "/privacy",
    );
  });
});

describe("copyable email", () => {
  it("copies the confirmed address on request", async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<ContactEmail />);
    await user.click(screen.getByRole("button", { name: "Copy email" }));
    expect(write).toHaveBeenCalledWith("dhananjayvaidya4154@gmail.com");
    expect(screen.getByRole("status")).toHaveTextContent("Email copied");
    write.mockRestore();
  });
  it("selects the email for manual copying when the clipboard is unavailable", async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("Denied"));
    render(<ContactEmail />);
    await user.click(screen.getByRole("button", { name: "Copy email" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Email selected.");
    expect(window.getSelection()?.toString()).toBe("dhananjayvaidya4154@gmail.com");
    write.mockRestore();
  });
});
