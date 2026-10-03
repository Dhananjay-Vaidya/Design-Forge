# 15 — UI Design Inventory

**Project:** DecisionForge AI · **Date:** 3 October 2026 · **Source of truth:** `frontend/src` at
commit `902e68b` plus the working tree.

This document catalogues every UI element, visual treatment and effect currently in the frontend:
the foundations they are built on, the shared components, and what each page and panel uses. It
describes what the code does today; the requirements behind it are in
[`07-frontend-ux-specification.md`](07-frontend-ux-specification.md).

---

## 1. Design language in one paragraph

A calm, precise "decision laboratory": light neutral surfaces, one teal accent for everything that
is **calculated**, and a violet accent reserved for everything that is **AI-advisory**, so the two
are never confused. Numbers are set in a monospaced face. Surfaces are near-opaque "glass" panels
over a faint engineering grid and soft colour washes. Motion is short and functional: things
enter, re-order or confirm, and nothing loops for decoration. Every effect has a reduced-motion
fallback, and the full experience works in light and dark mode.

## 2. Foundations

### 2.1 Colour tokens

Defined as space-separated RGB channels in `src/styles/globals.css` and exposed to Tailwind in
`tailwind.config.js`, so any token takes an alpha suffix (`bg-primary/10`). Dark mode is
class-based (`.dark` on `<html>`, toggled by `stores/themeStore.ts`, persisted in `localStorage`
under `df-theme`, falling back to the OS preference).

| Token | Role | Light | Dark |
|-------|------|-------|------|
| `bg` | Page background | `#F6F7F9` | `#0C121D` |
| `surface` | Cards, panels, inputs | `#FFFFFF` | `#131B28` |
| `surface-2` | Subtle fills, hovers, tracks | `#F0F2F5` | `#1B2534` |
| `text` | Primary text | `#0F1720` | `#E7EBF0` |
| `muted` | Secondary text, icons | `#546070` | `#96A1B0` |
| `border` / `border-strong` | Dividers / input borders | `#E1E5EB` / `#C8CFD9` | `#252C37` / `#37404E` |
| `primary` | Calculated results, CTAs, focus | `#0D766E` (teal 700) | `#2DD4BF` (teal 400) |
| `primary-hover` / `primary-soft` | Hover / tinted backgrounds | `#0F615B` / `#DEF4F0` | `#5EEAD4` / `#102E2C` |
| `on-primary` | Text on primary | white | `#042624` |
| `ai` | AI-advisory content only | `#7C3AED` | `#A78BFA` |
| `success` / `warning` / `danger` | Status semantics | `#15803D` / `#B45309` / `#C41E1E` | `#4ADE80` / `#FBBF24` / `#F87171` |
| `gold` | Winner accent (ranking leader panel) | `#8A5E13` | `#E4C375` |
| `info`, `scenario`, `silver`, `bronze` | Reserved, defined but not yet used | see CSS | see CSS |
| `elevated`, `floating` | Aliases of `surface` | | |

Rules in force: status is never shown by colour alone (always icon + text); AI content always
carries the violet accent and an "Advisory" label; calculated content uses teal and a
"Calculated, not AI" label.

### 2.2 Typography

| Use | Face | Notes |
|-----|------|-------|
| All UI text | **Geist Variable** (self-hosted via `@fontsource-variable/geist`) | Stylistic sets `ss01`, `cv11`; headings `text-wrap: balance`; long words wrap (`overflow-wrap: anywhere`) |
| Numbers, scores, counts, codes, `kbd` | **Geist Mono Variable** | `tabular-nums` globally, so digits never jitter while animating |
| Eyebrows | `.eyebrow`: 12 px, medium, uppercase, 0.08em tracking, muted | Section labels ("HOW IT WORKS") |
| Lab labels | Mono 10 px, wide tracking (`DECISION LAB / 01`, `DECISION SPACE`) | Navigation and schematic captions |

