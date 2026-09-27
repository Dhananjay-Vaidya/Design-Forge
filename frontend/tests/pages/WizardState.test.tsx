import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import { NewDecisionPage } from "@/pages/NewDecisionPage";

it("preserves details, added options, and unfinished input across wizard navigation", async () => {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <NewDecisionPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await user.type(screen.getByLabelText("What are you deciding?"), "Choose a research tool");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.type(screen.getByLabelText("Add an option"), "First option");
  await user.click(screen.getByRole("button", { name: "Add", exact: true }));
  await user.type(screen.getByLabelText("Add an option"), "Unfinished option");
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByLabelText("What are you deciding?")).toHaveValue("Choose a research tool");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByLabelText("Add an option")).toHaveValue("Unfinished option");
  expect(screen.getByText("First option")).toBeVisible();
  expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
});
