const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let state = {
  user: null,
  csrf: "",
  permissions: null,
  links: {},
  categories: { kasBesar: [], kasKecil: [] },
  entities: [],
  formOptions: { kas_besar: null, kas_kecil: null },
  driveUploadReady: false,
  driveUploadHint: "",
  driveUpload: null,
  hubSheetMode: true,
  sheetsReady: false,
  geminiReady: false
};

let toastTimer;

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 4200);
}

function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function rupiah(value) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value || 0);
}

function compactRupiah(value) {
  const v = Number(value) || 0;
  if (Math.abs(v) >= 1e9) return "Rp" + (v / 1e9).toFixed(1) + "M";
  if (Math.abs(v) >= 1e6) return "Rp" + (v / 1e6).toFixed(1) + "jt";
  if (Math.abs(v) >= 1e3) return "Rp" + (v / 1e3).toFixed(0) + "rb";
  return "Rp" + Math.round(v);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function prettyHeader(raw) {
  let s = String(raw || "").trim();
  if (!s) return "Kolom";
  s = s.replace(/^\d+\.\s*/, "");
  const alias = {
    Timestamp: "Waktu submit"
  };
  return alias[s] || s;
}

function isHttpUrl(val) {
  const s = String(val || "").trim();
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function extractGoogleDriveFileId(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s) && !/^https?:/i.test(s)) return s;
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) return m[1];
  }
  return "";
}

/** Preview Drive file yang sama setelah dipindah/rename Apps Script (ID tidak berubah). */
function resolveBuktiHref(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const id = extractGoogleDriveFileId(s);
  if (id) return `https://drive.google.com/file/d/${id}/view`;
  return isHttpUrl(s) ? s : "";
}

