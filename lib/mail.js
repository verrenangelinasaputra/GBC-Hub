const nodemailer = require("nodemailer");

function smtpConfigured() {
  return Boolean(
    String(process.env.SMTP_HOST || "").trim() &&
      String(process.env.SMTP_USER || "").trim() &&
      String(process.env.SMTP_PASS || "").trim()
  );
}

function mailFrom() {
  return String(process.env.MAIL_FROM || process.env.SMTP_USER || "noreply@gbc.local").trim();
}

let transporter = null;

function getTransporter() {
  if (!smtpConfigured()) return null;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  return transporter;
}

/**
 * @param {{ to: string, subject: string, text: string, html?: string }} opts
 */
async function sendMail(opts) {
  const to = String(opts.to || "").trim();
  if (!to) throw Object.assign(new Error("Email tujuan wajib diisi."), { status: 400 });

  const devLog = process.env.MAIL_DEV_LOG === "true" || !smtpConfigured();
  if (devLog) {
    console.log("[mail:dev]", { to, subject: opts.subject, text: opts.text });
    if (!smtpConfigured()) return { dev: true };
  }

  const tx = getTransporter();
  if (!tx) {
    const err = new Error(
      "Email belum dikonfigurasi. Set SMTP_HOST, SMTP_USER, SMTP_PASS di .env (atau MAIL_DEV_LOG=true untuk development)."
    );
    err.status = 503;
    throw err;
  }

  await tx.sendMail({
    from: mailFrom(),
    to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html || opts.text.replace(/\n/g, "<br>")
  });
  return { dev: false };
}

function adminNotifyEmail() {
  return String(process.env.ADMIN_NOTIFY_EMAIL || "nomarcengkareng@gmail.com").trim();
}

function newUserNotifyText({ name, email, phone }) {
  const base = String(process.env.APP_PUBLIC_URL || process.env.APP_URL || "http://localhost:3000").replace(
    /\/$/,
    ""
  );
  return `Ada user baru mendaftar di GBC Cash Management.

Nama: ${name}
Email: ${email}
Telepon: ${phone || "—"}

Berikan akses di User Access (Lihat / Isi form):
${base}/admin/user-access

— GBC Cash Management`;
}

function verificationEmailText(purpose, code) {
  const action =
    purpose === "register"
      ? "menyelesaikan pendaftaran GBC Cash Management"
      : "mengatur ulang password GBC Cash Management";
  return `Kode verifikasi Anda: ${code}

Gunakan kode ini untuk ${action}.
Kode berlaku 15 menit. Jangan bagikan kode ini kepada siapa pun.

— GBC Cash Management`;
}

module.exports = {
  smtpConfigured,
  sendMail,
  adminNotifyEmail,
  newUserNotifyText,
  verificationEmailText
};
