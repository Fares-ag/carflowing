# Admin Platform — Enterprise Test Matrix (Phase 1)

Traceability index for admin portal QA. Status reflects implementation in this repo.

## ID prefixes

| Prefix | Layer | Location |
|--------|-------|----------|
| ADM-API-### | Backend integration | `apps/backend/src/routes/__tests__/admin.test.ts` |
| ADM-SEC-### | RBAC / security | `apps/backend/src/routes/__tests__/admin-rbac.test.ts`, `security.test.ts` |
| ADM-E2E-### | Playwright | `e2e/admin/*.spec.ts` |
| ADM-UI-### | Vitest + RTL | `apps/admin/src/pages/__tests__/` |
| ADM-NF-### | Non-functional | CI / nightly (partial) |

## Audit mutation coverage checklist

| Mutation route | Audit action | Status |
|----------------|--------------|--------|
| PATCH `/customers/:id/status` | `customer.status.change` | Covered |
| PATCH `/customers/:id/profile` | `customer.profile.edit` | Covered |
| POST `/payments/:id/refund` | `payment.refund` | Covered |
| PATCH `/rentals/:id/status` | via lifecycle service | Covered |
| DELETE `/booking-requests/:id` | `booking_request.delete` | Covered |
| PATCH `/settings` | `settings.update` | Covered |
| POST/PATCH/DELETE `/plans` | `plan.create/update/delete` | Covered |
| PATCH `/complaints/:id/status` | `complaint.status.change` | Covered |
| POST `/complaints/:id/replies` | `complaint.reply` | Covered |
| POST `/payouts/generate` | `payout.generate` | Covered |
| POST `/payouts/:id/mark-paid` | `payout.mark_paid` | Covered |
| PATCH `/maintenance/:id/complete` | `maintenance.complete` | Covered |

## Module scorecard (target Phase 1)

| Module | Score | Notes |
|--------|-------|-------|
| Auth & RBAC | 3 | Portal roles seeded; ADM-SEC-06/07/10 |
| Audit log | 2 | API + E2E smoke `/audit` |
| Payments / Refunds | 3 | Summary aggregation + RBAC |
| Complaints | 2 | Reply thread (GAP-P1-016) |
| Plans | 2 | Delete guard + audit |
| Payouts / Maintenance | 2 | API sweep |
| E2E mutations | 2 | 8 critical journeys |

## P1 gaps addressed

- **GAP-P1-016** — Complaint reply thread (`GET/POST /complaints/:id/replies`)
- **ADM-API-12** — `GET /customers/:id` returns 404 when missing
- **ADM-API-20** — `/payments/summary` uses SQL aggregates (no full scan)
- **ADM-API-22** — Plan delete blocked when subscriptions/dealers reference plan
