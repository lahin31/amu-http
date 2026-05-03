# Contributing to Amu HTTP

First off, thank you for considering contributing to **Amu** ❤️

Amu is a Fetch-first HTTP client focused on **small size, predictable behavior, and production-safe defaults**. Contributions of all sizes are welcome — from typo fixes to major features.

---

# Code of Conduct

Please be respectful, constructive, and professional in all interactions.

We aim to build a welcoming environment for everyone.

---

# Ways to Contribute

You can help by:

- Fixing bugs
- Improving documentation
- Adding tests
- Improving TypeScript typings
- Suggesting features
- Optimizing performance
- Improving developer experience
- Reviewing pull requests

---

# Development Setup

## 1. Fork the repository

```bash
git clone https://github.com/your-username/amu-http.git
cd amu-http
```

## 2. Install dependencies

```bash
npm install
```

## 3. Run development mode

```bash
npm run dev
```

---

# Project Principles

Amu values:

## Fetch-first

Do not break native Fetch expectations unless clearly documented.

## Small Footprint

Every added feature should justify bundle size cost.

## Predictable Behavior

No magic. Explicit behavior wins.

## Production Safety

Retries, errors, timeouts, and parsing should behave reliably.

## Great TypeScript Support

Types are part of the API.

---

# Running the Project

## Lint

```bash
npm run lint
```

## Build

```bash
npm run build
```

## Tests

```bash
npm run test
```

## Watch Mode

```bash
npm run test:watch
```

## Coverage

```bash
npm run test:coverage
```

---

# Testing Guidelines

Please add tests for:

- New features
- Bug fixes
- Edge cases
- Error behavior
- Retry behavior
- Type safety when relevant

A feature without tests may not be accepted.

---

# Pull Request Process

## Before Opening a PR

Please ensure:

- Code builds successfully
- Tests pass
- Lint passes
- Docs updated if needed
- No unnecessary dependencies added

## PR Title Examples

```text
fix: retry hook not firing on final failure
feat: add custom serializer option
docs: improve timeout examples
refactor: simplify header normalization
```

## PR Description

Include:

- What changed
- Why it changed
- Tradeoffs
- Screenshots or logs if relevant

---

# Commit Guidelines

We recommend Conventional Commits:

```text
feat:
fix:
docs:
refactor:
test:
chore:
perf:
```

Examples:

```text
feat: add request debug timing
fix: preserve abort signal reason
docs: improve schema validation section
```

---

# Reporting Bugs

Please open an issue with:

- Amu version
- Runtime (Node / Browser / Bun / Deno)
- Reproduction steps
- Expected behavior
- Actual behavior
- Minimal code sample

---

# Suggesting Features

Before suggesting a feature, ask:

- Does it align with Fetch-first philosophy?
- Is it broadly useful?
- Can it remain small and predictable?
- Could users solve it externally instead?

Not every feature belongs inside core.

---

# What Might Be Rejected

Examples:

- Heavy abstractions over Fetch
- Large dependency additions
- Hidden magic behavior
- Breaking API changes without strong reason
- Features that bloat core for niche use cases

---

# Release Philosophy

Amu prefers:

- Stable APIs
- Small focused releases
- Clear changelogs
- Backward compatibility when possible

---

# Need Help?

Open an issue or discussion.

---

# Thank You

Your time and effort help make **Amu** better for everyone.