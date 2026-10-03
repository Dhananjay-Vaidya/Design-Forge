import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/features/templates/api";
import { DemoBanner } from "@/features/templates/components/DemoBanner";
import { decisionKeys } from "@/features/decisions/hooks";

vi.mock("@/features/templates/api");

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderBanner(
  decisionId: string,
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/decisions/d1/ranking"]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <DemoBanner decisionId={decisionId} onStartTour={() => {}} />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

describe("DemoBanner", () => {
  beforeEach(() => {
    vi.mocked(api.getDemo).mockResolvedValue({ decision_id: "d1" });
    vi.mocked(api.createDemo).mockReset();
  });

  it("appears only on the user's own sample decision", async () => {
    renderBanner("d1");
    expect(await screen.findByRole("note", { name: "Sample decision" })).toBeInTheDocument();
  });

  it("stays hidden on any other decision", async () => {
    renderBanner("someone-else");
    await waitFor(() => expect(api.getDemo).toHaveBeenCalled());
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("asks before resetting, then lands on the new sample's ranking", async () => {
    vi.mocked(api.createDemo).mockResolvedValue({ id: "d2" } as never);
    renderBanner("d1");
    await userEvent.click(await screen.findByRole("button", { name: "Reset sample" }));
    expect(api.createDemo).not.toHaveBeenCalled(); // confirmation first
    const confirm = screen.getAllByRole("button", { name: "Reset sample" }).at(-1)!;
    await userEvent.click(confirm);
    await waitFor(() =>
      expect(screen.getByTestId("where")).toHaveTextContent("/app/decisions/d2/ranking"),
    );
  });

  it("does not refetch the deleted sample: only the list and sample marker refresh", async () => {
    vi.mocked(api.createDemo).mockResolvedValue({ id: "d2" } as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(client, "invalidateQueries");
    renderBanner("d1", client);
    await userEvent.click(await screen.findByRole("button", { name: "Reset sample" }));
    await userEvent.click(screen.getAllByRole("button", { name: "Reset sample" }).at(-1)!);
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(decisionKeys.list()));
    expect(keys).not.toContain(JSON.stringify(decisionKeys.all));
  });
});
