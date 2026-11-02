/**
 * GBC Cash Management — Daily reminder email (input pengeluaran hari ini).
 *
 * Pasang: file baru di project Apps Script (hub atau standalone).
 * 1. Run installDailyReminderTriggers() sekali → authorize Gmail.
 * 2. Atau menu: GBC Daily Reminder → Pasang trigger harian.
 *
 * Di onOpen() project yang sudah ada, tambahkan: onOpenDailyReminderMenu();
 */

const DAILY_REMINDER_CONFIG = {
  TIMEZONE: "Asia/Jakarta",
  /** Jam WIB setiap hari (0–23) */
  REMINDER_HOURS: [9, 12, 15, 18],
  REMINDER_MINUTE: 0,
  RECIPIENTS:
    "verren62@gmail.com, verren.angelinas@gmail.com, rossydanamu123@gmail.com, indahdwiseptiani022@gmail.com",
  CC: "",
  BCC: "",
  HUB_URL: "https://docs.google.com/spreadsheets/d/1sRiwrn_nLHhp3mb1qyEnC0mxnleLSwF5AbsfuQ0o-LY/edit",
  APP_URL: "https://gbchub.vercel.app/",
  SENDER_NAME: "GBC Cash Management"
};

// ——— Menu ———

function dailyReminderScheduleLabel_() {
  const hours = (DAILY_REMINDER_CONFIG.REMINDER_HOURS || []).slice().sort(function (a, b) {
    return a - b;
  });
  const labels = hours.map(function (h) {
    return ("0" + h).slice(-2) + ":00";
  });
  return "setiap hari " + labels.join(", ") + " WIB";
}

function onOpenDailyReminderMenu() {
  SpreadsheetApp.getUi()
    .createMenu("GBC Daily Reminder")
    .addItem("Kirim reminder sekarang (test)", "testSendDailyExpenseReminder")
    .addItem("Pasang trigger (" + dailyReminderScheduleLabel_() + ")", "installDailyReminderTriggers")
    .addItem("Cek status trigger", "debugDailyReminderTriggers")
    .addItem("Hapus trigger reminder", "removeDailyReminderTriggers")
    .addToUi();
}

// ——— Trigger ———

function installDailyReminderTriggers() {
  removeDailyReminderTriggers();
  const cfg = DAILY_REMINDER_CONFIG;
  const hours = cfg.REMINDER_HOURS || [];
  if (!hours.length) {
    throw new Error("REMINDER_HOURS kosong.");
  }
  hours.forEach(function (hour) {
    ScriptApp.newTrigger("sendDailyExpenseReminder")
      .timeBased()
      .everyDays(1)
      .atHour(Number(hour))
      .nearMinute(cfg.REMINDER_MINUTE || 0)
      .inTimezone(cfg.TIMEZONE)
      .create();
  });
  const msg =
    "Daily reminder: " +
    dailyReminderScheduleLabel_() +
    " → " +
    parseDailyReminderRecipients_().join(", ");
  Logger.log(msg);
  SpreadsheetApp.getActive()?.toast(msg, "GBC Daily Reminder", 10);
}

function removeDailyReminderTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "sendDailyExpenseReminder") {
      ScriptApp.deleteTrigger(t);
    }
  });
}

function debugDailyReminderTriggers() {
  const ui = SpreadsheetApp.getUi();
  const triggers = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === "sendDailyExpenseReminder";
  });
  const lines = [
    "Jadwal CONFIG: " + dailyReminderScheduleLabel_(),
    "Penerima: " + parseDailyReminderRecipients_().join(", "),
    "Trigger terpasang: " + triggers.length + " (harusnya " + (DAILY_REMINDER_CONFIG.REMINDER_HOURS || []).length + ")"
  ];
  triggers.forEach(function (t, i) {
    lines.push("#" + (i + 1) + " id=" + t.getUniqueId() + " · tipe=" + t.getEventType());
  });
  if (!triggers.length) {
    lines.push("");
    lines.push("Belum ada trigger → jalankan installDailyReminderTriggers() atau menu Pasang trigger.");
  } else {
    lines.push("");
    lines.push("Google bisa telat beberapa menit. Cek Eksekusi untuk sendDailyExpenseReminder.");
  }
  const msg = lines.join("\n");
  Logger.log(msg);
  ui.alert("GBC Daily Reminder — trigger", msg, ui.ButtonSet.OK);
}

