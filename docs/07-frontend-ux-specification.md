# 07 — Frontend & UX Specification

**Product:** DecisionForge AI · **Version:** 1.0 · **Date:** 2026-09-23
**Stack:** React, TypeScript, Vite, React Router, TanStack Query, Zustand/Context, React Hook Form, Zod, Tailwind, Recharts, Vitest + RTL. Traces to BRD FR/NFR, DPR. Additions tagged **[REC]**.

---

## 1. Route Map

| Route | Page | Auth | Primary reqs |
|-------|------|------|--------------|
| `/` | Landing | public | Marketing/value; CTA to register/login |
| `/register` | Registration | public | FR-001 |
| `/login` | Login | public | FR-002 |
| `/app` | Dashboard | 🔒 | FR-015 |
| `/app/decisions/new` | Decision creation wizard | 🔒 | FR-003 |
| `/app/decisions/:id` | Decision workspace (tabs) | 🔒 | FR-003..013 |
| `/app/decisions/:id/alternatives` | Alternatives editor (tab) | 🔒 | FR-004 |
| `/app/decisions/:id/criteria` | Criteria & weights (tab) | 🔒 | FR-005 |
| `/app/decisions/:id/scores` | Scoring matrix (tab) | 🔒 | FR-006 |
| `/app/decisions/:id/ranking` | Ranking + sensitivity (tab) | 🔒 | FR-007/008 |
| `/app/decisions/:id/insights` | Gemini insights panel (tab) | 🔒 | FR-009/010/011 |
| `/app/decisions/:id/scenarios` | Scenario comparison (tab) | 🔒 | FR-009 (scenarios) |
| `/app/decisions/:id/commit` | Commit final choice | 🔒 | FR-013 |
| `/app/decisions/:id/history` | Decision history/snapshots | 🔒 | FR-012 |
| `/app/decisions/:id/outcome` | Outcome review | 🔒 | FR-014 |
| `/app/settings` | User settings | 🔒 | profile [REC] |
| `*` | Not found | any | graceful 404 |

Protected routes wrap in an `<AuthGuard>`; unauthenticated access redirects to `/login?next=`.

## 2. Navigation Structure

- **Top bar:** product mark, global nav (Dashboard, New Decision), user menu (Settings, Logout), dark-mode toggle.
- **Decision workspace:** left/tab nav across the decision stages (Overview → Alternatives → Criteria → Scores → Ranking → Insights → Scenarios → Commit → Outcome → History), with a progress indicator reflecting readiness (e.g., "2 alternatives ✓", "scores 8/12").
- **Breadcrumbs:** Dashboard / {Decision title} / {Stage}.

## 3. Responsive Layout (NFR-006)

- Mobile-first Tailwind; breakpoints sm/md/lg/xl.
- **Desktop:** multi-column workspace; matrix as a table.
- **Tablet:** collapsible side nav; matrix scrolls horizontally within a container.
- **Mobile:** stage nav becomes a top segmented control or dropdown; the scoring matrix switches to a per-alternative card list (one criterion row group at a time) to avoid tiny cells.

## 4. Component Hierarchy (features)

```
App
├─ AuthGuard
├─ AppShell (TopBar, ThemeToggle, Nav)
│  ├─ DashboardPage
│  │   ├─ DecisionListSection (active / completed / pending-review)
│  │   └─ CalibrationCard
│  ├─ DecisionWizard (multi-step: details → alternatives → criteria)
│  └─ DecisionWorkspace
│      ├─ WorkspaceTabs
│      ├─ OverviewPanel
│      ├─ AlternativesEditor (SortableList, AlternativeForm)
│      ├─ CriteriaEditor (CriterionForm, WeightControls, DirectionToggle)
│      ├─ ScoringMatrix (MatrixTable | MatrixCards, ScoreCell, RationalePopover)
│      ├─ RankingResults (RankBarChart[Recharts], SensitivityBadge)
│      ├─ InsightsPanel (AnalysisTypeTabs, JobStatus, InsightCards, Disclaimer)
│      ├─ ScenarioComparison (ScenarioGrid best/likely/worst)
│      ├─ CommitPanel (ChoiceSelect, ConfidenceSlider, RationaleField)
│      ├─ OutcomeReview (SatisfactionScale, NotesField)
│      └─ HistoryPanel (SnapshotList, VersionDiff[REC])
└─ Shared: FormField, Button, Toast, EmptyState, ErrorState, Spinner, ConfirmDialog
```

