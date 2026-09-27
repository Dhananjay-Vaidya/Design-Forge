# DecisionForge UI effects implementation

## Baseline audit — 2026-09-27

React 18, Tailwind 3, locally bundled Geist/Geist Mono, Motion 13, Recharts 2.
Existing tokens: teal deterministic accent, violet advisory accent; RGB CSS variables.
Existing tests: **6 files / 17 tests passed**. Production build: **passed**.
Baseline CSS 56.44 kB (10.67 gzip); entry JS 475.71 kB (150.80 gzip);
ranking chunk 370.54 kB (99.48 gzip); landing 35.99 kB (12.00 gzip).
Existing Vite React plugin deprecation warnings. No Playwright or axe configuration.
Compatibility documentation is stale: decisions and streaming AI now exist.

| Route | Page | Current visual quality | Current interactions | Problems | Proposed effects | Accessibility risk | Performance risk | Implementation status |
|---|---|---|---|---|---|---|---|---|
| / | Landing | Polished but glass-heavy | Live weights, FAQ, theme | Parallax ignores reduced motion; continuous decoration | Decision path, calmer surfaces | Motion, mobile header | Large blurred ambient layers | Audited |
| /login | Login | Consistent Geist form | Validation, password toggle | Narrow mobile spacing | Branded surface, field feedback | Error association | Low | Audited |
| /register | Registration | Same auth layout | Validation, submit | Same as login | Shared auth improvements | Labels/focus | Low | Audited |
| /app | Dashboard | Cards and counts already animated | Filters, search, sort, grid/list | No mobile drawer; excessive glass | Lab navigation, restrained stats | Focus and touch targets | Pointer effects | Audited |
| /app/decisions/new | Wizard | Three steps | Stateful setup | Remount loses unfinished option/criterion text | Persistent steps, progress/review | Focus after step changes | Low | Audited |
| /app/decisions/:decisionId | Workspace index | Readiness redirect | Edit/archive/delete, AI drawer | AI drawer lacks focus trap | Context and panel polish | Modal focus | Low | Audited |
| …/alternatives | Options | CRUD cards | Add/edit/delete | Shared surfaces/feedback | Numbered accents, clear actions | Destructive dialog | Low | Audited |
| …/criteria | Criteria | Numeric weights, distribution | Direction, weights, active state | Shared surfaces | Consistent bands and controls | Numeric alternative already exists | Low | Audited |
| …/scores | Matrix | Heat tint and mobile cards | Autosave, up/down/Enter | No lateral movement; width animation | Focus rows, transform progress | Keyboard labels | Large tables | Audited |
| …/ranking | Ranking + sensitivity | Winner, chart, breakdown | Recalculate | Tie presented as single winner; static motion query | Tie language, rank bars, stable summary | Text fallback exists | Lazy Recharts | Audited |
| * | Not found | Branded recovery | Return link | Shared polish | Surface consistency | Low | Low | Audited |
| No route | AI drawer | Streaming chat | Suggestions, stop, retry | Status failure looks disabled; focus escapes | Advisory states and bounded motion | High: modal focus | Streaming scroll | Audited |
| Not implemented | Scenarios/history/outcomes/settings/commit | Specification only | None | No existing UI or wired workflow | Do not invent product behavior | Not assessable | Not assessable | Out of scope: new features |

## Plan

1. Extend semantic tokens and centralize motion; retain existing fonts/dependencies.
2. Refine shared surfaces, modal behavior, responsive shell and navigation.
3. Improve all implemented screens, preserving API contracts and entered form data.
4. Verify state-based UI tests, lint/types/build, responsive browser checks where feasible.
5. Document actual checks and remaining gaps.

