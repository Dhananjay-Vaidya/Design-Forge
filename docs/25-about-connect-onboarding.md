# 25 — About Us, Connect & Onboarding

**Product:** DecisionForge AI · **Date:** 2026-10-12
**Adds:** an `/about` page (story + connect), a working contact form, and clear onboarding paths.
**Builds on:** docs 24 (marketing copy), 19/23 (guide + tour), 15/16 (UI invariants).
**Honesty rule:** no invented team, stats, office, or founding myth. Real details go in the `{…}`
placeholders; collect real testimonials before showing any.

---

## 1. Where it sits

- New public route **`/about`**, linked from the landing nav and footer, and from the Guide.
- The contact form posts to a **new public backend endpoint** (`POST /api/v1/contact`) — a real,
  rate-limited, spam-protected feature, not a `mailto:` link.
- Onboarding = three paths on the page: create account (primary), try the guided demo, or contact us.

---

## 2. About page copy

### 2.1 Hero
**Eyebrow:** About DecisionForge
**Headline:** The method behind better decisions.
**Sub:** We're building the tool we always wanted for the choices that actually matter — where the math
is transparent, the AI stays advisory, and every decision is one you can defend and learn from.

### 2.2 Why we built it
Most decision tools stop at a one-time pros-and-cons list. Most AI tools hand you a confident answer you
can't audit a week later. Neither helps you make a choice you can stand behind. DecisionForge started
from a simple belief: the hard part of a decision was never the arithmetic — it was being honest about
what matters, seeing the trade-offs clearly, and remembering why you chose. So we built a place to do
exactly that.

### 2.3 What we stand for (the principle)
**Heading:** AI advises. You decide.
**Body:** We drew one hard line and we won't cross it. AI here can ask a sharper question, surface a risk
you missed, or argue the other side. It cannot touch your scores, your weights, or your ranking. The
judgment stays yours — because a decision you didn't make isn't one you can own.

### 2.4 Who's building this
> Fill with your real details. Honest and specific beats a fake team page.