Scale in use: hero 36→58 px, page titles 30–36 px, section titles 30–36 px, card titles 16–24 px,
body 15–18 px, meta 11–13 px.

### 2.3 Shape, depth and layering

| Property | Values |
|----------|--------|
| Radius | Controls `rounded-lg` (8 px); cards `rounded-xl` (12 px); panels and chrome `rounded-2xl` (16 px); CTA band `rounded-3xl`; chips `rounded-full` |
| Shadows | `shadow-soft` (resting buttons, active pills); `shadow-lift` (hover lift, tooltips); `--shadow-panel` (every `.card`); glow shadows tinted with `--color-primary` or `--color-ai` on primary CTAs, step icons, avatar and AI send button |
| Glass blur | `--blur-chrome: 8px`; disabled on touch and small screens |
| z-index | chrome 30 (headers), overlay 40 (menus, backdrops), dialog 50 (dialogs, palette, AI panel, toasts) |
| Focus ring | 2 px solid `primary`, 2 px offset on every `:focus-visible`; inputs use a 4 px soft ring |

### 2.4 Motion system

Central values in `src/lib/motion.ts` and CSS custom properties:

| Token | Value | Used for |
|-------|-------|----------|
| `feedback` / `--dur-fast` | 140 ms | Hover colour, press, toggles |
| `component` / `--dur-base` | 220 ms | Panels, menus, list items, tab indicator |
| `page` / `--dur-page` | 320 ms | Page transitions, scroll reveals, count-ups |
| Easing | `cubic-bezier(0.16, 1, 0.3, 1)` ("expo out") | Nearly everything |
| Springs | stiffness 380–500, damping 32–40 | Sliding pills/indicators, list re-ordering, drawer |

`entrance(reduced)` gives the page-transition preset; `motionPresets` provides `page`, `panel`,
`feedback`, `stagger` and `score` variants.

**Reduced motion** is honoured three ways: `<MotionConfig reducedMotion="user">` for every Motion
animation, a global CSS rule that collapses CSS animations and transitions to ~0 ms, and
component checks (`Reveal`, `CountUp`, Recharts `isAnimationActive`) that render the final state
immediately. **Hidden tabs** pause CSS animations (`EffectsLifecycle` sets `data-effects-paused`).

### 2.5 Iconography

Lucide (`lucide-react`) only, outline style, 14–20 px, `aria-hidden` when decorative. Icon-only
buttons always carry an `aria-label`. Notable meanings: `Calculator` = calculated, `Sparkles` = AI,
`Trophy` = leader, `ShieldCheck` = stable, `TriangleAlert` = close call, `TrendingUp`/`TrendingDown`
= higher/lower is better.

## 3. Shared surfaces and effect classes

| Class / element | What it looks like | Where it is used |
|-----------------|--------------------|------------------|
| `.card` | White/surface panel, 1 px border, 12 px radius, panel shadow | Editor rows, add forms, matrix, breakdown table, wizard card, trust cards |
| `.glass` / `.glass-strong` | Surface at 96 % / 98 % opacity, hairline border, inner top highlight, layered shadow, 8 px backdrop blur | Headers, stat tiles, toolbar, dialogs, toasts, user menu, palette, AI panel, auth card, demo panels, FAQ, hero chips |
| `.spotlight` | On hover/focus: soft teal radial glow that follows the cursor, plus a teal "lit edge" on the border under the pointer | Feature cards, dashboard cards and rows, stat tiles |
| `.skeleton` | `surface-2` block with a shimmering highlight sweeping left→right (1.4 s) | All loading states |
| `.grid-texture` | 40 px engineering grid in `border` colour, usually radially masked | Page background wash, auth brand panel, 404, winner panel corner |
| `.input-base` | 44 px tall field, strong border, teal border + soft ring on focus, red when `aria-invalid` | Every text input, select and textarea |
| `.winner-panel` | Gold-tinted border with a gold inner top stripe | Leading-option card on the Ranking tab |
| `.lab-path` | Dashed SVG stroke that "flows" twice along the path | Hero decision-network schematic |
| `.float-y` | Gentle 8 px vertical float, runs once | Hero floating chips |
| `animate-grow-x` | Bars scale in from the left (700 ms) | Hero preview bars, feature-card breakdown bars |
| `animate-rise` / `animate-fade-in` / `animate-scale-in` | Small entrance animations (420 / 220 / 220 ms) | Toasts, list rows, auth card, workspace header, dialogs |
| Aurora washes | Two large, blurred, **static** teal radial washes at ~7–8 % opacity | Behind the app, auth and landing hero |
| `dialog::backdrop` | 55 % near-black scrim with 2 px blur | Native dialogs |