// ——— Kirim email ———

function sendDailyExpenseReminder() {
  sendDailyExpenseReminderCore_({ isTest: false });
}

function testSendDailyExpenseReminder() {
  sendDailyExpenseReminderCore_({ isTest: true });
}

function sendDailyExpenseReminderCore_(options) {
  const cfg = DAILY_REMINDER_CONFIG;
  const tz = cfg.TIMEZONE;
  const now = new Date();
  const dateLabel = Utilities.formatDate(now, tz, "EEEE, dd MMMM yyyy");
  const timeLabel = Utilities.formatDate(now, tz, "HH:mm") + " WIB";
  const slotLabel = reminderSlotLabel_(now, tz);

  const recipients = parseDailyReminderRecipients_();
  if (!recipients.length) {
    throw new Error("Tidak ada email valid di RECIPIENTS.");
  }

  const subject =
    (options.isTest ? "[TEST] " : "") +
    "[GBC Reminder] Input pengeluaran hari ini — " +
    Utilities.formatDate(now, tz, "dd MMM yyyy");

  const html = buildDailyReminderHtml_(dateLabel, timeLabel, slotLabel, options.isTest);
  const plain = stripHtmlForPlain_(html);

  try {
    GmailApp.sendEmail(recipients.join(","), subject, plain, {
      htmlBody: html,
      name: cfg.SENDER_NAME,
      cc: normalizeDailyEmailList_(cfg.CC).join(",") || undefined,
      bcc: normalizeDailyEmailList_(cfg.BCC).join(",") || undefined
    });
  } catch (e) {
    const msg = String(e.message || e);
    Logger.log("GmailApp.sendEmail gagal: " + msg);
    throw new Error("Gmail gagal kirim: " + msg + " · Authorize ulang script jika perlu.");
  }

  Logger.log(
    "Daily reminder terkirim (" +
      (options.isTest ? "test" : "trigger") +
      ") ke " +
      recipients.join(", ") +
      " · " +
      timeLabel
  );
}

function reminderSlotLabel_(now, tz) {
  const hour = Number(Utilities.formatDate(now, tz, "H"));
  if (hour < 10) return "pagi";
  if (hour < 14) return "siang";
  if (hour < 17) return "sore";
  return "petang";
}

function buildDailyReminderHtml_(dateLabel, timeLabel, slotLabel, isTest) {
  const cfg = DAILY_REMINDER_CONFIG;
  const testBanner = isTest
    ? "<p class=\"banner-test\">Email uji coba — bukan dari jadwal otomatis.</p>"
    : "";

  return (
    "<!DOCTYPE html><html><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
    "<meta name=\"x-apple-disable-message-reformatting\">" +
    dailyReminderStyles_() +
    "</head><body class=\"dr-body\">" +
    "<div class=\"dr-wrap\">" +
    "<div class=\"dr-card\">" +
    "<div class=\"dr-hero\">" +
    "<div class=\"dr-eyebrow\">GBC CASH MANAGEMENT</div>" +
    "<h1 class=\"dr-title\">Reminder input pengeluaran</h1>" +
    "<p class=\"dr-date\">" +
    escDaily_(dateLabel) +
    "</p></div>" +
    "<div class=\"dr-inner\">" +
    testBanner +
    "<p class=\"dr-lead\">Jangan lupa <b>kirim data pengeluaran hari ini</b> (" +
    escDaily_(slotLabel) +
    " · " +
    escDaily_(timeLabel) +
    ").</p>" +
    "<ul class=\"dr-checklist\">" +
    "<li>Isi form <b>Kas Kecil</b> atau <b>Bank</b> di web app</li>" +
    "<li>Lampirkan bukti transaksi (foto/PDF)</li>" +
    "<li>Pastikan tanggal pengeluaran = hari transaksi</li>" +
    "</ul>" +
    "<div class=\"dr-actions\">" +
    (cfg.APP_URL
      ? "<a class=\"dr-btn dr-btn-primary\" href=\"" +
        escDailyAttr_(cfg.APP_URL) +
        "\">Buka web app</a>"
      : "") +
    (cfg.HUB_URL
      ? "<a class=\"dr-btn dr-btn-soft\" href=\"" +
        escDailyAttr_(cfg.HUB_URL) +
        "\">Spreadsheet hub</a>"
      : "") +
    "</div>" +
    "<p class=\"dr-foot\">Reminder otomatis jam 09:00, 12:00, 15:00, dan 18:00 WIB.</p>" +
    "</div></div></div>" +
    "<p class=\"dr-meta\">GBC · " +
    escDaily_(timeLabel) +
    "</p></body></html>"
  );
}

