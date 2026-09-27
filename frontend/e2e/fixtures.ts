import type { Page } from "@playwright/test";

const timestamps = { created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-20T10:00:00Z" };
export const decision = {
  id: "demo",
  title: "Choose our next research platform",
  context:
    "Compare three platforms for a small research team. Balance cost, reliability and room to grow.",
  category: "Technology",
  status: "SCORED",
  deadline: null,
  archived_at: null,
  ...timestamps,
};
const alternatives = ["Atlas", "Meridian", "Fieldnotes"].map((name, i) => ({
  id: `a${i}`,
  decision: "demo",
  name,
  description: "Research platform candidate",
  position: i,
  ...timestamps,
}));
const criteria = ["Reliability", "Cost", "Growth"].map((name, i) => ({
  id: `c${i}`,
  decision: "demo",
  name,
  description: "",
  weight: String(3 - i),
  direction: i === 1 ? "cost" : "benefit",
  is_active: true,
  position: i,
  ...timestamps,
}));
const scores = alternatives.flatMap((a) =>
  criteria.map((c) => ({
    alternative: a.id,
    criterion: c.id,
    score: "7",
    rationale: "",
    ...timestamps,
  })),
);
const paginate = (results: unknown[]) => ({
  count: results.length,
  page: 1,
  page_size: 100,
  results,
});

export async function mockApi(
  page: Page,
  ai: "enabled" | "disabled" | "error" | "quota" = "enabled",
) {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    let body: unknown = {};
    if (path === "/auth/refresh") body = { access: "ui-test-token" };
    else if (path === "/me")
      body = {
        id: "test",
        email: "researcher@example.test",
        created_at: timestamps.created_at,
        profile: { display_name: "Mira", timezone: "UTC", quota_tier: "free", preferences: {} },
      };
    else if (path === "/decisions") body = paginate([decision]);
    else if (path === "/decisions/demo") body = decision;
    else if (path.endsWith("/alternatives")) body = paginate(alternatives);
    else if (path.endsWith("/criteria")) body = paginate(criteria);
    else if (path.endsWith("/scores")) body = scores;
    else if (path.endsWith("/ranking"))
      body = {
        decision_id: "demo",
        deterministic: true,
        computed_at: timestamps.updated_at,
        calculation_method: "weighted_sum",
        weights_normalized: { c0: "0.5", c1: "0.333333", c2: "0.166667" },
        ranking: alternatives.map((a, i) => ({
          alternative_id: a.id,
          name: a.name,
          rank: i + 1,
          total: String(0.78 - i * 0.08),
          breakdown: { c0: "0.4", c1: "0.22", c2: "0.16" },
        })),
        sensitivity: { leader_stable: true, note: "Leader stable", margin: "0.08" },
      };
    else if (path === "/ai/status") {
      if (ai === "error")
        return route.fulfill({
          status: 503,
          json: { error: { code: "unavailable", message: "Unavailable" } },
        });
      body = {
        enabled: ai !== "disabled",
        model: "test-provider",
        daily_limit: 10,
        remaining_today: ai === "quota" ? 0 : 8,
        disclaimer: "Advisory only. AI never changes your calculated scores.",
      };
    } else if (path.endsWith("/chat")) {
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: 'event: delta\ndata: {"text":"Review cost assumptions before committing."}\n\nevent: done\ndata: {"remaining_today":7,"model":"test-provider","disclaimer":"Advisory"}\n\n',
      });
    }
    return route.fulfill({ status: 200, json: body });
  });
}
