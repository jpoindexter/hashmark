# Feature Matrix — RICE Scoring

RICE = (Reach x Impact x Confidence) / Effort

| Metric | Scale |
|--------|-------|
| **Reach** | % of users who benefit (0-100%) |
| **Impact** | 0.25 minimal, 0.5 low, 1 medium, 2 high, 3 massive |
| **Confidence** | 50-100% |
| **Effort** | Person-days |

---

## Ranked by RICE Score

| Rank | # | Feature | Priority | Reach | Impact | Confidence | Effort | RICE | Status |
|------|---|---------|----------|-------|--------|------------|--------|------|--------|
| 1 | 1 | Multi-format generation (8 formats) | P0 | 100% | 3 | 100% | 5 | **60.0** | DONE |
| 2 | 5 | GitHub OAuth + repo listing | P0 | 100% | 3 | 95% | 5 | **57.0** | — |
| 3 | 2 | GitHub Action auto-sync | P0 | 80% | 3 | 90% | 4 | **54.0** | — |
| 4 | 4 | Stripe payments (Pro/Team) | P0 | 100% | 3 | 90% | 6 | **45.0** | — |
| 5 | 3 | Web scan + download | P0 | 100% | 2 | 95% | 5 | **38.0** | — |
| 6 | 11 | CLI upsell banner | P1 | 90% | 2 | 85% | 2 | **76.5** | — |
| 7 | 7 | .clinerules format | P1 | 60% | 2 | 100% | 3 | **40.0** | DONE |
| 8 | 9 | Format preview in dashboard | P1 | 80% | 1 | 90% | 3 | **24.0** | — |
| 9 | 10 | One-click Action install | P1 | 70% | 2 | 80% | 5 | **22.4** | — |
| 10 | 6 | Custom rules engine | P1 | 50% | 2 | 75% | 7 | **10.7** | — |
| 11 | 8 | Scan history/diff view | P1 | 40% | 1 | 70% | 5 | **5.6** | — |
| 12 | 25 | Badge for README | P3 | 60% | 1 | 80% | 1 | **48.0** | — |
| 13 | 15 | Scan caching | P2 | 70% | 1 | 85% | 2 | **29.8** | — |
| 14 | 13 | PR mode for GitHub Action | P2 | 40% | 2 | 75% | 3 | **20.0** | — |
| 15 | 17 | API for programmatic access | P2 | 30% | 2 | 70% | 5 | **8.4** | — |
| 16 | 14 | Monorepo support in web | P2 | 35% | 2 | 70% | 6 | **8.2** | — |
| 17 | 16 | Email notifications on scan | P2 | 50% | 0.5 | 80% | 3 | **6.7** | — |
| 18 | 12 | Team/org features (shared rules) | P2 | 20% | 2 | 70% | 8 | **3.5** | — |
| 19 | 19 | Webhook on scan complete | P2 | 20% | 1 | 70% | 3 | **4.7** | — |
| 20 | 18 | VSCode extension | P2 | 30% | 1 | 60% | 10 | **1.8** | — |
| 21 | 20 | AI-powered rule suggestions | P3 | 40% | 2 | 50% | 8 | **5.0** | — |
| 22 | 21 | Context quality scoring | P3 | 50% | 1 | 60% | 6 | **5.0** | — |
| 23 | 22 | Format comparison view | P3 | 40% | 0.5 | 70% | 3 | **4.7** | — |
| 24 | 24 | Slack integration | P3 | 15% | 0.5 | 60% | 4 | **1.1** | — |
| 25 | 23 | Self-hosted option | P3 | 10% | 2 | 50% | 15 | **0.7** | — |

---

## Sprint Grouping

### Sprint 1 — Launch Foundation (2 weeks)

Core revenue and auth loop. Nothing else matters until users can sign up, scan, and pay.

| Feature | Effort | RICE |
|---------|--------|------|
| GitHub OAuth + repo listing | 5d | 57.0 |
| Web scan + download | 5d | 38.0 |
| Stripe payments (Pro/Team) | 6d | 45.0 |

**Total: ~16 person-days**

### Sprint 2 — Retention + Auto-Sync (2 weeks)

The paid value prop: set it and forget it. Plus low-effort high-yield wins.

| Feature | Effort | RICE |
|---------|--------|------|
| GitHub Action auto-sync | 4d | 54.0 |
| CLI upsell banner | 2d | 76.5 |
| Format preview in dashboard | 3d | 24.0 |
| Badge for README | 1d | 48.0 |

**Total: ~10 person-days**

### Sprint 3 — Power Users (2 weeks)

Features that drive Pro upgrades and reduce churn.

| Feature | Effort | RICE |
|---------|--------|------|
| One-click Action install | 5d | 22.4 |
| Scan caching | 2d | 29.8 |
| Custom rules engine | 7d | 10.7 |

**Total: ~14 person-days**

### Sprint 4 — Growth + Teams (2 weeks)

Expand to teams, CI workflows, and developer integrations.

| Feature | Effort | RICE |
|---------|--------|------|
| PR mode for GitHub Action | 3d | 20.0 |
| Scan history/diff view | 5d | 5.6 |
| Team/org features | 8d | 3.5 |

**Total: ~16 person-days**

### Backlog — Ship When Ready

| Feature | Effort | RICE |
|---------|--------|------|
| API for programmatic access | 5d | 8.4 |
| Monorepo support in web | 6d | 8.2 |
| Email notifications on scan | 3d | 6.7 |
| AI-powered rule suggestions | 8d | 5.0 |
| Context quality scoring | 6d | 5.0 |
| Webhook on scan complete | 3d | 4.7 |
| Format comparison view | 3d | 4.7 |
| VSCode extension | 10d | 1.8 |
| Slack integration | 4d | 1.1 |
| Self-hosted option | 15d | 0.7 |

---

## Scoring Notes

- **CLI upsell banner** scores highest adjusted RICE due to trivial effort (2d) and massive reach. Ship early.
- **Badge for README** is similar: near-zero effort, high organic distribution. Sprint 2 quick win.
- **Multi-format generation** and **.clinerules** are already done. No sprint allocation needed.
- **Self-hosted** ranks last: tiny reach, enormous effort, undermines SaaS revenue.
- **VSCode extension** has high effort (10d) for moderate impact. Defer until product-market fit is clear.
- **Team features** are gated behind the $29/seat tier. Low reach now, revisit when Pro adoption is proven.