## 4. Shared components

### 4.1 Actions and inputs

| Component | Elements and variants | Effects |
|-----------|----------------------|---------|
| `Button` / `ButtonLink` (`components/Button.tsx`) | Variants `primary`, `secondary`, `ghost`, `danger`, `soft`; sizes `sm` 36 px, `md` 40 px, `lg` 48 px, `icon` 40×40. `ButtonLink` renders a real link with button styling | 140 ms colour/border transition, press scale to 98 %, spinner and `aria-busy` while loading, 50 % opacity when disabled |
| `FormField` / `TextAreaField` | Label (with "Optional" tag), input, hint or error line; password fields get an eye toggle | Error text fades in; error and hint linked via `aria-describedby`; errors announced with `role="alert"` |
| `DirectionToggle` | Two-option segmented control: "Higher is better" (TrendingUp) / "Lower is better" (TrendingDown) | Selected segment lifts to `surface` with soft shadow; full radio-group keyboard support (arrows, Home, End) |
| `WeightStepper` | − / numeric input / + | Steps by whole points, minimum 1, minus disables at 1, invalid value turns red |
| `WeightBar` | Stacked horizontal bar of normalised weights + legend with percentages | Segments in 5 teal shades; segment widths animate (`flex-grow` transition) as weights change |
| `StatusChip` | Pill with icon + label | See table below |

| Status | Label | Icon | Tone |
|--------|-------|------|------|
| `DRAFT` | Draft | CircleDashed | neutral grey |
| `SCORED` | Ready to rank | Calculator | teal |
| `COMMITTED` | Committed | CircleCheck | green |
| `UNDER_REVIEW` | Review due | CalendarClock | amber |
| `REVIEWED` | Reviewed | ShieldCheck | green |
| `ARCHIVED` | Archived | Archive | neutral grey |

### 4.2 Overlays and feedback

| Component | Design | Behaviour and effects |
|-----------|--------|----------------------|
| `Dialog` (center) | Native `<dialog>`, `glass-strong`, 16 px radius, max 448 px, title + close button, description, body, right-aligned footer (stacked on mobile) | Scales in; Esc and backdrop click close; Tab is trapped inside (`trapDialogTab`); page scroll locked while open |
| `Dialog` (drawer) | Same, docked to the left edge, full height, ≤ 320 px | Used for mobile navigation |
| `ConfirmDialog` | Dialog with Cancel + confirm button (`danger` or `primary`) | Confirm shows a spinner while working |
| `Toaster` | Bottom-right stack (full width on phones), `glass-strong` cards with tone icon, title, description, dismiss | Rise-in animation, auto-dismiss after 4.5 s, max 3 visible, polite live region (never steals focus) |
| `CommandPalette` | Centered `glass-strong` dialog: search field with Esc hint, grouped results ("Actions", "Decisions" with status hint), keyboard legend footer | Backdrop fades in with blur; dialog scales and drops in; a teal highlight pill **slides** between results (shared layout animation); ↑/↓/Enter/Esc; focus restored on close |
| `EmptyState` | Dashed-border panel, teal icon tile, title, explanation, optional action | Used everywhere a list or view can be empty |
| `ErrorState` | Red-tinted panel, alert icon, message, "Try again" button, faint request id | Hides server error details for 5xx responses |
| `Skeleton` | Shimmer blocks shaped like the content | Loading states |

