// CEO dashboard: loading, pages, charts and tables.

const TODAY = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
// Hosted data files, read only on private hosting (never on public GitHub Pages)
const LIVE_SQL = 'data/abcapital.sql';
const LIVE_FILE = 'data/abcapital.xlsx';

const state = { data: null, source: { kind: 'sample', label: 'Sample data' }, charts: [], opsDept: 'All' };

// ---------- helpers ----------
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sum = (rows, f) => rows.reduce((a, r) => a + (Number(r[f]) || 0), 0);
const isYes = (v) => /^(y|yes|true|1)$/i.test(String(v).trim());
const isOpen = (c) => !/^(completed|closed|done)$/i.test(String(c.Status).trim());
const daysAgo = (d) => Math.round((TODAY - d) / 864e5);
const daysUntil = (d) => Math.round((d - TODAY) / 864e5);
const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
const fmtAED = (n) => 'AED ' + Math.round(n).toLocaleString('en-US');
const fmtAEDShort = (n) => 'AED ' + new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const fmtPct = (n) => (isFinite(n) ? Math.round(n * 100) + '%' : '–');
const fmtDate = (d) => (d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '–');
const fmtMonth = (d) => d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const countBy = (rows, key) => rows.reduce((m, r) => { const k = typeof key === 'function' ? key(r) : r[key]; m[k] = (m[k] || 0) + 1; return m; }, {});
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
function lastMonths(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(new Date(TODAY.getFullYear(), TODAY.getMonth() - i, 1));
  return out;
}
function clientName(id) {
  const c = state.clientIndex[id];
  return c ? (c.Company || c.Name) : id;
}
function relDays(n) {
  if (n === 0) return 'today';
  return n < 0 ? `${-n}d overdue` : `in ${n}d`;
}

const pill = (level, label) => `<span class="pill ${level}">${esc(label)}</span>`;