## 5. Page-Level Requirements

- **Landing (`/`):** value proposition (deterministic + AI-assisted + outcome tracking), primary CTA. No auth. Fast first paint.
- **Registration / Login:** email+password forms (Zod), inline validation, server-error mapping (§Forms), link between the two, redirect to `next` on success (FR-001/002).
- **Dashboard (`/app`):** three sections — Active, Completed, Pending review — each a list with status chips and quick actions; a **CalibrationCard** summarizing confidence vs satisfaction (FR-015/016); empty state for new users with a "Create your first decision" CTA.
- **Decision creation wizard:** step 1 details (title, context, category, deadline); step 2 add ≥ 2 alternatives; step 3 add ≥ 1 criterion with weight+direction; on finish → workspace. Guardrails reflect BR-002/003 before enabling ranking.
- **Decision workspace:** hosts all stage tabs; shows readiness and a persistent "deterministic vs AI" visual distinction (AIR-06).
- **Alternatives editor:** add/edit/reorder (drag or up/down)/remove; enforce ≥ 2 before ranking is enabled (FR-004, BR-002).
- **Criteria & weights editor:** add criteria; weight input (positive), direction toggle (benefit/cost), active/inactive; a live "weights normalize to 100%" helper (BR-004); ≥ 1 active required (BR-003).
- **Scoring matrix:** grid of alternatives × active criteria; each cell a score input + optional rationale; progress counter of filled cells; highlights missing cells (supports AC-004). Cell edits autosave via `PUT scores` (debounced) or explicit Save.
- **Ranking results:** ranked list + horizontal bar chart (Recharts) of normalized totals; a **SensitivityBadge** ("Leader stable" / "Leader may change") from FR-008; a clear "These results are calculated, not AI" label.
- **Sensitivity analysis:** basic view (MVP) — indicator + short explanation; interactive Monte-Carlo is post-MVP (DPR).
- **Gemini insights panel:** choose analysis type; request button (disabled when over quota with an explanatory message, AC-008); shows job status (queued/processing/completed/failed, FR-010); renders validated insight cards; **advisory disclaimer** always visible (AIR-06/11). Invalid/failed jobs show a safe message, never raw/invalid content (AC-007).
- **Scenario comparison:** best/likely/worst per alternative in a compact grid.
- **Decision history:** list of snapshots/versions with timestamps and reason (analysis/commitment); optional version diff [REC].
- **Outcome review:** satisfaction scale + notes; visible when a review is due (FR-014).
- **User settings:** display name, timezone, dark-mode preference; account deletion (SEC-07) with confirm dialog.

## 6. Forms and Validation

- **React Hook Form + Zod** on every form; the Zod schema mirrors the API contract (05).
- **Client validation** for immediate feedback; **server validation** is authoritative — map `error.fields` from the envelope (05 §5) back to inputs so AC-002/AC-004 messages appear at the right field.
- Numeric inputs (weight, score, confidence) constrained to configured ranges (VLD-05/06/09); show helper text with the range.
- Destructive actions (delete decision/account, deactivate criterion affecting scores) require a confirm dialog.

## 7. Loading, Empty, Success, Error States

Every data view implements all four:
- **Loading:** skeletons for lists/matrix; spinners for actions; AI requests show a job-status indicator, not a blocking spinner (async, AC-005).
- **Empty:** friendly empty states with a primary next action (e.g., "Add your first alternative").
- **Success:** toasts for saves/commits; optimistic updates via TanStack Query with rollback on error.
- **Error:** inline field errors (validation), a page-level ErrorState with retry for failed loads, and specific messaging for quota (AC-008) and AI failure (AC-007). Network/500 → generic retry with correlation id shown subtly.