### 4.3 Brand, chrome and effects

| Component | Details |
|-----------|---------|
| `Logo` / `LogoMark` | 32 px teal rounded square with four stacked bars narrowing upward ("many options weighed down to one"), wordmark "DecisionForge **AI**" (AI in muted). Same mark is the favicon |
| `ThemeToggle` | 40 px icon button, Moon in light mode, Sun in dark mode |
| `UserMenu` | Gradient teal→violet avatar circle with the user's initial and a teal glow; menu (`glass-strong`) scales in from the top-right with name, email and a red "Sign out" item; focus moves into the menu, Esc returns it |
| `LabNavigation` | Desktop: sticky left sidebar card (`DECISION LAB / 01`), links "Decision library" and "New decision" (active link teal-tinted), collapse to a 72 px icon rail, tagline "Your criteria. Your evidence. *A reasoned choice.*" Mobile: "Laboratory navigation" button opening a left drawer |
| `AmbientBackground` | Static teal colour washes + masked grid behind content (`hero` and `app` sizes) |
| `Reveal` | Fades and rises content 18 px into place the first time it scrolls into view (320 ms) |
| `CountUp` | Animates a number from its previous value to the new one (320 ms); screen readers get the final value |
| `SpotlightCard` / `trackSpotlight` | Feeds the pointer position into `.spotlight` |
| `Marquee` | Now a static, wrapping, centred row of chips (no scrolling) |
| `EffectsLifecycle` | Pauses CSS animations while the browser tab is hidden |
| `AssistantText` | Renders AI output as plain paragraphs, violet-dot bullet lists and **bold** spans; never renders HTML |

## 5. Page by page

### 5.1 Landing page (`/`)

| Section | Elements | Design and effects |
|---------|----------|--------------------|
| Header | Logo, in-page links (How it works, Live demo, Features, FAQ; desktop only), theme toggle, "Sign in" link, "Get started" button | Sticky; transparent at the top, turns into a floating `glass` bar once the page scrolls |
| Hero | Pill badge "Decision intelligence laboratory" with a **pinging teal dot**; headline "Hard choices. / **Clear reasoning.**" (second line teal); explanatory paragraph; "Start deciding →" primary CTA (teal glow, arrow nudges right on hover) and "Try the live demo" glass button (lifts on hover) | Badge, headline, text and buttons enter in sequence (fade + rise, 0.5–0.7 s, staggered); hero aurora wash and grid |
| Decision-network schematic | Bordered figure "DECISION SPACE · ILLUSTRATIVE MODEL": SVG of Question → Weights → options A/B/C → result 01, with a violet line "Gemini advisory layer · questions, risks, counterpoints" | The highlighted teal path draws with a flowing dashed stroke (runs twice) |
| Ranking preview | "Example"-labelled card with window-style dots, three ranked offers with scores and bars, trophy on the leader, footer "Calculated, not AI" + weights | Card tilts in from 8° on the X axis while rising (0.9 s); bars grow in sequence; three glass chips float once around it ("Commute · lower is better", "Leader stable", "AI stays advisory") |
| Example decisions | Wrapped row of glass chips with example questions ("Rent or buy?", "Which candidate should we hire?" …) | Static; translucent band with top/bottom borders |
| How it works | Eyebrow + title; four steps with teal icon tiles (glow), "Step 01" mono labels, title and text | A gradient connector line draws across the steps when scrolled into view (1.2 s); steps reveal with 100 ms stagger |
| Live demo | Two glass panels: four labelled range sliders (with direction icon, % share and raw weight) + Reset; "Ranking" list with leader highlight and "Calculated live" badge; stability callout | Ranks **physically re-order** with a spring layout animation as you drag; bars resize with a spring; the trophy pops in with a rotate; the stability callout swaps between green "Leader stable" and amber "Close call" with a small fade |
| Features | Bento grid of 7 cards (two span 2 columns): audit breakdown (with growing mini bars), sensitivity, guided setup, keyboard scoring (with `kbd` keys), plain-language criteria, AI advisory (violet), light and dark | Cards reveal staggered; on hover: lift 4 px, shadow, cursor-following spotlight + lit border, icon tile scales up and tilts −6° |
| Two kinds of output | Two cards: teal "Calculated / The ranking" and violet-bordered "Advisory / The AI insights" | Scroll reveal |
| FAQ | Glass accordion of 5 questions | First item open; plus icon rotates into an × (45°); answers expand/collapse with animated height and fade; question text turns teal on hover |
| Closing CTA | Full-width teal band with masked grid and a violet wash, headline, text, inverted "Create your account →" button | Button scales to 103 % on hover, arrow nudges right |
| Footer | Logo and tagline "Deterministic ranking · advisory AI." | |

