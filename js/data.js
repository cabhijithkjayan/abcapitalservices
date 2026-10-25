// Data layer: sheet schema, sample data, Excel import and export.
// One workbook, one sheet per department. Sheet and column names must match SCHEMA.

const SCHEMA = {
  Leads:        ['LeadID', 'Date', 'Source', 'Campaign', 'ClientName', 'Service', 'ValueAED', 'Status', 'Owner'],
  // Ad spend per campaign per month, from Meta Ads Manager / Google Ads exports
  Campaigns:    ['Month', 'Campaign', 'Platform', 'SpendAED', 'Impressions', 'Clicks'],
  Clients:      ['ClientID', 'Name', 'Company', 'Jurisdiction', 'LicenceNo', 'TRN', 'StartDate'],
  Cases:        ['CaseID', 'ClientID', 'Department', 'Service', 'Stage', 'Assignee', 'OpenedOn', 'DueDate', 'ClosedOn', 'FeeAED', 'Status'],
  Expiries:     ['ClientID', 'Type', 'Number', 'ExpiryDate'],
  Banking:      ['ClientID', 'Bank', 'AppliedOn', 'Status', 'RejectionReason'],
  TaxCalendar:  ['ClientID', 'Type', 'Period', 'DueDate', 'Filed'],
  Team:         ['Staff', 'Department', 'Role', 'OnLeave'],
  // From Tally
  Finance:      ['Month', 'RevenueAED', 'ExpensesAED', 'CollectedAED', 'VATPayableAED'],
  Receivables:  ['ClientName', 'InvoiceNo', 'InvoiceDate', 'DueDate', 'AmountAED'],
  BankBalances: ['Bank', 'Account', 'BalanceAED', 'AsOf'],
};

const DATE_FIELDS = new Set(['Date', 'StartDate', 'OpenedOn', 'DueDate', 'ClosedOn', 'ExpiryDate', 'AppliedOn', 'InvoiceDate', 'AsOf', 'Month']);
const isMoney = (f) => f.endsWith('AED');
const COUNT_FIELDS = new Set(['Impressions', 'Clicks']);

const DEPARTMENTS = ['Company Formation', 'PRO & Visa', 'Banking', 'Accounting & Tax', 'Loans & Mortgage', 'Advisory'];
const LEAD_STAGES = ['New', 'Contacted', 'Proposal', 'Won', 'Lost'];
const OPEN_LEAD_STAGES = ['New', 'Contacted', 'Proposal'];

function toDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v === 'number') {
    // Excel serial date
    return new Date(Math.round((v - 25569) * 86400 * 1000));
  }
  const s = String(v).trim();
  // dd/mm/yyyy or dd-mm-yyyy (UAE / Tally style)
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(y, Number(m[2]) - 1, Number(m[1]));
  }
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function toNumber(v) {
  if (typeof v === 'number') return v;
  const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function normalizeRows(sheet, rows) {
  const cols = SCHEMA[sheet];
  return rows.map((r) => {
    // match columns case- and space-insensitively
    const keyed = {};
    for (const k of Object.keys(r)) keyed[k.replace(/\s+/g, '').toLowerCase()] = r[k];
    const out = {};
    for (const c of cols) {
      const v = keyed[c.toLowerCase()];
      if (DATE_FIELDS.has(c)) out[c] = toDate(v);
      else if (isMoney(c) || COUNT_FIELDS.has(c)) out[c] = toNumber(v);
      else out[c] = v === undefined || v === null ? '' : String(v).trim();
    }
    return out;
  }).filter((r) => Object.values(r).some((v) => v !== '' && v !== null && v !== 0));
}

// Parse an uploaded / fetched workbook (ArrayBuffer) into { data, warnings }.
function parseWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const byName = {};
  for (const n of wb.SheetNames) byName[n.replace(/\s+/g, '').toLowerCase()] = wb.Sheets[n];
  const data = {};
  const missing = [];
  for (const sheet of Object.keys(SCHEMA)) {
    const ws = byName[sheet.toLowerCase()];
    if (!ws) { data[sheet] = []; missing.push(sheet); continue; }
    data[sheet] = normalizeRows(sheet, XLSX.utils.sheet_to_json(ws, { defval: '' }));
  }
  return { data, warnings: missing.length ? [`Sheets not found (shown empty): ${missing.join(', ')}`] : [] };
}

