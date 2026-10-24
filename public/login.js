const form = document.getElementById("loginForm");
const msg = document.getElementById("loginMessage");
const submitBtn = document.getElementById("loginSubmit");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.textContent = "Memverifikasi kredensial...";
  msg.className = "inline-message";
  submitBtn.disabled = true;
  if (typeof progressStart === "function") progressStart("Masuk…");
  try {
    const body = {
      login: form.login.value.trim(),
      password: form.password.value
    };
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Login gagal.");
    window.location.href = data.redirect || "/";
  } catch (err) {
    msg.textContent = err.message;
    msg.className = "inline-message error";
  } finally {
    submitBtn.disabled = false;
    if (typeof progressDone === "function") progressDone();
  }
});

(async () => {
  try {
    if (typeof progressStart === "function") progressStart("Memuat…");
    const res = await fetch("/api/me", { credentials: "same-origin" });
    const data = await res.json();
    if (data.authenticated && data.permissions?.home) {
      window.location.href = data.permissions.home;
      return;
    }
  } catch { /* ignore */ }
  finally {
    if (typeof progressDone === "function") progressDone();
  }
})();