### 5.2 Sign in (`/login`) and Register (`/register`) — `AuthLayout`

| Area | Elements | Design and effects |
|------|----------|--------------------|
| Form side | Logo, theme toggle, glass card with mono label "DECISION INTELLIGENCE LAB", title ("Welcome back" / "Create your account"), link to the other page | Ambient wash behind; card rises in |
| Login form | Email, password (show/hide toggle), full-width 48 px "Sign in" button | Server errors shown in a red banner with icon at the top of the form; button shows a spinner and "Signing in…" |
| Register form | Email, password, live checklist line "At least 10 characters" | The check icon and text turn green the moment the rule is met; field-level server errors map to the right input |
| Brand panel (desktop only) | Eyebrow "Decisions, made legible", headline "Stop going in circles. **Weigh it, score it, rank it.**", three bordered icon tiles with benefits | Radially masked grid behind |

### 5.3 App shell (every `/app` page)

| Element | Design and effects |
|---------|--------------------|
| Skip link | "Skip to content" appears top-left on keyboard focus |
| Header | Floating `glass` bar (max 1440 px, 16 px radius): logo (wordmark hidden on phones), "Dashboard" nav with a **sliding grey pill** for the active item, "Search · Ctrl K" button (icon-only on small screens), "New decision" button (icon-only on phones, tooltip shows the `N` shortcut), theme toggle, user menu |
| Sidebar | `LabNavigation` (see 4.3) |
| Page transitions | Each page fades and rises 10 px in (220 ms) and fades/lifts out; switching tabs inside one decision does **not** replay it |
| Shortcuts | `Ctrl/⌘ + K` toggles the command palette; `N` (when not typing) starts a new decision |
| Accessibility | Focus moves to the main region on every route change |
| Session loading | Full-screen pulsing logo mark with "Loading…" for screen readers |

### 5.4 Dashboard (`/app`)

| Area | Elements | Design and effects |
|------|----------|--------------------|
| Heading | Time-based greeting with the user's name, "Your decisions", subtitle, "New decision" button | Button glow; plus icon rotates 90° on hover |
| Stat tiles | Glass tiles: Open decisions, Drafting, Ready to rank (teal icon), Committed (green icon) | Tiles stagger in (60 ms apart); numbers **count up** in mono; hover lifts the tile, scales its icon and shows the spotlight |
| Toolbar | Glass bar with filter buttons (All / In progress / Committed / Archived, each with a mono count), search field, sort select (Recently updated, Newest first, Deadline soonest, Title A–Z), grid/list toggle | Active filter and active view use **sliding pills** (springs); view choice is remembered (`localStorage` `df-dashboard-view`) |
| Decision cards (grid) | Status chip, title (2 lines), context (2 lines), category, deadline (red when overdue), relative "updated" time | Hover: lift 4 px, teal border, shadow, title turns teal, spotlight glow, and an arrow ↗ slides in from the corner |
| Decision rows (list) | Title, meta, status chip, time, arrow | Same hover language, compact |
| Filtering and sorting | | Cards animate in, out and into their new positions (spring layout, "pop" exit) |
| States | Skeleton tiles and cards; error panel with retry; first-run empty state "Frame your first decision"; "Nothing matches" for empty searches | |

