/** Cooldown tombol kirim ulang kode verifikasi (detik). */
const AUTH_RESEND_COOLDOWN_SEC = 60;

function startAuthResendCooldown(button, seconds = AUTH_RESEND_COOLDOWN_SEC) {
  if (!button) return;
  stopAuthResendCooldown(button);
  const base = button.dataset.resendLabel || button.textContent.replace(/\s*\(\d+s\)$/, "").trim();
  button.dataset.resendLabel = base;
  let left = Math.max(1, Math.ceil(Number(seconds) || AUTH_RESEND_COOLDOWN_SEC));
  button.disabled = true;
  const tick = () => {
    if (left <= 0) {
      button.disabled = false;
      button.textContent = base;
      button._resendTimer = null;
      return;
    }
    button.textContent = `${base} (${left}s)`;
    left -= 1;
    button._resendTimer = setTimeout(tick, 1000);
  };
  tick();
}

function stopAuthResendCooldown(button) {
  if (!button) return;
  if (button._resendTimer) clearTimeout(button._resendTimer);
  button._resendTimer = null;
}

window.startAuthResendCooldown = startAuthResendCooldown;
window.stopAuthResendCooldown = stopAuthResendCooldown;
window.AUTH_RESEND_COOLDOWN_SEC = AUTH_RESEND_COOLDOWN_SEC;