function parseMoney(val) {
  const raw = String(val ?? "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function formatSheetCell(header, value) {
  const v = String(value ?? "").trim();
  if (!v) return '<span class="cell-empty">—</span>';
  const buktiHref = /bukti|lampiran|file upload/i.test(header.toLowerCase()) ? resolveBuktiHref(v) : "";
  const linkHref = buktiHref || (isHttpUrl(v) ? v : "");
  if (linkHref) {
    const isDrive = /drive\.google|docs\.google/i.test(linkHref);
    const label = /bukti/i.test(header.toLowerCase()) && isDrive ? "Buka bukti ↗" : isDrive ? "Buka Drive ↗" : "Buka link ↗";
    return `<a class="cell-link" href="${escapeHtml(linkHref)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  }
  const h = header.toLowerCase();
  if (/jumlah|nominal|uang|amount|biaya|rp/i.test(h)) {
    const n = parseMoney(v);
    if (n !== null) return `<span class="cell-money">${escapeHtml(rupiah(n))}</span>`;
  }
  return escapeHtml(v);
}

function orderSheetHeaders(headers) {
  const list = (headers || []).filter(h => String(h || "").trim());
  const rank = (h) => {
    const l = h.toLowerCase();
    if (l === "timestamp") return 0;
    if (/tanggal/.test(l)) return 1;
    if (/entitas/.test(l)) return 2;
    if (/kategori/.test(l)) return 3;
    if (/nama transaksi/.test(l)) return 4;
    if (/jumlah|nominal|uang/.test(l)) return 5;
    if (/keterangan/.test(l)) return 6;
    if (/dibayarkan/.test(l)) return 7;
    if (/\bpic\b|person in charge|penanggung jawab/.test(l)) return 8;
    if (/sumber dana/.test(l)) return 9;
    if (/drive|image|bukti|lampiran|file upload|upload/.test(l)) return 10;
    return 40;
  };
  return list.slice().sort((a, b) => {
    const d = rank(a) - rank(b);
    return d !== 0 ? d : headers.indexOf(a) - headers.indexOf(b);
  });
}

const OWNER_BUSINESS_UNITS = [
  {
    id: "bkt",
    name: "PT Bersama Karunia Terang",
    short: "BKT",
    buktiUrl: "https://drive.google.com/drive/folders/1LiYyJkMDonyjQCN3ZMCWlOo_0baPOzXK?usp=sharing"
  },
  {
    id: "cv-anugerah",
    name: "CV Anugerah Impian Mandiri",
    short: "AIM",
    buktiUrl: "https://drive.google.com/drive/folders/1k6VQBmpofysURBDwA5bPe1Ebx5YHBals?usp=sharing"
  },
  {
    id: "mjl",
    name: "PT Mata Jendela Langit",
    short: "MJL",
    buktiUrl: "https://drive.google.com/drive/folders/1M0E5XEAChjGKRUhr9uKO7s1YVpxtOede?usp=sharing"
  },
  {
    id: "kediri",
    name: "Kediri",
    short: "KDR",
    buktiUrl: "https://drive.google.com/drive/folders/1t0WrK3kX0qU0UV5AKouw-c1NqaYTZpom?usp=sharing"
  },
  {
    id: "gbc",
    name: "GBC",
    short: "GBC",
    buktiUrl: "https://drive.google.com/drive/folders/1gqW2HwnUysen6V57Tn2eI5OxROictqtS?usp=sharing"
  }
];

function routeInfo() {
  const p = window.location.pathname;
  if (p.includes("/owner/business-units")) return { view: "ownerBu", kind: null, title: "Business Unit" };
  if (p.includes("/owner/dashboard")) return { view: "dashboard", kind: null, title: "Dashboard Owner" };
  if (p.includes("/admin/user-access")) return { view: "userAccess", kind: null, title: "User Access" };
  if (p.includes("/member/welcome")) return { view: "memberWelcome", kind: null, title: "Selamat datang" };
  if (p.includes("/kas-besar/history")) {
    return { view: "kas", kind: "kas_besar", layout: "history", title: "Bank — History data" };
  }
  if (p.includes("/kas-besar/dashboard")) {
    return { view: "kasDashboard", kind: "kas_besar", title: "Bank — Dashboard" };
  }
  if (p.includes("/kas-besar/form") || p.includes("kas-besar")) {
    return { view: "kas", kind: "kas_besar", layout: "form", title: "Bank — Form" };
  }
  if (p.includes("/kas-kecil/history")) {
    return { view: "kas", kind: "kas_kecil", layout: "history", title: "Kas Kecil — History data" };
  }
  if (p.includes("/kas-kecil/dashboard") || p.includes("/admin/kas-kecil/recap")) {
    return { view: "kasDashboard", kind: "kas_kecil", title: "Kas Kecil — Dashboard" };
  }
  if (p.includes("/kas-kecil/form") || p.includes("kas-kecil")) {
    return { view: "kas", kind: "kas_kecil", layout: "form", title: "Kas Kecil — Form" };
  }
  if (p.includes("/super-admin/recap")) return { view: "kasDashboard", kind: "kas_besar", title: "Bank — Dashboard" };
  return { view: "unknown", kind: null, title: "—" };
}

function kasMenuBasePath(kind) {
  const isBesar = kind === "kas_besar";
  const role = state.user?.role;
  if (role === "admin") return isBesar ? "/admin/kas-besar" : "/admin/kas-kecil";
  if (role === "super_admin") return isBesar ? "/super-admin/kas-besar" : "/super-admin/kas-kecil";
  if (role === "owner") return isBesar ? "/owner/kas-besar" : "/owner/kas-kecil";
  if (role === "member") return isBesar ? "/member/kas-besar" : "/member/kas-kecil";
  return null;
}

function userCanSubmitKind(kind) {
  const isBesar = kind === "kas_besar";
  const role = state.user?.role;
  if (role === "super_admin") return true;
  if (role === "admin") return !isBesar;
  if (role === "member") {
    return isBesar ? !!state.permissions?.submitKasBesar : !!state.permissions?.submitKasKecil;
  }
  return false;
}

function kasNavGroup(kind) {
  const isBesar = kind === "kas_besar";
  const role = state.user?.role;
  if (role === "member") {
    if (isBesar && !state.permissions?.kasBesar) return null;
    if (!isBesar && !state.permissions?.kasKecil) return null;
  }
  const base = kasMenuBasePath(kind);
  if (!base) return null;
  const children = [];
  if (userCanSubmitKind(kind)) {
    children.push({ href: `${base}/form`, label: "Form" });
  }
  children.push({ href: `${base}/history`, label: "History data" });
  children.push({ href: `${base}/dashboard`, label: "Dashboard" });
  return {
    group: isBesar ? "kas-besar" : "kas-kecil",
    label: isBesar ? "Bank" : "Kas Kecil",
    icon: isBesar ? "▦" : "◫",
    children
  };
}

function navItems() {
  const role = state.user?.role;
  const items = [];
  const kb = kasNavGroup("kas_besar");
  const kk = kasNavGroup("kas_kecil");
  if (role === "owner") {
    items.push({ href: "/owner/dashboard", label: "Dashboard Rekap", icon: "⌁" });
    items.push({ href: "/owner/business-units", label: "Business Unit", icon: "◉" });
    if (kb) items.push(kb);
    if (kk) items.push(kk);
  } else if (role === "super_admin") {
    if (kb) items.push(kb);
    if (kk) items.push(kk);
    items.push({ href: "/admin/user-access", label: "User Access", icon: "◎" });
  } else if (role === "admin") {
    if (kb) items.push(kb);
    if (kk) items.push(kk);
    items.push({ href: "/admin/user-access", label: "User Access", icon: "◎" });
  } else if (role === "member") {
    if (kk) items.push(kk);
    if (kb) items.push(kb);
    if (!state.permissions?.kasKecil && !state.permissions?.kasBesar) {
      items.push({ href: "/member/welcome", label: "Beranda", icon: "⌂" });
    }
  }
  return items;
}

function renderNav() {
  const nav = $("#sideNav");
  nav.replaceChildren();
  const path = window.location.pathname;
  for (const item of navItems()) {
    if (item.group) {
      const details = document.createElement("details");
      details.className = "nav-group";
      const childActive = item.children.some(c => path === c.href || path.startsWith(c.href + "/"));
      const seg = item.group === "kas-besar" ? "/kas-besar" : "/kas-kecil";
      if (childActive || path.includes(seg)) details.open = true;
      const summary = document.createElement("summary");
      summary.className = "nav-link nav-group-summary" + (childActive ? " active" : "");
      summary.innerHTML = `<span>${item.icon}</span> ${escapeHtml(item.label)}`;
      details.append(summary);
      const sub = document.createElement("div");
      sub.className = "nav-sub";
      for (const child of item.children) {
        const a = document.createElement("a");
        a.className = "nav-link nav-sublink" + (path === child.href ? " active" : "");
        a.href = child.href;
        a.textContent = child.label;
        sub.append(a);
      }
      details.append(sub);
      nav.append(details);
      continue;
    }
    const a = document.createElement("a");
    a.className = "nav-link" + (path === item.href ? " active" : "");
    a.href = item.href;
    a.innerHTML = `<span>${item.icon}</span> ${escapeHtml(item.label)}`;
    nav.append(a);
  }
}

function formatRoleLabel(role) {
  if (role === "admin") return "Admin";
  if (role === "super_admin") return "Super Admin";
  if (role === "owner") return "Owner";
  if (role === "member") return "Member";
  return String(role || "").replace(/_/g, " ");
}

function setUserChip() {
  const u = state.user;
  const title = u?.display_name || u?.username || "";
  const subtitle = u?.role === "admin" ? u.username : formatRoleLabel(u?.role);
  $("#userChip").innerHTML = u
    ? `<span class="avatar">${escapeHtml(title.slice(0, 1).toUpperCase())}</span><span><b>${escapeHtml(title)}</b><small>${escapeHtml(subtitle)}</small></span>`
    : "";
  $("#connectionLabel").textContent = u ? "Session aktif" : "Belum login";
}

async function api(url, options = {}) {
  const { progressLabel, silentProgress, ...fetchOpts } = options;
  const headers = { ...(fetchOpts.headers || {}) };
  if (fetchOpts.method && fetchOpts.method !== "GET") {
    headers["X-CSRF-Token"] = state.csrf;
  }
  if (fetchOpts.body instanceof FormData) {
    delete headers["Content-Type"];
  }
  let label = progressLabel;
  if (!label && !silentProgress) {
    label =
      fetchOpts.method === "POST" || fetchOpts.method === "PATCH" || fetchOpts.method === "DELETE"
        ? "Menyimpan…"
        : "Memuat data…";
  }
  if (!silentProgress && typeof progressStart === "function") progressStart(label);
  try {
    const res = await fetch(url, { credentials: "same-origin", ...fetchOpts, headers });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      window.location.href = "/login";
      throw new Error("Session berakhir.");
    }
    if (!res.ok) throw new Error(data.error || `Request gagal (${res.status})`);
    return data;
  } finally {
    if (!silentProgress && typeof progressDone === "function") progressDone();
  }
}

function openExternal(url) {
  if (!url) return toast("Tautan belum dikonfigurasi.");
  window.open(url, "_blank", "noopener,noreferrer");
}

function renderOwnerBusinessUnits(root) {
  root.innerHTML = `
    <div class="page-heading">
      <small>OWNER · BUSINESS UNIT</small>
      <h1>Business Unit</h1>
      <p>Lima entitas operasional — buka folder bukti pengeluaran di Google Drive atau data rekap (segera).</p>
    </div>
    <div class="entity-grid bu-unit-grid" id="buUnitGrid"></div>`;

  const grid = $("#buUnitGrid");
  OWNER_BUSINESS_UNITS.forEach(unit => {
    const card = document.createElement("article");
    card.className = "entity-card bu-unit-card";
    card.innerHTML = `
      <div class="entity-top">
        <span class="entity-logo">${escapeHtml(unit.short)}</span>
        <span class="entity-status">Drive</span>
      </div>
      <h3>${escapeHtml(unit.name)}</h3>
      <p class="entity-legal">Bukti pengeluaran</p>
      <p class="entity-description">Struktur folder: KAS BESAR &amp; KAS KECIL per bulan.</p>
      <div class="entity-actions">
        <button type="button" class="entity-action bu-action-recap">
          <span class="action-icon">▤</span>
          <span>Data rekap</span>
          <span class="arrow">→</span>
        </button>
        <button type="button" class="entity-action bu-action-bukti">
          <span class="action-icon">⌁</span>
          <span>Bukti</span>
          <span class="arrow">↗</span>
        </button>
      </div>`;
    card.querySelector(".bu-action-bukti").addEventListener("click", () => openExternal(unit.buktiUrl));
    card.querySelector(".bu-action-recap").addEventListener("click", () => {
      toast(`Data rekap ${unit.name} — fitur menyusul.`);
    });
    grid.append(card);
  });
}

function renderDashboard(root) {
  root.innerHTML = `
    <div class="page-heading"><small>OWNER · EXECUTIVE</small><h1>Dashboard Rekap &amp; Insight</h1>
      <p>Visualisasi bisnis Kas Besar + Kas Kecil, dengan rekomendasi AI (Gemini): root cause, rencana, dan solusi.</p></div>
    <div class="sheet-filter">
      <div class="sheet-filter-head"><b>Periode analisis</b><span>Filter tanggal pengeluaran</span></div>
      <div class="sheet-filter-grid recap-filter-grid">
        <label class="filter-field"><span>Dari tanggal</span><input type="date" id="dashFrom"></label>
        <label class="filter-field"><span>Sampai tanggal</span><input type="date" id="dashTo"></label>
        <div class="filter-actions recap-filter-actions"><button type="button" class="btn btn-primary" id="dashRefresh">↻ Perbarui dashboard</button></div>
      </div>
    </div>
    <div id="dashMessage" class="inline-message">Memuat dashboard...</div>
    <div class="metric-grid sa-recap-metrics">
      <div class="metric-card"><span>Kas Besar (Bank)</span><strong id="mKb">—</strong><small id="cKb">—</small></div>
      <div class="metric-card"><span>Kas Kecil</span><strong id="mKk">—</strong><small id="cKk">—</small></div>
      <div class="metric-card accent-metric"><span>Total gabungan</span><strong id="mCombined">—</strong><small id="cCombined">—</small></div>
    </div>
    <div class="panel owner-insight-panel">
      <div class="panel-head">
        <div><h3>Business insight · Gemini</h3><p>Executive summary, root cause, next plan, dan solusi berbasis data periode</p></div>
        <div class="owner-insight-actions">
          <button type="button" class="btn btn-soft" id="dashInsightsRefresh">✦ Generate insight</button>
        </div>
      </div>
      <div id="dashInsightsMeta" class="owner-insight-meta"></div>
      <div id="dashInsightsBody" class="owner-insight-body">
        <div class="chart-empty">Klik <b>Generate insight</b> sekali setelah data dimuat. Free tier Gemini ~5 request/menit — hasil sukses di-cache ~30 menit.</div>
      </div>
    </div>
    <div class="owner-charts-grid">
      <div class="panel recap-trend-panel owner-span-3 owner-chart-compact-trend">
        <div class="panel-head"><div><h3>Tren pengeluaran per bulan</h3></div>
          <div class="recap-dual-legend"><span><i class="leg-kb"></i> Kas Besar</span><span><i class="leg-kk"></i> Kas Kecil</span></div></div>
        <div id="dashChart"></div><div class="chart-labels" id="dashChartLabels"></div>
      </div>
      <div class="panel recap-chart-panel owner-span-1"><div class="panel-head"><div><h3>Jenis kas</h3></div></div><div id="dashJenis"></div></div>
      <div class="panel recap-chart-panel owner-span-1"><div class="panel-head"><div><h3>Entitas (share)</h3></div></div><div id="dashEntity"></div></div>
      <div class="panel recap-chart-panel owner-span-1">
        <div class="panel-head"><div><h3>Entitas · Bank vs Kas Kecil</h3></div>
          <div class="recap-dual-legend recap-dual-legend-mini"><span><i class="leg-kb"></i> Bank</span><span><i class="leg-kk"></i> Kecil</span></div></div>
        <div id="dashEntitySplit"></div>
      </div>
      <div class="panel recap-chart-panel owner-span-2"><div class="panel-head"><div><h3>Kategori</h3></div></div><div id="dashCat"></div></div>
      <div class="panel recap-chart-panel owner-span-1"><div class="panel-head"><div><h3>PIC</h3></div></div><div id="dashPic"></div></div>
      <div class="panel recap-chart-panel owner-span-3"><div class="panel-head"><div><h3>Sumber dana</h3></div></div><div id="dashSumber"></div></div>
    </div>
    <div class="panel table-panel"><div class="panel-head"><div><h3>Transaksi terbaru</h3></div></div>
      <div class="table-scroll"><table class="recap-table"><thead><tr>
        <th>No.</th><th>Jenis</th><th>Tanggal</th><th>Entitas</th><th>Kategori</th><th>Nama transaksi</th><th>Jumlah</th><th>PIC</th>
      </tr></thead><tbody id="dashRecent"></tbody></table></div>
    </div>`;

  const now = new Date();
  $("#dashTo").value = todayIso();
  $("#dashFrom").value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  $("#dashRefresh").addEventListener("click", () => { loadDashboard(); });
  $("#dashInsightsRefresh").addEventListener("click", loadOwnerInsights);
  loadDashboard();
}

function ownerDashboardQuery() {
  const q = new URLSearchParams();
  if ($("#dashFrom").value) q.set("dateFrom", $("#dashFrom").value);
  if ($("#dashTo").value) q.set("dateTo", $("#dashTo").value);
  return q;
}

async function loadDashboard() {
  const msg = $("#dashMessage");
  msg.textContent = "Memuat data spreadsheet...";
  msg.className = "inline-message";
  try {
    const data = await api("/api/owner/dashboard?" + ownerDashboardQuery().toString());
    $("#mKb").textContent = rupiah(data.kasBesar?.total);
    $("#cKb").textContent = `${data.kasBesar?.count || 0} transaksi`;
    $("#mKk").textContent = rupiah(data.kasKecil?.total);
    $("#cKk").textContent = `${data.kasKecil?.count || 0} transaksi`;
    $("#mCombined").textContent = rupiah(data.total);
    $("#cCombined").textContent = `${data.count} transaksi · rata-rata ${rupiah(data.average)}`;
    msg.textContent = "Dashboard diperbarui. Generate insight untuk analisis bisnis.";
    msg.className = "inline-message success";
    renderRecapKasTrendDual($("#dashChart"), $("#dashChartLabels"), data.trend || []);
    renderRecapPieChart($("#dashJenis"), data.byJenis, "Belum ada data.");
    renderRecapPieChart($("#dashEntity"), data.byEntity, "Belum ada entitas.");
    renderEntityKasSplitChart($("#dashEntitySplit"), data.byEntityKasSplit, "Belum ada entitas.");
    renderRecapBarChart($("#dashCat"), data.byCategory, "Belum ada kategori.");
    renderRecapBarChart($("#dashPic"), data.byPic, "Belum ada PIC.");
    renderRecapBarChart($("#dashSumber"), data.bySumberDana, "Belum ada sumber dana.");
    renderOwnerRecentTable(data.recent || []);
  } catch (e) {
    msg.textContent = e.message;
    msg.className = "inline-message error";
  }
}

function renderOwnerRecentTable(rows) {
  const body = $("#dashRecent");
  body.replaceChildren();
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="8" class="table-empty">Belum ada transaksi.</td></tr>';
    return;
  }
  rows.slice(0, 20).forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.no}</td>
      <td><span class="sa-jenis-badge" data-jenis="${escapeHtml(r.jenis)}">${escapeHtml(r.jenis || "—")}</span></td>
      <td>${escapeHtml(r.tanggal || "—")}</td>
      <td>${escapeHtml(r.entitas || "—")}</td>
      <td>${escapeHtml(r.category || "—")}</td>
      <td>${escapeHtml(r.namaTransaksi || "—")}</td>
      <td class="cell-money">${escapeHtml(rupiah(r.amount))}</td>
      <td>${escapeHtml(r.pic || "—")}</td>`;
    body.append(tr);
  });
}

