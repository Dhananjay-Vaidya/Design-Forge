# ADR-0002: Decision/account deletion policy

**Status:** Accepted
**Date:** 2026-09-23
**Resolves:** `docs/14-assumptions-open-questions.md` OQ-4

## Context

BR-014 requires deletion to "remove or anonymize dependent private data per the deletion policy"
without fixing which. `docs/14-assumptions-open-questions.md` D-8 recommends hard-delete with cascade
as the simple default, with anonymization as an optional future path.

## Decision

- Deleting a `Decision` hard-deletes it and all dependent rows via `ON DELETE CASCADE`
  (alternatives, criteria, scores, snapshots, AI jobs/results, scenarios, commitments, outcome
  reviews), per `docs/04-database-design.md` §6.
- An `ActivityEvent` row is written recording the deletion (actor, action=`decision.delete`,
  target_type=`decision`, target_id) with no private payload in `metadata`.
- Deleting a user account cascades their owned decisions and profile; `activity_event.actor_id` is
  set NULL (`ON DELETE SET NULL`) so audit shape survives without retaining identity;
  `ai_usage_record` cascades.
- `commitment.alternative_id` is `ON DELETE RESTRICT`: the API blocks deleting an alternative that
  is referenced by an active commitment, returning `409 conflict`.
- No anonymization mode is implemented in MVP; it remains a documented future option if aggregate
  retention is later required.

## Consequences

- Simple, predictable, matches user expectation of "delete means gone."
- No orphaned private data can remain (satisfies BR-014, SEC-07).
- If product direction later wants anonymized retention for analytics, that is an additive change
  (new deletion mode), not a schema rework.
