# Decision intelligence laboratory

DecisionForge uses evidence-oriented visual cues: a question branches through weights and alternatives,
then resolves into a calculated result. Teal marks deterministic work; violet marks advisory AI.
Navy surfaces, quiet grids and a small gold winner accent establish hierarchy without a gaming aesthetic.
The redesign-existing-projects audit informed targeted improvements to the existing components;
the product brief takes precedence over that skill's generic font or palette recommendations.

## Canonical tokens

`frontend/src/styles/globals.css` defines space-separated RGB channels. Tailwind 3 maps these through
`rgb(var(--color-name) / <alpha-value>)`; alpha modifiers remain supported. `.dark` overrides the same
semantic names. No remote font, image, canvas or animation service is required.

| Purpose | Token |
|---|---|
| Canvas / panel / nested surface | `--color-bg`, `--color-surface`, `--color-surface-2` |
| Elevated / floating / glass | `--color-elevated`, `--color-floating`, `--glass-alpha` |
| Primary / supporting / muted text | `--color-text`, `--color-secondary`, `--color-muted` |
| Border / strong border / focus | `--color-border`, `--color-border-strong`, `--color-focus` |
| Deterministic accent and contrast text | `--color-primary`, `--color-primary-hover`, `--color-primary-soft`, `--color-on-primary` |
| Positive / warning / negative / information | `--color-success`, `--color-warning`, `--color-danger`, `--color-info` |
| AI / scenario / ranking | `--color-ai`, `--color-scenario`, `--color-gold`, `--color-silver`, `--color-bronze` |
| Panel / floating shadows | `--shadow-panel`, `--shadow-floating` |
| Blur / radius / spacing | `--blur-chrome`, `--radius-control`, `--radius-panel`, `--space-unit` |
| Chrome / overlay / dialog layering | `--z-chrome`, `--z-overlay`, `--z-dialog`; native modal dialogs use the browser top layer |

Light canvas: RGB 246 247 249; surface: 255 255 255; text: 15 23 32; muted: 84 96 112.
Dark canvas: RGB 12 18 29; surface: 19 27 40; nested surface: 27 37 52;
text: 231 235 240; muted: 150 161 176. Light teal is intentionally darker than dark-mode teal.
Text contrast does not depend on a moving background: glass alpha is 0.96, 0.98 on floating panels.

## Typography and surfaces

Keep locally bundled Geist Variable and Geist Mono Variable. Use 400 for body, 500 for labels and
600 for headings. Hero text is 36–58 px, page titles 30–36 px, section headings 18–24 px, body 14–16 px,
supporting copy 12–14 px. Tiny laboratory labels are decorative, never the only action or status label.
Use tabular numbers for all scores; formulas and weights use Geist Mono. Balance headings and constrain
descriptive text. Do not uppercase paragraphs or use color as the only status signal.

`.card` is an opaque bordered working surface with a restrained tinted shadow. `.glass` is reserved for
chrome and higher-level panels; it is almost opaque, with only 8 px blur. Mobile disables backdrop blur.
`.winner-panel` adds a gold edge; it does not alter the ranking or imply statistical confidence.

## Motion system

`src/lib/motion.ts` owns feedback (140 ms), component (220 ms) and page/score (320 ms) presets.
The easing is `cubic-bezier(0.16, 1, 0.3, 1)`. CSS equivalents are `--dur-fast`, `--dur-base`,
`--dur-page`, `--ease-out`; Tailwind feedback utilities reference these variables.

| Interaction | Implementation |
|---|---|
| Page entrance/exit | `entrance()` with a short fade/10 px travel; no transition gates user input |
| Section reveal | `Reveal`, once in view; 320 ms, small optional stagger |
| List changes / active tabs | Existing Motion layout indicators and list transitions |
| Modal / mobile drawer | Native dialog, short CSS entrance; close remains immediate |
| Advisory drawer | Motion entrance/exit with native modal focus isolation |
| Command palette | Native dialog with short opacity/scale transition |
| Hover / button press | Border/color feedback and existing small transform press |
| Progress / demo bars | ScaleX, origin-left; no animated table-cell layout |
| Numeric score | `CountUp`, 320 ms; final accessible label throughout |
| Ranking chart | Recharts 320 ms reveal, disabled under reduced motion |
| Skeleton | Restrained CSS shimmer; static under reduced motion |
| AI waiting | Opacity dots while waiting for real SSE; no fabricated response text |
| Hero decision paths | Two finite SVG dash cycles; schematic explicitly labelled illustrative |

