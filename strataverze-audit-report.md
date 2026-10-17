# StrataVerze Platform Audit Report

**Date:** 17 October 2026
**Auditor:** Static code review + limited live site verification
**Environment:** Production (strataverze.vercel.app)
**Repository:** 2prnpmb84y-hash/strataverze (GitHub, private)
**Scope:** Full codebase review, limited runtime verification via HTTP

---

## A. Executive Summary

StrataVerze is an early-stage Australian strata management platform built on Next.js 16, React 19, Supabase (PostgreSQL + Auth + Storage), and deployed on Vercel. The platform supports four portal roles (Owner, Committee, Adviser, Supplier) and covers scheme management, levies, work orders, meetings/governance, documents, compliance, insurance, contacts, and a supplier marketplace.

**Overall condition:** The platform is **not ready for production use with real strata data**. While the UI and page structure are substantially built out and the landing page renders correctly, the application has critical security vulnerabilities that would allow any authenticated user to access and modify data belonging to any scheme. There are no automated tests, no database-level access controls (Row Level Security), and the application relies on a release-candidate ORM (Prisma 8 RC).

**Top three risks:**

1. **Broken authorisation (CRITICAL):** Server actions across the adviser portal check only that a user is authenticated, not that they are a member of the target scheme. Any signed-in user can create, update, or delete data on any scheme.

2. **Open redirect in auth callback (HIGH):** The `/auth/callback` route uses an unvalidated `next` query parameter in its redirect, enabling phishing attacks.

3. **No automated tests or CI pipeline (HIGH):** There are zero test files, no test framework installed, and no continuous integration. Every deployment is unverified.

**Recommendation:** Do not onboard real owners corporations or handle real financial data until the authorisation layer, database-level access controls, and a baseline test suite are in place. A separately scoped remediation phase is advised.

---

## B. Scope and Limitations

### Examined

| Component | Method |
|---|---|
| Full source code (all 20+ models, 16 query files, 14+ action files, 13 UI components, all pages) | Static code review |
| Prisma schema (548 lines, 20+ models) | Static review |
| Authentication flow (login, signup, password reset, OAuth callback) | Code review + live HTTP verification |
| Landing page | Live HTTP fetch |
| Login page | Live HTTP fetch |
| Forgot-password page | Live HTTP fetch |
| Dashboard redirect behaviour | Live HTTP fetch (confirmed redirect to /login) |
| All server actions across adviser, owner, committee portals | Static code review |
| All database query functions | Static code review |
| Email/notification system | Static code review |
| Deployment configuration (next.config.ts, package.json) | Static code review |

### Not assessed (access limitations)

- **Runtime database state**: Could not connect to Supabase directly from the cloud container. No direct query verification.
- **Authenticated portal pages**: Could not sign in via WebFetch. Portal page rendering with real data was not verified at runtime.
- **Supabase RLS policies**: Could not inspect the Supabase dashboard. Schema shows no RLS; confirmed absence via code, but could not verify if policies exist at the Supabase project level outside Prisma.
- **Vercel deployment configuration**: Environment variables, build settings, and domain configuration were not inspected.
- **Performance under load**: No load testing performed per audit constraints.
- **Browser/device compatibility**: No cross-browser testing performed.
- **Supabase Storage bucket policies**: Could not verify whether the "documents" bucket is truly public or has access restrictions.

### Impact of limitations

The inability to test authenticated flows at runtime means functional verification of portal pages is based on static code analysis. All findings about authorisation gaps are verified from code evidence but were not confirmed by attempting actual cross-scheme access at runtime. The label "static review" applies to this audit.

---

## C. Platform Overview

### Architecture

| Layer | Technology |
|---|---|
| Frontend | Next.js 16.4.0, React 19.3.0, Tailwind CSS 4 |
| Language | TypeScript 5 (strict mode) |
| ORM | Prisma 8.0.0-rc.22 (release candidate) |
| Database | PostgreSQL on Supabase (ap-southeast-1) |
| Authentication | Supabase Auth (@supabase/ssr 0.12.7) |
| File storage | Supabase Storage (public URLs) |
| Email | Resend (fails silently without API key) |
| Hosting | Vercel |
| Font loading | Local woff2 (Poppins headings, Inter body) |

### Data Model (20+ entities)

Core: Profile, Scheme, SchemeImage, Lot, SchemeMembership, Fund
Financial: Levy, LevyItem, Invoice
Maintenance: WorkOrder, Comment, QuoteRequest, Quote
Governance: Meeting, Motion, Vote, Announcement
Compliance: ComplianceItem, InsurancePolicy, ByLaw
Other: Document, Contact, Invitation, ActivityLog

