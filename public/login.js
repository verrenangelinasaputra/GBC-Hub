const form = document.getElementById("loginForm");
const msg = document.getElementById("loginMessage");
const submitBtn = document.getElementById("loginSubmit");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.textContent = "Memverifikasi kredensial...";
  msg.className = "inline-message";
  submitBtn.disabled = true;
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
  }
});

(async () => {
  try {
    const res = await fetch("/api/me", { credentials: "same-origin" });
    const data = await res.json();
    if (data.authenticated && data.permissions?.home) {
      window.location.href = data.permissions.home;
    }
  } catch { /* ignore */ }
})();