### 5.5 New decision wizard (`/app/decisions/new`)

| Area | Elements | Design and effects |
|------|----------|--------------------|
| Back link | "← Dashboard" | |
| Stepper | Three numbered circles (Details, Options, Criteria) joined by lines | Completed: solid teal with a check; current: soft teal with a teal ring; connectors turn teal as steps complete; labels hidden on phones |
| Card | "Step N of 3" eyebrow, step title (receives focus on step change), helper text, step form, footer with Cancel/Back and Continue/Create | Steps stay mounted (just hidden), so entered data survives Back/Continue |
| Step 1 — Details | Title, context (textarea), category (input with suggestions: Career, Business, Finance …), "Decide by" date | Validation messages under fields |
| Step 2 — Options | Add field + "Add" button (Enter adds), numbered list of options with remove buttons, dashed placeholder when empty | New rows rise in; duplicates and blanks are rejected inline |
| Step 3 — Criteria | Add field, rows with name, direction toggle, weight stepper, remove; "How much each criterion counts" weight bar; teal summary card "Ready for the scoring table" | Weight bar segments resize live |
| Create | Button shows spinner and "Creating…" | Success toast, then lands on the Scores tab |

### 5.6 Decision workspace (`/app/decisions/:id`)

| Area | Elements | Design and effects |
|------|----------|--------------------|
| Breadcrumb | Dashboard › decision title | |
| Header | Title + status chip, category, deadline, "Updated …", context paragraph | Fades in |
| Actions | **Ask AI** (violet-tinted button with a white shine that sweeps across on hover), Edit, Archive, Delete (red ghost) | Edit opens a form dialog; Archive/Delete open confirmation dialogs; results confirmed by toasts |
| Stage tabs (≥ 640 px) | Options · Criteria · Scores · Ranking with chevrons between; progress badges (`✓ 3`, `6/9`) green when complete | Active tab has a **glowing teal underline that slides** between tabs; tab icons nudge up on hover; screen-reader text states each stage's readiness |
| Stage select (phones) | Native select "Decision stage" listing each stage and its readiness | |
| Opening a decision | Lands on the first unfinished stage, else Ranking | |

#### Options tab

Add form (name + optional note + "Add option"); numbered option cards with up/down reorder,
rename (inline form, Esc cancels), and delete (confirmation warns that its scores go too). Rows
rise in with a 30 ms stagger. "Next: criteria →" soft button once two options exist; amber hint
while fewer than two.

#### Criteria tab

"Weight distribution" card with the live weight bar; add form (name, direction toggle, weight
stepper); criterion rows with an on/off **switch** (teal track, sliding knob), name with
"Counts for N% of the total" or "Excluded from ranking", direction toggle, weight stepper (saves on
blur/Enter/step), rename and delete. Switched-off criteria are struck through and dimmed. Toasts
confirm include/exclude.

#### Scores tab

| Element | Design and effects |
|---------|--------------------|
| Save indicator | "Changes save automatically" → spinner "Saving…" → green "All changes saved", or red "Couldn't save" + Retry; announced politely |
| Progress card | Mono "6 / 9 filled", progress bar (teal, turns green when complete, width animates), then "See ranking →" |
| Matrix (≥ 768 px) | Real table: sticky first column with option names, criterion headers with direction icon and weight share, 44 px score cells |
| Cards (phones) | One card per option with a row per criterion |
| Cell states | Empty: dashed amber border on a faint amber fill; invalid: red border and text; filled: **heat tint**, the cell background shades teal in proportion to how good the score is (direction-aware); unsaved edit: faint teal ring |
| Row/cell focus | The focused row tints teal and the focused cell gets a teal underline |
| Keyboard | ↑/↓ and Enter move between cells; Enter at the bottom moves to the next column; text is selected on focus |