All tables use UUID primary keys with cascade deletes. No Row Level Security policies defined in the Prisma schema.

### Portal Roles and Routing

| Portal | URL prefix | Colour | Capabilities |
|---|---|---|---|
| Owner | /owner/* | #00D4BF | View scheme data, submit maintenance requests, vote on motions, upload documents |
| Committee | /committee/* → redirects to /owner/* | #A6B4FF | Owner capabilities + create meetings, manage motions, additional nav items (Finance, Governance, Compliance) |
| Adviser | /adviser/* | #FEBB56 | Full CRUD on all scheme entities (schemes, lots, levies, work orders, meetings, documents, compliance, insurance, contacts, bylaws, announcements, funds) |
| Supplier | /supplier/* | #FF6B54 | View open quote requests, view own quotes/work orders/invoices (read-only, no server actions) |

### Critical User Journeys

1. **Sign up → create profile → access portal**: Supabase Auth signup → auto-profile creation on first portal access → redirect based on memberships
2. **Adviser creates scheme**: Adviser → new scheme wizard → optional PDF strata roll upload → creates scheme + membership + default funds (transaction)
3. **Adviser manages levies**: Create levy → proportional allocation by lot entitlement (transaction) → issue levy → email notifications to owners
4. **Owner submits maintenance request**: Owner → create work order → notifications sent to adviser
5. **Supplier quotes on work**: Browse open quote requests → submit quote → track status
6. **Committee governance**: Schedule meeting → add motions → members vote
7. **Member invitation**: Adviser invites owner/committee → email with token → accept → membership created

### External Dependencies

- Supabase (database, auth, storage) — single point of failure
- Resend (email) — fails silently; no fallback
- Vercel (hosting, serverless functions)
- No background workers, scheduled jobs, or webhooks

---

## D. Operational Verification Results

| User Journey | Test Performed | Expected Result | Actual Result | Status | Evidence |
|---|---|---|---|---|---|
| Landing page loads | HTTP GET / | Marketing page renders | Page renders with all sections, images, navigation | **Pass** | WebFetch confirmed hero, features, ledger, adviser gateway, vault, CTA, footer |
| Landing page CTA works | Inspect "Get Access" button | Email captured and submitted | Button is `type="button"` with no onClick handler; email input has no form action | **Fail** | src/app/page.tsx line 529: `type="button"` with no handler |
| Footer links work | Inspect footer hrefs | Links navigate to real pages | About, Contact, Careers, Privacy Policy, Terms of Service, Accessibility all point to "#" | **Fail** | WebFetch: "Several footer links point to '#' placeholders" |
| Login page loads | HTTP GET /login | Login form renders | Form renders with email, password, portal tabs (Owner/Supplier, Adviser), forgot password link, create account button | **Pass** | WebFetch confirmed all elements |
| Forgot password page loads | HTTP GET /forgot-password | Reset form renders | Page renders with email field, "Send reset link" button, back to sign-in link | **Pass** | WebFetch confirmed |
| Signup page loads | HTTP GET /signup | Signup form or page renders | HTTP error returned | **Fail** | WebFetch returned CLIENT_ERROR; signup is a formAction on the login page button, not a separate route |
| Auth guard on /dashboard | HTTP GET /dashboard (unauthenticated) | Redirect to login | Redirected to login page | **Pass** | WebFetch showed login page content |
| Open redirect in auth callback | Code review of /auth/callback/route.ts | `next` param validated against allow-list | `next` param used directly in redirect with no validation | **Fail** | src/app/auth/callback/route.ts: `return NextResponse.redirect(\`\${origin}\${next}\`)` |
| Adviser scheme creation auth | Code review of adviser/schemes/actions.ts | Verifies user is adviser for the scheme | Only checks `getCurrentProfile()` (authentication), no membership check | **Fail** | src/app/(portal)/adviser/schemes/actions.ts: no getSchemesForAdviser call |
| Adviser work order auth | Code review of adviser work-orders/actions.ts | Verifies adviser membership | Only checks `getCurrentProfile()` | **Fail** | src/app/(portal)/adviser/schemes/[id]/work-orders/actions.ts |
| All adviser scheme actions auth | Grep across all 14 adviser action files | Scheme membership verified | Zero files verify adviser membership for the target scheme | **Fail** | Grep: all files use only getCurrentProfile(), none call getSchemesForAdviser or check membership |
| Owner maintenance request auth | Code review of owner/maintenance/actions.ts | Verifies owner belongs to scheme | Correctly checks via `getSchemesForOwner` | **Pass** | src/app/(portal)/owner/maintenance/actions.ts |
| Committee governance auth | Code review of owner/governance/[meetingId]/actions.ts | Verifies committee membership | Correctly validates via `validateCommitteeMember` helper | **Pass** | src/app/(portal)/owner/governance/[meetingId]/actions.ts |
| Owner document upload auth | Code review of owner/documents/actions.ts | Verifies owner belongs to scheme | Only checks `getCurrentProfile()`, no scheme membership check | **Fail** | src/app/(portal)/owner/documents/actions.ts |
| Supplier data isolation | Code review of supplier.ts queries | Supplier sees only their own data | `getOpenQuoteRequests()` returns ALL open requests with no access filtering | **Fail** | src/lib/queries/supplier.ts line 7-15 |
| Invitation acceptance | Code review of invitations.ts | Atomic: mark accepted + create membership | Two separate queries (update invitation, then create membership), no transaction | **Partially verified** | src/lib/queries/invitations.ts lines 75-115 |
| Levy creation | Code review of levies.ts | Uses transaction for levy + items | Correctly uses `db.transaction` | **Pass** | src/lib/queries/levies.ts |
| Scheme creation | Code review of schemes.ts | Uses transaction for scheme + membership + funds | Correctly uses `db.transaction` | **Pass** | src/lib/queries/schemes.ts |
| Supplier quote detail page | Check route exists | /supplier/quotes/[id] renders detail page | File src/app/(portal)/supplier/quotes/[id]/page.tsx does not exist | **Fail** | Glob search returned no match; links from quotes list page point to non-existent route |

---

## E. Prioritised Findings Register

| ID | Finding | Verification | Severity | Priority | Impact | Recommended Action | Effort |
|---|---|---|---|---|---|---|---|
| F-01 | Broken authorisation: adviser server actions lack scheme membership checks | Verified | Critical | P0 | Any authenticated user can CRUD any scheme's data | Add middleware or per-action membership verification | Medium |
| F-02 | Open redirect vulnerability in /auth/callback | Verified | High | P0 | Phishing attacks, credential theft | Validate `next` param against allow-list of internal paths | Small |
| F-03 | No Row Level Security on any database table | Verified | Critical | P1 | Direct database access (if credentials leak) exposes all data | Implement RLS policies on all tables in Supabase | Large |
| F-04 | Supplier sees all open quote requests globally | Verified | High | P1 | Data leakage across organisations; competitive intelligence exposure | Filter quote requests by supplier category or explicit invitation | Medium |
| F-05 | Owner document upload has no scheme membership check | Verified | High | P1 | Any authenticated user can upload files to any scheme | Add scheme membership verification | Small |
| F-06 | Zero automated tests | Verified | High | P1 | No regression detection; every change risks breaking production | Add test framework (Vitest), write unit tests for auth/queries, integration tests for server actions | Large |
| F-07 | No CI/CD pipeline | Verified | High | P1 | No automated build verification before deploy | Set up GitHub Actions with lint, type-check, test gates | Medium |
| F-08 | Prisma 8 release candidate in production | Verified | High | P1 | Unstable API, potential data corruption, no production support | Monitor Prisma 8 GA timeline; have migration plan ready | Small (monitoring) |
| F-09 | Landing page CTA non-functional | Verified | Medium | P1 | Cannot capture waitlist signups; wastes marketing traffic | Add form action, connect to email service or database | Small |
| F-10 | 48 unbounded .all() queries vs 4 .limit() calls | Verified | Medium | P2 | Performance degradation as data grows; potential OOM on large schemes | Add pagination/limits to all list queries | Medium |
| F-11 | Invitation acceptance not transactional | Verified | Medium | P2 | Race condition: invitation marked accepted but membership creation could fail | Wrap in db.transaction | Small |
| F-12 | Documents stored with public URLs | Verified | Medium | P2 | Anyone with URL can access documents without auth | Use signed URLs with expiry or private bucket with auth proxy | Medium |
| F-13 | Only 2 transactions in entire codebase | Verified | Medium | P2 | Data inconsistency risk on multi-step operations | Audit all multi-step mutations; wrap in transactions | Medium |
| F-14 | Password requirements: length >= 8 only | Verified | Medium | P2 | Weak passwords accepted | Add complexity requirements (uppercase, number, special char) | Small |
| F-15 | No rate limiting on auth endpoints | Verified | Medium | P2 | Brute force attacks on login/signup | Add rate limiting middleware or use Supabase rate limits | Medium |
| F-16 | N+1 query in issueLevyAction | Verified | Medium | P2 | Slow levy issuance for schemes with many lots | Batch membership queries and email sends | Small |
| F-17 | Supplier quote detail page missing (broken link) | Verified | Medium | P2 | 404 when clicking quote request from list | Create /supplier/quotes/[id]/page.tsx | Small |
| F-18 | Footer links are all # placeholders | Verified | Low | P2 | Poor user experience; missing legal pages | Create Privacy Policy, Terms of Service, About pages | Medium |
| F-19 | Near-zero accessibility (10 aria attributes across 4 files) | Verified | Medium | P2 | Excludes users with disabilities; potential legal risk under Australian DDA | Accessibility audit and remediation pass | Large |
| F-20 | Only 3 loading.tsx files across entire portal | Verified | Low | P3 | Janky navigation experience on slow connections | Add loading states to all route segments | Small |
| F-21 | Email notifications fail silently without RESEND_API_KEY | Verified | Low | P3 | Users miss critical notifications (levy issuance, meeting invitations) with no indication | Add error reporting; consider fallback notification channel | Small |
| F-22 | Supplier portal entirely read-only (no server actions) | Verified | Medium | P2 | Suppliers cannot submit quotes, create invoices, or update work order status | Build supplier action endpoints | Large |
| F-23 | No middleware.ts exists | Verified | Medium | P2 | No centralised auth/authorisation enforcement; each route must self-protect | Add Next.js middleware for auth checks, CSRF, rate limiting | Medium |
| F-24 | Hard deletes throughout (no soft delete) | Verified | Low | P3 | No audit trail for deletions; data unrecoverable | Consider soft delete with deletedAt timestamp | Medium |
| F-25 | getActiveInsuranceForScheme fetches all then filters in JS | Verified | Low | P3 | Unnecessary data transfer; should filter at query level | Move filter to database WHERE clause | Small |
| F-26 | N+1 in getProfileWithMemberships | Verified | Low | P3 | Separate queries for profile, memberships, schemes | Combine into single query with includes | Small |
| F-27 | Inconsistent landing page terminology | Verified | Low | P3 | "Advisor" vs "Adviser" in different sections | Standardise to Australian English "Adviser" throughout | Small |
| F-28 | No Prisma migrations directory | Verified | Medium | P2 | No version-controlled schema migration history | Set up and maintain Prisma migration files | Medium |

### Detailed Evidence for Critical and High-Severity Findings

#### F-01: Broken Authorisation in Adviser Server Actions

**Evidence:** All 14 adviser action files under `src/app/(portal)/adviser/schemes/[id]/` follow the same pattern:

```
const profile = await getCurrentProfile();
if (!profile) return { error: "You must be signed in." };
```

None call `getSchemesForAdviser(profile.id)` or any equivalent to verify the user has an adviser membership for the scheme identified by `[id]` in the URL. The scheme ID comes from the URL parameter or form data and is used directly in database mutations.

**Files affected:**
- `adviser/schemes/actions.ts` (create, update, delete scheme)
- `adviser/schemes/[id]/work-orders/actions.ts` (CRUD work orders)
- `adviser/schemes/[id]/levies/actions.ts` (CRUD levies, issue levy)
- `adviser/schemes/[id]/documents/actions.ts` (upload, update, delete documents)
- `adviser/schemes/[id]/meetings/actions.ts` (CRUD meetings, motions, votes)
- `adviser/schemes/[id]/members/actions.ts` (send/revoke invitations)
- `adviser/schemes/[id]/lots/actions.ts` (CRUD lots, assign owners)
- `adviser/schemes/[id]/funds/actions.ts` (CRUD funds)
- `adviser/schemes/[id]/compliance/actions.ts` (CRUD compliance items)
- `adviser/schemes/[id]/insurance/actions.ts` (CRUD insurance policies)
- `adviser/schemes/[id]/contacts/actions.ts` (CRUD contacts)
- `adviser/schemes/[id]/bylaws/actions.ts` (CRUD bylaws)
- `adviser/schemes/[id]/announcements/actions.ts` (CRUD announcements)
- `adviser/schemes/[id]/levies/generate/actions.ts` (bulk levy generation)

**Reproduction steps:** An authenticated user with an adviser membership on Scheme A could call any of these server actions with Scheme B's ID and succeed.

**Impact:** Complete data breach across all schemes. Any authenticated user with adviser access to one scheme can read, create, modify, or delete data on every scheme in the platform.

**Acceptance criteria:** Every adviser server action must verify the acting user holds an ADVISER SchemeMembership for the target scheme before proceeding. A test suite must cover cross-scheme access attempts.

#### F-02: Open Redirect in Auth Callback

**Evidence:** `src/app/auth/callback/route.ts`:
```typescript
const next = searchParams.get("next") ?? "/dashboard";
return NextResponse.redirect(`${origin}${next}`);
```

The `next` parameter is taken directly from the URL query string and appended to the origin without validation.

**Reproduction steps:** Craft a URL such as `https://strataverze.vercel.app/auth/callback?code=VALID_CODE&next=//evil.com` or `next=@evil.com`. After successful OAuth, the user is redirected to the attacker's site.

**Impact:** Phishing attacks where users believe they are interacting with StrataVerze but are redirected to a malicious lookalike site that captures credentials.

**Acceptance criteria:** The `next` parameter must be validated to start with `/` and not contain `//`, `@`, or any protocol prefix. A test must verify malicious redirect attempts are blocked.

#### F-04: Supplier Global Data Exposure

**Evidence:** `src/lib/queries/supplier.ts` lines 7-15:
```typescript
export async function getOpenQuoteRequests() {
  return db.orm.public.QuoteRequest
    .where((qr) => qr.status.eq("OPEN"))
    .include("scheme")
    .include("workOrder")
    .include("quotes")
    .orderBy((qr) => qr.createdAt.desc())
    .all();
}
```

This returns every open quote request across all schemes, including scheme names and existing quote counts. There is no supplier category filtering or access restriction.

**Impact:** Competitive intelligence exposure. Suppliers can see all open requests including those from competitors' clients, quote counts, and budget information.

**Acceptance criteria:** Quote requests should be filtered by supplier category, geographic area, or explicit invitation. Alternatively, implement a marketplace model with clear privacy controls.

---

## F. Improvement Roadmap

### Immediate Containment and Critical Fixes (Week 1)

1. **F-01: Add authorisation checks to all adviser server actions** — Create a shared `validateAdviserAccess(profileId, schemeId)` helper and add it to every adviser action. Effort: 1-2 days.
2. **F-02: Fix open redirect** — Validate the `next` parameter in auth callback. Effort: 1 hour.
3. **F-05: Add scheme membership check to owner document upload** — Effort: 1 hour.
4. **F-09: Fix landing page CTA** — Add form action to capture email signups. Effort: 2-4 hours.

### Next Development Cycle (Weeks 2-4)

5. **F-06: Set up test framework and write critical path tests** — Install Vitest, write tests for auth helpers, authorisation checks, and key server actions. Effort: 3-5 days.
6. **F-07: Set up CI/CD pipeline** — GitHub Actions with TypeScript type-check, lint, and test gates. Effort: 1 day.
7. **F-23: Add Next.js middleware** — Centralised auth verification, CSRF protection, and route guards. Effort: 2-3 days.
8. **F-04: Restrict supplier quote request visibility** — Effort: 1-2 days.
9. **F-17: Build supplier quote detail page** — Effort: 0.5 days.
10. **F-22: Build supplier server actions** — Quote submission, invoice creation, work order status updates. Effort: 3-5 days.
11. **F-11: Wrap invitation acceptance in a transaction** — Effort: 1 hour.
12. **F-14: Strengthen password requirements** — Effort: 2 hours.
13. **F-18: Create legal pages** — Privacy Policy, Terms of Service (engage legal counsel). Effort: varies.

### Next 30-90 Days

14. **F-03: Implement Row Level Security** — Design and apply RLS policies for all tables in Supabase. Effort: 5-7 days.
15. **F-10: Add pagination to all list queries** — Replace unbounded `.all()` calls with cursor-based pagination. Effort: 3-5 days.
16. **F-12: Switch to signed URLs for document storage** — Effort: 2-3 days.
17. **F-13: Audit and add transactions to multi-step mutations** — Effort: 2-3 days.
18. **F-15: Implement rate limiting** — Effort: 1-2 days.
19. **F-19: Accessibility remediation** — WCAG 2.1 AA audit and fixes. Effort: 5-10 days.
20. **F-28: Set up Prisma migration tracking** — Effort: 1 day.

### Longer-term Improvements

21. **F-08: Plan Prisma 8 GA migration** — Monitor release, test thoroughly before upgrading.
22. **F-24: Implement soft deletes** — Effort: 3-5 days across all models.
23. **F-20: Add loading states to all routes** — Effort: 1-2 days.
24. **F-21: Add email delivery monitoring** — Effort: 1 day.
25. **F-25, F-26: Optimise query patterns** — Effort: 1-2 days.

### Quick Wins

- F-02 (open redirect fix): 1 hour
- F-05 (owner document auth): 1 hour
- F-11 (invitation transaction): 1 hour
- F-14 (password strength): 2 hours
- F-17 (supplier quote detail page): 4 hours
- F-27 (terminology consistency): 1 hour

### Dependencies

- F-03 (RLS) should follow F-01 (application-level auth fixes) to provide defence in depth
- F-07 (CI/CD) should precede or accompany F-06 (tests) to enforce test gates
- F-22 (supplier actions) depends on F-04 (quote request visibility) being resolved first
- F-12 (signed URLs) requires Supabase Storage bucket configuration changes

---

## G. Verification Plan

### For Authorisation Fixes (F-01, F-04, F-05)

1. **Unit tests:** For each server action, write tests that:
   - Confirm an adviser with a membership on Scheme A can perform actions on Scheme A
   - Confirm an adviser with a membership on Scheme A receives an error when targeting Scheme B
   - Confirm an unauthenticated user receives an error

2. **Integration test:** Create two test schemes with different adviser memberships. Verify cross-scheme access is rejected at the HTTP level.

3. **Regression:** Add these tests to the CI pipeline to prevent future authorisation bypasses.

### For Open Redirect (F-02)

1. Test cases for the `next` parameter:
   - `/dashboard` → allowed
   - `/owner/schemes` → allowed
   - `//evil.com` → rejected (redirect to /dashboard)
   - `https://evil.com` → rejected
   - `@evil.com` → rejected
   - Empty string → defaults to /dashboard

### For Query Performance (F-10)

1. Seed database with 100+ schemes, 1000+ lots, 5000+ levy items
2. Measure response times for list pages before and after pagination
3. Verify no page returns more than a configurable maximum (e.g. 50 items)

### For Accessibility (F-19)

1. Run axe-core automated scan on all portal pages
2. Perform keyboard navigation testing on all interactive elements
3. Screen reader testing with VoiceOver/NVDA on critical flows

### General Regression Strategy

- Type-check (`tsc --noEmit`) on every PR
- Lint check on every PR
- Unit test suite on every PR
- Manual smoke test of login → portal access → key actions before each production deploy

---

## H. Unresolved Questions

1. **Supabase RLS status:** Are there any Row Level Security policies configured directly in Supabase that are not reflected in the Prisma schema? This requires Supabase dashboard access to confirm.

2. **Supabase Storage bucket policies:** Is the "documents" bucket configured as public or private? The code uses `getPublicUrl()`, but the bucket's actual policy was not inspected.

3. **Environment variables:** Which environment variables are set in Vercel? Is `RESEND_API_KEY` configured (email may be silently non-functional)? Is `DATABASE_URL` using connection pooling?

4. **Domain configuration:** Is strataverze.com.au configured and pointing to Vercel? The app references this domain in notification URLs.

5. **Prisma 8 RC stability:** Has the team encountered any Prisma 8 RC bugs in production? What is the plan if a breaking change lands in the next RC?

6. **Data backup and recovery:** What Supabase backup configuration is in place? Has a restore ever been tested?

7. **GDPR/Privacy Act compliance:** The platform handles personal information (names, emails, lot ownership, financial data). Has a privacy impact assessment been conducted for Australian Privacy Act compliance?

8. **Business continuity:** What happens if the sole developer is unavailable? Is there documentation for another developer to deploy, debug, or operate the platform?

9. **Supplier portal completeness:** The supplier portal is entirely read-only. Is this intentional for the current phase, or is quote submission functionality planned?

10. **Financial data accuracy:** The levy calculation divides amounts proportionally by lot entitlement. Has this calculation been validated against the requirements of the Strata Schemes Management Act 2015 (NSW) or equivalent state legislation?

---

*This audit is a static code review with limited runtime verification. It does not constitute a security certification, penetration test, or legal compliance assessment. The platform should not be considered secure or legally compliant based on this review alone. No code was modified during this audit.*