function renderOwnerInsights(payload) {
  const body = $("#dashInsightsBody");
  const meta = $("#dashInsightsMeta");
  const ins = payload?.insights;
  if (!ins) {
    body.innerHTML = '<div class="chart-empty">Insight tidak tersedia.</div>';
    return;
  }
  const when = payload.generatedAt
    ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(payload.generatedAt))
    : "—";
  meta.innerHTML = `<span>Model: <b>${escapeHtml(payload.model || "Gemini")}</b></span>
    <span>Diperbarui: ${escapeHtml(when)}</span>${payload.cached ? "<span>Cache aktif (10 menit)</span>" : ""}`;

  const listItems = (arr, mapFn) => (arr?.length ? arr.map(mapFn).join("") : '<li class="owner-insight-empty">—</li>');

  body.innerHTML = `
    <div class="owner-insight-exec">${escapeHtml(ins.executiveSummary || "")}</div>
    <ul class="owner-highlight-list">${listItems(ins.highlights, h => `<li>${escapeHtml(h)}</li>`)}</ul>
    <div class="owner-insight-grid">
      <section class="owner-insight-card root">
        <h4>Root cause</h4>
        <ul>${listItems(ins.rootCauses, rc => `<li><b>${escapeHtml(rc.title)}</b><p>${escapeHtml(rc.detail)}</p><small>Bukti: ${escapeHtml(rc.evidence || "—")}</small></li>`)}</ul>
      </section>
      <section class="owner-insight-card plan">
        <h4>Next plan</h4>
        <ul>${listItems(ins.nextPlan, p => `<li><b>${escapeHtml(p.title)}</b><span class="owner-tag">${escapeHtml(p.horizon || "")}</span><p>${escapeHtml(p.action)}</p></li>`)}</ul>
      </section>
      <section class="owner-insight-card solution">
        <h4>Solutions</h4>
        <ul>${listItems(ins.solutions, s => `<li><b>${escapeHtml(s.title)}</b><span class="owner-tag pri-${escapeHtml(s.priority || "sedang")}">${escapeHtml(s.priority || "")}</span><p>${escapeHtml(s.expectedImpact)}</p></li>`)}</ul>
      </section>
      <section class="owner-insight-card watch">
        <h4>Watchlist</h4>
        <ul>${listItems(ins.watchlist, w => `<li>${escapeHtml(w)}</li>`)}</ul>
      </section>
    </div>`;
}

let ownerInsightsInFlight = false;

async function loadOwnerInsights(silent) {
  const body = $("#dashInsightsBody");
  const meta = $("#dashInsightsMeta");
  const btn = $("#dashInsightsRefresh");
  if (!state.geminiReady) {
    if (!silent) toast("Gemini belum dikonfigurasi — set GEMINI_API_KEY di .env");
    body.innerHTML = '<div class="chart-empty">Set <code>GEMINI_API_KEY</code> di file .env server, restart <code>npm start</code>, lalu Generate insight.</div>';
    return;
  }
  if (ownerInsightsInFlight) {
    if (!silent) toast("Insight masih diproses — tunggu sebentar, jangan klik lagi.");
    return;
  }
  ownerInsightsInFlight = true;
  if (btn) btn.disabled = true;
  body.innerHTML = '<div class="owner-insight-loading">Gemini menganalisis data periode… (±30–60 detik, satu klik saja)</div>';
  meta.textContent = "";
  try {
    const data = await api("/api/owner/insights?" + ownerDashboardQuery().toString());
    renderOwnerInsights(data);
    if (!silent) toast("Insight bisnis diperbarui.");
  } catch (e) {
    body.innerHTML = `<div class="inline-message error">${escapeHtml(e.message)}</div>`;
    if (!silent) toast(e.message);
  } finally {
    ownerInsightsInFlight = false;
    if (btn) btn.disabled = false;
  }
}

function formSelectOptions(list, placeholder) {
  const opts = (list || []).map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  return `<option value="">${escapeHtml(placeholder)}</option>${opts}`;
}

