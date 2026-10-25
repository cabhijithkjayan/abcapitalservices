# Putting the dashboard online for free

Two free options. Pick by one question: **should everyone see the same live data automatically?**

| | Option A: GitHub Pages | Option B: Cloudflare Pages + Access |
|---|---|---|
| Cost | Free | Free (Cloudflare Zero Trust free plan covers up to 50 users) |
| Setup time | 5 minutes | About 30 minutes |
| Who can open the site | Anyone with the link | Only email addresses you allow (login by one-time code) |
| Where the data lives | On each viewer's device. Each person clicks **Load Excel** and picks the workbook from OneDrive/Google Drive | On the server, as `data/abcapital.xlsx`, behind the login |
| Updating data | Each viewer reloads the file | Accounts uploads the new workbook once; everyone sees it |
| Repo | Must be **public** (Pages on private repos needs a paid GitHub plan) | Should be **private** |
| Good for | Trying it out now | Daily use by the CEO and department heads |

Check current free-plan limits on GitHub and Cloudflare before relying on them; they change from time to time.

---

## Option A: GitHub Pages (fastest)

The site holds only code and fictional sample data. Real numbers never leave the viewer's device.

1. Push this repo to GitHub (already connected: `cabhijithkjayan/abcapitalservices`).
2. On GitHub, open the repo → **Settings** → **Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*, branch `main`, folder `/ (root)`. Click **Save**.
4. Wait 1–2 minutes. The site is at **https://cabhijithkjayan.github.io/abcapitalservices/**
5. To use real data: open the site, click **Load Excel**, pick the workbook. The browser remembers it until **Reset** is clicked.

Do **not** put a real workbook in `data/` with this option. The repo and site are public.

---

## Option B: Cloudflare Pages + Cloudflare Access (recommended for daily use)

Everyone who logs in sees the same live workbook. Nobody else can open the site.

### 1. Make the repo private

GitHub → repo → **Settings** → **General** → scroll to **Danger Zone** → **Change visibility** → **Private**.

### 2. Deploy on Cloudflare Pages

1. Create a free account at https://dash.cloudflare.com.
2. **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → authorise GitHub → choose `abcapitalservices`.
3. Build settings: Framework preset **None**, build command **empty**, build output directory **empty** (the site is the repo root).
4. Click **Save and Deploy**. The site appears at `https://abcapitalservices.pages.dev` (the name may have a suffix if taken).

### 3. Lock it behind a login (do this before adding real data)

1. Cloudflare dashboard → **Zero Trust** (choose the Free plan; a card may be requested for verification but the plan is free).
2. **Access** → **Applications** → **Add an application** → **Self-hosted**.
3. Application domain: `abcapitalservices.pages.dev`. Add a second entry `*.abcapitalservices.pages.dev` to also protect preview deployments.
4. Add a policy: **Action** Allow → **Include** → *Emails ending in* `@abcapital.ae` (or list specific emails).
5. Login method: **One-time PIN** (users receive a code by email; no passwords to manage).
6. Save. Open the site in a private window and check that it asks for an email before showing anything.

### 4. Add the live workbook

The `.gitignore` blocks `.xlsx` files on purpose. Add the workbook through the GitHub website, which is not affected by `.gitignore`:

1. GitHub → repo (now private) → open the `data` folder → **Add file** → **Upload files**.
2. Upload the workbook named exactly **`abcapital.xlsx`** → **Commit changes**.
3. Cloudflare redeploys automatically in about a minute. The badge in the dashboard turns green and shows **Live file**.

To update: upload the new `abcapital.xlsx` the same way (it replaces the old one). Daily routine:
department sheets updated → accounts pastes Tally exports → workbook uploaded by 10 am.

### 5. Optional: your own address

Cloudflare Pages → project → **Custom domains** → add `dashboard.abcapital.ae`, then add the DNS record it shows at the abcapital.ae domain provider. Add the same domain to the Access application from step 3.

---

## Safety checklist

- [ ] Real data never committed while the repo is public.
- [ ] Cloudflare Access login tested in a private window **before** uploading the workbook.
- [ ] Access policy lists only current staff; remove leavers the same day.
- [ ] A copy of each day's workbook kept in the company OneDrive/Drive as backup.
