# StrataVerze security review: findings, plan and settings for approval

Assessment date: 23 October 2026. Scope: the Next.js app (`src/`), the Supabase project `vtqovzfywfrizjufsrmj` (database, RLS, storage, Auth settings), and the Vercel project `strataverze` (production at `https://strataverze.vercel.app`).

This document is for approval. Apart from the SEC-001 hotfix (approved and applied on 23 October), no production changes have been made.

## How the platform is put together (and why it matters)

- **The app talks to the database through Prisma as the `postgres` role, which bypasses RLS.** Every server action, page and API route is therefore a privileged path. The application code is the only control on what a user can do through the app.
- **The browser holds the public Supabase key and the user's JWT.** With them, anyone can call the Supabase Data API (PostgREST and GraphQL), Storage and Auth directly. For those direct calls, the database grants and RLS policies are the only controls.
- **The app itself makes no Data API table calls.** The one call in the code (`waitlist` insert) targets a table that doesn't exist. Storage calls are the only direct calls that matter, and they're made with the user's JWT.

So isolation has to hold in two places:
1. the server actions and pages
2. the direct Supabase APIs

## Summary

| Severity | Count | Status |
|---|---|---|
| Critical | 4 | 3 fixed (SEC-001, SEC-003, SEC-004), 1 partly fixed (SEC-002, sign-up closes in S2) |
| High | 11 | 6 fixed (SEC-005, 007, 008, 009, 014, and 033 in code), 1 partly fixed (SEC-012), 4 open (SEC-006 storage, SEC-010 MFA, SEC-011 sessions, SEC-013 backups) |
| Medium | 10 | open |
| Low | 8 | open |

The single most important point: **today anyone on the internet can sign up, create a building, and become its Adviser** (SEC-002). Many server actions check only "is this person an Adviser on *some* scheme" and then act on whatever record id they are sent (SEC-004). Together, a stranger could change or delete other buildings' records if they know the record ids. Ids are random UUIDs, so this is hard to exploit blind, but unguessable ids are not an access control.