function renderKasPage(root, kind, layout = "form") {
  const isBesar = kind === "kas_besar";
  if (layout === "form" && !userCanSubmitKind(kind)) {
    const base = kasMenuBasePath(kind);
    if (base) {
      window.location.replace(`${base}/history`);
      return;
    }
  }
  const showForm = layout === "form";
  const showHistory = layout === "history";
  const title = isBesar
    ? layout === "history"
      ? "Bank — History data"
      : "Bank — Form"
    : layout === "history"
      ? "Kas Kecil — History data"
      : "Kas Kecil — Form";
  const apiBase = isBesar ? "/api/kas-besar/transactions" : "/api/kas-kecil/transactions";
  const fo = state.formOptions?.[kind] || {};
  const cats = fo.categories?.length ? fo.categories : (isBesar ? state.categories.kasBesar : state.categories.kasKecil);
  const entities = fo.entities?.length ? fo.entities : state.entities;
  const sumberList = fo.sumberDana || [];
  const hubLink = isBesar
    ? state.links.kasBesarSheet || state.links.hubSpreadsheet
    : state.links.kasKecilSheet || state.links.hubSpreadsheet;
  const canSubmit = userCanSubmitKind(kind);
  const dis = canSubmit ? "" : "disabled";
  const picName = state.user?.display_name || state.user?.username || "";
  const formTitle = fo.title || (isBesar ? "Form Pengeluaran Bank" : "Form Pengeluaran Kas Kecil");
  const formSub = fo.subtitle || "";
  const namaHint = isBesar
    ? "Contoh: Pembelian ATK, pembayaran tagihan listrik, pembayaran ekspedisi."
    : "Contoh: Pembelian perlengkapan kantor, biaya parkir, kebutuhan operasional.";
  const uploadNote = state.driveUploadReady
    ? "Unggah kuitansi/invoice (PDF, foto). Maks. 5 file × 10 MB."
    : (state.driveUploadHint ||
      "Upload otomatis tidak aktif — upload bukti manual ke folder Drive, lalu tempel link di bawah.");

  root.innerHTML = `
    <div class="page-heading"><small>${isBesar ? "BANK" : "PETTY CASH"}</small><h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(formSub)} Pastikan data benar dan bukti dilampirkan. Data masuk tab <strong>${escapeHtml(isBesar ? (state.links.kasBesarTab || "Bank") : (state.links.kasKecilTab || "KAS KECIL"))}</strong>.</p>
    </div>
    <div class="kas-layout${showHistory && !showForm ? " kas-layout-single" : ""}">
      ${showForm ? `<article class="panel primary-shortcut" id="txFormPanel">
        <div class="form-title"><span class="feature-icon">＋</span><div><h3>${escapeHtml(formTitle)}</h3><p>GBC Cash Management — pertanyaan selaras formulir resmi.</p></div></div>
        ${canSubmit ? "" : '<div class="inline-message">Anda belum punya akses input halaman ini. Hubungi admin untuk mengaktifkan Kas Kecil dan/atau Bank.</div>'}
        <form class="form-grid" id="txForm" enctype="multipart/form-data" novalidate>
          <label>1. Tanggal Pengeluaran <span class="req">*</span>
            <input type="date" name="tanggal" required ${dis}>
          </label>
          <label>2. Entitas Pengeluaran <span class="req">*</span>
            <select name="entitas" required ${dis}>${formSelectOptions(entities, "— Pilih entitas —")}</select>
          </label>
          <label>3. Kategori Pengeluaran <span class="req">*</span>
            <select name="category" required ${dis}>${formSelectOptions(cats, "— Pilih kategori —")}</select>
          </label>
          <label>4. Nama Transaksi <span class="req">*</span>
            <input type="text" name="namaTransaksi" required maxlength="200" ${dis}>
            <span class="form-hint">${escapeHtml(namaHint)}</span>
          </label>
          <label>5. Jumlah Pengeluaran (Rp) <span class="req">*</span>
            <input type="text" name="amount" inputmode="numeric" placeholder="500000" required ${dis}>
            <span class="form-hint">Nominal tanpa simbol Rp. Harus lebih dari 0.</span>
          </label>
          <label>6. Keterangan Pengeluaran
            <textarea name="keterangan" rows="3" ${dis}></textarea>
            <span class="form-hint">Detail atau tujuan pengeluaran (opsional).</span>
          </label>
          <label>7. Dibayarkan Kepada <span class="req">*</span>
            <input type="text" name="dibayarkan" required ${dis}>
            <span class="form-hint">Nama penerima, vendor, atau pihak terkait.</span>
          </label>
          <label>8. ${isBesar ? "Sumber Dana Bank" : "Sumber Dana Kas Kecil"} <span class="req">*</span>
            <select name="sumberDana" required ${dis}>${formSelectOptions(sumberList, "— Pilih sumber dana —")}</select>
          </label>
          ${
            state.driveUploadReady
              ? `<label>9. Bukti Transaksi <span class="req">*</span>
            <input type="file" name="buktiFiles" accept="image/*,application/pdf,.pdf,.png,.jpg,.jpeg,.webp" multiple ${dis} ${canSubmit ? "required" : ""}>
            <span class="form-hint">${escapeHtml(uploadNote)}</span>
          </label>
          <label>Link bukti (opsional jika sudah upload)
            <input type="url" name="bukti" placeholder="https://drive.google.com/..." ${dis}>
          </label>`
              : `<div class="bukti-link-panel inline-message">
            <b>9. Bukti Transaksi</b> — ${escapeHtml(uploadNote)}
            ${
              canSubmit && state.driveUpload?.oauthConnectUrl
                ? `<p style="margin:12px 0 0"><a class="btn btn-primary" href="${state.driveUpload.oauthConnectUrl}">Hubungkan Google Drive (sekali, admin/superadmin)</a></p>`
                : ""
            }
          </div>
          <label>Link bukti transaksi <span class="req">*</span>
            <input type="url" name="bukti" placeholder="https://drive.google.com/file/d/…/view" required ${dis}>
            <span class="form-hint">Sementara OAuth belum aktif, tempel link file yang sudah di-upload manual.</span>
          </label>`
          }
          <label>10. Nama PIC <span class="req">*</span>
            <input type="text" name="pic" value="${escapeHtml(picName)}" readonly required class="input-locked">
            <span class="form-hint">Terisi otomatis dari akun yang login (${escapeHtml(picName)}).</span>
          </label>
          <div class="form-actions">
            ${canSubmit ? '<button class="btn btn-primary" type="submit" id="txSubmit">Simpan &amp; update rekap</button><button class="btn btn-soft" type="reset">Reset</button>' : ""}
          </div>
        </form>
        <div id="txFormMessage" class="inline-message hidden"></div>
      </article>` : ""}
      ${showHistory ? `<article class="panel shortcut-card">
        <div class="form-title"><span class="feature-icon">▤</span><div><h3>Spreadsheet hub</h3><p>Tab input, compiled table, entitas, laporan bulanan.</p></div></div>
        <button type="button" class="btn btn-soft btn-full" id="extSheet">Buka spreadsheet pusat ↗</button>
      </article>` : ""}
    </div>
    ${showHistory ? `<div id="sheetNotice" class="inline-message"></div>
    <div class="panel table-panel">
      <div class="panel-head"><div><h3>Tabel transaksi (dari Spreadsheet)</h3><p>Pagination, pencarian, filter kategori</p></div><span class="panel-mark">LIVE SHEET</span></div>
      <div class="sheet-filter">
        <div class="sheet-filter-head">
          <b>Filter &amp; pencarian</b>
          <span>Saring data dari spreadsheet tanpa mengubah file asli</span>
        </div>
        <div class="sheet-filter-grid">
          <label class="filter-field filter-span-2">
            <span>Kata kunci</span>
            <input type="search" id="tSearch" placeholder="Cari di semua kolom…">
          </label>
          <label class="filter-field">
            <span>Dari tanggal</span>
            <input type="date" id="tFrom">
          </label>
          <label class="filter-field">
            <span>Sampai tanggal</span>
            <input type="date" id="tTo">
          </label>
          <label class="filter-field">
            <span>Kategori</span>
            <select id="tCategory"><option value="">Semua kategori</option></select>
          </label>
          <label class="filter-field">
            <span>Baris / halaman</span>
            <select id="tPerPage"><option>10</option><option selected>20</option><option>50</option></select>
          </label>
          <div class="filter-actions">
            <button class="btn btn-primary" type="button" id="tRefresh">↻ Refresh data</button>
          </div>
        </div>
      </div>
      <div id="tableMessage" class="inline-message">Memuat...</div>
      <div class="table-scroll"><table><thead id="txHead"></thead><tbody id="txBody"></tbody></table></div>
      <div class="pager" id="pager"></div>
    </div>` : ""}`;

  $("#extSheet")?.addEventListener("click", () => openExternal(hubLink));

  const txForm = $("#txForm");
  if (txForm) {
    const dateInput = txForm.querySelector('input[name="tanggal"]');
    if (dateInput && !dateInput.value) dateInput.value = todayIso();
    txForm.addEventListener("submit", async e => {
      e.preventDefault();
      const msg = $("#txFormMessage");
      const btn = $("#txSubmit");
      const fd = new FormData(txForm);
      const tanggalInput = txForm.querySelector('[name="tanggal"]');
      if (tanggalInput?.value) fd.set("tanggal", tanggalInput.value);
      btn.disabled = true;
      msg.classList.remove("hidden", "error", "success");
      msg.textContent = "Menyimpan…";
      msg.className = "inline-message";
      try {
        const data = await api(apiBase, {
          method: "POST",
          body: fd,
          progressLabel: "Menyimpan transaksi & upload bukti…"
        });
        msg.className = "inline-message success";
        msg.textContent = data.message || "Tersimpan.";
        toast(data.message || "Transaksi tersimpan.");
        txForm.reset();
        if (dateInput) dateInput.value = todayIso();
        if (showHistory) {
          page = 1;
          await loadTable();
        }
      } catch (err) {
        msg.className = "inline-message error";
        msg.textContent = err.message;
        toast(err.message);
      } finally {
        btn.disabled = false;
      }
    });
  }

  if (!showHistory) return;

  const notice = $("#sheetNotice");
  if (!state.sheetsReady) {
    notice.textContent = "Google Service Account belum dikonfigurasi di server (.env). Service account butuh akses Editor ke spreadsheet hub.";
    notice.className = "inline-message error";
  } else {
    notice.textContent = state.hubSheetMode
      ? `Data dari spreadsheet hub (tab ${isBesar ? state.links.kasBesarTab || "Bank" : state.links.kasKecilTab || "KAS KECIL"}). Gunakan Refresh setelah input dari Form.`
      : "Mode legacy: data dari sheet Form lama.";
    notice.className = "inline-message";
  }

  const tCat = $("#tCategory");
  cats.forEach(c => tCat.append(new Option(c, c)));

  function mergeCategoryOptions(rows) {
    const current = $("#tCategory").value;
    const existing = new Set([...tCat.options].map(o => o.value).filter(Boolean));
    rows.forEach(row => {
      const cat = row._category || row["3. Kategori Pengeluaran"] || row["Kategori Pengeluaran"];
      const val = String(cat || "").trim();
      if (val && !existing.has(val)) {
        tCat.append(new Option(val, val));
        existing.add(val);
      }
    });
    if (current) tCat.value = current;
  }

  let page = 1;
  let sort = "transaction_date";
  let order = "desc";
  let displayHeaders = [];
  let forceSheetRefresh = false;

  async function loadTable() {
    const msg = $("#tableMessage");
    msg.textContent = "Memuat data dari spreadsheet...";
    msg.className = "inline-message";
    $("#txBody").innerHTML = '<tr><td class="table-empty">Loading...</td></tr>';
    try {
      const q = new URLSearchParams({ page, perPage: $("#tPerPage").value, sort, order });
      if (forceSheetRefresh) {
        q.set("refresh", "1");
        forceSheetRefresh = false;
      }
      const s = $("#tSearch").value.trim();
      if (s) q.set("search", s);
      if ($("#tFrom").value) q.set("dateFrom", $("#tFrom").value);
      if ($("#tTo").value) q.set("dateTo", $("#tTo").value);
      if ($("#tCategory").value) q.set("category", $("#tCategory").value);
      const data = await api(`${apiBase}?` + q.toString());
      renderSheetTable(data);
      msg.textContent = `${data.total} baris ditemukan · sinkron dengan spreadsheet.`;
      msg.className = "inline-message success";
    } catch (e) {
      msg.textContent = e.message;
      msg.className = "inline-message error";
      $("#txHead").replaceChildren();
      $("#txBody").innerHTML = `<tr><td class="table-empty">${escapeHtml(e.message)}</td></tr>`;
    }
  }

  function renderSheetTable(data) {
    displayHeaders = orderSheetHeaders(data.headers || []);
    const colSpan = Math.max(displayHeaders.length + 1, 2);
    const head = $("#txHead");
    head.replaceChildren();
    const trh = document.createElement("tr");
    const thNo = document.createElement("th");
    thNo.className = "sheet-th sheet-th-no";
    thNo.textContent = "No.";
    thNo.title = "Urutan tampilan (bukan nomor baris di spreadsheet)";
    trh.append(thNo);
    displayHeaders.forEach(h => {
      const th = document.createElement("th");
      th.className = "sheet-th";
      th.textContent = prettyHeader(h);
      th.title = h;
      trh.append(th);
    });
    head.append(trh);

    const body = $("#txBody");
    body.replaceChildren();
    if (!data.rows.length) {
      body.innerHTML = `<tr><td colspan="${colSpan}" class="table-empty">Belum ada data. Isi form di menu Form atau klik Refresh.</td></tr>`;
    } else {
      const startNo = (data.page - 1) * data.perPage;
      data.rows.forEach((row, idx) => {
        const tr = document.createElement("tr");
        const tdNo = document.createElement("td");
        tdNo.className = "sheet-td-no";
        tdNo.textContent = String(startNo + idx + 1);
        tdNo.title = `Baris spreadsheet: ${row._rowNumber}`;
        tr.append(tdNo);
        displayHeaders.forEach(h => {
          const td = document.createElement("td");
          td.innerHTML = formatSheetCell(h, row[h]);
          td.title = String(row[h] ?? "").trim();
          tr.append(td);
        });
        body.append(tr);
      });
    }

    mergeCategoryOptions(data.rows);

    const pager = $("#pager");
    pager.innerHTML = `<span>Hal ${data.page} / ${data.totalPages}</span>
      <button type="button" id="pgPrev" ${data.page <= 1 ? "disabled" : ""}>← Prev</button>
      <button type="button" id="pgNext" ${data.page >= data.totalPages ? "disabled" : ""}>Next →</button>`;
    $("#pgPrev")?.addEventListener("click", () => { page = Math.max(1, page - 1); loadTable(); });
    $("#pgNext")?.addEventListener("click", () => { page += 1; loadTable(); });
  }

  function applyFilters() {
    page = 1;
    loadTable();
  }

  function hardRefreshTable() {
    page = 1;
    forceSheetRefresh = true;
    loadTable();
  }

  let searchTimer;
  $("#tRefresh").addEventListener("click", hardRefreshTable);
  $("#tCategory").addEventListener("change", applyFilters);
  $("#tFrom").addEventListener("change", applyFilters);
  $("#tTo").addEventListener("change", applyFilters);
  $("#tPerPage").addEventListener("change", applyFilters);
  $("#tSearch").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyFilters();
    }
  });
  $("#tSearch").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applyFilters, 400);
  });

  loadTable();
}