## 8. Accessibility Requirements (NFR-005)

- All primary flows fully **keyboard operable**; visible focus rings; logical tab order.
- Every control has a programmatic **label** (`<label>`/`aria-label`); the scoring matrix uses proper table semantics with header associations, or an accessible cards fallback on mobile.
- **Color contrast** meets WCAG AA; status is never conveyed by color alone (icons/text too).
- Live regions announce async job status changes and toasts (`aria-live="polite"`).
- Charts have text alternatives (a data table or `aria-label` summary) since Recharts SVG alone isn't sufficient.
- Target WCAG 2.1 AA for MVP primary flows.

## 9. Chart Behavior (Recharts)

- **Ranking:** horizontal bar chart of normalized totals, sorted desc, with value labels; responsive container; tooltips on hover/focus.
- **Calibration:** simple bar/scatter of confidence buckets vs average satisfaction (FR-016).
- Charts degrade to an accessible table on very small screens or when reduced-motion/AT is detected.
- No chart is the sole source of a number the user needs — always accompanied by text/values.

## 10. Design Tokens

Tailwind theme tokens (single source; CSS variables for theming):

| Token group | Examples |
|-------------|----------|
| Color | `--color-bg`, `--color-surface`, `--color-text`, `--color-primary`, `--color-success`, `--color-warning`, `--color-danger`, `--color-ai` (distinct accent for AI-advisory content) |
| Spacing | 4-pt scale (`space-1..12`) |
| Radius | `rounded-md/lg/xl` |
| Typography | `font-sans`; sizes `text-sm/base/lg/xl/2xl`; weights 400/500/600/700 |
| Elevation | `shadow-sm/md` for surfaces/dialogs |
| Motion | `--dur-fast/base`; respects `prefers-reduced-motion` |

A dedicated `--color-ai` token visually separates AI-advisory sections from deterministic results (AIR-06).

## 11. Dark Mode

- Class-based dark mode (`dark:` variants) driven by user preference (settings) with system default fallback; persisted in profile/localStorage.
- Tokens redefined under `.dark`; contrast maintained (NFR-005). Toggle in the top bar.

## 12. Keyboard Support

- Global: `g d` → dashboard, `n` → new decision [REC shortcuts].
- Matrix: arrow keys move between cells; `Enter` edits; `Esc` cancels; `Tab` advances.
- Dialogs: focus trap; `Esc` closes; return focus to trigger.
- All actions reachable without a pointer (NFR-005).

## 13. Mobile Behavior (NFR-006)

- Stage navigation collapses to a segmented control/dropdown.
- Scoring matrix → per-alternative cards (criterion rows) to keep touch targets ≥ 44px.
- Charts stack full-width; tables gain horizontal scroll affordances.
- AI insights render as a vertical card stack with the disclaimer pinned.

## 14. Frontend ↔ Requirements Traceability

| Page/component | Requirements |
|----------------|--------------|
| Registration/Login | FR-001, FR-002 |
| Dashboard + CalibrationCard | FR-015, FR-016 |
| Wizard | FR-003, BR-002/003 |
| AlternativesEditor | FR-004, BR-002 |
| CriteriaEditor | FR-005, BR-003/004 |
| ScoringMatrix | FR-006, BR-005, AC-004 |
| RankingResults + Sensitivity | FR-007, FR-008, AC-002/003 |
| InsightsPanel | FR-009/010/011, AC-005/007/008, AIR-06/11 |
| ScenarioComparison | FR-009 (scenarios) |
| CommitPanel | FR-013, BR-009 |
| OutcomeReview | FR-014 |
| HistoryPanel | FR-012, BR-007 |
| Settings | SEC-07, NFR-005/006 |
| Whole app | NFR-005 (a11y), NFR-006 (responsive) |
