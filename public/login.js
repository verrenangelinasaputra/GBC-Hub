const form = document.getElementById("loginForm");
const msg = document.getElementById("loginMessage");
const submitBtn = document.getElementById("loginSubmit");
const rememberCb = document.getElementById("rememberMe");
const loginInput = form.login;

const STORAGE_LOGIN = "gbc_last_login";
const STORAGE_REMEMBER = "gbc_remember_me";

function loadRememberedLogin() {
  const remember = localStorage.getItem(STORAGE_REMEMBER) !== "0";
  if (rememberCb) rememberCb.checked = remember;
  const saved = localStorage.getItem(STORAGE_LOGIN);
  if (remember && saved) loginInput.value = saved;
}

function persistRememberLogin(login, rememberMe) {
  if (rememberMe) {
    localStorage.setItem(STORAGE_LOGIN, login);
    localStorage.setItem(STORAGE_REMEMBER, "1");
  } else {
    localStorage.removeItem(STORAGE_LOGIN);
    localStorage.setItem(STORAGE_REMEMBER, "0");
  }
}

loadRememberedLogin();

form.addEventListener("submit", async e => {
  e.preventDefault();
  msg.textContent = "Memverifikasi kredensial...";
  msg.className = "inline-message";
  submitBtn.disabled = true;
  if (typeof progressStart === "function") progressStart("Masuk…");
  const login = form.login.value.trim();
  const rememberMe = !!rememberCb?.checked;
  try {
    const body = {
      login,
      password: form.password.value,
      rememberMe
    };
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Login gagal.");
    persistRememberLogin(login, rememberMe);
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
  } catch {
    /* ignore */
  } finally {
    if (typeof progressDone === "function") progressDone();
  }
})();
