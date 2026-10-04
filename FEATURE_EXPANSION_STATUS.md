# Feature Expansion Status (FX-*)

Tracks the build of the recommended tier from the feature-expansion plan (FX-01, 03, 04, 05, 06, 08, 10, 14, 15,
16, 19, 20). "Verified" means the listed command or check was actually run and passed.

## Deviations from the plan (and why)

| Plan assumption | Reality in this repo | Decision |
|-----------------|----------------------|----------|
| Backend is Django/DRF | Backend is FastAPI + SQLAlchemy + Alembic | Built to the real stack; every entity ships an Alembic migration and `alembic check` stays clean |
| "Snapshots already exist" (FX-04) | No snapshot entity exists | Phase B builds snapshots first (doc 04 §4.8), plus a manual "Save version" reason |
| "Existing commitments and outcome reviews" (FX-06) | Neither exists | Phase C builds commit + outcome review first (docs 04 §4.11/4.12, API-31..34) |
| FX-03 "live what-if sliders" | Plan implied client-side re-ranking while dragging weights | **Not built**: a second implementation of the scoring maths in TypeScript would be a second source of truth for the ranking. The What-if tab instead shows what the real engine computes (tornado, flip points) and the user edits weights on the Criteria tab |
| Optional Phase G (public share links) | Needs product-owner and privacy approval | **Not built**: no approval recorded. FX-07/09/11/12/13 likewise not built |

## Phases

| Phase | Features | Status | Notes |
|-------|----------|--------|-------|
| A | FX-01 templates, FX-16 save-as-template, FX-20 demo + tour | **Verified** | See below |
| B | FX-03 sensitivity lab, FX-05 explainer, FX-04 version diff | **Verified** | See below |
| C | FX-06 calibration (+ commit/outcome prerequisites) | Not started | |
| D | FX-15 PDF, FX-14 CSV, FX-10 brief | Not started | |
| E | FX-08 devil's advocate | Not started | |
| F | FX-19 PWA / offline | Not started | |

## Phase A — Templates, save-as-template, demo mode

- **Backend:** migration `d3e4f5a6b7c8` (`decision_templates`); `app/domain/templates.py` (6 built-ins, code);
  `template_service`; endpoints API-41..46; metrics `decisions_from_template_total{source}`, `templates_saved_total`.
- **Frontend:** `/app/templates` gallery, use-template dialog, save-as-template dialog, sample decision banner with
  reset, guided tour (`features/tour`), first-run actions on the dashboard, sidebar + command-palette entries.
- **Verified:** backend 239 tests (15 new + 6 contract checks that every new frontend call exists in OpenAPI), mypy/ruff clean, `alembic check` clean; frontend lint, typecheck,
  75 tests (16 new), build (main bundle +0.74 kB, templates page is a 9 kB lazy chunk); real-browser walkthrough
  against the Docker stack (register → template → create → save as template → delete → sample → tour by keyboard →
  reset → dark mode → 390 px), no console errors, no horizontal scroll; throwaway accounts deleted.
- **Bugs found by that verification and fixed:** tour lost keyboard focus on step change; tour restored focus to the
  wrong element; "Reset sample" landed on "Decision not found" (cache invalidation refetched the deleted sample).
- **Gemini-OFF:** nothing in this phase calls Gemini.

## Phase B — Sensitivity lab, explainer, version diff

- **Backend:** migration `e4f5a6b7c8d9` (`decision_snapshots`, insert-only); pure domain modules
  `sensitivity.py`, `explain.py`, `snapshot.py`, `diff.py`; `snapshot_service`; endpoints API-47..52; metrics
  `snapshots_created_total{reason}`, `snapshot_compares_total`, `sensitivity_lab_requests_total{status}`,
  `explanations_total{status}`. The tornado re-runs the real engine; flip points are closed-form and then checked
  against the engine in tests.
- **Frontend:** What-if tab (tornado bars with icon+text status, smallest weight/score changes, infeasible case worded),
  Versions tab (save with label, list, compare any two or against live), "Why this ranks first" card on the Ranking
  tab. Everything is teal and labelled "Calculated"; nothing is violet because nothing is AI.
- **Verified:** backend 292 tests (53 new), ruff, format, mypy, `alembic check` clean; OpenAPI snapshot regenerated;
  frontend lint, typecheck, 87 tests (12 new, including the contrast and tokens-only guards), build; real-browser
  walkthrough against the Docker stack (18 checks: explainer, what-if figures, save two versions, diff reports the leader
  change, compare to live, dark mode, reduced motion, 390 px with no horizontal scroll, second account gets 404 on
  every endpoint, no AI requests), no console errors; throwaway accounts deleted.
- **Bug found by that verification and fixed:** the Compare selects took their accessible name from the option text
  because they sat inside their `<label>`; now named by `aria-labelledby`.
- **Known limits (stated in the product text):** score flips are "at least" values one 0.1 step past the boundary
  (exact ties are decided by decimal noise, so the tool never claims a precise tie-break); only one weight or one
  score changes at a time.
- **Gemini-OFF:** none of these endpoints touch the AI provider (a test fails if they try).
