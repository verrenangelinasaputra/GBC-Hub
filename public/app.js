const ENTITIES = {
  BKT: { short:"BKT", name:"PT Bersama Karunia Terang", tax:"Non-PKP", accent:"#7896f7",
    formUrl:"", sheetUrl:"", driveUrl:"" },
  AIM: { short:"AIM", name:"CV Anugerah Impian Mandiri", tax:"Non-PKP", accent:"#4ac6a7",
    formUrl:"", sheetUrl:"", driveUrl:"" },
  MJL: { short:"MJL", name:"PT Mata Jendela Langit", tax:"PKP", accent:"#ad8bf0",
    formUrl:"", sheetUrl:"", driveUrl:"" }
};
const CASH = {
  BANK: { code:"KB", title:"Kas Besar (Bank)", tag:"BANK", accent:"#7896f7",
    desc:"Catat bukti pengeluaran melalui rekening bank dan pantau rekap transaksinya.",
    formUrl:"https://forms.gle/n3kfDNSQ9j18dPKMA",
    sheetUrl:"https://docs.google.com/spreadsheets/d/1jgcaW0NLr_FFyVpGa483mMNSqhGBeuxtocRhMj3IyyY/edit?gid=1533749503#gid=1533749503" },
  PETTY: { code:"KK", title:"Kas Kecil", tag:"PETTY CASH", accent:"#4ac6a7",
    desc:"Catat bukti pengeluaran kas kecil harian dan pantau rekap transaksinya.",
    formUrl:"https://forms.gle/jN6rXf3oCJK9eyZx7",
    sheetUrl:"https://docs.google.com/spreadsheets/d/1vQYT4cVRxM8f3qnwWpXupB3SrZbb7Uc7H5ykTXpddiM/edit?gid=423968165#gid=423968165" }
};
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
let currentUser = null;
let toastTimer;

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 4200);
}
function openGoogleLink(url, label) {
  if (!url) return toast(`URL ${label} belum diisi di public/app.js.`);
  try {
    const parsed = new URL(url);
    const allowed = ["docs.google.com", "drive.google.com", "forms.gle"];
    if (parsed.protocol !== "https:" || !allowed.some(host => parsed.hostname === host || parsed.hostname.endsWith("." + host))) {
      return toast("URL harus berupa tautan HTTPS Google yang valid.");
    }
    window.open(parsed.href, "_blank", "noopener,noreferrer");
  } catch { toast("URL tidak valid."); }
}
function makeEntityCard(key, entity) {
  const card = document.createElement("article");
  card.className = "entity-card";
  card.style.setProperty("--accent", entity.accent);
  card.style.setProperty("--soft", entity.accent + "22");
  const top = document.createElement("div"); top.className = "entity-top";
  const logo = document.createElement("div"); logo.className = "entity-logo"; logo.textContent = key;
  const status = document.createElement("span"); status.className = "entity-status"; status.textContent = entity.tax;
  top.append(logo, status);
  const title = document.createElement("h3"); title.textContent = entity.name;
  const legal = document.createElement("div"); legal.className = "entity-legal"; legal.textContent = key + " · " + entity.tax;
  const desc = document.createElement("p"); desc.className = "entity-description"; desc.textContent = "Akses formulir, rekap transaksi, dan arsip bukti pengeluaran.";
  const actions = document.createElement("div"); actions.className = "entity-actions";
  [
    ["formUrl","Form Pengeluaran","＋"],
    ["sheetUrl","Data Rekap","▤"],
    ["driveUrl","Folder Bukti Transaksi","▱"]
  ].forEach(([field,label,icon]) => {
    const btn = document.createElement("button"); btn.className = "entity-action"; btn.type = "button";
    const ico = document.createElement("span"); ico.className = "action-icon"; ico.textContent = icon;
    const text = document.createElement("span"); text.textContent = label;
    const arrow = document.createElement("span"); arrow.className = "arrow"; arrow.textContent = "↗";
    btn.append(ico,text,arrow); btn.addEventListener("click", () => openGoogleLink(entity[field], `${label} ${key}`)); actions.append(btn);
  });
  const foot = document.createElement("div"); foot.className = "entity-foot";
  foot.innerHTML = "<span><i></i> Workspace shortcut</span><span>GBC HUB</span>";
  card.append(top,title,legal,desc,actions,foot);
  return card;
}
function makeCashCard(key, cash) {
  const card = document.createElement("article");
  card.className = "entity-card";
  card.style.setProperty("--accent", cash.accent);
  card.style.setProperty("--soft", cash.accent + "22");
  const top = document.createElement("div"); top.className = "entity-top";
  const logo = document.createElement("div"); logo.className = "entity-logo"; logo.textContent = cash.code;
  const status = document.createElement("span"); status.className = "entity-status"; status.textContent = cash.tag;
  top.append(logo, status);
  const title = document.createElement("h3"); title.textContent = cash.title;
  const desc = document.createElement("p"); desc.className = "entity-description"; desc.textContent = cash.desc;
  const actions = document.createElement("div"); actions.className = "entity-actions";
  [["formUrl","Form Bukti Pengeluaran","＋"],["sheetUrl","Spreadsheet Rekap","▤"]].forEach(([field,label,icon]) => {
    const btn = document.createElement("button"); btn.className = "entity-action"; btn.type = "button";
    const ico = document.createElement("span"); ico.className = "action-icon"; ico.textContent = icon;
    const text = document.createElement("span"); text.textContent = label;
    const arrow = document.createElement("span"); arrow.className = "arrow"; arrow.textContent = "↗";
    btn.append(ico,text,arrow); btn.addEventListener("click", () => openGoogleLink(cash[field], `${label} ${cash.title}`)); actions.append(btn);
  });
  const foot = document.createElement("div"); foot.className = "entity-foot";
  foot.innerHTML = "<span><i></i> Workspace shortcut</span><span>GBC HUB</span>";
  card.append(top,title,desc,actions,foot);
  return card;
}
function renderCashCards() {
  const grid = $("#cashCards"); if (!grid) return;
  Object.entries(CASH).forEach(([key,cash]) => grid.append(makeCashCard(key,cash)));
}
function renderEntities() {
  Object.entries(ENTITIES).forEach(([key,entity]) => {
    $("#overviewEntities").append(makeEntityCard(key,entity));
  });
}
function goPage(page) {
  $$(".page").forEach(el => el.classList.toggle("active", el.id === "page-" + page));
  $$(".nav-link").forEach(el => el.classList.toggle("active", el.dataset.page === page));
  $("#crumbCurrent").textContent = ({overview:"Overview",entities:"Kas & Bukti",dashboard:"Expense Dashboard",upload:"Upload Bukti"})[page] || "Overview";
  $("#sidebar").classList.remove("open");
  window.scrollTo({top:0,behavior:"smooth"});
}
async function api(url, options={}) {
  const response = await fetch(url, {credentials:"same-origin", ...options});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request gagal (${response.status})`);
  return data;
}
function setUser(user) {
  currentUser = user;
  const chip = $("#userChip");
  if (user) {
    chip.innerHTML = `<span class="avatar">${escapeHtml((user.name || user.email || "G").slice(0,1).toUpperCase())}</span><span><b>${escapeHtml(user.name || "Google user")}</b><small>${escapeHtml(user.email)}</small></span>`;
    $("#loginBtn").classList.add("hidden");
    $("#logoutBtn").classList.remove("hidden");
    $("#connectionLabel").textContent = "Google login aktif";
    $("#dashboardMessage").textContent = "Login aktif. Pilih entitas lalu refresh untuk membaca data.";
    $("#dashboardMessage").className = "inline-message";
  } else {
    chip.innerHTML = '<span class="avatar">G</span><span><b>Guest</b><small>Belum login</small></span>';
    $("#loginBtn").classList.remove("hidden");
    $("#logoutBtn").classList.add("hidden");
    $("#connectionLabel").textContent = "Login diperlukan untuk data";
  }
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function rupiah(value) {
  return new Intl.NumberFormat("id-ID", {style:"currency",currency:"IDR",maximumFractionDigits:0}).format(value || 0);
}
function compactRupiah(value) {
  if (Math.abs(value) >= 1e9) return "Rp" + (value/1e9).toFixed(1) + "M";
  if (Math.abs(value) >= 1e6) return "Rp" + (value/1e6).toFixed(1) + "jt";
  if (Math.abs(value) >= 1e3) return "Rp" + (value/1e3).toFixed(0) + "rb";
  return "Rp" + Math.round(value);
}
async function loadDashboard() {
  if (!currentUser) {
    $("#dashboardMessage").textContent = "Login Google terlebih dahulu untuk membaca Google Sheets.";
    $("#dashboardMessage").className = "inline-message";
    return;
  }
  const key = $("#dashboardEntity").value;
  $("#dashboardMessage").textContent = "Mengambil data dari Google Sheets...";
  $("#dashboardMessage").className = "inline-message";
  $("#refreshDashboard").disabled = true;
  try {
    const data = await api(`/api/entities/${key}/summary`);
    $("#metricTotal").textContent = rupiah(data.totalExpense);
    $("#metricCount").textContent = new Intl.NumberFormat("id-ID").format(data.rowCount);
    $("#metricCategories").textContent = data.byCategory.length;
    $("#dashboardMessage").textContent = `${data.name} · ${data.taxStatus} · ${data.rowCount} transaksi terbaca. Nominal dan kategori diidentifikasi otomatis berdasarkan nama kolom; verifikasi hasil dengan format Sheet asli.`;
    $("#dashboardMessage").className = "inline-message success";
    renderChart(data.byMonth || []);
    renderCategories(data.byCategory || []);
    renderTable(data.headers || [], data.rows || []);
  } catch (err) {
    $("#dashboardMessage").textContent = err.message;
    $("#dashboardMessage").className = "inline-message error";
    toast(err.message);
  } finally {
    $("#refreshDashboard").disabled = false;
  }
}
function renderChart(items) {
  const chart = $("#monthlyChart"), labels = $("#chartLabels");
  chart.replaceChildren(); labels.replaceChildren();
  if (!items.length) { chart.innerHTML = '<div class="chart-empty">Belum ada data bulanan yang terdeteksi.</div>'; return; }
  const max = Math.max(...items.map(x => Math.abs(Number(x.amount) || 0)), 1);
  items.forEach(item => {
    const col = document.createElement("div"); col.className = "bar-col";
    const val = document.createElement("span"); val.className = "bar-value"; val.textContent = compactRupiah(Number(item.amount)||0);
    const bar = document.createElement("i"); bar.className = "bar"; bar.style.height = `${Math.max(3, Math.abs(Number(item.amount)||0)/max*100)}%`; bar.title = `${item.month}: ${rupiah(item.amount)}`;
    col.append(val,bar); chart.append(col);
    const label = document.createElement("span"); label.textContent = item.month; label.title = item.month; labels.append(label);
  });
}
function renderCategories(items) {
  const list = $("#categoryList"); list.replaceChildren();
  if (!items.length) { list.innerHTML = '<div class="chart-empty">Belum ada kolom kategori yang terdeteksi.</div>'; return; }
  const max = Math.max(...items.map(x => x.count), 1);
  items.slice(0,8).forEach(item => {
    const row = document.createElement("div"); row.className = "category-row";
    const label = document.createElement("span"); label.textContent = item.category;
    const count = document.createElement("b"); count.textContent = item.count;
    const track = document.createElement("div"); track.className = "category-track";
    const fill = document.createElement("div"); fill.className = "category-fill"; fill.style.width = `${item.count/max*100}%`;
    track.append(fill); row.append(label,count,track); list.append(row);
  });
}
function renderTable(headers, rows) {
  const head = $("#transactionsHead"), body = $("#transactionsBody");
  head.replaceChildren(); body.replaceChildren();
  if (!headers.length || !rows.length) { body.innerHTML = '<tr><td class="table-empty">Belum ada baris transaksi untuk ditampilkan.</td></tr>'; return; }
  const trh = document.createElement("tr");
  ["Baris",...headers.slice(0,7)].forEach(label => { const th = document.createElement("th"); th.textContent = label; trh.append(th); });
  head.append(trh);
  rows.slice(0,100).forEach(row => {
    const tr = document.createElement("tr");
    const rowNo = document.createElement("td"); rowNo.textContent = row._rowNumber; tr.append(rowNo);
    headers.slice(0,7).forEach(h => { const td = document.createElement("td"); td.textContent = row[h] ?? ""; td.title = td.textContent; tr.append(td); });
    body.append(tr);
  });
}
async function handleUpload(event) {
  event.preventDefault();
  if (!currentUser) return toast("Login Google terlebih dahulu sebelum upload.");
  const file = $("#receiptFile").files[0];
  if (!file) return toast("Pilih file bukti terlebih dahulu.");
  if (file.size > 10*1024*1024) return toast("Ukuran file maksimal 10 MB.");
  const form = new FormData();
  form.append("receipt", file);
  const key = $("#uploadEntity").value;
  $("#uploadSubmit").disabled = true;
  $("#uploadMessage").textContent = "Sedang mengunggah file...";
  $("#uploadMessage").className = "inline-message";
  try {
    const data = await api(`/api/entities/${key}/upload`, {method:"POST",body:form});
    $("#uploadMessage").className = "inline-message success";
    $("#uploadMessage").textContent = `Berhasil mengunggah ${data.file.name}. ${data.file.webViewLink ? "Buka file: " + data.file.webViewLink : data.note}`;
    toast("Upload berhasil.");
    $("#uploadForm").reset();
    $("#fileLabel").textContent = "Klik untuk memilih file";
  } catch (err) {
    $("#uploadMessage").className = "inline-message error";
    $("#uploadMessage").textContent = err.message;
    toast(err.message);
  } finally { $("#uploadSubmit").disabled = false; }
}
async function checkSession() {
  try {
    const data = await api("/api/me");
    setUser(data.authenticated ? data.user : null);
  } catch { setUser(null); }
}
document.addEventListener("DOMContentLoaded", async () => {
  renderEntities();
  renderCashCards();
  $("#todayLabel").textContent = new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"short",year:"numeric"}).format(new Date());
  $$(".nav-link").forEach(btn => btn.addEventListener("click", () => goPage(btn.dataset.page)));
  $$("[data-goto]").forEach(btn => btn.addEventListener("click", () => goPage(btn.dataset.goto)));
  $("#mobileMenu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  $("#loginBtn").addEventListener("click", () => window.location.href = "/auth/google");
  $("#logoutBtn").addEventListener("click", async () => { await api("/auth/logout",{method:"POST"}); setUser(null); toast("Kamu sudah keluar."); });
  $("#refreshDashboard").addEventListener("click", loadDashboard);
  $("#dashboardEntity").addEventListener("change", loadDashboard);
  $("#uploadForm").addEventListener("submit", handleUpload);
  $("#receiptFile").addEventListener("change", e => { $("#fileLabel").textContent = e.target.files[0]?.name || "Klik untuk memilih file"; });
  $("#monthlyBtn").addEventListener("click", () => toast("Tambahkan URL laporan bulanan di public/app.js untuk mengaktifkan shortcut."));
  document.addEventListener("click", e => {
    if (window.innerWidth <= 820 && $("#sidebar").classList.contains("open") && !$("#sidebar").contains(e.target) && !$("#mobileMenu").contains(e.target)) $("#sidebar").classList.remove("open");
  });
  await checkSession();
});
