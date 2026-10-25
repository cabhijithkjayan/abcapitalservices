# AB Capital — Operations Dashboard Blueprint

Version 0.1 · 2026-10-25 · Owner: Manager (AbHi)

## 1. What the business actually is

AB Capital Services FZC (SRTIP Sharjah licence 1543, FTA-approved tax agency) is a **corporate services consultancy**, not a brokerage or investment firm. Revenue comes from service jobs sold to entrepreneurs, SMEs and foreign investors:

| Department | Services |
|---|---|
| Sales / Business Development | Leads from website, WhatsApp, Book-a-Call, Tally calculator, referrals |
| Company Formation | Mainland, Freezone, Offshore, Dubai Customs registration |
| PRO & Visa | Government paperwork, employment/investor visas, Golden Visa, Emirates ID |
| Banking Solutions | Corporate bank account opening (~16 partner banks) |
| Accounting & Tax | Bookkeeping, VAT, Corporate Tax, e-invoicing (ASP), audit, Tax Residency Certificate, AML/CFT |
| Loans & Mortgage | Business loans, mortgages, real estate advisory |
| Advisory | Feasibility studies, business plans, financial projections, liquidation |
| Internal | Finance/Billing, HR, Admin, Management |

**Design consequence:** the dashboard is built around one idea —
**one Client → many Cases (service jobs) → each Case moves through departments.**
A single client typically flows: Lead → Formation → PRO/Visa → Bank account → Accounting & Tax (recurring for years).

## 2. Architecture (high level)

```
                 Internet (HTTPS, 24x7)
                          |
              [ CDN + WAF / DDoS protection ]
                          |
         +----------------+-----------------+
         |                                  |
  Staff Dashboard (web, mobile-friendly)   Client Portal (Phase 4)
         |                                  |
         +---------------+------------------+
                         |
                  API / Backend layer
       (auth, roles, business rules, workflows, jobs)
                         |
   +---------+-----------+-----------+-------------+
   |         |           |           |             |
 Postgres  File store  Job queue   Realtime     Integrations
  (data)  (documents)  (reminders, (live         (WhatsApp, email,
                        reports)    updates)      accounting, calendar)
```

### Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js + TypeScript + Tailwind + shadcn/ui | One codebase for web and mobile browser |
| Backend | Next.js API routes / server actions (split to separate service later if needed) | Simple for a 20-user system |
| Database | PostgreSQL (Supabase or AWS RDS) | Relational data, row-level security |
| Auth | Supabase Auth or Auth.js with **mandatory MFA** | Handles passports/KYC data |
| Files | S3-compatible storage, encrypted, private buckets | Passports, licences, bank docs |
| Realtime | Supabase Realtime or WebSockets | Live dashboard counts |
| Background jobs | Cron + queue (e.g. Inngest, BullMQ) | Expiry reminders, deadline alerts |
| Hosting | AWS **me-central-1 (UAE)** or Azure UAE North; or Vercel + Supabase | UAE data residency (PDPL), 99.9%+ uptime |
| Monitoring | Uptime monitor + Sentry + daily backup checks | 24x7 availability |

**Build vs buy check:** for 20 users, Zoho One or Odoo can cover CRM + Books + HR out of the box. Custom build makes sense when the service workflows (formation stages, visa/licence expiries, tax calendar) are the differentiator. A hybrid is realistic: custom dashboard + Zoho Books/Xero for accounting via API.

## 3. Core data model

```
User ──< RoleAssignment >── Role (Admin, Manager, DeptHead, Staff, Viewer)
Department ──< User

Lead ──(convert)──> Client
Client ──< Contact (shareholders, signatories)
Client ──< Company (legal entity: licence no, jurisdiction, TRN, expiry)
Client ──< Document (type, expiry date, owner, version)
Client ──< Case
Case: service_type, department, stage, assignee, SLA due, fee, status
Case ──< Task ──< Comment
Case ──< Document
Case ──< Invoice ──< Payment
ComplianceItem: company, type (VAT return, CT return, licence renewal, visa expiry, EID expiry), due date, status
AuditLog: who, what, when, before/after
```

## 4. Module map (build one by one, all plug into the Core)

