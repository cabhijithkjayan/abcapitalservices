# data/

Put the live data file here as `abcapital.sql` (or a workbook as `abcapital.xlsx`) **only on private hosting** (see `docs/HOSTING.md`, Option B).

The dashboard loads `data/abcapital.sql`, then `data/abcapital.xlsx`, automatically if one exists (never on GitHub Pages). If it does not, the dashboard uses the last file loaded in that browser, or the fictional sample data.

`.gitignore` blocks `.sql` and `.xlsx` files so real data cannot be committed to the public repo by accident.