function dailyReminderStyles_() {
  return (
    "<style>" +
    "body.dr-body{margin:0;padding:0;background:#f4f6fb;color:#18243b;-webkit-text-size-adjust:100%;font-family:Segoe UI,Helvetica,Arial,sans-serif;}" +
    ".dr-wrap{max-width:520px;margin:0 auto;padding:12px 10px 20px;}" +
    ".dr-card{background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(24,36,59,.08);}" +
    ".dr-hero{background:linear-gradient(135deg,#172554,#3458d4);color:#fff;padding:22px 18px;}" +
    ".dr-eyebrow{font-size:11px;opacity:.85;letter-spacing:.5px;}" +
    ".dr-title{margin:8px 0 6px;font-size:22px;line-height:1.25;}" +
    ".dr-date{margin:0;font-size:14px;opacity:.95;}" +
    ".dr-inner{padding:18px 16px 22px;}" +
    ".banner-test{background:#fff8e6;border:1px solid #fde68a;color:#92400e;padding:10px 12px;border-radius:8px;font-size:13px;margin:0 0 14px;}" +
    ".dr-lead{font-size:16px;line-height:1.55;margin:0 0 16px;color:#34415a;}" +
    ".dr-checklist{margin:0 0 20px;padding-left:20px;font-size:14px;line-height:1.65;color:#53617a;}" +
    ".dr-checklist li{margin:6px 0;}" +
    ".dr-actions{display:flex;flex-direction:column;gap:10px;}" +
    ".dr-btn{display:block;text-align:center;text-decoration:none;border-radius:10px;padding:14px 16px;font-size:15px;font-weight:700;}" +
    ".dr-btn-primary{background:#3458d4;color:#fff!important;}" +
    ".dr-btn-soft{background:#f7f8fc;color:#3458d4!important;border:1px solid #e0e7ff;}" +
    ".dr-foot{margin:18px 0 0;font-size:12px;color:#8792a6;line-height:1.5;}" +
    ".dr-meta{text-align:center;font-size:11px;color:#8792a6;margin:12px 8px 0;}" +
    "</style>"
  );
}

// ——— Utils ———

function normalizeDailyEmailToken_(raw) {
  let s = String(raw || "").trim();
  while (s.charAt(0) === "@") s = s.slice(1).trim();
  return s.toLowerCase();
}

function isValidDailyEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
}

function normalizeDailyEmailList_(raw) {
  const valid = [];
  String(raw || "")
    .split(/[,;]+/)
    .map(normalizeDailyEmailToken_)
    .forEach(function (s) {
      if (s && isValidDailyEmail_(s)) valid.push(s);
    });
  return valid;
}

function parseDailyReminderRecipients_() {
  return normalizeDailyEmailList_(DAILY_REMINDER_CONFIG.RECIPIENTS);
}

function escDaily_(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escDailyAttr_(s) {
  return escDaily_(s).replace(/'/g, "&#39;");
}

function stripHtmlForPlain_(html) {
  return String(html)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
}
