# Feature Expansion Status (FX-*)

Tracks the build of the recommended tier from the feature-expansion plan (FX-01, 03, 04, 05, 06, 08, 10, 14, 15,
16, 19, 20). "Verified" means the listed command or check was actually run and passed.

## Deviations from the plan (and why)

| Plan assumption | Reality in this repo | Decision |
|-----------------|----------------------|----------|
| Backend is Django/DRF | Backend is FastAPI + SQLAlchemy + Alembic | Built to the real stack; every entity ships an Alembic migration and `alembic check` stays clean |
| "Snapshots already exist" (FX-04) | No snapshot entity exists | Phase B builds snapshots first (doc 04 §4.8), plus a manual "Save version" reason |
| "Existing commitments and outcome reviews" (FX-06) | Neither exists | Phase C builds commit + outcome review first (docs 04 §4.11/4.12, API-31..34) |
| Optional Phase G (public share links) | Needs product-owner and privacy approval | **Not built**: no approval recorded. FX-07/09/11/12/13 likewise not built |

## Phases

| Phase | Features | Status | Notes |
|-------|----------|--------|-------|
| A | FX-01 templates, FX-16 save-as-template, FX-20 demo + tour | **Verified** | See below |
| B | FX-03 sensitivity lab, FX-05 explainer, FX-04 version diff | Not started | |
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