| Phase | Page or component | Status | Files changed | Tests | Accessibility verification | Performance notes | Remaining issue |
|---|---|---|---|---|---|---|---|
| Audit | All implemented routes | Complete | This file | Baseline 17 passing, build passing | Source review | Baseline above | Browser inspection pending |
| Tokens / theme / motion | Shared foundations | Complete | globals.css, tailwind.config.js, lib/motion.ts, EffectsLifecycle.tsx, Reveal.tsx, CountUp.tsx, spotlight.ts | Theme, reduced-motion and lifecycle tests | Visible focus, static reduced-motion content | No new runtime dependencies; bounded SVG effect | Existing Motion/Vite deprecation warnings |
| Shared components | Fields, states, dialogs, palette | Complete | FormField.tsx, States.tsx, Dialog.tsx, CommandPalette.tsx, dialogKeyboard.ts | Field tests, browser keyboard/modal tests | Native modal isolation, Tab cycle, Escape, focus restoration | Short feedback; opaque surfaces | Pixel-diff baseline not established |
| Shell | Desktop sidebar / mobile drawer | Complete | App.tsx, AppShell.tsx, LabNavigation.tsx | Browser navigation, responsive checks | Skip link, focus, labelled controls | CSS background; 1440 px maximum width | No settings route in existing app |
| Landing | Hero, network, live demo, features | Complete | LandingPage.tsx, DecisionNetwork.tsx, LiveDemo.tsx, Marquee.tsx | Browser route/axe/screenshots | No parallax or endless ticker; labelled schematic | Landing chunk smaller than baseline | No monitoring API UI exists |
| Authentication | Login / registration | Complete | AuthLayout.tsx, FormField.tsx, shared CSS; form formatting | Existing schema/field tests; browser axe/screenshots | Password visibility and associated errors retained | Existing local fonts reused | Live login/register not exercised by browser mocks |
| Dashboard | Summary, search, decision cards | Complete | DashboardPage.tsx, shared shell/CSS | Browser route/axe/screenshots | Clear search/filter recovery action | Pointer effects limited to capable devices | No historical trend data available |
| Wizard | Details / options / criteria + inline review | Complete | NewDecisionPage.tsx, WizardState.test.tsx | Draft text survives Back/Continue | Hidden steps retain state; focus on heading | No animation-driven remounting | Existing three-step workflow retained |
| Workspace | Header and stage navigation | Complete | DecisionWorkspacePage.tsx | Mobile selector + browser checks | Labelled mobile stage select | Existing routed panels retained | Only four implemented stages |
| Alternatives / criteria | Rows and weight controls | Complete | AlternativesTab.tsx, CriteriaTab.tsx, CriterionControls.tsx | Existing controls + radio keyboard test | Touch targets; roving focus; numeric weight input | Bounded row staggering | Relative weights normalize automatically; no false 100% warning |
| Scoring | Matrix + mobile cards | Complete | ScoresTab.tsx, globals.css | Arrow navigation + responsive screenshots | Focus rows, labels, progressbar | Transform progress, no cell animation | Existing autosave contract unchanged |
| Ranking / sensitivity | Winner, chart, contribution table | Complete | RankingTab.tsx | Browser reduced-motion values, axe/screenshots | Joint-leader wording; focusable scroll region; text alternatives | Lazy chart retained, 320 ms reveal | Sensitivity is existing margin indicator, not simulation |
| AI | Existing streaming advisory drawer | Complete | AskAiPanel.tsx | Enabled/disabled/status failure/quota browser states + axe | Native dialog, keyboard loop, safe errors, status skeleton | Real SSE retained, no simulated streaming | Cache/job-analysis cards not supplied by existing chat API |
| Scenarios / history / outcomes / settings / commit | No implemented route | Not applicable to effects pass | None | Not executable | No fake controls introduced | No new feature payload | Requires separately implemented product workflows |
| Responsive / accessibility | All existing routes | Complete | e2e fixtures, UI checks, Playwright config | 320/375/768/1024/1440/1920; light/dark/reduced motion | Axe WCAG-tag scans, browser keyboard checks | No horizontal page overflow in fixtures | Real-device/Safari/Firefox/screen-reader audits not run |
| Performance / tooling | Production and container builds | Complete | package.json/lock, scripts/lint.mjs, Dockerfile, .dockerignore, vite.config.ts | npm ci, lint, typecheck, build; Compose build | Test-only tools do not ship | Node 22 matches installed test tooling; deterministic npm ci | No Lighthouse or bundle visualizer configured |
| Documentation | Audit and extension guide | Complete | This file; docs/ui-effects-design-system.md | Source review | Rules documented | Bundle deltas recorded below | Final verification results below |