const RECAP_CHART_PALETTE = [
  { main: "#4F6BF6", light: "#A5B8FF" },
  { main: "#0D9488", light: "#5EEAD4" },
  { main: "#E11D48", light: "#FDA4AF" },
  { main: "#D97706", light: "#FCD34D" },
  { main: "#7C3AED", light: "#C4B5FD" },
  { main: "#059669", light: "#6EE7B7" },
  { main: "#DB2777", light: "#F9A8D4" },
  { main: "#2563EB", light: "#93C5FD" }
];

function recapChartColor(i) {
  return RECAP_CHART_PALETTE[i % RECAP_CHART_PALETTE.length];
}

function formatMonthLabel(month) {
  const s = String(month || "");
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (!m) return s;
  const names = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${names[Number(m[2]) - 1] || m[2]} ${m[1]}`;
}

function renderBreakdownList(container, items, emptyLabel) {
  container.replaceChildren();
  if (!items?.length) {
    container.innerHTML = `<div class="chart-empty">${escapeHtml(emptyLabel)}</div>`;
    return;
  }
  const max = Math.max(...items.map(x => x.amount), 1);
  items.forEach(item => {
    const row = document.createElement("div");
    row.className = "category-row";
    row.innerHTML = `<span>${escapeHtml(item.name)}</span><b>${rupiah(item.amount)} <small>(${item.count}x)</small></b>`;
    const track = document.createElement("div");
    track.className = "category-track";
    const fill = document.createElement("div");
    fill.className = "category-fill";
    fill.style.width = `${item.amount / max * 100}%`;
    track.append(fill);
    row.append(track);
    container.append(row);
  });
}

/** Bar chart horizontal — label panjang tetap terbaca, warna per baris */
function renderRecapBarChart(container, items, emptyLabel) {
  container.replaceChildren();
  container.className = "recap-hbar-panel";
  if (!items?.length) {
    container.innerHTML = `<div class="chart-empty">${escapeHtml(emptyLabel)}</div>`;
    return;
  }
  const isAvg = container.dataset.avgChart === "1";
  delete container.dataset.avgChart;
  const max = Math.max(...items.map(x => Number(x.amount) || 0), 1);
  const list = document.createElement("div");
  list.className = "recap-hbar-list";
  items.slice(0, 8).forEach((item, i) => {
    const pct = Math.max(6, ((Number(item.amount) || 0) / max) * 100);
    const c = recapChartColor(i);
    const row = document.createElement("div");
    row.className = "recap-hbar-row";
    row.title = `${item.name} · ${rupiah(item.amount)} · ${item.count} transaksi`;
    row.innerHTML = `
      <span class="recap-hbar-rank">${i + 1}</span>
      <div class="recap-hbar-body">
        <div class="recap-hbar-top">
          <span class="recap-hbar-name">${escapeHtml(item.name)}</span>
          <span class="recap-hbar-val">${escapeHtml(rupiah(item.amount))}</span>
        </div>
        <div class="recap-hbar-track"><div class="recap-hbar-fill"></div></div>
        <span class="recap-hbar-meta">${isAvg ? `rata-rata · ${item.count}× transaksi` : `${item.count}× transaksi`}</span>
      </div>`;
    const fill = row.querySelector(".recap-hbar-fill");
    fill.style.width = `${pct}%`;
    fill.style.background = `linear-gradient(90deg, ${c.main}, ${c.light})`;
    fill.style.boxShadow = `0 2px 8px ${c.main}40`;
    row.querySelector(".recap-hbar-rank").style.background = `${c.main}18`;
    row.querySelector(".recap-hbar-rank").style.color = c.main;
    list.append(row);
  });
  container.append(list);
}

/** Pie chart — recap entitas (proporsi nominal) */
function renderRecapPieChart(container, items, emptyLabel) {
  container.replaceChildren();
  container.className = "recap-pie-panel";
  if (!items?.length) {
    container.innerHTML = `<div class="chart-empty">${escapeHtml(emptyLabel)}</div>`;
    return;
  }
  const total = items.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  if (total <= 0) {
    container.innerHTML = `<div class="chart-empty">${escapeHtml(emptyLabel)}</div>`;
    return;
  }
  let acc = 0;
  const stops = [];
  items.forEach((item, i) => {
    const pct = ((Number(item.amount) || 0) / total) * 100;
    if (pct <= 0) return;
    const start = acc;
    acc += pct;
    stops.push(`${recapChartColor(i).main} ${start.toFixed(2)}% ${acc.toFixed(2)}%`);
  });
  const wrap = document.createElement("div");
  wrap.className = "recap-pie-wrap";
  const pie = document.createElement("div");
  pie.className = "recap-pie";
  pie.style.background = stops.length
    ? `conic-gradient(from -90deg, ${stops.join(", ")})`
    : `conic-gradient(${recapChartColor(0).main} 0% 100%)`;
  pie.setAttribute("role", "img");
  pie.setAttribute("aria-label", "Diagram entitas pengeluaran");
  const center = document.createElement("div");
  center.className = "recap-pie-center";
  center.innerHTML = `<small>Total</small><strong>${compactRupiah(total)}</strong>`;
  pie.append(center);
  const legend = document.createElement("ul");
  legend.className = "recap-pie-legend";
  items.forEach((item, i) => {
    const pct = ((Number(item.amount) || 0) / total * 100).toFixed(1);
    const li = document.createElement("li");
    const c = recapChartColor(i);
    li.style.borderLeftColor = c.main;
    li.innerHTML = `<i style="background:linear-gradient(135deg,${c.main},${c.light})"></i>
      <span class="recap-pie-legend-label" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
      <b style="color:${c.main}">${pct}%</b><small>${escapeHtml(rupiah(item.amount))}</small>`;
    legend.append(li);
  });
  wrap.append(pie, legend);
  container.append(wrap);
}

function shortenChartLabel(text, maxLen) {
  const s = String(text || "").trim();
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + "…";
}

/** Volume (jumlah transaksi) per bulan — dual bar */
function renderRecapCountTrendDual(chart, labels, items) {
  const normalized = (items || []).map(it => ({
    month: it.month,
    kasBesar: Number(it.kasBesar) || 0,
    kasKecil: Number(it.kasKecil) || 0
  }));
  renderRecapKasTrendDual(chart, labels, normalized, { formatValue: n => String(n) });
}

function renderRecapAvgBarChart(container, items, emptyLabel) {
  const mapped = (items || []).map(it => ({
    name: it.name,
    amount: Number(it.amount) || 0,
    count: it.count
  }));
  container.dataset.avgChart = "1";
  renderRecapBarChart(container, mapped, emptyLabel);
}

/** Stacked horizontal: Kas Besar + Kas Kecil per entitas */
function renderEntityKasSplitChart(container, items, emptyLabel) {
  container.replaceChildren();
  container.className = "recap-entity-split-panel";
  if (!items?.length) {
    container.innerHTML = `<div class="chart-empty">${escapeHtml(emptyLabel)}</div>`;
    return;
  }
  const max = Math.max(...items.map(x => (Number(x.kasBesar) || 0) + (Number(x.kasKecil) || 0)), 1);
  const kbC = recapChartColor(0);
  const kkC = recapChartColor(1);
  const list = document.createElement("div");
  list.className = "recap-entity-split-list";
  items.forEach(row => {
    const kb = Number(row.kasBesar) || 0;
    const kk = Number(row.kasKecil) || 0;
    const total = kb + kk;
    const sharePct = total ? Math.max(4, (total / max) * 100) : 0;
    const kbPct = total ? (kb / total) * 100 : 0;
    const kkPct = total ? 100 - kbPct : 0;
    const el = document.createElement("div");
    el.className = "recap-entity-split-row";
    el.title = `${row.name}: Bank ${rupiah(kb)} · Kecil ${rupiah(kk)}`;
    el.innerHTML = `
      <span class="recap-entity-split-name" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</span>
      <div class="recap-entity-split-track" aria-hidden="true">
        <div class="recap-entity-split-fill" style="width:${sharePct}%">
          <span class="seg-kb" style="width:${kbPct}%"></span>
          <span class="seg-kk" style="width:${kkPct}%"></span>
        </div>
      </div>
      <span class="recap-entity-split-val">${escapeHtml(rupiah(total))}</span>`;
    const segKb = el.querySelector(".seg-kb");
    const segKk = el.querySelector(".seg-kk");
    segKb.style.background = `linear-gradient(90deg,${kbC.main},${kbC.light})`;
    segKk.style.background = `linear-gradient(90deg,${kkC.main},${kkC.light})`;
    list.append(el);
  });
  container.append(list);
}

function renderRecapKasTrendDual(chart, labels, items, opts) {
  const formatVal = opts?.formatValue || (n => compactRupiah(Number(n) || 0));
  chart.replaceChildren();
  labels.replaceChildren();
  chart.className = "recap-trend-chart recap-dual-trend";
  labels.className = "chart-labels recap-trend-labels";
  if (!items.length) {
    chart.innerHTML = '<div class="chart-empty">Belum ada data bulanan.</div>';
    return;
  }
  const max = Math.max(...items.map(x => (Number(x.kasBesar) || 0) + (Number(x.kasKecil) || 0)), 1);
  const n = items.length;
  chart.style.setProperty("--trend-cols", String(n));
  labels.style.setProperty("--trend-cols", String(n));
  const kbColor = recapChartColor(0);
  const kkColor = recapChartColor(1);
  items.forEach(item => {
    const col = document.createElement("div");
    col.className = "recap-dual-col";
    const pair = document.createElement("div");
    pair.className = "recap-dual-bars";
    const kb = Number(item.kasBesar) || 0;
    const kk = Number(item.kasKecil) || 0;
    [
      [kb, kbColor, "Kas Besar"],
      [kk, kkColor, "Kas Kecil"]
    ].forEach(([amt, c, label]) => {
      const bar = document.createElement("i");
      bar.className = "recap-trend-bar recap-dual-bar";
      bar.style.height = `${Math.max(amt ? 8 : 2, (amt / max) * 100)}%`;
      bar.style.background = `linear-gradient(180deg, ${c.light}, ${c.main})`;
      bar.title = `${label} · ${formatMonthLabel(item.month)}: ${formatVal(amt)}`;
      pair.append(bar);
    });
    col.append(pair);
    chart.append(col);
    const lab = document.createElement("span");
    lab.textContent = formatMonthLabel(item.month);
    lab.title = item.month;
    labels.append(lab);
  });
}

function renderRecapTrend(items) {
  const chart = $("#recapChart");
  const labels = $("#recapChartLabels");
  chart.replaceChildren();
  labels.replaceChildren();
  chart.className = "recap-trend-chart";
  labels.className = "chart-labels recap-trend-labels";
  if (!items.length) {
    chart.innerHTML = '<div class="chart-empty">Belum ada data bulanan.</div>';
    return;
  }
  const max = Math.max(...items.map(x => Number(x.amount) || 0), 1);
  const n = items.length;
  chart.style.setProperty("--trend-cols", String(n));
  labels.style.setProperty("--trend-cols", String(n));
  items.forEach((item, i) => {
    const c = recapChartColor(i);
    const col = document.createElement("div");
    col.className = "recap-trend-col";
    const val = document.createElement("span");
    val.className = "recap-trend-value";
    val.textContent = compactRupiah(Number(item.amount) || 0);
    val.title = `${formatMonthLabel(item.month)}: ${rupiah(item.amount)}`;
    const bar = document.createElement("i");
    bar.className = "recap-trend-bar";
    const h = Math.max(12, ((Number(item.amount) || 0) / max) * 100);
    bar.style.height = `${h}%`;
    bar.style.background = `linear-gradient(180deg, ${c.light} 0%, ${c.main} 100%)`;
    bar.style.boxShadow = `0 4px 14px ${c.main}35`;
    bar.title = val.title;
    col.append(val, bar);
    chart.append(col);
    const lab = document.createElement("span");
    lab.textContent = formatMonthLabel(item.month);
    lab.title = item.month;
    labels.append(lab);
  });
}

function kindLabel(kind) {
  return kind === "kas_besar" ? "Bank" : "Kas Kecil";
}

function renderKindDashboard(root, kind) {
  const label = kindLabel(kind);
  const sumberPanel = kind === "kas_besar" ? "Sumber dana bank" : "Sumber dana kas kecil";
  root.innerHTML = `
    <div class="page-heading"><small>${escapeHtml(label.toUpperCase())}</small><h1>Dashboard</h1>
      <p>Ringkasan pengeluaran ${escapeHtml(label)} dari spreadsheet — kategori, entitas, PIC, sumber dana, dan transaksi terbaru.</p></div>
    <div class="sheet-filter">
      <div class="sheet-filter-head"><b>Periode recap</b><span>Filter tanggal pengeluaran — kosong = semua data (selaras History)</span></div>
      <div class="sheet-filter-grid recap-filter-grid">
        <label class="filter-field"><span>Dari tanggal</span><input type="date" id="recapFrom"></label>
        <label class="filter-field"><span>Sampai tanggal</span><input type="date" id="recapTo"></label>
        <div class="filter-actions recap-filter-actions"><button type="button" class="btn btn-primary" id="recapRefresh">↻ Perbarui recap</button></div>
      </div>
    </div>
    <div id="recapMessage" class="inline-message">Memuat recap...</div>
    <div class="metric-grid recap-metrics">
      <div class="metric-card"><span>Total pengeluaran</span><strong id="recapTotal">—</strong><small>Jumlah uang (Rp) agregat</small></div>
      <div class="metric-card"><span>Jumlah transaksi</span><strong id="recapCount">—</strong><small>Baris valid dari form</small></div>
      <div class="metric-card accent-metric"><span>Rata-rata per transaksi</span><strong id="recapAvg">—</strong><small>Total ÷ jumlah transaksi</small></div>
    </div>
    <div class="panel recap-trend-panel"><div class="panel-head"><div><h3>Tren pengeluaran per bulan</h3><p>12 bulan terakhir dalam periode filter</p></div></div>
      <div id="recapChart"></div><div class="chart-labels" id="recapChartLabels"></div></div>
    <div class="recap-breakdown-grid">
      <div class="panel recap-chart-panel"><div class="panel-head"><div><h3>Kategori pengeluaran</h3><p>Top nominal per kategori</p></div></div><div id="recapCat"></div></div>
      <div class="panel recap-chart-panel"><div class="panel-head"><div><h3>Entitas</h3><p>Proporsi pengeluaran per entitas</p></div></div><div id="recapEntity"></div></div>
      <div class="panel recap-chart-panel"><div class="panel-head"><div><h3>Nama PIC</h3><p>Top nominal per PIC</p></div></div><div id="recapPic"></div></div>
      <div class="panel recap-chart-panel"><div class="panel-head"><div><h3>${escapeHtml(sumberPanel)}</h3><p>Top nominal per sumber dana</p></div></div><div id="recapSumber"></div></div>
    </div>
    <div class="panel table-panel"><div class="panel-head"><div><h3>Transaksi terbaru</h3><p>Sesuai kolom form: tanggal, entitas, kategori, nama transaksi, nominal, keterangan, dibayarkan, sumber dana, bukti, PIC</p></div></div>
      <div class="table-scroll"><table class="recap-table"><thead><tr>
        <th>No.</th><th>Waktu submit</th><th>Tanggal</th><th>Entitas</th><th>Kategori</th><th>Nama transaksi</th>
        <th>Jumlah (Rp)</th><th>Keterangan</th><th>Dibayarkan kepada</th><th>Sumber dana</th><th>Bukti</th><th>PIC</th>
      </tr></thead><tbody id="recapRecent"></tbody></table></div>
    </div>`;

  $("#recapFrom").value = "";
  $("#recapTo").value = "";
  root.dataset.kasDashboardKind = kind;
  $("#recapRefresh").addEventListener("click", () => loadKindRecap(kind));
  $("#recapFrom").addEventListener("change", () => loadKindRecap(kind));
  $("#recapTo").addEventListener("change", () => loadKindRecap(kind));
  loadKindRecap(kind);
}

async function loadKindRecap(kind) {
  const msg = $("#recapMessage");
  msg.textContent = "Memuat data recap dari spreadsheet...";
  msg.className = "inline-message";
  const apiPath = kind === "kas_besar" ? "/api/kas-besar/recap" : "/api/kas-kecil/recap";
  try {
    const q = new URLSearchParams();
    if ($("#recapFrom").value) q.set("dateFrom", $("#recapFrom").value);
    if ($("#recapTo").value) q.set("dateTo", $("#recapTo").value);
    const data = await api(`${apiPath}?${q.toString()}`, { progressLabel: "Memuat dashboard…" });
    $("#recapTotal").textContent = rupiah(data.total);
    $("#recapCount").textContent = new Intl.NumberFormat("id-ID").format(data.count);
    $("#recapAvg").textContent = rupiah(data.average);
    msg.textContent = `${data.count} transaksi dalam periode · data live dari Google Sheet.`;
    msg.className = "inline-message success";
    renderRecapTrend(data.trend || []);
    renderRecapBarChart($("#recapCat"), data.byCategory, "Belum ada kategori.");
    renderRecapPieChart($("#recapEntity"), data.byEntity, "Belum ada entitas.");
    renderRecapBarChart($("#recapPic"), data.byPic, "Belum ada PIC.");
    renderRecapBarChart($("#recapSumber"), data.bySumberDana, "Belum ada sumber dana.");
    const body = $("#recapRecent");
    body.replaceChildren();
    if (!data.recent?.length) {
      body.innerHTML = '<tr><td colspan="12" class="table-empty">Belum ada transaksi.</td></tr>';
      return;
    }
    data.recent.forEach(r => {
      const tr = document.createElement("tr");
      const buktiHref = resolveBuktiHref(r.bukti);
      const buktiCell = buktiHref
        ? `<a class="cell-link" href="${escapeHtml(buktiHref)}" target="_blank" rel="noopener noreferrer">Buka bukti ↗</a>`
        : escapeHtml(r.bukti || "—");
      tr.innerHTML = `
        <td>${r.no}</td>
        <td>${escapeHtml(r.timestamp || "—")}</td>
        <td>${escapeHtml(r.tanggal || "—")}</td>
        <td>${escapeHtml(r.entitas || "—")}</td>
        <td>${escapeHtml(r.category || "—")}</td>
        <td>${escapeHtml(r.namaTransaksi || "—")}</td>
        <td class="cell-money">${escapeHtml(rupiah(r.amount))}</td>
        <td title="${escapeHtml(r.keterangan)}">${escapeHtml(r.keterangan || "—")}</td>
        <td>${escapeHtml(r.dibayarkan || "—")}</td>
        <td>${escapeHtml(r.sumberDana || "—")}</td>
        <td>${buktiCell}</td>
        <td>${escapeHtml(r.pic || "—")}</td>`;
      body.append(tr);
    });
  } catch (e) {
    msg.textContent = e.message;
    msg.className = "inline-message error";
  }
}

function renderSuperAdminRecap(root) {
  root.innerHTML = `
    <div class="page-heading"><small>SUPER ADMIN</small><h1>Recap Dashboard</h1>
      <p>Visualisasi gabungan Kas Besar (Bank) dan Kas Kecil — tren, kategori, entitas, PIC, dan sumber dana.</p></div>
    <div class="sheet-filter">
      <div class="sheet-filter-head"><b>Periode recap</b><span>Filter berdasarkan tanggal pengeluaran</span></div>
      <div class="sheet-filter-grid recap-filter-grid">
        <label class="filter-field"><span>Dari tanggal</span><input type="date" id="saRecapFrom"></label>
        <label class="filter-field"><span>Sampai tanggal</span><input type="date" id="saRecapTo"></label>
        <div class="filter-actions recap-filter-actions"><button type="button" class="btn btn-primary" id="saRecapRefresh">↻ Perbarui recap</button></div>
      </div>
    </div>
    <div id="saRecapMessage" class="inline-message">Memuat recap...</div>
    <div class="metric-grid sa-recap-metrics">
      <div class="metric-card"><span>Kas Besar (Bank)</span><strong id="saRecapKb">—</strong><small id="saRecapKbCount">—</small></div>
      <div class="metric-card"><span>Kas Kecil</span><strong id="saRecapKk">—</strong><small id="saRecapKkCount">—</small></div>
      <div class="metric-card accent-metric"><span>Total gabungan</span><strong id="saRecapTotal">—</strong><small id="saRecapCount">—</small></div>
    </div>
    <div class="panel recap-trend-panel"><div class="panel-head"><div><h3>Tren pengeluaran per bulan</h3><p>Kas Besar vs Kas Kecil (12 bulan terakhir)</p></div>
      <div class="recap-dual-legend"><span><i class="leg-kb"></i> Kas Besar</span><span><i class="leg-kk"></i> Kas Kecil</span></div></div>
      <div id="saRecapChart"></div><div class="chart-labels" id="saRecapChartLabels"></div></div>
    <div class="recap-breakdown-grid">
      <div class="panel recap-chart-panel"><div class="panel-head"><div><h3>Jenis kas</h3><p>Proporsi Bank vs Kas Kecil</p></div></div><div id="saRecapJenis"></div></div>
      <div class="panel recap-chart-panel"><div class="panel-head"><div><h3>Entitas</h3><p>Proporsi per entitas (gabungan)</p></div></div><div id="saRecapEntity"></div></div>
      <div class="panel recap-chart-panel"><div class="panel-head"><div><h3>Kategori pengeluaran</h3><p>Top nominal gabungan</p></div></div><div id="saRecapCat"></div></div>
      <div class="panel recap-chart-panel"><div class="panel-head"><div><h3>Nama PIC</h3><p>Top nominal gabungan</p></div></div><div id="saRecapPic"></div></div>
      <div class="panel recap-chart-panel recap-span-2"><div class="panel-head"><div><h3>Sumber dana</h3><p>Bank &amp; kas kecil — top nominal</p></div></div><div id="saRecapSumber"></div></div>
    </div>
    <div class="panel table-panel"><div class="panel-head"><div><h3>Transaksi terbaru</h3><p>Gabungan Kas Besar &amp; Kas Kecil</p></div></div>
      <div class="table-scroll"><table class="recap-table"><thead><tr>
        <th>No.</th><th>Jenis</th><th>Waktu submit</th><th>Tanggal</th><th>Entitas</th><th>Kategori</th><th>Nama transaksi</th>
        <th>Jumlah (Rp)</th><th>Keterangan</th><th>Dibayarkan</th><th>Sumber dana</th><th>Bukti</th><th>PIC</th>
      </tr></thead><tbody id="saRecapRecent"></tbody></table></div>
    </div>`;

  const now = new Date();
  $("#saRecapTo").value = todayIso();
  $("#saRecapFrom").value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  $("#saRecapRefresh").addEventListener("click", loadSuperAdminRecap);
  $("#saRecapFrom").addEventListener("change", loadSuperAdminRecap);
  $("#saRecapTo").addEventListener("change", loadSuperAdminRecap);
  loadSuperAdminRecap();
}

async function loadSuperAdminRecap() {
  const msg = $("#saRecapMessage");
  msg.textContent = "Memuat recap Kas Besar & Kas Kecil...";
  msg.className = "inline-message";
  try {
    const q = new URLSearchParams();
    if ($("#saRecapFrom").value) q.set("dateFrom", $("#saRecapFrom").value);
    if ($("#saRecapTo").value) q.set("dateTo", $("#saRecapTo").value);
    const data = await api("/api/super-admin/recap?" + q.toString());
    $("#saRecapKb").textContent = rupiah(data.kasBesar?.total);
    $("#saRecapKbCount").textContent = `${data.kasBesar?.count || 0} transaksi`;
    $("#saRecapKk").textContent = rupiah(data.kasKecil?.total);
    $("#saRecapKkCount").textContent = `${data.kasKecil?.count || 0} transaksi`;
    $("#saRecapTotal").textContent = rupiah(data.total);
    $("#saRecapCount").textContent = `${data.count} transaksi · rata-rata ${rupiah(data.average)}`;
    msg.textContent = `${data.count} transaksi dalam periode · data live dari kedua spreadsheet.`;
    msg.className = "inline-message success";
    renderRecapKasTrendDual($("#saRecapChart"), $("#saRecapChartLabels"), data.trend || []);
    renderRecapPieChart($("#saRecapJenis"), data.byJenis, "Belum ada data.");
    renderRecapPieChart($("#saRecapEntity"), data.byEntity, "Belum ada entitas.");
    renderRecapBarChart($("#saRecapCat"), data.byCategory, "Belum ada kategori.");
    renderRecapBarChart($("#saRecapPic"), data.byPic, "Belum ada PIC.");
    renderRecapBarChart($("#saRecapSumber"), data.bySumberDana, "Belum ada sumber dana.");
    const body = $("#saRecapRecent");
    body.replaceChildren();
    if (!data.recent?.length) {
      body.innerHTML = '<tr><td colspan="13" class="table-empty">Belum ada transaksi.</td></tr>';
      return;
    }
    data.recent.forEach(r => {
      const tr = document.createElement("tr");
      const buktiHref = resolveBuktiHref(r.bukti);
      const buktiCell = buktiHref
        ? `<a class="cell-link" href="${escapeHtml(buktiHref)}" target="_blank" rel="noopener noreferrer">Buka bukti ↗</a>`
        : escapeHtml(r.bukti || "—");
      tr.innerHTML = `
        <td>${r.no}</td>
        <td><span class="sa-jenis-badge" data-jenis="${escapeHtml(r.jenis)}">${escapeHtml(r.jenis || "—")}</span></td>
        <td>${escapeHtml(r.timestamp || "—")}</td>
        <td>${escapeHtml(r.tanggal || "—")}</td>
        <td>${escapeHtml(r.entitas || "—")}</td>
        <td>${escapeHtml(r.category || "—")}</td>
        <td>${escapeHtml(r.namaTransaksi || "—")}</td>
        <td class="cell-money">${escapeHtml(rupiah(r.amount))}</td>
        <td title="${escapeHtml(r.keterangan)}">${escapeHtml(r.keterangan || "—")}</td>
        <td>${escapeHtml(r.dibayarkan || "—")}</td>
        <td>${escapeHtml(r.sumberDana || "—")}</td>
        <td>${buktiCell}</td>
        <td>${escapeHtml(r.pic || "—")}</td>`;
      body.append(tr);
    });
  } catch (e) {
    msg.textContent = e.message;
    msg.className = "inline-message error";
  }
}

function renderMemberWelcome(root) {
  root.innerHTML = `
    <div class="page-heading"><small>MEMBER</small><h1>Selamat datang</h1>
      <p>Akun Anda sudah aktif, tetapi belum ada menu yang di-assign. Admin akan memberi akses <strong>Lihat</strong> (History + Dashboard) dan/atau <strong>Isi form</strong> untuk Kas Kecil / Bank di halaman User Access.</p>
    </div>
    <article class="panel"><p>Refresh halaman ini setelah admin memberi akses. Menu akan muncul di sidebar.</p></article>`;
}

async function renderUserAccess(root) {
  root.innerHTML = `
    <div class="page-heading"><small>ADMIN</small><h1>User Access</h1>
      <p>Kelola akses user: <strong>Lihat</strong> = History + Dashboard · <strong>Isi form</strong> = bisa input transaksi (otomatis dapat lihat).</p>
    </div>
    <article class="panel">
      <div id="userAccessMsg" class="inline-message" aria-live="polite"></div>
      <div class="table-wrap"><table class="data-table user-access-table"><thead>
        <tr><th rowspan="2">Nama</th><th rowspan="2">Email</th><th rowspan="2">Telepon</th>
          <th colspan="2">Kas Kecil</th><th colspan="2">Bank</th><th rowspan="2"></th></tr>
        <tr><th>Lihat</th><th>Isi form</th><th>Lihat</th><th>Isi form</th></tr>
      </thead><tbody id="userAccessBody"><tr><td colspan="8">Memuat…</td></tr></tbody></table></div>
      <p id="userAccessLink" class="login-foot" style="margin-top:12px"></p>
    </article>`;
  const msg = $("#userAccessMsg");
  const body = $("#userAccessBody");
  try {
    const data = await api("/api/admin/users");
    if (data.registryUrl) {
      $("#userAccessLink").innerHTML = `<a href="${escapeHtml(data.registryUrl)}" target="_blank" rel="noopener">Buka spreadsheet registry ↗</a>`;
    }
    body.replaceChildren();
    if (!data.users?.length) {
      body.innerHTML = '<tr><td colspan="8">Belum ada user terdaftar.</td></tr>';
      return;
    }
    for (const u of data.users) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(u.name)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${escapeHtml(u.phone || "—")}</td>
        <td><input type="checkbox" data-field="access_kas_kecil" ${u.access_kas_kecil ? "checked" : ""} title="History & Dashboard"></td>
        <td><input type="checkbox" data-field="input_kas_kecil" ${u.input_kas_kecil ? "checked" : ""} title="Form input"></td>
        <td><input type="checkbox" data-field="access_kas_besar" ${u.access_kas_besar ? "checked" : ""} title="History & Dashboard"></td>
        <td><input type="checkbox" data-field="input_kas_besar" ${u.input_kas_besar ? "checked" : ""} title="Form input"></td>
        <td class="user-access-actions">
          <button type="button" class="btn btn-primary btn-sm" data-save>Simpan</button>
          <button type="button" class="btn btn-danger btn-sm" data-delete>Hapus</button>
        </td>`;
      const inputKk = tr.querySelector('[data-field="input_kas_kecil"]');
      const inputKb = tr.querySelector('[data-field="input_kas_besar"]');
      const viewKk = tr.querySelector('[data-field="access_kas_kecil"]');
      const viewKb = tr.querySelector('[data-field="access_kas_besar"]');
      inputKk.addEventListener("change", () => { if (inputKk.checked) viewKk.checked = true; });
      inputKb.addEventListener("change", () => { if (inputKb.checked) viewKb.checked = true; });
      tr.querySelector("[data-delete]").addEventListener("click", async () => {
        const label = `${u.name} (${u.email})`;
        if (!window.confirm(`Hapus akun ${label}? Tindakan ini tidak bisa dibatalkan.`)) return;
        try {
          msg.textContent = "";
          msg.className = "inline-message";
          const data = await api(`/api/admin/users/${encodeURIComponent(u.user_id)}`, {
            method: "DELETE",
            progressLabel: "Menghapus akun…"
          });
          tr.remove();
          toast(data.message || "Akun dihapus.");
          if (!body.querySelector("tr")) {
            body.innerHTML = '<tr><td colspan="8">Belum ada user terdaftar.</td></tr>';
          }
        } catch (e) {
          msg.textContent = e.message;
          msg.className = "inline-message error";
        }
      });
      tr.querySelector("[data-save]").addEventListener("click", async () => {
        const access_kas_kecil = viewKk.checked;
        const input_kas_kecil = inputKk.checked;
        const access_kas_besar = viewKb.checked;
        const input_kas_besar = inputKb.checked;
        try {
          msg.textContent = "";
          msg.className = "inline-message";
          const data = await api(`/api/admin/users/${encodeURIComponent(u.user_id)}/access`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              access_kas_kecil,
              access_kas_besar,
              input_kas_kecil,
              input_kas_besar
            })
          });
          const saved = data.access || {};
          viewKk.checked = !!saved.access_kas_kecil;
          inputKk.checked = !!saved.input_kas_kecil;
          viewKb.checked = !!saved.access_kas_besar;
          inputKb.checked = !!saved.input_kas_besar;
          toast(data.message || "Akses disimpan.");
        } catch (e) {
          msg.textContent = e.message;
          msg.className = "inline-message error";
        }
      });
      body.append(tr);
    }
  } catch (e) {
    body.innerHTML = `<tr><td colspan="8">${escapeHtml(e.message)}</td></tr>`;
  }
}

