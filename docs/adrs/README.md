# Architecture Decision Records

ADRs capture the *reasoning* behind architectural decisions, not just the decisions themselves. Future maintainers (and future-you) need to know why something is the way it is.

## Format

Each ADR is a markdown file with:

- **Status** — proposed / accepted / superseded / deprecated
- **Context** — what problem are we solving?
- **Decision** — what did we decide?
- **Consequences** — positive and negative
- **Alternatives considered** — what else was on the table?

Numbered sequentially, never renumbered.

## Index

| # | Title | Status |
|---|---|---|
| [0001](./0001-functional-core-no-class.md) | Functional core, no class in public API | Accepted |
| [0002](./0002-esm-only.md) | ESM-only distribution | Accepted |
| [0003](./0003-standard-schema-interop.md) | Standard Schema for validator interop | Accepted |
| [0004](./0004-user-middleware-outside-builtins.md) | User middleware composes outside built-ins | Accepted |
| [0005](./0005-next-may-be-called-multiple-times.md) | `next()` may be called multiple times | Accepted |
| [0006](./0006-frozen-request-context.md) | RequestContext is shape-frozen | Accepted |

## Process

New architectural decisions:

1. Open a PR adding `docs/adrs/<n>-<kebab-title>.md` with status `proposed`.
2. Comment period: minimum 7 days for non-trivial decisions.
3. On consensus / maintainer approval, mark `accepted` and merge.
4. If superseded later, update `status` and link to the successor.

ADRs are append-only. Don't edit accepted ADRs except to mark them superseded — write a new ADR instead.
