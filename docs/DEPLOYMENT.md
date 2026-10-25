# Production deployment and security plan

Target: the CEO dashboard and department screens live 24x7 on the internet, backed by PostgreSQL, visible only to AB Capital staff.

## 1. Platforms

| Layer | Platform | Plan | Cost | Why |
|---|---|---|---|---|
| Code | GitHub, **private** repo | Free | AED 0 | Version history, deploys automatically on push |
| Website hosting | Cloudflare Pages | Free | AED 0 | Global CDN, HTTPS, DDoS protection built in |
| Login gate in front of the whole site | Cloudflare Zero Trust **Access** | Free (up to 50 users) | AED 0 | Nobody reaches the site without an approved company email and a one-time code or Microsoft/Google sign-in |
| Database + app logins | **Supabase** (PostgreSQL) | Free to build; **Pro** once real client data goes in | AED 0, then about USD 25/month | Real Postgres, row-level security, daily backups and no auto-pause on Pro |
| Documents (passports, licences) | Company OneDrive / Google Drive, or Supabase Storage private bucket | Existing / included | AED 0 | Store links in the database, not copies of IDs everywhere |
| Uptime alerts | UptimeRobot or Better Stack | Free | AED 0 | SMS/email if the site goes down |
| Error tracking | Sentry | Free | AED 0 | See front-end errors before staff report them |
| Backups off-platform | GitHub Actions nightly `pg_dump`, encrypted, to company OneDrive | Free | AED 0 | Copy outside Supabase in case of account or provider problems |
| Address | `*.pages.dev` free, or `dashboard.abcapital.ae` | Free | AED 0 | Subdomain of the domain the firm already owns |

Running cost in production: about **USD 25/month** (Supabase Pro). Everything else stays free at 20 users. Check current plan limits before go-live; they change.

**Data residency:** Supabase does not offer a UAE region. Choose the nearest region it offers. If the firm decides client ID data must stay in the UAE (UAE PDPL), move the database to AWS RDS in `me-central-1` (UAE) or Azure UAE North later; the schema in `db/schema.sql` is plain Postgres and moves with `pg_dump` / `pg_restore`.

## 2. Deployment steps (in order)

1. **Make the GitHub repo private.** Settings → General → Danger Zone → Change visibility. Turn off GitHub Pages after step 3 works.
2. **Create the Supabase project.** Pick the nearest region, set a long random database password, store it in a password manager. Run `db/schema.sql` in the SQL editor.
3. **Deploy on Cloudflare Pages.** Workers & Pages → Create → Pages → Connect to Git → choose the repo. Framework: None. Build command: empty. Output directory: empty.
4. **Put Cloudflare Access in front before any real data.** Zero Trust → Access → Applications → Self-hosted → domain `<project>.pages.dev` and `*.<project>.pages.dev` → policy: Allow, emails ending in `@abcapital.ae` (or a named list) → login: One-time PIN or Microsoft/Google. Test in a private window: it must ask for login first.
5. **Turn on Supabase Auth.** Email sign-in with MFA (TOTP), or Microsoft/Google sign-in. Disable public sign-ups; staff are invited by an admin.
6. **Turn on Row Level Security on every table** and add policies per role (admin, manager, dept_head, staff, finance). Staff see their department's clients and cases; finance tables only for manager/finance.
7. **Connect the dashboard to Supabase** using only the public `anon` key in the browser. The `service_role` key never goes in front-end code or the repo.
8. **Security headers.** Add a `_headers` file for Cloudflare Pages (CSP, HSTS, no framing). See section 3.
9. **Backups.** Upgrade Supabase to Pro before real client data. Add the nightly encrypted `pg_dump` GitHub Action with the database URL stored as a GitHub secret.
10. **Monitoring.** UptimeRobot check on the site every 5 minutes, Sentry on the front end.
11. **Import real data** from the Excel workbook into Postgres.
12. **Go-live review** with the checklist in section 4.

## 3. Security protocols

### Identity and access
- **MFA for everyone**, enforced at Cloudflare Access and in Supabase Auth. No exceptions for managers.
- **One named account per person.** No shared logins, no shared passwords.
- **Least privilege.** Roles in `staff.role`; Postgres Row Level Security enforces them in the database, not just in the screens.
- **Separate admin accounts** for the 1–2 people who manage users and settings.
- **Joiners and leavers:** add to the Access policy and Supabase on day one; remove both on the last day.
- **Quarterly access review:** manager checks the user list and roles.

### Data protection
- **HTTPS only**, with HSTS. Cloudflare and Supabase encrypt data at rest.
- **No real data in Git**, ever. `.gitignore` blocks `.xlsx`, `.xls`, `.csv`.
- **Secrets** (database password, service keys) live in a password manager, Supabase and GitHub Secrets only. Rotate them if anyone with access leaves.
- **ID documents** (passports, Emirates IDs) in a private bucket or company drive; the app stores a link and serves short-lived signed URLs.
- **Collect only what is needed** for KYC/AML.
- **Audit log** on client, case, document and staff tables (already in `db/schema.sql`); keep it at least 5 years in line with UAE AML record-keeping.

### Application hardening
- `_headers` file on Cloudflare Pages:
  ```
  /*
    Strict-Transport-Security: max-age=31536000; includeSubDomains
    Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdnjs.cloudflare.com https://cdn.sheetjs.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://*.supabase.co https://cdn.jsdelivr.net; frame-ancestors 'none'
    X-Content-Type-Options: nosniff
    Referrer-Policy: strict-origin-when-cross-origin
    Permissions-Policy: camera=(), microphone=(), geolocation=()
  ```
- **Pinned library versions** (already done) plus Subresource Integrity hashes on CDN scripts.
- **Dependabot** alerts on the GitHub repo.
- **Validate inputs** in the database too (check constraints already in the schema).

### Backups and continuity
- **3-2-1 rule:** 3 copies, 2 different places, 1 outside the main provider (Supabase daily backups + nightly encrypted dump to OneDrive).
- **Restore test every month** into a scratch database. A backup that was never restored is not a backup.
- **Uptime alerts** to the manager's phone.
- **Incident plan:** who to call, how to revoke all sessions (Cloudflare Access → revoke; Supabase → rotate keys), how to restore.

### Compliance (UAE)
- **UAE PDPL** (Federal Decree-Law No. 45 of 2021): lawful basis and privacy notice for client data, breach notification process, decision on data residency.
- **AML/CFT** (Federal Decree-Law No. 20 of 2018 and its amendments): keep CDD records at least 5 years; restrict who can view them; log access.
- Have the firm's compliance officer confirm these points before go-live.

### Staff devices
- Screen lock, full-disk encryption (BitLocker on Windows), automatic OS updates.
- Company password manager.
- No dashboard use on shared or public computers.

## 4. Go-live checklist

- [ ] Repo private; GitHub Pages turned off
- [ ] Cloudflare Access tested in a private window before any real data
- [ ] Supabase: public sign-up off, MFA on, RLS on for every table, policies tested per role
- [ ] `service_role` key not present anywhere in the repo
- [ ] `_headers` deployed; checked at securityheaders.com
- [ ] Supabase Pro active; nightly off-site dump running; one restore tested
- [ ] Uptime and error alerts reaching the manager
- [ ] Staff accounts created by invite only; leaver process written down
- [ ] Compliance officer sign-off on PDPL and AML points
