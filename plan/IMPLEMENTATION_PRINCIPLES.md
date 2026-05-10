# Implementation Principles

## Structured Errors and Logs

- Server-side runtime code should use `src/lib/logger.ts` instead of raw `console.*`.
- Log entries should include a stable `event` field, plus identifiers needed for debugging such as `runId`, `source`, `sourcePaperId`, counts, status, and `err` when an exception is available.
- Error logs should be actionable and clean: describe what failed, include the boundary where it failed, and avoid dumping unrelated payloads.
- Expected partial outcomes should be logged as state, not treated as exceptions. For example, a source collection run may complete with fewer than the target candidate count when sources under-deliver.
- CLI scripts and one-off validation tools may keep concise `console.*` output when the output is the user interface of the command.

## Background Collection

- Next.js route handlers that start background work should schedule it with `after()` from `next/server`.
- Route handlers that schedule collection work should declare a `maxDuration` matching the expected platform budget.
- Source clients should use bounded fetches. Phase 2 uses a 10 minute timeout so one stalled provider cannot leave the run open indefinitely.

## Integration Tests

- Integration tests that require local services must be explicitly enabled with `RUN_INTEGRATION=1`.
- `DATABASE_URL_TEST` alone is not enough to opt in; this prevents stale local environment values from causing surprise failures.
- When integration tests are enabled, missing services should fail clearly rather than being silently ignored.
