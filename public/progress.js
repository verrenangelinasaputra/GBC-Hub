(function (global) {
  let active = 0;
  let bar = null;
  let fill = null;
  let label = null;

  function ensure() {
    if (bar) return;
    bar = document.createElement("div");
    bar.id = "globalProgress";
    bar.className = "global-progress";
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    bar.setAttribute("aria-hidden", "true");
    bar.innerHTML =
      '<div class="global-progress-track"><div class="global-progress-fill"></div></div>' +
      '<span class="global-progress-label">Memuat…</span>';
    document.body.prepend(bar);
    fill = bar.querySelector(".global-progress-fill");
    label = bar.querySelector(".global-progress-label");
  }

  function syncBody() {
    document.body.classList.toggle("global-busy", active > 0);
  }

  function progressStart(message) {
    ensure();
    active += 1;
    if (message) label.textContent = message;
    bar.classList.add("active");
    bar.setAttribute("aria-hidden", "false");
    fill.classList.remove("done");
    fill.style.width = active === 1 ? "12%" : "";
    syncBody();
  }

  function progressDone() {
    if (!bar) return;
    active = Math.max(0, active - 1);
    syncBody();
    if (active > 0) return;
    fill.classList.add("done");
    fill.style.width = "100%";
    bar.setAttribute("aria-hidden", "true");
    window.setTimeout(() => {
      if (active === 0) bar.classList.remove("active");
    }, 280);
  }

  function progressMessage(message) {
    if (label && message) label.textContent = message;
  }

  /** Langkah terukur (mis. batch: transaksi 3 dari 10). */
  function progressSetStep(current, total, message) {
    ensure();
    if (active < 1) active = 1;
    syncBody();
    bar.classList.add("active");
    bar.setAttribute("aria-hidden", "false");
    fill.classList.remove("done");
    const t = Math.max(1, Number(total) || 1);
    const c = Math.max(0, Math.min(t, Number(current) || 0));
    const pct = Math.round((c / t) * 100);
    const w = Math.max(12, Math.min(98, pct || 12));
    fill.style.width = `${w}%`;
    bar.setAttribute("aria-valuenow", String(pct));
    if (message) label.textContent = message;
  }

  global.progressStart = progressStart;
  global.progressDone = progressDone;
  global.progressMessage = progressMessage;
  global.progressSetStep = progressSetStep;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => progressStart("Memuat halaman…"));
  } else {
    progressStart("Memuat halaman…");
  }
})(window);
