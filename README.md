# AB Capital Services – CEO Dashboard

One screen for the whole firm: sales, operations, compliance, finance and team.
It runs on the tools the firm already uses: **Excel sheets per department plus Tally exports**. No database, no server code, no licence fees.

## Pages

| Page | What the CEO sees |
|---|---|
| **Overview** | Revenue, collections, receivables, cash, new leads, open/overdue cases, expiries, tax deadlines, and a "Needs attention" list ranked by urgency |
| **Sales & Marketing** | Leads by stage and source, conversion rate, pipeline value, Meta and Google ad spend, leads from ads, cost per lead, cost per client won, return on ad spend, campaign table, services and sales staff ranked by won value |
| **Operations** | Open and overdue cases, completion time by department, opened vs completed per month, full open-case list (filter by department) |
| **Compliance** | Expired and expiring licences, visas and Emirates IDs; unfiled VAT and corporate tax returns; bank account applications and rejection reasons |
| **Finance** | Revenue, expenses and profit by month, collection rate, receivables aging, overdue invoices, bank balances, VAT payable |
| **Team** | Open and overdue cases per person, who is on leave |

Every chart has a **Table** button that shows the same numbers as a table. Light and dark mode are supported, and the layout works on phones.

## How the data works

All data lives in **one Excel workbook** with one sheet per area. Click **Download template** in the dashboard to get the workbook with the right sheet and column names (filled with fictional sample rows to show the format).

| Sheet | Updated by | Columns |
|---|---|---|
| `Leads` | Sales & Marketing | LeadID, Date, Source (Website, WhatsApp, Meta Ads, Google Ads…), Campaign, ClientName, Service, ValueAED, Status (New / Contacted / Proposal / Won / Lost), Owner |
| `Campaigns` | Marketing, from Meta Ads Manager / Google Ads | Month, Campaign, Platform (Meta / Google), SpendAED, Impressions, Clicks |
| `Clients` | Sales & Marketing / Admin | ClientID, Name, Company, Jurisdiction, LicenceNo, TRN, StartDate |
| `Cases` | All departments | CaseID, ClientID, Department, Service, Stage, Assignee, OpenedOn, DueDate, ClosedOn, FeeAED, Status (Open / On Hold / Completed) |
| `Expiries` | PRO | ClientID, Type (Trade Licence, Investor Visa, Emirates ID…), Number, ExpiryDate |
| `Banking` | Banking | ClientID, Bank, AppliedOn, Status (Submitted / Under Review / Approved / Rejected), RejectionReason |
| `TaxCalendar` | Accounts | ClientID, Type (VAT Return, Corporate Tax Return…), Period, DueDate, Filed (Y/N) |
| `Team` | HR | Staff, Department, Role, OnLeave (Y/N) |
| `Finance` | Accounts, from Tally | Month, RevenueAED, ExpensesAED, CollectedAED, VATPayableAED |
| `Receivables` | Accounts, from Tally | ClientName, InvoiceNo, InvoiceDate, DueDate, AmountAED |
| `BankBalances` | Accounts, from Tally | Bank, Account, BalanceAED, AsOf |

Rules that keep the dashboard accurate:

- Keep sheet names and column headers exactly as in the template. Extra columns are ignored.
- `ClientID` is the link between sheets. Use the same ID everywhere.
- For ad leads, write the campaign name in `Leads.Campaign` exactly as in the `Campaigns` sheet. That is how cost per lead and return on ad spend are calculated.
- `Campaigns`: one row per campaign per month. In Meta Ads Manager or Google Ads, set the date range to one month, export the campaign report, and copy Amount spent (AED), Impressions and Clicks.
- `Department` values: Company Formation, PRO & Visa, Banking, Accounting & Tax, Loans & Mortgage, Advisory.
- Dates can be real Excel dates or `dd/mm/yyyy`.
- Use dropdowns (Data → Data Validation) for Status, Stage and Department so spelling stays consistent.

### Getting the numbers out of Tally (TallyPrime)

| Sheet | Tally report | Path |
|---|---|---|
| `Finance` | Profit & Loss, monthly columns | Gateway → Profit & Loss A/c → F5/Alt+C for monthly columns → Export (Alt+E) to Excel |
| `Receivables` | Bills Receivable | Gateway → Display More Reports → Statements of Accounts → Outstandings → Receivables → Export |
| `BankBalances` | Bank Accounts group summary | Gateway → Display More Reports → Account Books → Group Summary → Bank Accounts → Export |
| `Finance` → VATPayableAED | VAT Return / VAT Computation | Gateway → Display More Reports → Statutory Reports → VAT Reports → Export |

Paste the exported rows into the matching sheet. Menu names vary slightly between Tally versions.

### Where the dashboard reads data from (in this order)

1. `data/abcapital.xlsx` on the web server, if it exists. Use this only on private hosting.
2. The last workbook loaded in this browser with **Load Excel**. It is kept in this browser only and never uploaded.
3. Fictional sample data, so the dashboard is never blank.

## Run it on your computer

Open a terminal in this folder and run:

```bash
python -m http.server 8080
```

Then open http://localhost:8080.

## Put it online for free

See [docs/HOSTING.md](docs/HOSTING.md).

## Files

```
index.html          page shell
css/style.css       layout, colors, light/dark mode
js/data.js          sheet schema, Excel import/export, sample data
js/app.js           pages, charts, tables
data/               live workbook goes here (private hosting only)
docs/BLUEPRINT.md   full system blueprint and module roadmap
docs/HOSTING.md     free hosting options
```

> **This repository is public.** Never commit real client or finance data. `.gitignore` blocks `.xlsx`, `.xls` and `.csv` files.