## File inventory

Created: this status file, `docs/ui-effects-design-system.md`, `frontend/playwright.config.ts`,
`frontend/e2e/{fixtures.ts,ui-effects.spec.ts}`, `frontend/scripts/lint.mjs`,
`frontend/src/components/LabNavigation.tsx`, `frontend/src/components/fx/EffectsLifecycle.tsx`,
`frontend/src/features/landing/DecisionNetwork.tsx`, `frontend/src/lib/{motion.ts,dialogKeyboard.ts}`,
`frontend/tests/components/UiEffects.test.tsx`, `frontend/tests/pages/WizardState.test.tsx`.

Functional modifications are listed per phase above. The requested Prettier pass also reformatted
existing frontend sources and tests; API modules contain formatting-only changes. Backend files and
API contracts were not modified. Existing staged changes are preserved.

Dev dependencies added: `@playwright/test` 1.61.1 and `axe-core` 4.12.1. Runtime dependencies: none.

## Verification notes

- Baseline tests/build passed before implementation.
- Clean `npm ci` passed, then dev-tool installation passed with zero reported vulnerabilities.
- Frontend formatting executed over source files and tests.
- Lint originally discovered a parent workspace's incompatible flat config. The local ESLint runner
  now explicitly uses this repository's config; lint passes.
- Unit tests: 8 files / 22 tests pass (baseline 6 files / 17 tests).
- Typecheck and production build pass after fixing the command-palette keyboard event type.
- Browser checks caught and prompted fixes for 320 px header overflow, keyboard access to the
  contribution-table scroll region, and reverse-Tab escape from the AI dialog.
- Screenshot review caught a stretched mobile switch; the visual track is now 24 px within a 44 px target.
- Browser fixtures cover real UI code with intercepted auth, decision and SSE requests. They do not
  prove live backend integration or real-provider availability.
- Docker Compose frontend build passed with Node 22 and npm ci. No services were restarted or deployed.
- Backend tests not run: no shared contract changes. No bundle-analysis tool or Lighthouse configured.
- Screenshots are generated under `frontend/test-results/`, excluded from Git and Docker context.
  Docker context shrank from 53.43 MB including QA artifacts to approximately 291 kB after exclusions.

## Remaining limitations

Specification-only scenarios, history/snapshots, outcomes, commitments and settings cannot receive an
effects pass without implementing new product behavior. Cached/queued analysis panels are likewise
not the existing streaming-chat workflow. No pretend controls or data were added. Existing dependency
deprecation notices remain; no risky framework/chart major-version migration was included.

Browser coverage is Chromium with fixtures, including normal-motion keyboard tests and reduced-motion
screenshots. Safari/Firefox, physical touch devices, screen-reader listening, production API mutations,
and image-diff regression baselines remain unverified. Automated checks are not a WCAG certification.

## Final verification

Final executed results: **lint passed; TypeScript passed; 22 unit tests passed; 12 Playwright tests
passed; production build passed; Docker Compose frontend build passed**. Browser suite includes
30 route/theme screenshot and axe checks, 40 additional route/width overflow checks, four AI state
checks with axe, keyboard/focus tests, reduced-motion values, and live/persisted theme behavior.
All API traffic in browser tests is mocked. Screenshot review covered the working layouts in light,
dark and mobile modes; the artifacts remain available locally for further review.

| Output | Baseline raw / gzip kB | Final raw / gzip kB | Gzip change |
|---|---|---|---|
| CSS | 56.44 / 10.67 | 58.04 / 11.34 | +0.67 kB |
| Entry JS | 475.71 / 150.80 | 482.12 / 152.54 | +1.74 kB |
| Landing chunk | 35.99 / 12.00 | 29.85 / 9.23 | -2.77 kB |
| Lazy ranking chunk | 370.54 / 99.48 | 371.16 / 99.70 | +0.22 kB |

No remaining build/test blocker in the implemented frontend. Remaining work is the explicitly listed
product-feature gaps and broader real-device/live-service QA, not unfinished token or landing-only work.