Production holds 2 user profiles, Matthew and Emily, and both are platform admins (Emily made admin on 23 Oct at Matthew's request). Real exposure today is very low. Every Critical and High item must be fixed before any real building is onboarded.

**Evidence key**
- **V:** verified by me against the code, the live database or the dashboard.
- **R:** reported by the review sweep with file and line references. I spot-checked these, but not every line.
- One sweep claim (that contractor review actions need only sign-in) proved wrong on checking: the local helper does require platform admin. It has been excluded.

## Findings register

Owner for every app item: the StrataVerze development team (implemented by Claude, approved by Matthew). Provider configuration items: Matthew (dashboard access).

### Critical

| ID | Finding | Component | Evidence | Remediation | Status |
|---|---|---|---|---|---|
| SEC-001 | Any signed-in user could make themselves platform admin by updating `profiles.is_platform_admin` through the Data API (the update policy and default grants covered every column) | Database grants and RLS | V: a rolled-back proof reported "rows updated: 1" | Revoked browser-role writes on `profiles`. Added a trigger that rejects any change to that column from the browser roles. | **Fixed 23 Oct** (PR #38). Re-proof: "permission denied". Trigger proof: "can only be changed by the server". |
| SEC-002 | Anyone can become an Adviser: open Supabase sign-up, then `createSchemeAction` needs only sign-in and makes the creator ADVISER of the new scheme | Auth settings, `adviser/schemes/actions.ts:89`, `queries/schemes.ts:140` | V | Limit building creation to platform admins. Close open sign-up once invitation and supplier sign-up run server-side (see Accounts below). | **Partly fixed 23 Oct** (S0, PR #40): building creation and strata roll parsing need platform admin. Open sign-up closes in S2. |
| SEC-003 | 6 of 8 debt recovery actions check only that someone is signed in. An owner can mark their own instalments paid, close or write off their own case, or exclude it from recovery. Anyone can open cases on any scheme. | `lib/actions/debt-recovery.ts:32,106,244,382,439,466` | V | Scheme and role check in every action. Load the case and confirm it belongs to the scheme. Take the role from the membership, not the form. | **Fixed 23 Oct** (S0, PR #40), with cross-scheme and debtor tests |
| SEC-004 | Systemic cross-scheme record access in server actions. The action authorises the scheme id it was sent, then reads, updates or deletes the record id it was sent, without checking the two belong together. | Adviser CRUD (about 86 of 161 actions: lots, lot workflows, meetings, motions, agenda, minutes, insurance, announcements, by-laws, compliance, contacts, documents, funds, work orders), finance (post journal, lock and reopen period, bank accounts, account codes, matching rules), `works.ts` (about 25 actions), `contractor.ts` licence and insurance | V (samples: `deleteLotAction`, `submitApprovalDecision`, `saveLicence`), R for the rest | One shared helper that loads a record only within the authorised scheme. Make every query mutator require `schemeId`. Automated tests. | **Fixed 23 Oct** (S1, PR #41). An independent review found no cross-scheme paths left. |

SEC-004 also includes mass assignment. `createMatchingRule({ schemeId, ...data })` lets the caller's `data.schemeId` override the authorised scheme, so a rule with `autoPost` could be planted in another building (V).

### High

| ID | Finding | Component | Evidence | Remediation | Status |
|---|---|---|---|---|---|
| SEC-005 | **Data API is wide open to members.** `anon` and `authenticated` hold full grants on all 142 tables. Policies let any member, suppliers included, read their scheme's levy notices, journals, bank transactions, bank accounts, contacts, activity log, invitations (with tokens) and co-members' emails and phones. `schemes` and `organisations` accept inserts from anyone, including signed-out callers (`CHECK true`, role `public`). GraphQL is exposed too. | Database | V | Revoke all table, sequence and default privileges from `anon` and `authenticated`. Keep only the function EXECUTE that storage needs. Optionally stop exposing `public` in the API settings. RLS stays as a second layer. | **Fixed 23 Oct** (S0, PR #40). Re-proof: every direct read and write returns "permission denied" over HTTP. Storage access for members still works. |
| SEC-006 | **Storage is readable by any member of the scheme.** Suppliers and owners can list and download every file under `schemes/<id>/`, including other owners' payment confirmations. The signing actions sign any path the caller sends. Uploads go from the browser directly, so server validation never runs. No MIME restriction on the bucket. SVG allowed. | Storage policies, `documents/actions.ts:307`, `owner insurance/actions.ts:18`, upload forms | V (policy), R (actions) | Server-only storage: uploads through server-issued signed upload URLs after authorisation, downloads through short-lived links signed only after checking the document record and its visibility. Remove the browser storage policies. MIME allow-list and size limit on the bucket. No SVG. | Open |
| SEC-007 | Payment controls can be bypassed. `authoriseWorksPayment` skips the verified bank details check when the field is omitted, accepts any amount, and takes a free-text beneficiary. | `works.ts:1112-1150` | V | Require a VERIFIED bank version for the invoice's contractor. Cap at the approved amount less prior instructions. Take the beneficiary from the bank record. | **Fixed 23 Oct** (S1, PR #41). Works payments stay blocked until a bank detail verification step exists. |
| SEC-008 | Sign-in only on contractor and quote actions. Any account can submit quotes on any RFQ in any contractor's name (`submitWorksQuotation`) and rewrite any contractor's ABN, email and phone (`updateContractorBusiness`). Contractors can submit their own forged ABR result (`saveAbnLookupResult`). | `works.ts:659,497`, `contractor.ts:262` | V (first two), R | Require an active contractor contact. Remove the duplicate actions. ABN checks only through the server-side ABR lookup. | **Fixed 23 Oct** (S0, PR #40). Unused `contractor.ts` removed. |
| SEC-009 | Cross-scheme and over-broad reads | various pages, see the list below | V (dashboard), R (rest) | Membership and record-scope checks on every page. Minimal fields returned. | **Fixed 23 Oct** (S1, PR #41) |
| SEC-010 | No MFA in the app. TOTP is enabled in Supabase, but there is no enrolment, challenge or enforcement, and 0 factors are enrolled. | Auth | V | See MFA design below | Open |
| SEC-011 | Sessions never expire. Time-box and inactivity settings need the Supabase Pro plan, and the app enforces no timeout. | Auth | V | App-enforced idle and absolute timeouts (see Sessions below) | Open |
| SEC-012 | Auth configuration is weak | Supabase Auth | V | See the list below | **Partly fixed 23 Oct**: Site URL, redirect list, and minimum 8 characters with all four character types. Open sign-up and CAPTCHA wait for S2. |
| SEC-013 | No database backups. The Supabase Free plan includes no backups. | Supabase plan | V | Upgrade to Pro (daily backups, PITR available as an add-on), or run a scheduled encrypted export as an interim measure | Open, needs decision |
| SEC-014 | Governance and role integrity | owner and adviser governance actions, `payment-controls.ts:28` | R | See the list below | **Fixed 23 Oct** (S1, PR #41), including the independent review items (co-owner conflicts, committee and owner votes kept apart, own-lot refunds) |
| SEC-033 | **Email links pointed at an unregistered domain.** Invitation, levy and notification emails linked to `https://strataverze.com.au` (DNS: does not exist). Anyone registering it would receive owners' clicks. No app emails have been sent yet, because `RESEND_API_KEY` is not set in Vercel. | `lib/notifications.ts`, `levies/notice-content-data.ts`, `email.ts` sender | V | `siteUrl()` falls back to the production deployment. Register the domain before using it as the sender or link domain. | **Fixed in code 23 Oct** (S0, PR #40). Domain decision open. |
| SEC-034 | **Multi-row writes changed only one row.** In Prisma 8, `update()` and `delete()` change only the first matching row. A receipt covering several levy payments linked only one of them. Moving or unmatching a receipt left other bank allocations behind. Insurance item replacement left old items. Budget, plan and notice supersession could miss rows. | finance, insurance, meetings queries | V (Prisma type definitions) | `updateAndCount` / `deleteAndCount`, plus a guard test | **Fixed 23 Oct** (S1, PR #41) |

SEC-009 covers these reads:
- The owner dashboard trusts the scheme-selection cookie. Any signed-in user who sets it sees another scheme's meetings and work orders, and committee members anywhere also see its fund balances.
- The bank reconciliation report and bank account page load by id with no scheme filter, which exposes another scheme's BSB, account number and transactions.
- 39 Works pages have no role check.
- Suppliers see competitors' quotes.
- Global search uses a portal name the client controls.
- `searchProfilesAction` returns full profile rows (email, phone, auth id) for any user.

SEC-012 covers these Auth settings:
- Open sign-up.
- Minimum password length is 6, with no character rules set in Supabase.
- No CAPTCHA.
- Site URL is `http://localhost:3000`, with no redirect allow-list.
- "Secure password change" and "Require current password" are off.
- Leaked password protection needs Pro.

SEC-014 covers these integrity gaps:
- Any owner can create meetings, upload official documents and create motions. The pages say committee only, but the actions allow owners.
- Votes accepted on another scheme's motion. Advisers, suppliers and accountants can vote. Ballot agenda items are not checked.
- Anyone signed in can decline any invitation.
- A committee member can make themselves treasurer, an approver role.
- Approval route `approverRoles` is not enforced.
- Accountant (meant to be read-only) has write access in Works.

### Medium

| ID | Finding | Evidence | Remediation |
|---|---|---|---|
| SEC-015 | Admin pages and 10 finance list pages rely on the layout check only | R | Check in every page **Fixed 23 Oct (S1, PR #41).** |
| SEC-016 | **Audit logging gaps.** `activity_logs` needs a scheme, so there are no auth, MFA or platform events. Rows can be altered or deleted. No outcome, IP or request context. No downloads, contact views or access denials recorded (except finance documents). Supabase Auth audit-to-database is off. Owners see the scheme's whole activity log. | V | New append-only security audit log (see Audit below) |
| SEC-017 | **Database TLS not enforced.** Supabase "Enforce SSL on incoming connections" is off. The local `DATABASE_URL` has no `sslmode`, and the production value is unconfirmed. | V | Enforce SSL (brief database reboot), add `sslmode` to the connection strings and test on a preview deployment |
| SEC-018 | **Preview deployments use production database credentials.** All variables are scoped "Production and Preview", none marked Sensitive. | V | Separate preview database, or remove production credentials from Preview. Mark the variables Sensitive. |
| SEC-019 | Email templates insert user text into HTML unescaped (announcements, invitations, meetings, levies, work orders). This is a phishing vector from the StrataVerze sending address. | R | One shared escape for every value, and validate link targets |
| SEC-020 | Rate limiting is per serverless instance and in memory, applied only to login | R | Database-backed limiter on login, sign-up, forgot and reset password, invitation acceptance and search |
| SEC-021 | **Dependency management.** No Dependabot, no audit in CI, Actions not pinned. `npm audit` (production) lists 14 findings: 8 high, 6 moderate. Most sit in the Prisma CLI toolchain (hono, lodash, alchemy), which is installed as a runtime dependency. `fflate` 0.8.2 has a moderate denial-of-service issue (fix 0.8.3). An unused `@prisma/client` 7 is installed. | V | Dependabot, an audit gate in CI, move the CLI to devDependencies, bump `fflate`, remove the unused client |
| SEC-022 | Client-asserted upload details: `fileUrl`, size and MIME type are trusted, and `resolveDocumentUrl` passes external URLs through, which makes an open redirect | R | Covered by the SEC-006 rebuild **Partly fixed 23 Oct (S1): paths limited to the scheme folder, no external URLs. Server-side storage in S3..** |
| SEC-023 | Global `hasCommitteeRole` and similar checks are not tied to the scheme in hand | V | Scheme-scoped role checks **Fixed 23 Oct (S1).** |
| SEC-024 | The search and profile actions have no rate limit and allow 2-character wildcard searches | R | Minimum length, exact email match, rate limit **Fixed 23 Oct (S1).** |

### Low

| ID | Finding |
|---|---|
| SEC-025 | Raw database or Supabase error text is returned to the client in several actions |
| SEC-026 | Strata roll text (owner names and addresses) is written to server logs. Bank detail errors are logged whole. |
| SEC-027 | The cron secret is compared with `!==` rather than a constant-time comparison |
| SEC-028 | Authenticated API responses send `cache-control: public, max-age=0`. They should send `private, no-store`. |
| SEC-029 | The signed URL helper defaults to 3600 seconds |
| SEC-030 | Supabase auth cookies are readable by JavaScript (the `@supabase/ssr` design). The strict nonce CSP is the main mitigation. |
| SEC-031 | The pending invitation lookup uses an unescaped `ilike` on email **Fixed 23 Oct (S1).** |
| SEC-032 | One contractor review path lacks the self-approval guard **Fixed 23 Oct (S1).** |

### Controls already working (with evidence)

- **HTTPS.** Every Vercel deployment is HTTPS only. The CDN answers HTTP with a 308 redirect that can't be disabled ([Vercel encryption docs](https://vercel.com/docs/encryption)). Observed: `http://strataverze.vercel.app/login` landed on `https://`. TLS 1.2 and 1.3 only, forward-secret ciphers.
- **Headers on production.** HSTS (`max-age=63072000; includeSubDomains; preload`), and `*.vercel.app` is HSTS-preloaded. Nonce-based CSP with `strict-dynamic`, `frame-ancestors 'none'`, `X-Frame-Options DENY`, `nosniff`, a strict Referrer-Policy and a Permissions-Policy. No mixed content found on the login page.
- **Supabase HTTP APIs** (Auth, Data API, Storage) accept only TLS 1.2 and 1.3 ([Supabase platform security](https://supabase.com/docs/guides/security/platform-security)). Live database connections observed over SSL.
- **Passwords** are held only by Supabase Auth as bcrypt hashes. The live hashes show `$2a$10$` (bcrypt, cost 10). The app stores no passwords.
- **RLS** is on for all 142 tables. All 13 SECURITY DEFINER functions set `search_path` and return only booleans about the caller.
- **Email confirmation** is required, and invitation acceptance needs an exact email match.
- **Code hygiene.** No raw SQL, no `dangerouslySetInnerHTML`, no `eval`, no secrets in client code, `.env` files not committed. Open-redirect handling in login and callback is sound.
- **Finance code.** The finance API routes (PDFs, documents, audit export) and the newer finance modules (receipts, reconciliation, budgets, cutover, statutory) scope records correctly.

## Provider-managed controls and plan limits

| Control | Provider | What is documented | Limitation for us |
|---|---|---|---|
| Encryption at rest | Supabase | "All customer data is encrypted at rest with AES-256", and tokens and keys are also encrypted at application level ([Supabase security](https://supabase.com/security)) | The statement does not break down database, storage and backups separately. I have no independent evidence beyond the provider's statement, so it is recorded as **provider-attested, not independently verified**. The SOC 2 Type 2 report and ISO 27001 certificate are available only on Team and Enterprise plans. |
| Backups | Supabase | Daily backups on paid plans, PITR as a Pro add-on | **Free plan: no backups** (dashboard) |
| Session time-box and inactivity | Supabase | Pro plan and above. Enforced at the next refresh, not immediately ([Sessions docs](https://supabase.com/docs/guides/auth/sessions)) | Not available, so the app must enforce it |
| Leaked password check, SMS MFA | Supabase | Pro plan | Not available |
| Database SSL enforcement | Supabase | Off by default. Enabling it triggers a fast database reboot ([SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement)) | Brief interruption when enabled |
| HTTPS, TLS, HSTS | Vercel | See above | None |
| Deployment protection | Vercel | Standard Protection (Vercel login) is on for previews | Password protection needs Pro |
| Platform patching | Both | Vercel patches its CDN and runtime. Supabase patches Postgres, Auth and Storage on its own schedule. | We own our dependencies and configuration |

**Other places data lives:**
- Vercel build and function logs, which contain whatever the app logs (see SEC-026).
- Resend, which holds outgoing email content including owner names and levy amounts.
- Browser downloads of PDFs and exports.
- The ABR (ABN lookup) service.
- The edge cache, though no authenticated pages are cached (only the static login page showed a cache HIT).

Each of these is listed in the residual risks. Vercel's hosting terms (Hobby plan for a commercial service) need checking. I am not certain of the current terms.

## Accounts and onboarding (your process, as confirmed on 23 October)

1. **Buildings are onboarded only by StrataVerze administrators.** `createSchemeAction` and the onboarding wizard require platform admin.
2. **When onboarding finishes, the platform invites every lot owner** at their preferred email (from the lot's delivery preference or owner email). Each owner gets an OWNER invitation tied to their lot.
3. **Committee access** comes through a COMMITTEE invitation or by adding the role to an existing owner. Committee office (chair, secretary, treasurer) is recorded on the membership. Treasurer and the new chair and secretary flags can be set only by an administrator or the Adviser, never by the person themselves.
4. **Strata managers come in through the supplier route.** They self-register as a supplier and StrataVerze reviews them. They are then invited to a building as its Adviser by a **StrataVerze administrator or the committee's chair or secretary only**.
5. **Change of ownership.** Recording a transfer does three things:
   - ends the outgoing owner's OWNER membership on the settlement date
   - gives them **read-only access to their own levy history and statements for 30 days**
   - invites the incoming owner

   It also cancels any of the outgoing owner's pending invitations.
6. **Only suppliers self-register.** Supabase open sign-up is turned off.
   - Owner and committee accounts are created on the server when someone accepts an invitation, for the invited email only.
   - Supplier sign-up runs through a server action with rate limiting, creating an account that has no building access until StrataVerze approves it and a building assigns work.

## Permissions matrix (draft for approval)

Legend:
- **V** view, **C** create, **U** update, **D** delete, **X** download or export
- **own** means only records tied to the user's own lot or own assignment
- **none** no access
- Platform admin access is for support and onboarding, and every use is audited

| Information | Owner | Committee | Adviser (invited strata manager) | Accountant | Supplier | Platform admin |
|---|---|---|---|---|---|---|
| Building profile | V | V | V U | V | V (assigned buildings, name and address only) | V C U D |
| Lots, entitlements | V (own lot detail, others' lot number and entitlement only) | V | V C U D | V | none | V |
| Owner contact details | V U own | V (owners' names and lot numbers, contact details pending decision 3) | V U | none | none | V (audited) |
| Levy notices, owner ledger, statements | V X own | V X (summary and arrears) | V C U X | V X | none | V |
| General ledger, journals, bank, reconciliation | none | V X (reports) | V C U X | V X | none | V |
| Supplier invoices and payments | none | V, approve (per payment controls) | V C U | V | V C own (own invoices) | V |
| Payment authorisation | none | Treasurer or authoriser per policy | Instruct only, cannot approve own | none | none | none |
| Budgets, statutory reports | V X (published) | V X | V C U X | V X | none | V |
| Meetings, notices, minutes | V (published), vote own lot | V C U, vote, and may call general meetings (decided 23 Oct) | V C U | none | none | V |
| Documents (shared library) | V X (owner-visible) | V X C | V X C U D | V X (financial) | V X (assigned work only) | V |
| Payment confirmations | C V own | none | V | V | none | V |
| Work orders, quotes | C (request), V (all of the building's work orders, decided 23 Oct) | V C U, approve | V C U D | none | V U own (assigned), quote own | V |
| Debt recovery | V own case (no internal notes) | V | V C U | V | none | V |
| Memberships and invitations | none | Chair or secretary: invite Adviser | V C U D (owner, committee, accountant) | none | none | V C U D |
| Security audit log | none | none | V (own building, read-only) | none | none | V X |

Every rule here is enforced on the server by checking the role **on that building** and checking that the record **belongs to that building** (and to the lot or assignment where marked "own"). A person with different roles on different buildings gets each building's rules separately. Hidden buttons are not relied on.

## Implementation plan

Each stage is one PR, green on lint, type-check, tests and build. Production database changes go through the SQL editor with your approval each time, as before.

| Stage | Content | Production change |
|---|---|---|
| **S0 Containment** | (a) Revoke Data API privileges (SEC-005). (b) Building creation for platform admins only (SEC-002). (c) Fix the sign-in-only actions (SEC-003, SEC-008). (d) Auth settings: Site URL and redirect list, minimum password 8 with character rules, secure password change on. | Grants migration. Auth settings. |
| **S1 Authorisation layer** | `src/config/permissions.ts` (the matrix as code), `requireSchemeAccess(schemeId, capability)`, `loadInScheme(...)`, scheme-scoped mutators. Fix SEC-004, 007, 009, 014, 015, 023, 024. | None |
| **S2 Accounts lifecycle** | Admin onboarding, bulk owner invitations, committee offices, Adviser invitation by chair or secretary, change of ownership with 30-day read-only, server-side account creation, supplier sign-up. Then turn off open sign-up. | Migration for offices and transfers. Auth setting. |
| **S3 Storage** | Server-only uploads and downloads, document visibility, bucket MIME and size limits, SVG removed (SEC-006, 022) | Storage policies and bucket settings |
| **S4 MFA** | Enrolment, login challenge, server enforcement, step-up for sensitive operations, recovery and admin reset | Auth setting (limit AAL1 session duration) |
| **S5 Sessions** | App session register, idle and absolute timeouts, revocation on disable, role change and password reset, admin "sign out everywhere" | Migration |
| **S6 Audit log** | Append-only `security_audit_events` with a hash chain, event coverage, admin viewer, retention job, owner feed restricted | Migration. Turn on Auth audit to database. |
| **S7 Web hardening** | Email escaping, error mapping, log hygiene, database-backed rate limiting, cache headers, cron comparison, signed URL default (SEC-019, 020, 025 to 029, 031, 032) | Migration (rate limit table) |
| **S8 Transport and patching** | Enforce SSL and `sslmode`, preview separation, Sensitive variables, Dependabot, CI audit gate, pinned Actions, dependency clean-up (SEC-017, 018, 021) | Database reboot. Vercel settings. |
| **S9 Documentation and verification** | Final register, matrix, verification report with evidence, runbook, residual risks | None |

**Automated tests** (added from S0 onwards):
- **Cross-scheme tests.** For every server action, calling it with scheme A and a record from scheme B is rejected.
- **A static test** that fails the build if any exported server action does not call the authorisation layer.
- **Role escalation tests.** Covers memberships, invitations, profile flags and committee offices.
- **Live negative checks on production.** Run as the browser roles in rolled-back blocks, like the SEC-001 proof:
  - Data API reads and writes refused
  - storage list and download refused
  - profile flag change refused

## MFA design

- **Mandatory:** platform admins, Advisers, Accountants, Payment authorisers, and committee office holders (chair, secretary, treasurer). **Available** to everyone else.
- **Server enforcement.** The authorisation layer reads the session's assurance level (`aal`). A user who holds a mandatory role but is at `aal1` is sent to enrol or verify and cannot reach any page or action for that role. This is checked on the server for every request, so another sign-in method or a direct call gets the same result. A password reset gives an `aal1` session, so it doesn't bypass MFA.
- **Step-up.** These need a TOTP check within the last 15 minutes, read from the session's `amr` timestamps:
  - payment authorisation and instruction
  - bank detail changes and verification
  - membership, role and invitation changes
  - MFA removal
  - period reopen
  - migration cutover
  - building deletion
  - exports
- **Recovery.** Users are encouraged to enrol a second authenticator. Supabase has no built-in backup codes. If both are lost, a platform admin removes the factor after verifying identity (callback to the phone number on record, plus a confirmation email). The reset is logged, and all the user's sessions are revoked.
- **Revocation.** Disabling an account removes its memberships, ends its sessions and blocks sign-in.

## Proposed settings for approval

| Setting | Proposal | Reason |
|---|---|---|
| Idle timeout, privileged roles (platform admin, Adviser, Accountant, Payment authoriser) | **30 minutes** | Access to every owner's data and payments |
| Absolute timeout, privileged roles | **12 hours** | One working day |
| Idle timeout, owners, committee, suppliers | **4 hours** | Lower privilege, less friction |
| Absolute timeout, owners, committee, suppliers | **14 days** | Fortnightly sign-in |
| Access token lifetime (Supabase) | **15 minutes** (currently 60) | Limits a stolen token's use against the Auth API. The app check revokes immediately inside the app either way. |
| Step-up window | **15 minutes** | |
| Password minimum | **8 characters** (your decision, 23 Oct), mixed case and digits (Supabase setting) | Applies at next password change, so existing users are unaffected. Matches the app's existing 8 character rule. |
| Invitation expiry | **14 days** | |
| Outgoing owner read-only | **30 days** (your decision) | |
| Security audit log retention | **7 years**, then deleted by a scheduled job | Aligns with financial record keeping. I am not certain of the exact NSW record-keeping periods that apply to an owners corporation's access logs, so please confirm with your compliance view. |
| IP addresses in logs | Stored as a salted hash, user agent truncated | Investigation value without holding raw IPs |

## Audit log design

- **Where it is stored.** A new table, `security_audit_events`:
  - time, actor, actor role, building (optional), action, resource type and id, outcome (allowed, denied, failed), reason
  - hashed IP, truncated user agent, request id
  - a small allow-listed metadata object
- **Never logged:** passwords, tokens, codes, bank numbers or request bodies.
- **Protection:**
  - The browser roles have no access to the table.
  - A trigger rejects updates and deletes except by the retention job.
  - Each row carries a hash of the previous row, so a daily check detects any tampering.
- **Events recorded:**
  - sign-in success and failure, sign-out, MFA enrol, verify, fail and removal, password reset requested and completed
  - session expired or revoked
  - access denied (every 403)
  - owner contact detail views, financial report and ledger views, every document download and export
  - membership, role, office and invitation changes
  - every Adviser and administrator write
- **Who can read it:** platform admins read everything, and Advisers read their own building's events, both read-only.
- **Provider logs.** Supabase and Vercel infrastructure logs are separate. Their retention on the current plans is short and is not relied on.

## Changes that could disrupt users

1. **Enforcing database SSL** causes a database reboot of seconds to a few minutes. Best done out of hours.
2. **Data API revoke.** No impact expected, since the app does not use the Data API for tables. The waitlist form already fails because its table does not exist.
3. **Turning off open sign-up.** Existing accounts are unaffected. New owners can join only by invitation, and new suppliers only through the supplier sign-up. This waits until S2 ships.
4. **MFA.** You and any Adviser must enrol at next sign-in once S4 ships.
5. **Timeouts.** Idle users are signed out.
6. **Storage changes.** Upload and download flows change. The 3 existing files stay in place.

## Decisions needed

1. Approve the findings, the plan and the settings above (or amend any value).
2. **Plans.**
   - Supabase Pro (backups, session settings, leaked password check).
   - Whether Vercel Hobby is acceptable for a commercial service. Please check Vercel's current terms, as I can't confirm them.
3. **Committee access to owner contact details.** Names and lot numbers only, or emails and phones too?
4. **A separate Supabase project for preview deployments**, or preview runs without database credentials.
5. **The domain.** Decided: `strataverze.com`. Still to do: verify the domain in Resend (add its DNS records in Cloudflare), add `RESEND_API_KEY` to Vercel, and add MX records if mail to support@ and staff addresses should be received.

## Open items raised in S1 (for decision or a later stage)

- **Bank detail verification.** Nothing yet lets StrataVerze mark a contractor's bank details as verified, so works payments cannot be authorised. A verification step (with call-back to a known number) needs building.
- **Owner view of work orders.** Decided 23 Oct: owners see all of their building's work orders (matrix and search updated).
- **Committee calling general meetings.** Decided 23 Oct: the committee as well as the adviser may call general meetings.
- **Domain.** Decided 23 Oct: `strataverze.com`. It is connected to Vercel (`strataverze.com` redirects to `https://www.strataverze.com`), and the Supabase Site URL and redirect list now use it. Its DNS (Cloudflare) has no MX, SPF, DMARC or Resend DKIM records, so it cannot yet send through Resend or receive mail (including support@). Those records are needed before invitations can go out (stage S2).
- **Payment policy loosening.** A treasurer (not also an adviser) can loosen the payment policy alone. A second-approver step is a follow-up.
- **Contractor identity after approval.** An approved contractor can still change its company name, phone and email without re-review.
- **Owner assignment.** An adviser can assign any existing profile as owner of a lot without an invitation (replaced by the invitation flow in S2).
- **Password change.** Changing a password does not ask for the current password (S4, with re-authentication).

## Residual risks and limitations

- Encryption at rest is provider-attested only. Assurance reports need a Supabase Team plan.
- No independent penetration test has been done. This review was by code reading and configuration inspection.
- Supabase has no built-in MFA backup codes, so recovery depends on the admin-assisted process.
- Third parties that hold personal information: Resend (email content), Vercel logs, ABR.
- Exported files and PDFs are outside our control once downloaded.
- Platform admins (StrataVerze staff) can see every building. This is mitigated by MFA, audit and least use, not removed.
- The `postgres` database credential is all-powerful. It is held only in Vercel and the local environment.
