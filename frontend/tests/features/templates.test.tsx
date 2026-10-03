import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
import * as api from "@/features/templates/api";
import { TemplateCard } from "@/features/templates/components/TemplateCard";
import { UseTemplateDialog } from "@/features/templates/components/UseTemplateDialog";
import type { Template } from "@/types/template";

vi.mock("@/features/templates/api");

const job: Template = {
  id: "builtin:job-offer",
  kind: "builtin",
  name: "Job offer",
  description: "Compare offers.",
  category: "Career",
  title_hint: "Which job offer should I accept?",
  option_hints: ["Offer A", "Offer B"],
  criteria: [
    { name: "Salary", description: "", weight: "5", direction: "benefit" },
    { name: "Growth", description: "", weight: "4", direction: "benefit" },
    { name: "Balance", description: "", weight: "4", direction: "benefit" },
    { name: "Commute time", description: "", weight: "3", direction: "cost" },
    { name: "Culture", description: "", weight: "3", direction: "benefit" },
    { name: "Security", description: "", weight: "3", direction: "benefit" },
  ],
};

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TemplateCard", () => {
  it("previews four criteria, summarises the rest, and states direction in text", () => {
    wrap(<TemplateCard template={job} onUse={() => {}} />);
    const list = screen.getByRole("list", { name: "Job offer criteria" });
    expect(list).toHaveTextContent("Salary");
    expect(list).toHaveTextContent("Commute time");
    expect(list).toHaveTextContent("+2 more");
    expect(list).not.toHaveTextContent("Culture");
    // Direction is never icon-only.
    expect(list).toHaveTextContent("Lower is better: Commute time");
    expect(screen.getByText("6 criteria")).toBeInTheDocument();
  });

  it("calls onUse, and only personal templates can be deleted", async () => {
    const onUse = vi.fn();
    const onDelete = vi.fn();
    const { unmount } = wrap(<TemplateCard template={job} onUse={onUse} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: /Use template/ }));
    expect(onUse).toHaveBeenCalledWith(job);
    expect(screen.queryByRole("button", { name: /Delete template/ })).toBeNull();
    unmount();

    wrap(
      <TemplateCard
        template={{ ...job, kind: "mine", id: "u1" }}
        onUse={onUse}
        onDelete={onDelete}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete template Job offer" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

describe("UseTemplateDialog", () => {
  beforeEach(() => {
    vi.mocked(api.createFromTemplate).mockReset();
  });

  it("prefills the title and option hints from the template", () => {
    wrap(<UseTemplateDialog template={job} onClose={() => {}} />);
    expect(screen.getByLabelText("What are you deciding?")).toHaveValue(job.title_hint);
    expect(screen.getByLabelText(/Your options/)).toHaveValue("Offer A\nOffer B");
  });

  it("requires a title and does not call the API without one", async () => {
    wrap(<UseTemplateDialog template={job} onClose={() => {}} />);
    await userEvent.clear(screen.getByLabelText("What are you deciding?"));
    await userEvent.click(screen.getByRole("button", { name: "Create decision" }));
    expect(await screen.findByText("Give the decision a title.")).toBeInTheDocument();
    expect(api.createFromTemplate).not.toHaveBeenCalled();
  });

  it("sends trimmed, non-empty options and closes on success", async () => {
    vi.mocked(api.createFromTemplate).mockResolvedValue({ id: "d1" } as never);
    const onClose = vi.fn();
    wrap(<UseTemplateDialog template={job} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/Your options/), {
      target: { value: "  Alpha \n\n Beta\n" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Create decision" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    // TanStack Query passes a context argument after the variables; assert on the body only.
    expect(vi.mocked(api.createFromTemplate).mock.calls[0][0]).toEqual({
      template_id: "builtin:job-offer",
      title: job.title_hint,
      options: ["Alpha", "Beta"],
    });
  });

  it("shows a server validation message next to the options field", async () => {
    vi.mocked(api.createFromTemplate).mockRejectedValue(
      new ApiError(
        {
          code: "validation_error",
          message: "One or more fields are invalid.",
          fields: { options: ["“Offer A” is listed more than once."] },
        },
        400,
      ),
    );
    wrap(<UseTemplateDialog template={job} onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Create decision" }));
    expect(await screen.findByText("“Offer A” is listed more than once.")).toBeInTheDocument();
  });
});
