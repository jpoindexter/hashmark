# Hashmark — Strategic Audit

**Date:** 2026-03-15

---

## Current State

- CLI tool for AI context file generation
- 652 npm downloads (organic, no paid tier yet)
- Monetization plan: $9 one-time for GitHub Action auto-sync
- Status: payment + GitHub Action not yet built

---

## The Case For Shipping It

- 652 downloads is real traction with zero marketing
- Monetization work is small: Stripe one-time + GitHub Action, probably 2-3 days
- Shipping it proves the full stack works (CLI → paid feature → delivery)
- Gets you a product with payments live, which unblocks everything else mentally

## The Case Against

- $9 one-time has a hard ceiling
- No network effects — needs constant new distribution
- At 1% conversion of current installs: ~$58 total
- At 10% (optimistic): ~$587, once
- After that, growth depends entirely on new npm downloads

---

## The Real Question

652 people are using a free tool to manage AI context files. That's the signal worth investigating. The $9 CLI is not the product — it's a test of whether people will pay at all.

If they do, the actual product might be:
- **$15/mo sync service** — auto-keep context files updated across branches, teams
- **Team sharing** — shared context configs across an org
- **More integrations** — not just GitHub Actions, but CI systems, editors, etc.

The one-time price is low friction but low ceiling. The subscription angle is harder to sell but scales.

---

## Recommendation

**Ship the $9 tier, but treat it as a customer discovery exercise, not a business.**

Goals:
1. Get 10 paying customers
2. Email each one: "what else do you wish this did?"
3. That answer tells you if there's a bigger product here

If nobody pays → the tool has value but not enough to monetize directly. Kill the paid tier, keep the free CLI, move on.

If people pay → ask them what they actually need. Build that.

---

## Before Working on This

Check Gripe first. If Gripe has higher ceiling and is closer to shippable, do that instead. Hashmark's work is small enough that it can wait 2 weeks without losing momentum.
