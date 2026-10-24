const form = document.getElementById("forgotForm");
const msg = document.getElementById("forgotMessage");
const submitBtn = document.getElementById("forgotSubmit");
const resetFields = document.getElementById("resetFields");
const resendBtn = document.getElementById("resendCodeBtn");
let step = "send";

async function sendResetCode(email) {
  const res = await fetch("/api/auth/forgot-password/send-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 429) {
    const err = new Error(data.error || "Tunggu sebelum kirim ulang.");
    err.retryAfterSeconds = data.retryAfterSeconds;
    throw err;
  }
  if (!res.ok) throw new Error(data.error || "Gagal mengirim kode.");
  return data;
}

function enterResetStep(data) {
  step = "reset";
  resetFields.classList.remove("hidden");
  resendBtn.classList.remove("hidden");
  form.email.readOnly = true;
  submitBtn.textContent = "Simpan password baru";
  msg.textContent = data.message;
  msg.className = "inline-message ok";
  startAuthResendCooldown(resendBtn, data.retryAfterSeconds || AUTH_RESEND_COOLDOWN_SEC);
}

resendBtn.addEventListener("click", async () => {
  if (resendBtn.disabled || step !== "reset") return;
  msg.textContent = "";
  msg.className = "inline-message";
  resendBtn.disabled = true;
  if (typeof progressStart === "function") progressStart("Mengirim ulang kode…");
  try {
    const data = await sendResetCode(form.email.value.trim());
    msg.textContent = data.message;
    msg.className = "inline-message ok";
    startAuthResendCooldown(resendBtn, data.retryAfterSeconds || AUTH_RESEND_COOLDOWN_SEC);
  } catch (err) {
    msg.textContent = err.message;
    msg.className = "inline-message error";
    if (err.retryAfterSeconds) {
      startAuthResendCooldown(resendBtn, err.retryAfterSeconds);
    } else {
      resendBtn.disabled = false;
    }
  } finally {
    if (typeof progressDone === "function") progressDone();
  }
});

form.addEventListener("submit", async e => {
  e.preventDefault();
  msg.textContent = "";
  msg.className = "inline-message";
  submitBtn.disabled = true;
  if (typeof progressStart === "function") {
    progressStart(step === "send" ? "Mengirim kode…" : "Menyimpan password…");
  }
  const email = form.email.value.trim();
  try {
    if (step === "send") {
      const data = await sendResetCode(email);
      enterResetStep(data);
    } else {
      const res = await fetch("/api/auth/forgot-password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          code: form.code.value.trim(),
          password: form.password.value,
          confirmPassword: form.confirmPassword.value
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Reset gagal.");
      msg.textContent = data.message;
      msg.className = "inline-message ok";
      stopAuthResendCooldown(resendBtn);
      setTimeout(() => { window.location.href = "/login"; }, 1800);
    }
  } catch (err) {
    msg.textContent = err.message;
    msg.className = "inline-message error";
    if (step === "send" && err.retryAfterSeconds) {
      startAuthResendCooldown(resendBtn, err.retryAfterSeconds);
    }
  } finally {
    submitBtn.disabled = false;
    if (typeof progressDone === "function") progressDone();
  }
});