#### Ranking tab

| Element | Design and effects |
|---------|--------------------|
| Header strip | Teal pill "Calculated, not AI · weighted-sum.v1", "Computed …", "Recalculate" (icon spins while fetching) |
| Leader panel | `glass` + **gold winner panel**, corner grid texture, "LEADING OPTION" eyebrow with trophy, option name, large mono score that **counts up** to its value, "Ahead of … by N pts" |
| Stability callout | Green "Leader stable" (ShieldCheck) or amber "Close call — leader may change" (TriangleAlert) with guidance |
| Chart | Glass panel: horizontal Recharts bar chart, leader solid teal, others at 40 % opacity, rounded bar ends, value labels in mono, custom glass tooltip, 600 ms grow-in (off for reduced motion), described for screen readers |
| Breakdown table | "Score breakdown" table: rank, option (trophy on leader, leader row tinted teal), points contributed per criterion (with weight % under each header), bold total |
| Not ready | Amber panel "Not ready to rank yet" listing what is missing per area with "Fix →" links |

### 5.7 Ask AI panel (from any decision)

| Element | Design and effects |
|---------|--------------------|
| Container | Right-hand drawer (full screen on phones, max 448 px), `glass-strong` with a violet left edge, slides in on a spring; dimmed, lightly blurred backdrop |
| Header | Gradient violet→teal icon tile with glow, "Ask AI" + violet "ADVISORY" pill, "About '<title>'", clear-conversation and close buttons |
| Disclaimer strip | Violet-tinted band with an info icon, always visible |
| Empty state | Short explanation + four suggested questions as bordered buttons that stagger in and lift with a violet tint on hover |
| Messages | User questions right-aligned in solid teal bubbles; assistant answers left-aligned beside a violet sparkle avatar, rendered by `AssistantText` |
| Streaming | Three bouncing violet dots while thinking, then text streams in with a blinking violet caret |
| Errors | Red alert card with the reason (quota, busy provider, outage) and "Try again" |
| Composer | Auto-growing textarea in a rounded field that gains a violet border and ring on focus; gradient send button (scales on hover/press) that turns into a Stop button while answering; "Enter to send · Shift+Enter for a new line" and "N left today" |
| Disabled | If the server has no Gemini key, an explanation card replaces the conversation and the composer is disabled |

### 5.8 Not found (`*`)

Centred logo mark, mono "404" in teal, "This page doesn't exist", short explanation, secondary
"← Back to home" button, radially masked grid behind.

## 6. Motion and effects index

| Effect | Where | Trigger | Duration | Reduced motion |
|--------|-------|---------|----------|----------------|
| Page transition (fade + 10 px rise) | App pages | Route change | 220 ms | Opacity only |
| Scroll reveal (fade + 18 px rise) | Landing sections | First time in view | 320 ms, staggered | Shown immediately |
| Sliding pills / underline | Header nav, dashboard filters and view toggle, workspace tabs, palette selection | Selection change | Spring | Instant |
| Layout re-ordering | Dashboard cards, live-demo ranking | Filter/sort/weight change | Spring | Instant |
| Count-up numbers | Stat tiles, leader score | Value change | 320 ms | Final value shown |
| Bar growth | Hero preview, feature card, ranking chart | Mount | 600–700 ms | Static |
| Cursor spotlight + lit edge | Feature cards, dashboard cards/rows, stat tiles | Hover / focus | 220 ms fade | Disabled |
| Hover lift | Cards, stat tiles, hero demo button, suggestions | Hover | 220 ms | Colour change only |
| Shine sweep | Ask AI button | Hover | 700 ms | Disabled |
| Hero card 3D tilt-in | Landing preview | Page load | 900 ms | Static |
| Pinging dot | Hero badge | Continuous | CSS `animate-ping` | Single frame |
| Dashed path flow | Decision-network SVG | Page load, runs twice | 3 s | Static |
| Floating chips | Hero | Page load, runs once | 6 s | Static, hidden on phones |
| Skeleton shimmer | Loading states | While loading | 1.4 s loop | Static block |
| Drawer slide | Ask AI panel | Open/close | Spring | Instant |
| Menu / palette scale-in | User menu, command palette, dialogs | Open | 160–220 ms | Instant |
| Thinking dots + streaming caret | Ask AI | While answering | 0.9 s loop | Minimal |