function exportWorkbook(data, filename) {
  const wb = XLSX.utils.book_new();
  for (const sheet of Object.keys(SCHEMA)) {
    const ws = XLSX.utils.json_to_sheet(data[sheet] || [], { header: SCHEMA[sheet], cellDates: true, dateNF: 'dd-mmm-yyyy' });
    ws['!cols'] = SCHEMA[sheet].map((c) => ({ wch: Math.max(12, c.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, sheet);
  }
  XLSX.writeFile(wb, filename);
}

// Cache an upload in this browser only. Storage can be blocked, so every access is guarded.
const CACHE_KEY = 'abc-dashboard-upload';
function saveCache(payload) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(payload)); } catch (e) { /* storage unavailable or full */ }
}
function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    for (const sheet of Object.keys(SCHEMA)) {
      p.data[sheet] = (p.data[sheet] || []).map((r) => {
        for (const f of DATE_FIELDS) if (f in r) r[f] = r[f] ? new Date(r[f]) : null;
        return r;
      });
    }
    return p;
  } catch (e) { clearCache(); return null; }
}
function clearCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Sample data: fictional, generated relative to today so the dashboard always looks current.
// ---------------------------------------------------------------------------
function makeSampleData() {
  let seed = 20261025;
  const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const pad = (n, w) => String(n).padStart(w, '0');

  const team = [
    ['Sana R.', 'Management', 'General Manager'],
    ['Imran H.', 'Sales & Marketing', 'Sales Lead'], ['Priya N.', 'Sales & Marketing', 'Business Consultant'], ['Omar F.', 'Sales & Marketing', 'Digital Marketing Executive'],
    ['Faisal A.', 'Company Formation', 'Formation Lead'], ['Neha S.', 'Company Formation', 'Formation Executive'], ['Yusuf K.', 'Company Formation', 'Formation Executive'],
    ['Rashid M.', 'PRO & Visa', 'PRO Lead'], ['Arjun P.', 'PRO & Visa', 'PRO Officer'], ['Hassan T.', 'PRO & Visa', 'PRO Officer'],
    ['Leena J.', 'Banking', 'Banking Relationship Lead'], ['Karim B.', 'Banking', 'Banking Executive'],
    ['Deepa V.', 'Accounting & Tax', 'Tax Manager'], ['Anil G.', 'Accounting & Tax', 'Senior Accountant'], ['Mariam Z.', 'Accounting & Tax', 'Accountant'], ['Rohit D.', 'Accounting & Tax', 'Accountant'],
    ['Samir L.', 'Loans & Mortgage', 'Mortgage Advisor'],
    ['Vikram C.', 'Advisory', 'Business Analyst'],
    ['Noor E.', 'HR & Admin', 'HR & Admin Officer'], ['Joseph W.', 'HR & Admin', 'Office Administrator'],
  ];
  const Team = team.map(([Staff, Department, Role]) => ({ Staff, Department, Role, OnLeave: rnd() < 0.1 ? 'Y' : 'N' }));
  const staffIn = (dept) => team.filter((t) => t[1] === dept).map((t) => t[0]);

  const services = {
    'Company Formation': [['Mainland Setup', 18000, 30000], ['Freezone Setup', 6000, 15000], ['Offshore Setup', 8000, 14000], ['Customs Registration', 1500, 3000]],
    'PRO & Visa': [['Investor Visa', 4000, 7500], ['Employment Visa', 3000, 5500], ['Golden Visa', 8000, 15000], ['Emirates ID Renewal', 600, 1200]],
    'Banking': [['Corporate Bank Account', 3500, 8000]],
    'Accounting & Tax': [['Bookkeeping (monthly)', 1500, 4500], ['VAT Filing', 1000, 2500], ['Corporate Tax Filing', 3000, 9000], ['E-invoicing Setup', 2500, 6000], ['Audit Coordination', 5000, 15000]],
    'Loans & Mortgage': [['Business Loan', 5000, 20000], ['Mortgage Advisory', 4000, 12000]],
    'Advisory': [['Business Plan', 4000, 10000], ['Feasibility Study', 8000, 25000], ['Liquidation', 6000, 14000]],
  };
  const stages = {
    'Company Formation': ['Documents', 'Name Approval', 'Licence Issued'],
    'PRO & Visa': ['Application', 'Medical', 'Biometrics', 'Stamping'],
    'Banking': ['KYC Pack', 'Submitted to Bank', 'Bank Review'],
    'Accounting & Tax': ['Data Collection', 'Preparation', 'Review'],
    'Loans & Mortgage': ['Assessment', 'Submitted', 'Lender Approval'],
    'Advisory': ['Scoping', 'Drafting', 'Client Review'],
  };
  const firstNames = ['Ahmed', 'Elena', 'Ravi', 'Chen', 'Fatima', 'Lucas', 'Aditi', 'Mohammed', 'Sofia', 'Kwame', 'Hana', 'Daniel', 'Zara', 'Igor', 'Layla', 'Marco', 'Nadia', 'Tomás', 'Ayesha', 'Pierre'];
  const lastNames = ['Rahman', 'Petrova', 'Iyer', 'Wei', 'Haddad', 'Silva', 'Mehta', 'Saleh', 'Rossi', 'Mensah', 'Kim', 'Novak', 'Ali', 'Volkov', 'Nasser', 'Bianchi', 'Karimi', 'García', 'Qureshi', 'Laurent'];
  const companyWords = ['Trading', 'Technologies', 'General Trading', 'Consultancy', 'Logistics', 'Foodstuff', 'Real Estate', 'E-Commerce', 'Marketing', 'Holdings'];
  const jurisdictions = ['Dubai Mainland', 'SRTIP', 'SHAMS', 'IFZA', 'RAKEZ', 'Ajman Free Zone', 'Meydan Free Zone', 'RAK ICC Offshore'];

  const Clients = [];
  for (let i = 1; i <= 70; i++) {
    const name = `${pick(firstNames)} ${pick(lastNames)}`;
    const j = pick(jurisdictions);
    Clients.push({
      ClientID: `C${pad(i, 3)}`,
      Name: name,
      Company: `${name.split(' ')[1]} ${pick(companyWords)} ${j.includes('Mainland') ? 'LLC' : 'FZE'}`,
      Jurisdiction: j,
      LicenceNo: String(int(100000, 999999)),
      TRN: rnd() < 0.7 ? `100${int(100000000, 999999999)}0003` : '',
      StartDate: addDays(today, -int(20, 1100)),
    });
  }

  const sources = ['Website', 'WhatsApp', 'WhatsApp', 'Referral', 'Book-a-Call', 'Cost Calculator', 'Walk-in', 'Meta Ads', 'Meta Ads', 'Google Ads', 'Google Ads'];
  const campaigns = [
    { name: 'Freezone Setup – Lead Form', platform: 'Meta', budget: 2600 },
    { name: 'Golden Visa – Reels', platform: 'Meta', budget: 1700 },
    { name: 'Company Formation – Search', platform: 'Google', budget: 3400 },
    { name: 'Corporate Tax – Search', platform: 'Google', budget: 1900 },
    { name: 'Bank Account Opening – Search', platform: 'Google', budget: 1300 },
  ];
  const Campaigns = [];
  for (let m = 5; m >= 0; m--) {
    const month = new Date(today.getFullYear(), today.getMonth() - m, 1);
    for (const c of campaigns) {
      const spend = Math.round(c.budget * (0.75 + rnd() * 0.5));
      const cpm = c.platform === 'Meta' ? 9 + rnd() * 6 : 28 + rnd() * 14;   // AED per 1,000 impressions
      const impressions = Math.round(spend / cpm * 1000);
      const ctr = c.platform === 'Meta' ? 0.009 + rnd() * 0.008 : 0.035 + rnd() * 0.03;
      Campaigns.push({ Month: month, Campaign: c.name, Platform: c.platform, SpendAED: spend, Impressions: impressions, Clicks: Math.round(impressions * ctr) });
    }
  }
  const Leads = [];
  for (let i = 1; i <= 170; i++) {
    const age = int(0, 180);
    const dept = pick(DEPARTMENTS.concat(['Company Formation', 'Company Formation', 'Accounting & Tax']));
    const [svc, lo, hi] = pick(services[dept]);
    let status;
    const r = rnd();
    if (age > 45) status = r < 0.42 ? 'Won' : r < 0.82 ? 'Lost' : pick(['Proposal', 'Contacted']);
    else if (age > 14) status = r < 0.25 ? 'Won' : r < 0.45 ? 'Lost' : pick(['Proposal', 'Contacted', 'Contacted']);
    else status = pick(['New', 'New', 'Contacted', 'Proposal']);
    const Source = pick(sources);
    const Campaign = Source === 'Meta Ads' ? pick(campaigns.filter((c) => c.platform === 'Meta')).name
      : Source === 'Google Ads' ? pick(campaigns.filter((c) => c.platform === 'Google')).name : '';
    Leads.push({
      LeadID: `L${pad(i, 4)}`, Date: addDays(today, -age), Source, Campaign,
      ClientName: `${pick(firstNames)} ${pick(lastNames)}`, Service: svc,
      ValueAED: Math.round(int(lo, hi) / 100) * 100, Status: status, Owner: pick(staffIn('Sales & Marketing')),
    });
  }

  const Cases = [];
  for (let i = 1; i <= 210; i++) {
    const dept = pick(DEPARTMENTS.concat(['Company Formation', 'PRO & Visa', 'Accounting & Tax', 'Accounting & Tax']));
    const [svc, lo, hi] = pick(services[dept]);
    const age = int(0, 180);
    const opened = addDays(today, -age);
    const due = addDays(opened, int(14, 50));
    let Status = 'Open', ClosedOn = null, Stage = pick(stages[dept]);
    const doneChance = age > 50 ? 0.93 : age > 20 ? 0.55 : 0.15;
    if (rnd() < doneChance) {
      Status = 'Completed'; Stage = 'Completed';
      ClosedOn = addDays(opened, int(5, Math.max(6, Math.min(age, 50))));
    } else if (rnd() < 0.08) Status = 'On Hold';
    Cases.push({
      CaseID: `K${pad(i, 4)}`, ClientID: pick(Clients).ClientID, Department: dept, Service: svc, Stage,
      Assignee: pick(staffIn(dept)), OpenedOn: opened, DueDate: due, ClosedOn,
      FeeAED: Math.round(int(lo, hi) / 100) * 100, Status,
    });
  }

  const Expiries = [];
  const expTypes = ['Trade Licence', 'Investor Visa', 'Emirates ID', 'Establishment Card', 'Employment Visa'];
  for (const c of Clients) {
    const n = int(1, 3);
    for (let k = 0; k < n; k++) {
      Expiries.push({ ClientID: c.ClientID, Type: pick(expTypes), Number: String(int(1000000, 9999999)), ExpiryDate: addDays(today, int(-12, 200)) });
    }
  }

  const banks = ['Emirates NBD', 'FAB', 'ADCB', 'Mashreq', 'RAKBANK', 'DIB', 'Wio', 'ADIB', 'CBD'];
  const reasons = ['Nationality risk', 'Insufficient business proof', 'High-risk activity', 'Incomplete KYC', 'No UAE presence'];
  const Banking = [];
  for (let i = 0; i < 60; i++) {
    const age = int(0, 150);
    const r = rnd();
    const Status = age > 30 ? (r < 0.62 ? 'Approved' : r < 0.9 ? 'Rejected' : 'Under Review') : (r < 0.2 ? 'Approved' : r < 0.3 ? 'Rejected' : pick(['Submitted', 'Under Review']));
    Banking.push({ ClientID: pick(Clients).ClientID, Bank: pick(banks), AppliedOn: addDays(today, -age), Status, RejectionReason: Status === 'Rejected' ? pick(reasons) : '' });
  }

  const TaxCalendar = [];
  for (const c of Clients.filter((x) => x.TRN)) {
    for (let q = -2; q <= 1; q++) {
      const due = addDays(today, q * 90 + int(-20, 20));
      const ago = -Math.round((due - today) / 864e5);
      const filed = ago > 30 ? rnd() < 0.99 : ago > 0 ? rnd() < 0.8 : rnd() < 0.15;
      TaxCalendar.push({ ClientID: c.ClientID, Type: 'VAT Return', Period: `Q${((Math.floor(due.getMonth() / 3) + 3) % 4) + 1} ${due.getFullYear()}`, DueDate: due, Filed: filed ? 'Y' : 'N' });
    }
    if (rnd() < 0.5) {
      const due = addDays(today, int(-30, 120));
      TaxCalendar.push({ ClientID: c.ClientID, Type: 'Corporate Tax Return', Period: `FY ${due.getFullYear() - 1}`, DueDate: due, Filed: due < today ? (rnd() < 0.9 ? 'Y' : 'N') : 'N' });
    }
  }

  const Finance = [];
  for (let m = 11; m >= 0; m--) {
    const month = new Date(today.getFullYear(), today.getMonth() - m, 1);
    const rev = Math.round((210000 + (11 - m) * 7000 + int(-25000, 25000)) / 100) * 100;
    const exp = Math.round(rev * (0.58 + rnd() * 0.12) / 100) * 100;
    Finance.push({ Month: month, RevenueAED: rev, ExpensesAED: exp, CollectedAED: Math.round(rev * (0.82 + rnd() * 0.16) / 100) * 100, VATPayableAED: Math.round(rev * 0.05 * (0.55 + rnd() * 0.2)) });
  }

  const Receivables = [];
  for (let i = 1; i <= 45; i++) {
    const inv = addDays(today, -int(1, 130));
    const c = pick(Clients);
    Receivables.push({ ClientName: c.Company, InvoiceNo: `ABC-${today.getFullYear()}-${pad(1000 + i, 4)}`, InvoiceDate: inv, DueDate: addDays(inv, 30), AmountAED: Math.round(int(1500, 38000) / 50) * 50 });
  }

  const BankBalances = [
    { Bank: 'Emirates NBD', Account: 'Current – AED', BalanceAED: 412500, AsOf: today },
    { Bank: 'Wio', Account: 'Business – AED', BalanceAED: 186300, AsOf: today },
    { Bank: 'Mashreq', Account: 'Client Funds – AED', BalanceAED: 254900, AsOf: today },
  ];

  return { Leads, Campaigns, Clients, Cases, Expiries, Banking, TaxCalendar, Team, Finance, Receivables, BankBalances };
}