function kpi(label, value, sub = '') {
  return `<div class="kpi"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;
}
function delta(cur, prev) {
  if (!prev) return '';
  const p = (cur - prev) / prev;
  const cls = p >= 0 ? 'up' : 'down';
  return `<span class="${cls}">${p >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(p * 100))}%</span> vs last month`;
}

// span may carry an anchor id: "span-6#cp-tax"
function card(span, title, sub, body) {
  const [cls, id] = span.split("#");
  return `<section class="card ${cls}"${id ? ` id="${id}"` : ""}><div class="card-head"><div><h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ''}</div></div>${body}</section>`;
}
function chartCard(span, id, title, sub, tall = false) {
  return `<section class="card ${span}">
    <div class="card-head">
      <div><h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ''}</div>
      <button class="btn btn-ghost btn-sm" type="button" data-toggle="${id}" aria-pressed="false">Table</button>
    </div>
    <div class="chart-box${tall ? ' tall' : ''}" id="${id}-chart"><canvas id="${id}" role="img" aria-label="${esc(title)}"></canvas></div>
    <div class="table-wrap" id="${id}-table" hidden></div>
  </section>`;
}

function table(columns, rows, emptyText = 'Nothing to show') {
  if (!rows.length) return `<div class="empty">${esc(emptyText)}</div>`;
  const head = columns.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('');
  const body = rows.map((r) => `<tr>${columns.map((c) => `<td class="${c.num ? 'num' : ''}">${c.html ? c.html(r) : esc(c.value(r))}</td>`).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

// ---------- charts ----------
function themeColors() {
  return {
    series: [css('--series-1'), css('--series-2'), css('--series-3')],
    ramp: [css('--ramp-1'), css('--ramp-2'), css('--ramp-3'), css('--ramp-4')],
    good: css('--good'), warning: css('--warning'), serious: css('--serious'), critical: css('--critical'),
    surface: css('--surface-1'), grid: css('--grid'), text: css('--text-secondary'), muted: css('--text-muted'),
  };
}

// series: [{ label, data, color?, colors? }]
function chart(id, { type = 'bar', labels, series, stacked = false, horizontal = false, money = false }) {
  const el = document.getElementById(id);
  if (!el || typeof Chart === 'undefined') return;
  const t = themeColors();
  const fmt = money ? fmtAEDShort : fmtInt;
  const fmtFull = money ? fmtAED : fmtInt;
  const last = series.length - 1;

  const datasets = series.map((s, i) => {
    const color = s.color || t.series[i % t.series.length];
    if (type === 'line') {
      return { label: s.label, data: s.data, borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, pointHitRadius: 14, pointHoverBorderColor: t.surface, pointHoverBorderWidth: 2, tension: 0.25 };
    }
    return {
      label: s.label, data: s.data,
      backgroundColor: s.colors || color,
      borderRadius: !stacked || i === last ? 4 : 0,
      borderSkipped: 'start',
      borderColor: t.surface,
      borderWidth: stacked ? (horizontal ? { right: 2 } : { top: 2 }) : 0,
      maxBarThickness: 34,
      categoryPercentage: 0.7,
    };
  });

  const valueAxis = {
    stacked, beginAtZero: true,
    grid: { color: t.grid, drawTicks: false }, border: { display: false },
    ticks: { color: t.muted, padding: 6, callback: (v) => fmt(v), maxTicksLimit: 6 },
  };
  const catAxis = { stacked, grid: { display: false }, border: { color: t.grid }, ticks: { color: t.muted, autoSkip: true, maxRotation: 0 } };

  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  const c = new Chart(el, {
    type,
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
      indexAxis: horizontal ? 'y' : 'x',
      interaction: { mode: 'index', intersect: false },
      scales: horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis },
      plugins: {
        legend: { display: series.length > 1, position: 'top', align: 'end', labels: { color: t.text, usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 8, boxHeight: 8, padding: 14 } },
        tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${fmtFull(ctx.parsed[horizontal ? 'x' : 'y'])}` } },
      },
    },
  });
  state.charts.push(c);

  // table view of the same numbers
  const cols = [{ label: '', value: (r) => r.label }].concat(series.map((s, i) => ({ label: s.label, num: true, value: (r) => fmtFull(r.values[i]) })));
  const rows = labels.map((l, j) => ({ label: l, values: series.map((s) => s.data[j]) }));
  document.getElementById(`${id}-table`).innerHTML = table(cols, rows);
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-toggle]');
  if (!b) return;
  const id = b.dataset.toggle;
  const showTable = b.getAttribute('aria-pressed') !== 'true';
  b.setAttribute('aria-pressed', String(showTable));
  b.textContent = showTable ? 'Chart' : 'Table';
  document.getElementById(`${id}-chart`).hidden = showTable;
  document.getElementById(`${id}-table`).hidden = !showTable;
});

// ---------- pages ----------
const PAGES = {};

PAGES.overview = () => {
  const d = state.data;
  const fin = [...d.Finance].filter((r) => r.Month).sort((a, b) => a.Month - b.Month);
  const cur = fin[fin.length - 1] || {}, prev = fin[fin.length - 2];
  const open = d.Cases.filter(isOpen);
  const overdue = open.filter((c) => c.DueDate && c.DueDate < TODAY);
  const leads30 = d.Leads.filter((l) => l.Date && daysAgo(l.Date) <= 30);
  const won30 = leads30.filter((l) => l.Status === 'Won');
  const expired = d.Expiries.filter((e) => e.ExpiryDate && daysUntil(e.ExpiryDate) < 0);
  const exp30 = d.Expiries.filter((e) => e.ExpiryDate && daysUntil(e.ExpiryDate) >= 0 && daysUntil(e.ExpiryDate) <= 30);
  const taxDue = d.TaxCalendar.filter((t) => !isYes(t.Filed) && t.DueDate && daysUntil(t.DueDate) <= 14);
  const taxOverdue = taxDue.filter((t) => daysUntil(t.DueDate) < 0);
  const ar = sum(d.Receivables, 'AmountAED');
  const cash = sum(d.BankBalances, 'BalanceAED');

  const alerts = [];
  taxOverdue.forEach((t) => alerts.push({ lvl: 'critical', tag: 'Tax overdue', text: `${t.Type} ${t.Period} – ${clientName(t.ClientID)}`, n: daysUntil(t.DueDate) }));
  expired.forEach((e) => alerts.push({ lvl: 'critical', tag: 'Expired', text: `${e.Type} – ${clientName(e.ClientID)}`, n: daysUntil(e.ExpiryDate) }));
  overdue.forEach((c) => alerts.push({ lvl: 'serious', tag: 'Case overdue', text: `${c.Service} – ${clientName(c.ClientID)} (${c.Assignee})`, n: daysUntil(c.DueDate) }));
  exp30.filter((e) => daysUntil(e.ExpiryDate) <= 14).forEach((e) => alerts.push({ lvl: 'warning', tag: 'Expiring', text: `${e.Type} – ${clientName(e.ClientID)}`, n: daysUntil(e.ExpiryDate) }));
  taxDue.filter((t) => daysUntil(t.DueDate) >= 0).forEach((t) => alerts.push({ lvl: 'warning', tag: 'Tax due', text: `${t.Type} ${t.Period} – ${clientName(t.ClientID)}`, n: daysUntil(t.DueDate) }));
  const rank = { critical: 0, serious: 1, warning: 2 };
  alerts.sort((a, b) => rank[a.lvl] - rank[b.lvl] || a.n - b.n);
  const alertHtml = alerts.length
    ? `<ul class="alerts">${alerts.slice(0, 40).map((a) => `<li>${pill(a.lvl, a.tag)}<span>${esc(a.text)}</span><span class="when">${relDays(a.n)}</span></li>`).join('')}</ul>`
    : '<div class="empty">No alerts. All clear.</div>';

  $('#page').innerHTML = `
    <div class="page-head"><div><h2>Overview</h2><p>The whole firm at a glance, as of ${fmtDate(TODAY)}.</p></div></div>
    <div class="kpis">
      ${kpi('Revenue this month', fmtAEDShort(cur.RevenueAED || 0), delta(cur.RevenueAED, prev && prev.RevenueAED))}
      ${kpi('Collected this month', fmtAEDShort(cur.CollectedAED || 0), cur.RevenueAED ? `${fmtPct(cur.CollectedAED / cur.RevenueAED)} of revenue` : '')}
      ${kpi('Receivables outstanding', fmtAEDShort(ar), `${d.Receivables.length} invoices`)}
      ${kpi('Cash in bank', fmtAEDShort(cash), `${d.BankBalances.length} accounts`)}
      ${kpi('New leads (30 days)', fmtInt(leads30.length), `${won30.length} won`)}
      ${kpi('Open cases', fmtInt(open.length), `<span class="${overdue.length ? 'down' : 'up'}">${overdue.length} overdue</span>`)}
      ${kpi('Expiring in 30 days', fmtInt(exp30.length), `<span class="${expired.length ? 'down' : ''}">${expired.length} already expired</span>`)}
      ${kpi('Tax filings due (14 days)', fmtInt(taxDue.length), `<span class="${taxOverdue.length ? 'down' : ''}">${taxOverdue.length} overdue</span>`)}
    </div>
    <div class="grid">
      ${chartCard('span-7', 'ov-rev', 'Revenue and expenses', 'Monthly, from Tally')}
      ${card('span-5#attention', 'Needs attention', `${alerts.length} items, most urgent first`, alertHtml)}
      ${chartCard('span-12', 'ov-cases', 'Open cases by department', 'On time vs overdue')}
    </div>`;

  chart('ov-rev', { type: 'line', money: true, labels: fin.map((r) => fmtMonth(r.Month)), series: [
    { label: 'Revenue', data: fin.map((r) => r.RevenueAED) },
    { label: 'Expenses', data: fin.map((r) => r.ExpensesAED) },
  ] });
  const depts = deptList(d.Cases);
  chart('ov-cases', { labels: depts, stacked: true, series: [
    { label: 'On time', data: depts.map((x) => open.filter((c) => c.Department === x && !(c.DueDate < TODAY)).length) },
    { label: 'Overdue', data: depts.map((x) => open.filter((c) => c.Department === x && c.DueDate < TODAY).length), color: themeColors().critical },
  ] });
};

function deptList(cases) {
  const present = new Set(cases.map((c) => c.Department).filter(Boolean));
  return DEPARTMENTS.filter((x) => present.has(x)).concat([...present].filter((x) => !DEPARTMENTS.includes(x)));
}

PAGES.sales = () => {
  const d = state.data;
  const recent = d.Leads.filter((l) => l.Date && daysAgo(l.Date) <= 180);
  const won = recent.filter((l) => l.Status === 'Won');
  const lost = recent.filter((l) => l.Status === 'Lost');
  const openL = recent.filter((l) => OPEN_LEAD_STAGES.includes(l.Status));
  const leads30 = d.Leads.filter((l) => l.Date && daysAgo(l.Date) <= 30);

  const bySource = Object.entries(countBy(recent, 'Source')).sort((a, b) => b[1] - a[1]);
  const months = lastMonths(6);
  const svc = {};
  recent.forEach((l) => {
    const s = svc[l.Service] || (svc[l.Service] = { name: l.Service, leads: 0, won: 0, lost: 0, value: 0 });
    s.leads++;
    if (l.Status === 'Won') { s.won++; s.value += l.ValueAED; }
    if (l.Status === 'Lost') s.lost++;
  });
  const svcRows = Object.values(svc).sort((a, b) => b.value - a.value);
  const ownerRows = Object.entries(countBy(recent, 'Owner')).map(([o, n]) => {
    const w = won.filter((l) => l.Owner === o);
    return { o, n, w: w.length, v: sum(w, 'ValueAED') };
  }).sort((a, b) => b.v - a.v);

  // Marketing: ad spend from the Campaigns sheet, results from leads tagged with a campaign
  const monthKeys = new Set(months.map(monthKey));
  const camp = (d.Campaigns || []).filter((c) => c.Month && monthKeys.has(monthKey(c.Month)));
  const platformOf = (name) => {
    const n = String(name || '');
    if (/meta|facebook|instagram/i.test(n)) return 'Meta';
    if (/google|youtube/i.test(n)) return 'Google';
    return 'Other';
  };
  const campPlatform = {};
  camp.forEach((c) => { campPlatform[c.Campaign] = platformOf(c.Platform); });
  const leadPlatform = (l) => campPlatform[l.Campaign] || (/meta|facebook|instagram|google/i.test(l.Source) ? platformOf(l.Source) : null);
  const adLeads = recent.filter((l) => leadPlatform(l));
  const adWon = adLeads.filter((l) => l.Status === 'Won');
  const spend = sum(camp, 'SpendAED');
  const impressions = sum(camp, 'Impressions');
  const clicks = sum(camp, 'Clicks');
  const platforms = ['Meta', 'Google', 'Other'].filter((pl) => camp.some((c) => platformOf(c.Platform) === pl) || adLeads.some((l) => leadPlatform(l) === pl));
  const ratio = (a, b) => (b ? a / b : NaN);
  const fmtX = (n) => (isFinite(n) ? n.toFixed(1) + '×' : '–');
  const campRows = Object.values(camp.reduce((m, c) => {
    const r = m[c.Campaign] || (m[c.Campaign] = { name: c.Campaign, platform: platformOf(c.Platform), spend: 0, imp: 0, clicks: 0 });
    r.spend += c.SpendAED; r.imp += c.Impressions; r.clicks += c.Clicks;
    return m;
  }, {})).map((r) => {
    const ls = recent.filter((l) => l.Campaign === r.name);
    const w = ls.filter((l) => l.Status === 'Won');
    return { ...r, leads: ls.length, won: w.length, value: sum(w, 'ValueAED') };
  }).sort((a, b) => ratio(b.value, b.spend) - ratio(a.value, a.spend));

  $('#page').innerHTML = `
    <div class="page-head"><div><h2>Sales &amp; Marketing</h2><p>Leads, conversion and Meta / Google ad campaigns over the last 6 months.</p></div></div>
    <div class="kpis">
      ${kpi('New leads (30 days)', fmtInt(leads30.length))}
      ${kpi('Conversion rate', fmtPct(won.length / (won.length + lost.length)), 'Won ÷ (won + lost)')}
      ${kpi('Open pipeline', fmtAEDShort(sum(openL, 'ValueAED')), `${openL.length} open leads`)}
      ${kpi('Won value (6 months)', fmtAEDShort(sum(won, 'ValueAED')), `${won.length} deals`)}
    </div>
    <div class="kpis">
      ${kpi('Ad spend (6 months)', fmtAEDShort(spend), platforms.filter((pl) => pl !== 'Other').map((pl) => `${pl} ${fmtAEDShort(sum(camp.filter((c) => platformOf(c.Platform) === pl), 'SpendAED'))}`).join(' · '))}
      ${kpi('Leads from ads', fmtInt(adLeads.length), recent.length ? `${fmtPct(adLeads.length / recent.length)} of all leads` : '')}
      ${kpi('Cost per lead', isFinite(ratio(spend, adLeads.length)) ? fmtAED(ratio(spend, adLeads.length)) : '–', 'Ad spend ÷ leads from ads')}
      ${kpi('Cost per client won', isFinite(ratio(spend, adWon.length)) ? fmtAED(ratio(spend, adWon.length)) : '–', `${adWon.length} clients won from ads`)}
      ${kpi('Return on ad spend', fmtX(ratio(sum(adWon, 'ValueAED'), spend)), 'Won value ÷ ad spend')}
      ${kpi('Click-through rate', isFinite(ratio(clicks, impressions)) ? (ratio(clicks, impressions) * 100).toFixed(1) + '%' : '–', `${fmtInt(clicks)} clicks`)}
    </div>
    <div class="grid">
      ${chartCard('span-6', 'mk-spend', 'Ad spend by platform', 'Monthly')}
      ${chartCard('span-6', 'mk-leads', 'Leads from ads by platform', 'Monthly, from the Leads sheet')}
      ${card('span-12#mk-campaigns', 'Campaign performance', 'Last 6 months, best return first', table([
        { label: 'Campaign', value: (r) => r.name },
        { label: 'Platform', value: (r) => r.platform },
        { label: 'Spend', num: true, value: (r) => fmtAED(r.spend) },
        { label: 'Clicks', num: true, value: (r) => fmtInt(r.clicks) },
        { label: 'CTR', num: true, value: (r) => (r.imp ? (r.clicks / r.imp * 100).toFixed(1) + '%' : '–') },
        { label: 'Leads', num: true, value: (r) => r.leads },
        { label: 'Cost per lead', num: true, value: (r) => (r.leads ? fmtAED(r.spend / r.leads) : '–') },
        { label: 'Won', num: true, value: (r) => r.won },
        { label: 'Won value', num: true, value: (r) => fmtAED(r.value) },
        { label: 'Return', num: true, html: (r) => { const x = ratio(r.value, r.spend); return isFinite(x) ? (x >= 1 ? pill('good', fmtX(x)) : pill('critical', fmtX(x))) : '–'; } },
      ], campRows, 'No campaign data. Fill the Campaigns sheet from Meta Ads Manager and Google Ads.'))}
      ${chartCard('span-6', 'sl-stage', 'Leads by stage', 'Last 6 months')}
      ${chartCard('span-6', 'sl-source', 'Leads by source', 'Last 6 months')}
      ${chartCard('span-12', 'sl-month', 'Leads and wins per month', 'Count of leads created each month, and how many of them were won')}
      ${card('span-7', 'Services ranked by won value', 'Last 6 months', table([
        { label: 'Service', value: (r) => r.name },
        { label: 'Leads', num: true, value: (r) => r.leads },
        { label: 'Won', num: true, value: (r) => r.won },
        { label: 'Conversion', num: true, value: (r) => fmtPct(r.won / (r.won + r.lost)) },
        { label: 'Won value', num: true, value: (r) => fmtAED(r.value) },
      ], svcRows))}
      ${card('span-5', 'Sales team', 'Last 6 months', table([
        { label: 'Owner', value: (r) => r.o },
        { label: 'Leads', num: true, value: (r) => r.n },
        { label: 'Won', num: true, value: (r) => r.w },
        { label: 'Won value', num: true, value: (r) => fmtAED(r.v) },
      ], ownerRows))}
    </div>`;

  const t = themeColors();
  const platColor = { Meta: t.series[0], Google: t.series[1], Other: t.series[2] };
  chart('mk-spend', { money: true, stacked: true, labels: months.map(fmtMonth), series: platforms.map((pl) => ({
    label: pl, color: platColor[pl], data: months.map((m) => sum(camp.filter((c) => platformOf(c.Platform) === pl && monthKey(c.Month) === monthKey(m)), 'SpendAED')),
  })) });
  chart('mk-leads', { type: 'line', labels: months.map(fmtMonth), series: platforms.map((pl) => ({
    label: pl, color: platColor[pl], data: months.map((m) => adLeads.filter((l) => leadPlatform(l) === pl && monthKey(l.Date) === monthKey(m)).length),
  })) });
  chart('sl-stage', { labels: LEAD_STAGES, series: [{ label: 'Leads', data: LEAD_STAGES.map((s) => recent.filter((l) => l.Status === s).length) }] });
  chart('sl-source', { horizontal: true, labels: bySource.map((x) => x[0]), series: [{ label: 'Leads', data: bySource.map((x) => x[1]) }] });
  chart('sl-month', { type: 'line', labels: months.map(fmtMonth), series: [
    { label: 'Leads', data: months.map((m) => recent.filter((l) => monthKey(l.Date) === monthKey(m)).length) },
    { label: 'Won', data: months.map((m) => won.filter((l) => monthKey(l.Date) === monthKey(m)).length) },
  ] });
};

PAGES.operations = () => {
  const d = state.data;
  const depts = deptList(d.Cases);
  if (state.opsDept !== 'All' && !depts.includes(state.opsDept)) state.opsDept = 'All';
  const cases = state.opsDept === 'All' ? d.Cases : d.Cases.filter((c) => c.Department === state.opsDept);
  const open = cases.filter(isOpen);
  const overdue = open.filter((c) => c.DueDate && c.DueDate < TODAY);
  const done = cases.filter((c) => !isOpen(c) && c.ClosedOn && c.OpenedOn);
  const done30 = done.filter((c) => daysAgo(c.ClosedOn) <= 30);
  const done90 = done.filter((c) => daysAgo(c.ClosedOn) <= 90);
  const avgDays = (rows) => rows.length ? rows.reduce((a, c) => a + (c.ClosedOn - c.OpenedOn) / 864e5, 0) / rows.length : 0;
  const months = lastMonths(6);

  const status = (c) => {
    if (/hold/i.test(c.Status)) return pill('serious', 'On hold');
    if (!c.DueDate) return pill('good', 'Open');
    const n = daysUntil(c.DueDate);
    if (n < 0) return pill('critical', `${-n}d overdue`);
    if (n <= 3) return pill('warning', `Due ${n === 0 ? 'today' : 'in ' + n + 'd'}`);
    return pill('good', 'On track');
  };
  const openSorted = [...open].sort((a, b) => (a.DueDate || 0) - (b.DueDate || 0));

  $('#page').innerHTML = `
    <div class="page-head">
      <div><h2>Operations</h2><p>Every service job across the departments.</p></div>
      <label class="filters">Department
        <select id="ops-dept">${['All'].concat(depts).map((x) => `<option ${x === state.opsDept ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
      </label>
    </div>
    <div class="kpis">
      ${kpi('Open cases', fmtInt(open.length))}
      ${kpi('Overdue', fmtInt(overdue.length), open.length ? `${fmtPct(overdue.length / open.length)} of open` : '')}
      ${kpi('Completed (30 days)', fmtInt(done30.length))}
      ${kpi('Avg days to complete', avgDays(done90).toFixed(1), 'Cases closed in last 90 days')}
      ${kpi('Fees on open cases', fmtAEDShort(sum(open, 'FeeAED')))}
    </div>
    <div class="grid">
      ${state.opsDept === 'All'
        ? chartCard('span-6', 'op-dept', 'Average days to complete', 'By department, last 90 days')
        : chartCard('span-6', 'op-dept', 'Open cases by stage', state.opsDept)}
      ${chartCard('span-6', 'op-month', 'Opened vs completed', 'Cases per month')}
      ${card('span-12#op-open', 'Open cases', 'Sorted by due date', table([
        { label: 'Case', value: (c) => c.CaseID },
        { label: 'Client', value: (c) => clientName(c.ClientID) },
        { label: 'Department', value: (c) => c.Department },
        { label: 'Service', value: (c) => c.Service },
        { label: 'Stage', value: (c) => c.Stage },
        { label: 'Assignee', value: (c) => c.Assignee },
        { label: 'Due', value: (c) => fmtDate(c.DueDate) },
        { label: 'Status', html: status },
        { label: 'Fee', num: true, value: (c) => fmtAED(c.FeeAED) },
      ], openSorted, 'No open cases'))}
    </div>`;

  $('#ops-dept').addEventListener('change', (e) => {
    location.hash = e.target.value === 'All' ? 'operations' : `operations?dept=${encodeURIComponent(e.target.value)}`;
  });

  if (state.opsDept === 'All') {
    chart('op-dept', { labels: depts, series: [{ label: 'Avg days', data: depts.map((x) => +avgDays(done90.filter((c) => c.Department === x)).toFixed(1)) }] });
  } else {
    const st = Object.entries(countBy(open, 'Stage'));
    chart('op-dept', { labels: st.map((x) => x[0]), series: [{ label: 'Open cases', data: st.map((x) => x[1]) }] });
  }
  chart('op-month', { type: 'line', labels: months.map(fmtMonth), series: [
    { label: 'Opened', data: months.map((m) => cases.filter((c) => c.OpenedOn && monthKey(c.OpenedOn) === monthKey(m)).length) },
    { label: 'Completed', data: months.map((m) => done.filter((c) => monthKey(c.ClosedOn) === monthKey(m)).length) },
  ] });
};

PAGES.compliance = () => {
  const d = state.data;
  const withDays = d.Expiries.filter((e) => e.ExpiryDate).map((e) => ({ ...e, n: daysUntil(e.ExpiryDate) }));
  const expired = withDays.filter((e) => e.n < 0);
  const exp30 = withDays.filter((e) => e.n >= 0 && e.n <= 30);
  const upcoming = withDays.filter((e) => e.n <= 60).sort((a, b) => a.n - b.n);
  const tax = d.TaxCalendar.filter((t) => t.DueDate && !isYes(t.Filed)).map((t) => ({ ...t, n: daysUntil(t.DueDate) })).filter((t) => t.n <= 30).sort((a, b) => a.n - b.n);
  const tax14 = tax.filter((t) => t.n <= 14);
  const decided = d.Banking.filter((b) => /approved|rejected/i.test(b.Status));
  const approved = d.Banking.filter((b) => /approved/i.test(b.Status));
  const pending = d.Banking.filter((b) => !/approved|rejected/i.test(b.Status));

  const types = [...new Set(withDays.map((e) => e.Type))];
  const banks = [...new Set(d.Banking.map((b) => b.Bank))].sort((a, b) => d.Banking.filter((x) => x.Bank === b).length - d.Banking.filter((x) => x.Bank === a).length);
  const t = themeColors();
  const urgency = (n) => n < 0 ? pill('critical', 'Expired') : n <= 14 ? pill('warning', relDays(n)) : pill('good', relDays(n));
  const reasons = Object.entries(countBy(d.Banking.filter((b) => b.RejectionReason), 'RejectionReason')).sort((a, b) => b[1] - a[1]);

  $('#page').innerHTML = `
    <div class="page-head"><div><h2>Compliance</h2><p>Licence, visa and Emirates ID expiries, tax deadlines and bank applications.</p></div></div>
    <div class="kpis">
      ${kpi('Already expired', fmtInt(expired.length), 'Renew now')}
      ${kpi('Expiring in 30 days', fmtInt(exp30.length))}
      ${kpi('Tax filings due (14 days)', fmtInt(tax14.length), `${tax.filter((x) => x.n < 0).length} overdue`)}
      ${kpi('Bank approval rate', fmtPct(approved.length / decided.length), `${approved.length} of ${decided.length} decided`)}
      ${kpi('Bank applications pending', fmtInt(pending.length))}
    </div>
    <div class="grid">
      ${chartCard('span-6', 'cp-exp', 'Expiries in the next 90 days', 'By document type')}
      ${chartCard('span-6', 'cp-bank', 'Bank applications by bank', 'All applications on record')}
      ${card('span-6#cp-expiring', 'Expired and expiring within 60 days', `${upcoming.length} documents`, table([
        { label: 'Client', value: (e) => clientName(e.ClientID) },
        { label: 'Type', value: (e) => e.Type },
        { label: 'Expiry', value: (e) => fmtDate(e.ExpiryDate) },
        { label: 'Status', html: (e) => urgency(e.n) },
      ], upcoming, 'Nothing expiring soon'))}
      ${card('span-6#cp-tax', 'Unfiled tax returns due within 30 days', `${tax.length} returns`, table([
        { label: 'Client', value: (x) => clientName(x.ClientID) },
        { label: 'Return', value: (x) => x.Type },
        { label: 'Period', value: (x) => x.Period },
        { label: 'Due', value: (x) => fmtDate(x.DueDate) },
        { label: 'Status', html: (x) => x.n < 0 ? pill('critical', relDays(x.n)) : x.n <= 7 ? pill('warning', relDays(x.n)) : pill('good', relDays(x.n)) },
      ], tax, 'No returns due'))}
      ${card('span-6', 'Bank rejection reasons', 'Where applications fail', table([
        { label: 'Reason', value: (r) => r[0] },
        { label: 'Count', num: true, value: (r) => r[1] },
      ], reasons, 'No rejections'))}
    </div>`;

  const buckets = [['0–30 days', 0, 30], ['31–60 days', 31, 60], ['61–90 days', 61, 90]];
  chart('cp-exp', { labels: types, stacked: true, series: buckets.map(([label, a, b], i) => ({
    label, color: t.ramp[i], data: types.map((ty) => withDays.filter((e) => e.Type === ty && e.n >= a && e.n <= b).length),
  })) });
  chart('cp-bank', { labels: banks, stacked: true, horizontal: true, series: [
    { label: 'Approved', color: t.good, data: banks.map((b) => d.Banking.filter((x) => x.Bank === b && /approved/i.test(x.Status)).length) },
    { label: 'In progress', color: t.warning, data: banks.map((b) => d.Banking.filter((x) => x.Bank === b && !/approved|rejected/i.test(x.Status)).length) },
    { label: 'Rejected', color: t.critical, data: banks.map((b) => d.Banking.filter((x) => x.Bank === b && /rejected/i.test(x.Status)).length) },
  ] });
};

PAGES.finance = () => {
  const d = state.data;
  const fin = [...d.Finance].filter((r) => r.Month).sort((a, b) => a.Month - b.Month);
  const rev = sum(fin, 'RevenueAED'), exp = sum(fin, 'ExpensesAED'), col = sum(fin, 'CollectedAED');
  const latest = fin[fin.length - 1] || {};
  const rec = d.Receivables.map((r) => ({ ...r, late: r.DueDate ? daysAgo(r.DueDate) : 0 }));
  const overdueRec = rec.filter((r) => r.late > 0).sort((a, b) => b.AmountAED - a.AmountAED);
  const cash = sum(d.BankBalances, 'BalanceAED');
  const t = themeColors();
  const aging = [['Not yet due', -1e9, 0], ['1–30 days late', 1, 30], ['31–60 days late', 31, 60], ['Over 60 days late', 61, 1e9]];

  $('#page').innerHTML = `
    <div class="page-head"><div><h2>Finance</h2><p>From Tally exports: last ${fin.length} months.</p></div></div>
    <div class="kpis">
      ${kpi('Revenue', fmtAEDShort(rev), `Last ${fin.length} months`)}
      ${kpi('Net profit', fmtAEDShort(rev - exp), rev ? `${fmtPct((rev - exp) / rev)} margin` : '')}
      ${kpi('Collection rate', fmtPct(col / rev), 'Collected ÷ revenue')}
      ${kpi('Receivables', fmtAEDShort(sum(rec, 'AmountAED')), `<span class="${overdueRec.length ? 'down' : ''}">${fmtAEDShort(sum(overdueRec, 'AmountAED'))} overdue</span>`)}
      ${kpi('Cash in bank', fmtAEDShort(cash))}
      ${kpi('VAT payable (latest month)', fmtAEDShort(latest.VATPayableAED || 0))}
    </div>
    <div class="grid">
      ${chartCard('span-8', 'fn-pl', 'Revenue, expenses and profit', 'Monthly')}
      ${chartCard('span-4', 'fn-aging', 'Receivables aging', 'Amount by days past due')}
      ${card('span-7#fn-overdue', 'Overdue invoices', 'Largest first', table([
        { label: 'Client', value: (r) => r.ClientName },
        { label: 'Invoice', value: (r) => r.InvoiceNo },
        { label: 'Due', value: (r) => fmtDate(r.DueDate) },
        { label: 'Late', html: (r) => r.late > 60 ? pill('critical', `${r.late}d`) : r.late > 30 ? pill('serious', `${r.late}d`) : pill('warning', `${r.late}d`) },
        { label: 'Amount', num: true, value: (r) => fmtAED(r.AmountAED) },
      ], overdueRec, 'No overdue invoices'))}
      ${card('span-5', 'Bank balances', `Total ${fmtAED(cash)}`, table([
        { label: 'Bank', value: (r) => r.Bank },
        { label: 'Account', value: (r) => r.Account },
        { label: 'As of', value: (r) => fmtDate(r.AsOf) },
        { label: 'Balance', num: true, value: (r) => fmtAED(r.BalanceAED) },
      ], d.BankBalances))}
    </div>`;

  chart('fn-pl', { type: 'line', money: true, labels: fin.map((r) => fmtMonth(r.Month)), series: [
    { label: 'Revenue', data: fin.map((r) => r.RevenueAED) },
    { label: 'Expenses', data: fin.map((r) => r.ExpensesAED) },
    { label: 'Profit', data: fin.map((r) => r.RevenueAED - r.ExpensesAED) },
  ] });
  chart('fn-aging', { money: true, labels: aging.map((a) => a[0]), series: [{
    label: 'Amount', colors: [t.ramp[3], t.ramp[2], t.ramp[1], t.ramp[0]],
    data: aging.map(([, a, b]) => sum(rec.filter((r) => r.late >= a && r.late <= b), 'AmountAED')),
  }] });
};

PAGES.team = () => {
  const d = state.data;
  const open = d.Cases.filter(isOpen);
  const rows = d.Team.map((m) => {
    const mine = open.filter((c) => c.Assignee === m.Staff);
    return { ...m, open: mine.length, overdue: mine.filter((c) => c.DueDate && c.DueDate < TODAY).length };
  });
  const busy = rows.filter((r) => r.open > 0).sort((a, b) => b.open - a.open);
  const onLeave = rows.filter((r) => isYes(r.OnLeave));
  const t = themeColors();

  $('#page').innerHTML = `
    <div class="page-head"><div><h2>Team</h2><p>Workload across the ${rows.length} staff.</p></div></div>
    <div class="kpis">
      ${kpi('Staff', fmtInt(rows.length))}
      ${kpi('On leave', fmtInt(onLeave.length), onLeave.map((r) => esc(r.Staff)).join(', '))}
      ${kpi('Open tasks', fmtInt(open.length))}
      ${kpi('Overdue tasks', fmtInt(sum(rows, 'overdue')))}
    </div>
    <div class="grid">
      ${chartCard('span-7', 'tm-load', 'Open cases per person', 'On time vs overdue', true)}
      ${card('span-5', 'Team list', '', table([
        { label: 'Name', value: (r) => r.Staff },
        { label: 'Department', value: (r) => r.Department },
        { label: 'Open', num: true, value: (r) => r.open },
        { label: 'Overdue', num: true, value: (r) => r.overdue },
        { label: 'Status', html: (r) => isYes(r.OnLeave) ? pill('warning', 'On leave') : pill('good', 'Working') },
      ], rows))}
    </div>`;

  chart('tm-load', { labels: busy.map((r) => r.Staff), stacked: true, horizontal: true, series: [
    { label: 'On time', data: busy.map((r) => r.open - r.overdue) },
    { label: 'Overdue', data: busy.map((r) => r.overdue), color: t.critical },
  ] });
};

// ---------- loading and routing ----------
function setData(data, source, warnings = []) {
  state.data = data;
  state.source = source;
  state.clientIndex = Object.fromEntries((data.Clients || []).map((c) => [c.ClientID, c]));
  const badge = $('#source-badge');
  badge.textContent = source.label;
  badge.dataset.kind = source.kind;
  const notice = $('#notice');
  const msgs = [...warnings];
  if (source.kind === 'sample') msgs.unshift('You are looking at fictional sample data. Click “Load data” in the sidebar and pick your .sql file (or Excel workbook). “SQL sample” downloads the file format.');
  notice.hidden = !msgs.length;
  notice.textContent = msgs.join(' ');
  $('#asof').textContent = `Today: ${fmtDate(TODAY)}`;
  buildSidebar();
  render();
}

// ---------- sidebar ----------
const PAGE_TITLES = { overview: 'Overview', sales: 'Sales & Marketing', operations: 'Operations', compliance: 'Compliance', finance: 'Finance', team: 'Team' };
const slug = (s) => s.toLowerCase().replace(/&/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function buildSidebar() {
  const d = state.data;
  const open = d.Cases.filter(isOpen);
  // Department channels with their open-case count
  $('#dept-links').innerHTML = deptList(d.Cases).map((dept) => {
    const n = open.filter((c) => c.Department === dept).length;
    return `<a href="#operations?dept=${encodeURIComponent(dept)}"><span class="hash" aria-hidden="true">#</span><span>${esc(slug(dept))}</span><b class="count muted" title="Open cases">${n || ''}</b></a>`;
  }).join('');

  // Counts: red = needs action, grey = informational
  const overdueCases = open.filter((c) => c.DueDate && c.DueDate < TODAY).length;
  const expired = d.Expiries.filter((e) => e.ExpiryDate && daysUntil(e.ExpiryDate) < 0).length;
  const expiring = d.Expiries.filter((e) => e.ExpiryDate && daysUntil(e.ExpiryDate) <= 30).length;
  const taxOverdue = d.TaxCalendar.filter((t) => !isYes(t.Filed) && t.DueDate && daysUntil(t.DueDate) < 0).length;
  const taxDue = d.TaxCalendar.filter((t) => !isYes(t.Filed) && t.DueDate && daysUntil(t.DueDate) <= 14).length;
  const overdueInvoices = d.Receivables.filter((r) => r.DueDate && daysAgo(r.DueDate) > 0).length;
  const counts = {
    attention: overdueCases + expired + taxOverdue,
    newLeads: d.Leads.filter((l) => l.Status === 'New').length,
    overdueCases,
    compliance: expired + taxOverdue,
    overdueInvoices,
    onLeave: d.Team.filter((m) => isYes(m.OnLeave)).length,
    expiring,
    taxDue,
  };
  const tips = {
    attention: 'Overdue cases, expired documents and overdue tax returns',
    newLeads: 'New leads not yet contacted',
    overdueCases: 'Overdue cases',
    compliance: 'Expired documents and overdue tax returns',
    overdueInvoices: 'Overdue invoices',
    onLeave: 'Staff on leave',
    expiring: 'Expired or expiring within 30 days',
    taxDue: 'Unfiled returns due within 14 days',
  };
  document.querySelectorAll('[data-count]').forEach((b) => {
    const n = counts[b.dataset.count];
    b.textContent = n ? (n > 99 ? '99+' : n) : '';
    b.title = tips[b.dataset.count] || '';
  });
}

function parseHash() {
  const [p, q] = (location.hash || '#overview').slice(1).split('?');
  return { page: PAGES[p] ? p : 'overview', params: new URLSearchParams(q || '') };
}

function markActive(page) {
  const hash = location.hash || '#overview';
  const links = [...document.querySelectorAll('.side-nav a')];
  const exact = links.find((a) => a.getAttribute('href') === hash);
  links.forEach((a) => a.removeAttribute('aria-current'));
  (exact || links.find((a) => a.dataset.page === page))?.setAttribute('aria-current', 'page');
}

function setSidebar(open) {
  $('#sidebar').classList.toggle('open', open);
  $('#scrim').hidden = !open;
  $('#btn-menu').setAttribute('aria-expanded', String(open));
}
$('#btn-menu').addEventListener('click', () => setSidebar(true));
$('#scrim').addEventListener('click', () => setSidebar(false));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setSidebar(false);
  // Ctrl+K / Cmd+K focuses "Jump to", like Slack
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSidebar(true); $('#jump').focus(); }
});
$('#side-nav').addEventListener('click', (e) => { if (e.target.closest('a')) setSidebar(false); });
$('#jump').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll('.side-section').forEach((sec) => {
    let any = false;
    sec.querySelectorAll('a').forEach((a) => { const hit = !q || a.textContent.toLowerCase().includes(q); a.hidden = !hit; any = any || hit; });
    sec.hidden = !any;
  });
});
$('#jump').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const first = [...document.querySelectorAll('.side-nav a')].find((a) => !a.hidden && !a.closest('[hidden]'));
  if (first) { location.hash = first.getAttribute('href'); e.target.value = ''; e.target.dispatchEvent(new Event('input')); e.target.blur(); setSidebar(false); }
});