## 7. Responsive and touch behaviour

- Breakpoints follow Tailwind: `sm` 640, `md` 768, `lg` 1024 px; content max width 1152 px
  (marketing) or 1440 px (app).
- Phones: header labels collapse to icons, the sidebar becomes a drawer, workspace tabs become a
  select, the score matrix becomes per-option cards, dialogs and the AI panel go full width.
- Touch devices and screens under 768 px: all buttons and labelled links get a 44 px minimum
  height, glass backdrop blur is switched off (performance), floating chips do not animate.
- The page body never scrolls horizontally; wide tables scroll inside their own container.

## 8. Accessibility patterns built into the UI

Visible focus everywhere; skip link; focus moved to the main region after navigation and to the
step heading in the wizard; native `<dialog>` with Tab trapping and focus return; `aria-live`
regions for toasts, save state, demo ranking and AI streaming; `role="alert"` for errors; proper
table semantics and captions; radio-group, switch and toggle-button roles with correct state
attributes; status always icon + text; charts described in text; AI output never rendered as HTML.

## 9. Inconsistencies and dormant styles (cleanup candidates)

| Item | Finding | Suggestion |
|------|---------|------------|
| `.marquee`, `.marquee-track`, `@keyframes marquee` | `Marquee` is now static; these styles are unused | Remove, or rename the component to `UseCaseChips` |
| `.text-gradient`, `@keyframes gradient-pan` | No longer used (hero uses solid teal) | Remove |
| `.aurora-a/.aurora-b` keyframes | Overridden to `animation: none`; `.aurora-blob` forces a teal wash with `!important`, so the violet `--aurora-2` colour passed inline never shows | Simplify `AmbientBackground` to a single static wash |
| Stale comments | `AmbientBackground` says "slow-drifting"; `LandingPage` calls the use-case chips a "ticker" | Update the comments |
| Unused tokens | `info`, `scenario`, `silver`, `bronze`, `elevated`, `floating` | Keep for planned scenario/podium features or drop |
| Glass naming | `.glass` is now 96 % opaque with light blur, closer to "frosted panel" than glassmorphism | Fine for legibility; rename only if it confuses contributors |
| Ask AI button | Violet-tinted outline style, while the AI send button and avatar use the violet→teal gradient | Pick one AI button style |
| Two visual vocabularies | Older surfaces say "Dashboard"/"Your decisions"; newer ones use "Decision library"/"Laboratory" | Align naming in the header nav and sidebar |

## 10. Adding to the UI

- Use tokens, never raw hex: `bg-surface`, `text-muted`, `bg-primary/10`, `text-ai`.
- Calculated content gets teal and a "Calculated" label; AI content gets violet and an "Advisory"
  label.
- Use `.card` for working surfaces and `.glass` for chrome and anything over the ambient wash.
- Use `motionTiming`/`motionPresets` from `src/lib/motion.ts` for any new animation, animate only
  `transform` and `opacity`, and check it with the OS "reduce motion" setting on.
- Every new view needs loading, empty, error and success states (§4.2).