| # | Module | Purpose | Key screens |
|---|---|---|---|
| M0 | **Core Platform** | Login, MFA, users, roles, departments, audit log, notifications, settings | Login, user admin, profile |
| M1 | **CRM & Leads** | Capture leads from all channels, pipeline, quotes, conversion | Pipeline board, lead detail, quote builder |
| M2 | **Client 360 & KYC** | Single client record, shareholders, companies, KYC/AML risk rating | Client profile with tabs per department |
| M3 | **Case / Workflow Engine** | Generic stage-based workflow, checklists, SLAs, hand-offs between departments | Kanban per department, case detail |
| M4 | **Company Formation** | Formation templates per jurisdiction (Mainland/Freezone/Offshore) | Formation tracker |
| M5 | **PRO & Visa** | Visa/EID/licence applications and **expiry tracker** | Expiry calendar, renewals due |
| M6 | **Banking Solutions** | Applications per bank, status, rejection reasons, bank success rates | Bank pipeline, per-bank stats |
| M7 | **Accounting & Tax** | Recurring clients, **compliance calendar** (VAT, CT, e-invoicing), filing status | Deadline calendar, filing board |
| M8 | **Loans & Mortgage** | Applications, lenders, approval status, commissions | Loan pipeline |
| M9 | **Billing & Finance** | Quotes to invoices (AED, 5% VAT), payments, receivables aging, revenue by dept | Invoices, AR aging, revenue |
| M10 | **Document Vault** | Encrypted storage, versioning, expiry, access by role | Search, upload, expiring docs |
| M11 | **HR & Team** | 20 staff: attendance, leave, workload, targets | Team board, leave calendar |
| M12 | **Management Dashboard** | Live KPIs across all departments | Home screen for Manager |
| M13 | **Client Portal** | Clients upload docs, see case status, pay invoices | Client login |
| M14 | **Integrations** | WhatsApp Business API, email, Google/M365 calendar, Zoho Books/Xero, website forms | Connector settings |
| M15 | **Reports & Analytics** | Exports, scheduled reports, trends | Report builder |

### Management dashboard KPIs (M12)

- Leads this week/month, conversion rate, by source
- Open cases per department, overdue cases, SLA breaches
- Upcoming expiries (licences, visas, EIDs) — next 30/60/90 days
- Tax deadlines due (VAT, CT) and filing status
- Bank account applications: in progress, approved, rejected, by bank
- Revenue: invoiced vs collected, by department, receivables aging
- Team workload: open tasks per person, overdue per person

## 5. Roles and access

| Role | Access |
|---|---|
| Admin | Everything, user management, settings |
| Manager | All departments read/write, all dashboards, finance |
| Department Head | Own department full, other departments read where client is shared |
| Staff | Assigned cases and clients only |
| Finance | Billing, payments, revenue reports |
| Client (portal) | Own cases, own documents, own invoices |

## 6. Security and compliance (non-negotiable)

- MFA for every staff login; session timeout; IP/device alerts.
- Encryption in transit (TLS) and at rest (DB + file storage).
- Role-based access plus row-level security (staff see only what they need).
- Full audit log of views/edits of KYC documents.
- UAE PDPL data-protection alignment; host data in the UAE.
- AML/CFT: keep client due-diligence records at least 5 years (UAE AML law).
- Daily automated backups, point-in-time recovery, monthly restore test.
- Separate **staging** and **production** environments.

## 7. 24x7 availability

- Managed hosting with auto-restart and health checks.
- Uptime monitoring with SMS/WhatsApp alerts.
- CDN + WAF in front of the app.
- Error tracking (Sentry) and logs.
- Target: 99.9% uptime (about 43 minutes downtime/month).
- Custom domain, e.g. `portal.abcapital.ae` / `ops.abcapital.ae`.

## 8. Phased roadmap

| Phase | Modules | Outcome |
|---|---|---|
| **1. Foundation** | M0 Core, M2 Client 360, M10 Documents | Everyone logs in, one client database |
| **2. Revenue flow** | M1 CRM, M3 Workflow Engine, M9 Billing | Lead → case → invoice works end to end |
| **3. Departments** | M4 Formation, M5 PRO/Visa, M6 Banking, M7 Accounting & Tax, M8 Loans | Every department runs its work in the system |
| **4. Visibility** | M12 Management Dashboard, M11 HR, M15 Reports | Live picture of the whole firm |
| **5. External** | M13 Client Portal, M14 Integrations | Clients self-serve; WhatsApp/email connected |

Each module is built against the same Core (users, clients, cases, documents), so integration at the end is minimal — modules share data from day one.

## 9. Folder structure (when development starts)

```
ab-capital-dashboard/
├── BLUEPRINT.md
├── docs/                    # one spec per module (M0.md, M1.md ...)
├── apps/
│   ├── web/                 # staff dashboard (Next.js)
│   └── portal/              # client portal (Phase 5)
├── packages/
│   ├── db/                  # schema, migrations, seed
│   ├── auth/                # roles, permissions
│   ├── ui/                  # shared components
│   └── workflows/           # case stage templates per service
├── modules/
│   ├── crm/
│   ├── clients/
│   ├── cases/
│   ├── formation/
│   ├── pro-visa/
│   ├── banking/
│   ├── accounting-tax/
│   ├── loans/
│   ├── billing/
│   ├── documents/
│   ├── hr/
│   └── dashboard/
└── infra/                   # hosting, backups, monitoring config
```

## 10. Decisions needed before Phase 1

1. Build custom, buy (Zoho One/Odoo), or hybrid?
2. Current tools in use (Excel, Zoho, WhatsApp groups, Google Drive)? Data to migrate?
3. Accounting software already in use (Zoho Books, Xero, Tally)?
4. Budget and who develops (in-house, freelancer, agency, AI-assisted)?
5. Hosting preference and domain access (abcapital.ae DNS).
6. Department heads' list of current pain points (input for M3 workflows).