function render() {
  state.charts.forEach((c) => c.destroy());
  state.charts = [];
  const { page, params } = parseHash();
  if (page === 'operations') state.opsDept = params.get('dept') || 'All';
  markActive(page);
  $('#crumb-page').textContent = PAGE_TITLES[page];
  $('#crumb-sub').textContent = page === 'operations' && state.opsDept !== 'All' ? `# ${slug(state.opsDept)}` : '';
  document.title = `${PAGE_TITLES[page]} · AB Capital Dashboard`;
  if (typeof Chart === 'undefined' || typeof XLSX === 'undefined') {
    $('#notice').hidden = false;
    $('#notice').textContent = 'Chart or Excel library failed to load. Check the internet connection and refresh.';
  }
  try {
    PAGES[page]();
  } catch (err) {
    // Never leave a blank screen: say what failed and how to recover.
    console.error(err);
    $('#page').innerHTML = `<section class="card"><h3>This page could not be drawn</h3>
      <p class="kpi-sub">${esc(err.message)}</p>
      <p>If you loaded an Excel file, check its sheet and column names against the template, or click <b>Reset</b> in the sidebar to go back to sample data.</p></section>`;
  }
  const focus = params.get('focus');
  const target = focus && document.getElementById(focus);
  if (target) {
    target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    target.classList.add('focus');
    setTimeout(() => target.classList.remove('focus'), 1600);
  } else {
    window.scrollTo(0, 0);
  }
}

