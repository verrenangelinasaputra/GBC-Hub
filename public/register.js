const form = document.getElementById("registerForm");
const msg = document.getElementById("registerMessage");
const submitBtn = document.getElementById("registerSubmit");
const codeBlock = document.getElementById("codeBlock");
const resendBtn = document.getElementById("resendCodeBtn");
let step = "send";

function registerPayload() {
  return {
    name: form.name.value.trim(),
    email: form.email.value.trim(),
    phone: form.phone.value.trim(),
    password: form.password.value,
    confirmPassword: form.confirmPassword.value
  };
}

async function sendVerificationCode() {
  const body = registerPayload();
  const res = await fetch("/api/auth/register/send-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
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

function enterVerifyStep(data) {
  step = "verify";
  codeBlock.classList.remove("hidden");
  resendBtn.classList.remove("hidden");
  submitBtn.textContent = "Verifikasi & daftar";
  form.email.readOnly = true;
  msg.textContent = data.message + (data.devHint ? " " + data.devHint : "");
  msg.className = "inline-message ok";
  startAuthResendCooldown(resendBtn, data.retryAfterSeconds || AUTH_RESEND_COOLDOWN_SEC);
}

resendBtn.addEventListener("click", async () => {
  if (resendBtn.disabled || step !== "verify") return;
  msg.textContent = "";
  msg.className = "inline-message";
  resendBtn.disabled = true;
  if (typeof progressStart === "function") progressStart("Mengirim ulang kode…");
  try {
    const data = await sendVerificationCode();
    msg.textContent = data.message + (data.devHint ? " " + data.devHint : "");
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
    progressStart(step === "send" ? "Mengirim kode verifikasi…" : "Menyelesaikan pendaftaran…");
  }
  const body = registerPayload();
  try {
    if (step === "send") {
      const data = await sendVerificationCode();
      enterVerifyStep(data);
    } else {
      const res = await fetch("/api/auth/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: body.email, code: form.code.value.trim() })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Verifikasi gagal.");
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