function renderApp() {
  const info = routeInfo();
  $("#crumbCurrent").textContent = info.title;
  renderNav();
  const root = $("#appRoot");
  root.replaceChildren();
  if (info.view === "dashboard") renderDashboard(root);
  else if (info.view === "ownerBu") renderOwnerBusinessUnits(root);
  else if (info.view === "memberWelcome") renderMemberWelcome(root);
  else if (info.view === "userAccess") renderUserAccess(root);
  else if (info.view === "kasDashboard") renderKindDashboard(root, info.kind);
  else if (info.view === "kas") renderKasPage(root, info.kind, info.layout || "form");
  else root.innerHTML = '<div class="inline-message error">Halaman tidak dikenali.</div>';
}

async function bootstrap() {
  $("#todayLabel").textContent = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date());
  try {
    const data = await api("/api/me");
    if (!data.authenticated) {
      window.location.href = "/login";
      return;
    }
    state.user = data.user;
    state.csrf = data.csrf;
    state.permissions = data.permissions;
    state.links = data.links || {};
    state.categories = data.categories || state.categories;
    state.entities = data.entities || state.entities;
    state.formOptions = data.formOptions || state.formOptions;
    state.driveUploadReady = !!data.driveUploadReady;
    state.driveUploadHint = data.driveUploadHint || data.driveUpload?.hint || "";
    state.driveUpload = data.driveUpload || null;
    state.hubSheetMode = data.hubSheetMode !== false;
    state.sheetsReady = !!data.sheetsReady;
    state.geminiReady = !!data.geminiReady;
    setUserChip();
    renderApp();
  } catch {
    window.location.href = "/login";
  } finally {
    if (typeof progressDone === "function") progressDone();
  }
}

$("#logoutBtn").addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      progressLabel: "Keluar…"
    });
  } catch { /* ignore */ }
  window.location.href = "/login";
});

$("#mobileMenu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
document.addEventListener("click", e => {
  if (window.innerWidth <= 820 && $("#sidebar").classList.contains("open") && !$("#sidebar").contains(e.target) && !$("#mobileMenu").contains(e.target)) {
    $("#sidebar").classList.remove("open");
  }
});

bootstrap();