async function init() {
  // 1. A hosted data file (private hosting only, see README) wins.
  //    GitHub Pages is public, so a data file must never be there; skip the lookup.
  if (!location.hostname.endsWith('github.io')) {
    for (const [file, parse] of [[LIVE_SQL, async (r) => parseSql(await r.text())], [LIVE_FILE, async (r) => parseWorkbook(await r.arrayBuffer())]]) {
      try {
        const res = await fetch(file, { cache: 'no-store' });
        if (!res.ok) continue;
        showNotice('Loading live data…');
        const { data, warnings } = await parse(res);
        const mod = res.headers.get('last-modified');
        setData(data, { kind: 'live', label: `Live ${file.split('.').pop().toUpperCase()}${mod ? ' · updated ' + fmtDate(new Date(mod)) : ''}` }, warnings);
        return;
      } catch (e) { console.error(e); /* try the next source */ }
    }
  }
  // 2. A workbook this browser loaded earlier.
  const cached = loadCache();
  if (cached) {
    try {
      setData(cached.data, { kind: 'upload', label: `${cached.name} · loaded ${fmtDate(new Date(cached.at))}` });
      return;
    } catch (err) {
      // A saved file that no longer loads must not block the dashboard.
      console.error(err);
      clearCache();
    }
  }
  // 3. Sample data.
  setData(makeSampleData(), { kind: 'sample', label: 'Sample data' });
}

$('#file-input').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const isSql = /.sql$/i.test(f.name);
    if (isSql) showNotice(`Reading ${f.name}… (first time downloads the in-browser database engine, about 3 MB)`);
    const { data, warnings } = isSql ? await parseSql(await f.text()) : parseWorkbook(await f.arrayBuffer());
    const at = Date.now();
    saveCache({ name: f.name, at, data });
    setData(data, { kind: 'upload', label: `${f.name} · loaded ${fmtDate(new Date(at))}` }, warnings);
  } catch (err) {
    $('#notice').hidden = false;
    $('#notice').textContent = `Could not read ${f.name}: ${err.message}`;
  }
  e.target.value = '';
});
function showNotice(msg) { $('#notice').hidden = false; $('#notice').textContent = msg; }
$('#btn-reset').addEventListener('click', () => { clearCache(); init(); });

// Theme: OS setting by default, toggle overrides and is remembered on this device.
function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
}
try { applyTheme(localStorage.getItem('abc-theme')); } catch (e) { /* ignore */ }
$('#btn-theme').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('abc-theme', next); } catch (e) { /* ignore */ }
  render();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => render());
window.addEventListener('hashchange', render);

init();