**Heading:** Built by people who sweat the details.
**Body:** DecisionForge is built by {your name / "a small team"} — {one honest line: e.g. "an engineer
who spent years on data and backend systems and got tired of making big calls on gut feel"}. We're
{solo / a small group} by choice right now: close to the product, fast to respond, and reachable by a
real person when you write to us.
**Optional founder line:** — {Your Name}, {role, e.g. "Founder & Engineer"}, {city}

### 2.5 Where we're headed
We're focused on doing one thing exceptionally: helping an individual make a structured, reviewable
decision. Next on the path: richer sensitivity analysis, a calibration profile that teaches you your own
patterns, and ways to bring a trusted second opinion into a decision without losing your own voice.
We'll add features when they earn their place — not before.

### 2.6 Values (short list)
- **Transparency over magic.** If we can't show the working, we don't ship it.
- **Advice, not autopilot.** The tool sharpens your judgment; it never replaces it.
- **Privacy by default.** We send the minimum, store the minimum, and let you delete anything.
- **Earned trust.** No dark patterns, no invented social proof, no selling your decisions.

### 2.7 Signature
**Created by AI, Designed by Human.**

---

## 3. Connect with us (on the About page)

**Heading:** Let's talk.
**Sub:** Feedback, a feature you wish existed, a partnership, or just a hard decision you're wrestling
with — we read every message.

**Contact email (show as selectable text + a Copy button):** {hello@yourdomain.com}
**Links:** {GitHub} · {LinkedIn} · {X/Twitter} — use the real ones; omit any you don't have.
**Response expectation (honest):** "We're small, so you'll usually hear back within a couple of days."

### Contact form fields
- **Name** (required)
- **Email** (required, validated)
- **Reason** (select: General · Feedback · Partnership · Support · Press)
- **Message** (required, max ~2000 chars)
- **Consent checkbox** (required): "I agree to be contacted about this message." + link to privacy.
- Hidden **honeypot** field + optional bot challenge (anti-spam).

**Success message:** "Thanks — your message is in. We'll reply to {email} within a couple of days."
**Error message:** "That didn't send. Check your connection and try again, or email us directly at
{hello@yourdomain.com}."

---

## 4. Onboarding paths (end of About page)

**Heading:** Ready when you are.
Three cards, no dead ends:
1. **Start free** — "Bring a real decision. You'll have a clear ranking in minutes." → Create account.
2. **See it first** — "Take the 60-second guided tour, no sign-up needed." → launches the demo (doc 23).
3. **Talk to us** — "Not sure if it fits? Ask us anything." → scrolls to the contact form.

Optional: a single **"Get product updates"** email opt-in (one field + consent), only if you'll actually
send updates. Don't add it otherwise.

---

## 5. Build prompt (Claude Code / Codex) — About page + contact form

> Paste into your coding agent at the repo root. Builds the `/about` page and a real contact endpoint.
> Implement → verify → commit → continue, no confirmation gates. UI per docs 15/16; copy from §2–4.

### Role & mode
Implement a public **About page** and a working **contact form** in DecisionForge (React/TS/Vite/Tailwind
frontend; Django/DRF backend). Complete drop-in code, migration, tests, metrics. Reuse existing tokens,
motion, and components. No new heavy deps.

### Hard invariants
- Tokens only (teal `--color-primary` / violet `--color-ai`); light + dark; reduced-motion; keyboard +
  a11y (labelled fields, `aria-describedby` errors, `role="alert"`, visible focus); responsive, 44px
  targets, no horizontal scroll.
- Contact endpoint is **public but protected**: server-side validation, per-IP + global rate limit,
  honeypot + optional bot challenge, max lengths; friendly 429. Store minimal data; never log message
  bodies with PII beyond what's needed; no third-party sends of the data.
- Teal = calculated / violet = advisory semantics preserved anywhere the two outputs are mentioned.
- No invented testimonials/stats; leave `// TODO: real testimonials` placeholders. TypeScript strict +
  existing tests stay green.

### Phase 1 — Backend contact endpoint
- Model `ContactMessage` (id, name, email, reason, message, consent, created_at, ip_hash, handled bool).
- `POST /api/v1/contact` (no auth): validate (email format, required fields, max lengths, consent true,
  honeypot empty); rate-limit per IP + global; on success store the row and return `{ok:true}`; optional
  email notification to `{hello@yourdomain.com}` if SMTP env is configured, else just store.
- Metrics: `decisionforge_contact_submissions_total{result=ok|invalid|rate_limited|spam}`.
- Tests: valid submit stored; missing/invalid fields → 400 with field errors; honeypot filled → silently
  accepted-but-dropped (spam metric); rate limit → 429; no PII in logs.

### Phase 2 — About page (`/about`)
- New route + nav/footer links. Render the §2 sections with real typographic hierarchy (hero, why-we-
  built-it, the principle in violet framing, who's-building, where-headed, values). Keep it calm — this
  is read, not operated; one tasteful motion moment at most (reuse `Reveal`).
- Put all copy in `content/about.ts`; use `{…}` placeholders wired to a single `content/site.ts`
  (contact email, social links, founder name) so real details live in one place.

### Phase 3 — Contact form + onboarding cards
- Build the §3 form (React Hook Form + Zod mirroring the backend), with loading/success/error states,
  the honeypot, consent checkbox, and a copyable contact email. Map server field errors back to inputs.
- Add the §4 three onboarding cards (Start free → register; See it first → `startTour('landing')` from
  doc 23; Talk to us → scroll to form). Optional updates opt-in only if wired to a real list.

### Per-phase checks, then commit
Run `npm run lint && npm run typecheck && npm run test -- --run && npm run build` + backend `pytest -q`
+ `makemigrations --check --dry-run`. Verify light/dark, reduced-motion, keyboard, mobile; submit happy
path + validation + rate-limit; no PII in logs. Commit each phase (`feat(about): <phase>`).

### Acceptance checklist
- [x] `/about` renders all §2 sections; copy in `content/about.ts`; real details in `content/site.ts`.
- [x] Contact form submits to `POST /api/v1/contact`; validation, honeypot, rate limit, consent enforced.
- [x] Success/error states clear; server errors map to fields; contact email shown + copyable.
- [x] Three onboarding cards wired (register / tour / scroll-to-form); no dead ends.
- [x] Tokens, light/dark, reduced-motion, keyboard, responsive all pass; no PII in logs; no heavy deps.
- [x] Metrics emitted; migration added; lint/typecheck/test/build/pytest green.

---

## 6. Decisions to confirm (so it matches reality)

- **Solo or team?** The copy defaults to a small/solo honest framing. Tell me if it's a team and I'll
  adjust the "who's building" block.
- **Contact channel:** form + email is the default. If you'd rather *only* show an email (no backend
  form), say so and I'll drop Phase 1.
- **Real details:** fill `content/site.ts` with your actual email, name, and links before launch — the
  page ships with placeholders, and shipping placeholders live reads as unfinished.

## Implementation record

- Implemented on the repository's current FastAPI, SQLAlchemy and Alembic backend, with React,
  TypeScript, React Hook Form and Zod on the frontend. No new dependencies were added.
- Confirmed public email: dhananjayvaidya4154@gmail.com. DecisionForge is a solo project.
  Unconfirmed founder name, role, city, social links and reply-time expectations are omitted.
  Public details are centralized in frontend/src/content/site.ts; page and form copy is in
  frontend/src/content/about.ts.
- /about and /privacy are public routes, linked from navigation and the footer. Guide links to
  About both before and after creating a draft. Privacy describes actual contact storage, manual
  deletion, account sessions and optional AI requests; no unsupported retention promise.
- The form posts to POST /api/v1/contact with loading, receipt, field errors, consent, a honeypot,
  a 2,000-character message limit, and preserved input after network or rate-limit failures.
  It saves messages in PostgreSQL. It does not send email notifications or third-party requests.
  Read, mark and delete messages using the owner-only commands in docs/contact-inbox.md.
- Onboarding routes create-account to /register, tour to /?tour=landing (starts after landing
  targets mount and clears the query), and contact to the form with keyboard focus. Reduced-motion
  preference is respected. No unwired newsletter or invented testimonial was added.
- Validation: 471 backend tests passed on a disposable local PostgreSQL database and temporary
  Redis service; Alembic upgrade and check passed. Earlier Docker runs encountered connection
  timeouts and a removed container stack, so final backend verification ran locally.
- Frontend: lint, typecheck and production build passed; all 207 unit tests passed (25 files).
  All 13 About/marketing browser checks passed, including light/dark desktop/tablet/phone layouts,
  reduced motion, accessibility, keyboard order and focus, copy email, form payload/loading/receipt,
  server validation, 429 retry text, registration and the guided tour.
- Live API check: public intake returned 200 with frontend CORS allowed; a honeypot submission
  stored no row and emitted the spam counter. The local application database is at revision
  b7c8d9e0f1a2. Backend and Redis are running with the existing local-PostgreSQL Compose override.