`MotionConfig reducedMotion="user"` is retained. `Reveal` bypasses hidden initial content in reduced
motion; CountUp renders final values immediately. CSS disables continuous motion and spotlight effects.
The landing hero no longer has scroll parallax. Decorative ambient fields and use-case chips are static.
`EffectsLifecycle` pauses CSS animations when the document is hidden. Spotlight pointer tracking only
runs with a fine pointer on a viewport at least 1024 px wide and no reduced-motion preference.

## Component state rules

All controls retain a visible focus outline, hover response, active response and disabled treatment.
Use existing `Button` loading states, contextual `Skeleton`, `EmptyState`, `ErrorState` and polite toasts.
Field errors are associated with controls and appear with a short fade. Password visibility remains
keyboard operable. Server failures use safe retry copy instead of internal server messages.

Direction toggles implement radio-group arrow navigation and roving tabindex. Weight steppers retain
the numeric input; weights are relative, so do not introduce a false requirement to total 100.
Scoring keeps autosave semantics and exposes left/right/up/down/Enter movement. Score completion uses
a labelled progressbar. Wizard forms stay mounted while hidden so unfinished input survives navigation;
only the active form is submitted, and step changes focus the heading.

## Charts and analytical integrity

Recharts remains lazy-loaded with the ranking route. Colors resolve from the active theme. Every chart
has a textual summary and an accessible contribution table. The overflow table is keyboard focusable.
Ties identify joint leaders rather than claiming one winner. Totals are weighted scores, not probabilities.
Sensitivity remains the existing margin-based indicator; this pass does not invent simulations,
threshold charts or confidence values the API does not provide.

## Accessibility and responsive rules

Preserve semantic landmarks, labels, skip links and meaningful heading order. Native dialogs provide
modal isolation, Escape handling and focus restoration; `trapDialogTab` keeps focus cycling through
controls. Confirmation dialogs remain explicit. The command palette also isolates focus.
Important asynchronous states use live regions. Advisory failure, disabled provider and exhausted quota
have distinct messages; deterministic work remains available.

The shell caps content at 1440 px, uses a collapsible desktop sidebar and a mobile navigation drawer.
Workspace navigation becomes a labelled select on small screens. Matrices switch to per-alternative
cards below 768 px. Keep intrinsic grid widths at zero/minmax(0,1fr) to prevent overflow. Touch layouts
enlarge button targets. Large tables scroll within their own region, never the page.

## Performance and verification

No new runtime dependency. Playwright and axe-core are dev-only. Removed scroll-driven hero motion and
large moving blur filters. Backgrounds use static CSS/SVG; no canvas, video or remote fonts. Existing
route splitting is retained. Full font language coverage is retained. See the status file for measured
bundle sizes and exact executed checks; a successful automated axe scan is not a full WCAG certification.

From `frontend`:

```text
npm ci
npm run format
npm run lint
npm run typecheck
node node_modules/vitest/vitest.mjs run
node node_modules/@playwright/test/cli.js test
npm run build
```

For first-time browser setup run `npx playwright install chromium`. Browser tests mock all API calls,
including SSE. They never need real credentials or consume Gemini quota. Screenshots are generated in
`frontend/test-results` (ignored by Git), named 0–9 in route order from `e2e/ui-effects.spec.ts`, plus
AI-state captures. These are review artifacts, not pre-approved pixel-diff baselines.

## Extending the system

Add semantic colors to CSS first, then map Tailwind utilities. Reuse shared field/button/dialog helpers.
Choose feedback rather than ambient motion for working screens. Supply text alternatives for new
charts, mock data for UI tests, reduced-motion behavior and mobile checks before shipping a new view.
Do not add a route merely because it appears in the historical specification: scenarios, settings,
history, commitments and outcomes still require a separately implemented product workflow.
