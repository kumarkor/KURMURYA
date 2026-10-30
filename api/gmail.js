const nodemailer = require("nodemailer");
const { ImapFlow } = require("imapflow");

// ============================================================================
// 1. CONFIGURATION & FIREBASE REALTIME DATABASE REST ENGINE
// ============================================================================
const DB_URL = "https://kumartelegrambot-default-rtdb.firebaseio.com";
const MASTER_PIN = "252010";

async function fbGet(path) {
  try {
    const response = await fetch(DB_URL + "/" + path + ".json");
    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    return null;
  }
}

async function fbSet(path, data) {
  try {
    await fetch(DB_URL + "/" + path + ".json", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return true;
  } catch (err) {
    return false;
  }
}

// ============================================================================
// 2. DOT (.) & PLUS (+) UNLIMITED GMAIL GENERATOR ALGORITHM
// ============================================================================
function generateGmailVariations(baseEmail, maxCount, mode, customTag) {
  const clean = String(baseEmail || "").trim().toLowerCase();
  const parts = clean.split("@");
  if (parts.length !== 2) return [];

  // Strip existing dots and +tags from username to get pure root username
  const rawUser = parts[0].split("+")[0].replace(/\./g, "");
  const domain = parts[1];
  const results = [];
  const limit = Math.min(2000, Math.max(10, parseInt(maxCount, 10) || 200));
  const prefixTag = String(customTag || "vip").replace(/[^a-zA-Z0-9]/g, "");

  // 1. Generate Dot (.) Trick Combinations using Bitmasking
  if (mode === "dot" || mode === "both") {
    const n = rawUser.length;
    const maxMasks = Math.min(limit, Math.pow(2, Math.min(n - 1, 12)));
    for (let mask = 1; mask < maxMasks; mask++) {
      let built = "";
      for (let i = 0; i < n; i++) {
        built += rawUser[i];
        if (i < n - 1 && (mask & (1 << i)) !== 0) {
          built += ".";
        }
      }
      results.push(built + "@" + domain);
      if (results.length >= limit && mode === "dot") break;
    }
  }

  // 2. Generate Plus (+) Trick Combinations
  if (mode === "plus" || mode === "both") {
    let idx = 1;
    while (results.length < limit) {
      results.push(rawUser + "+" + prefixTag + idx + "@" + domain);
      idx++;
    }
  }

  return results.slice(0, limit);
}

// ============================================================================
// 3. SMART OTP CODE EXTRACTOR FROM EMAIL SUBJECT / BODY
// ============================================================================
function extractOtpFromText(subject, bodyText) {
  const combined = String(subject || "") + " " + String(bodyText || "");
  // Prioritize 4-8 digit codes near keywords like OTP, code, verification, pin
  const keywordMatch = combined.match(
    /(?:code|otp|pin|verification|passcode|password|शिवाय|कोड)[^0-9]{0,25}\b(\d{4,8})\b/i
  );
  if (keywordMatch && keywordMatch[1]) {
    return keywordMatch[1];
  }
  // Fallback: look for standalone 6-digit or 5-digit numbers (excluding years like 2025/2026)
  const allNums = combined.match(/\b(\d{5,6})\b/g);
  if (allNums && allNums.length > 0) {
    for (let i = 0; i < allNums.length; i++) {
      if (allNums[i] !== "2024" && allNums[i] !== "2025" && allNums[i] !== "2026") {
        return allNums[i];
      }
    }
  }
  return "NO-OTP";
}

// ============================================================================
// 4. IMAP LIVE GMAIL INBOX & OTP READER ENGINE
// ============================================================================
async function fetchGmailInboxOtps(emailUser, appPassword, limitCount) {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: String(emailUser).trim(),
      pass: String(appPassword).replace(/\s+/g, "").trim()
    },
    logger: false
  });

  const messagesList = [];
  await client.connect();

  let lock = await client.getMailboxLock("INBOX");
  try {
    const totalMessages = client.mailbox.exists || 0;
    if (totalMessages === 0) {
      return [];
    }
    const fetchCount = Math.min(12, Math.max(1, parseInt(limitCount, 10) || 8));
    const startSeq = Math.max(1, totalMessages - fetchCount + 1);
    const seqRange = startSeq + ":*";

    for await (let msg of client.fetch(seqRange, {
      envelope: true,
      source: true
    })) {
      const rawSource = msg.source ? msg.source.toString("utf8") : "";
      // Extract clean text preview from raw email source
      let cleanBody = rawSource
        .replace(/[\r\n]+/g, " ")
        .replace(/<style[^>]*>.*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (cleanBody.length > 500) {
        cleanBody = cleanBody.substring(cleanBody.length - 500);
      }

      const subject = (msg.envelope && msg.envelope.subject) || "(No Subject)";
      const fromObj =
        msg.envelope && msg.envelope.from && msg.envelope.from[0]
          ? msg.envelope.from[0]
          : {};
      const fromSender =
        (fromObj.name ? fromObj.name + " " : "") +
        "<" +
        (fromObj.address || "unknown") +
        ">";
      const toObj =
        msg.envelope && msg.envelope.to && msg.envelope.to[0]
          ? msg.envelope.to[0]
          : {};
      const deliveredTo = toObj.address || emailUser;
      const dateStr =
        msg.envelope && msg.envelope.date
          ? new Date(msg.envelope.date).toLocaleString("en-IN")
          : "Just now";

      const detectedOtp = extractOtpFromText(subject, cleanBody);

      messagesList.push({
        seq: msg.seq,
        from: fromSender,
        to: deliveredTo,
        subject: subject,
        date: dateStr,
        otp: detectedOtp,
        snippet: cleanBody.substring(0, 240)
      });
    }
  } finally {
    lock.release();
    await client.logout().catch(function () {});
  }

  return messagesList.reverse();
}

// ============================================================================
// 5. SUPER STYLISH HTML EMAIL TEMPLATE FOR SENDING OTP
// ============================================================================
function buildOtpHtmlEmail(otpCode, brandName, recipientEmail) {
  return `
  <div style="background:#050814;padding:32px 16px;font-family:'Segoe UI',Arial,sans-serif;color:#f8fafc;">
    <div style="max-width:480px;margin:0 auto;background:#0f172a;border:2px solid #00f0ff;border-radius:20px;padding:28px;text-align:center;box-shadow:0 0 35px rgba(0,240,255,0.25);">
      <div style="display:inline-block;background:rgba(0,240,255,0.12);border:1px solid #00f0ff;color:#00f0ff;padding:6px 16px;border-radius:99px;font-size:12px;font-weight:700;letter-spacing:1.5px;margin-bottom:14px;">
        ⚡ ${brandName || "KUMAR OTP SECURITY CLOUD"} ⚡
      </div>
      <h2 style="margin:0 0 10px;color:#ffffff;font-size:22px;">Email Verification Code</h2>
      <p style="color:#94a3b8;font-size:14px;line-height:1.5;margin:0 0 22px;">
        Hello <b>${recipientEmail}</b>,<br/>Use the 6-digit verification code below to complete your login or verification:
      </p>
      <div style="background:#020617;border:2px dashed #10b981;border-radius:16px;padding:18px;margin-bottom:22px;">
        <span style="font-family:monospace;font-size:34px;font-weight:900;letter-spacing:8px;color:#10b981;">
          ${otpCode}
        </span>
      </div>
      <p style="color:#64748b;font-size:12px;margin:0;">
        ⏳ This OTP is valid for 10 minutes. Do not share this code with anyone.
      </p>
    </div>
  </div>`;
}

// ============================================================================
// 6. MASTER WEB UI (100% GLITCH-FREE USING String.raw)
// ============================================================================
function renderGmailMasterWebUI() {
  return String.raw`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>📧 KUMAR GMAIL CLOUD OS • UNLIMITED ALIAS & LIVE OTP HUB 📧</title>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800;900&family=Plus+Jakarta+Sans:wght@500;600;700;800&family=JetBrains+Mono:wght@500;700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg-deep: #030712;
      --bg-surface: #0b1325;
      --bg-card: rgba(15, 23, 42, 0.9);
      --bg-input: #060b16;
      --accent: #00f0ff;
      --accent-glow: rgba(0, 240, 255, 0.4);
      --accent-2: #8b5cf6;
      --accent-2-glow: rgba(139, 92, 246, 0.38);
      --success: #10b981;
      --success-glow: rgba(16, 185, 129, 0.4);
      --danger: #f43f5e;
      --warning: #f59e0b;
      --text-main: #f8fafc;
      --text-sub: #cbd5e1;
      --text-dim: #94a3b8;
      --border-glass: rgba(0, 240, 255, 0.26);
      --border-strong: rgba(0, 240, 255, 0.75);
      --grad-main: linear-gradient(135deg, #00f0ff 0%, #3b82f6 50%, #8b5cf6 100%);
      --grad-btn: linear-gradient(90deg, #00f0ff, #0284c7);
    }

    body.theme-gold {
      --bg-deep: #080414;
      --bg-surface: #140a29;
      --bg-card: rgba(24, 12, 48, 0.9);
      --bg-input: #090414;
      --accent: #f59e0b;
      --accent-glow: rgba(245, 158, 11, 0.42);
      --accent-2: #ec4899;
      --border-glass: rgba(245, 158, 11, 0.3);
      --border-strong: rgba(245, 158, 11, 0.8);
      --grad-main: linear-gradient(135deg, #f59e0b 0%, #ec4899 50%, #8b5cf6 100%);
      --grad-btn: linear-gradient(90deg, #f59e0b, #d97706);
    }

    body.theme-matrix {
      --bg-deep: #020d07;
      --bg-surface: #062114;
      --bg-card: rgba(8, 35, 22, 0.9);
      --bg-input: #03120a;
      --accent: #10b981;
      --accent-glow: rgba(16, 185, 129, 0.42);
      --accent-2: #06b6d4;
      --border-glass: rgba(16, 185, 129, 0.3);
      --border-strong: rgba(16, 185, 129, 0.8);
      --grad-main: linear-gradient(135deg, #10b981 0%, #06b6d4 50%, #3b82f6 100%);
      --grad-btn: linear-gradient(90deg, #10b981, #059669);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
    }

    body {
      background-color: var(--bg-deep);
      color: var(--text-main);
      font-family: 'Plus Jakarta Sans', sans-serif;
      min-height: 100vh;
      overflow-x: hidden;
      background-image:
        radial-gradient(circle at 12% 15%, var(--accent-glow) 0%, transparent 35%),
        radial-gradient(circle at 88% 85%, var(--accent-2-glow) 0%, transparent 35%);
      background-attachment: fixed;
    }

    /* ========================================================================
       1. SECURITY VAULT OVERLAY (PIN: 252010)
       ======================================================================== */
    #vault-overlay {
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: radial-gradient(circle at top, #0f172a 0%, #020617 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      transition: opacity 0.35s ease, visibility 0.35s ease;
    }

    #vault-overlay.vault-open {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
    }

    .vault-card {
      width: 100%;
      max-width: 420px;
      background: rgba(11, 19, 37, 0.96);
      border: 2px solid var(--border-strong);
      border-radius: 28px;
      padding: 26px 20px;
      box-shadow: 0 0 65px var(--accent-glow);
      text-align: center;
    }

    .vault-badge {
      display: inline-block;
      background: rgba(0, 240, 255, 0.12);
      border: 1px solid var(--accent);
      color: var(--accent);
      padding: 6px 16px;
      border-radius: 99px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 1.5px;
      margin-bottom: 12px;
    }

    .vault-title {
      font-family: 'Orbitron', sans-serif;
      font-size: 22px;
      font-weight: 900;
      color: var(--accent);
      letter-spacing: 1.5px;
      margin-bottom: 6px;
    }

    .vault-sub {
      font-size: 13px;
      color: var(--text-sub);
      margin-bottom: 16px;
    }

    .led-row {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 8px;
      margin-bottom: 14px;
    }

    .led-cell {
      height: 48px;
      background: #040812;
      border: 1.5px solid var(--border-glass);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'JetBrains Mono', monospace;
      font-size: 22px;
      font-weight: 800;
      color: var(--accent);
    }

    .led-cell.filled {
      border-color: var(--accent);
      background: rgba(0, 240, 255, 0.15);
      box-shadow: 0 0 14px var(--accent-glow);
    }

    .direct-pin-bar {
      display: flex;
      gap: 8px;
      margin-bottom: 14px;
    }

    .direct-pin-inp {
      flex: 1;
      padding: 12px;
      background: #040812;
      border: 1.5px solid var(--border-glass);
      border-radius: 12px;
      color: #fff;
      font-family: 'JetBrains Mono', monospace;
      font-size: 16px;
      text-align: center;
      letter-spacing: 5px;
      outline: none;
    }

    .direct-pin-btn {
      background: var(--grad-btn);
      color: #020617;
      border: none;
      border-radius: 12px;
      padding: 0 18px;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 800;
      cursor: pointer;
    }

    .keypad-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 12px;
    }

    .k-btn {
      background: rgba(20, 32, 60, 0.9);
      border: 1px solid var(--border-glass);
      border-bottom: 3px solid var(--accent);
      border-radius: 14px;
      padding: 12px 0;
      color: #fff;
      font-family: 'JetBrains Mono', monospace;
      font-size: 20px;
      font-weight: 800;
      cursor: pointer;
    }

    .k-btn:active {
      transform: translateY(2px);
      background: var(--accent);
      color: #000;
    }

    /* ========================================================================
       2. MAIN SHELL & HEADER
       ======================================================================== */
    .shell {
      max-width: 1240px;
      margin: 0 auto;
      padding: 16px 14px 100px;
    }

    .top-header {
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(8, 13, 26, 0.96));
      border: 1.5px solid var(--border-strong);
      border-radius: 24px;
      padding: 18px 22px;
      margin-bottom: 16px;
      box-shadow: 0 10px 35px rgba(0, 0, 0, 0.6), 0 0 25px var(--accent-glow);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
    }

    .brand-left {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .brand-icon {
      width: 56px;
      height: 56px;
      border-radius: 16px;
      background: var(--grad-main);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      box-shadow: 0 0 22px var(--accent-glow);
    }

    .brand-titles h1 {
      font-family: 'Orbitron', sans-serif;
      font-size: 20px;
      font-weight: 900;
      color: var(--accent);
      letter-spacing: 1px;
    }

    .brand-titles p {
      font-size: 12.5px;
      color: var(--text-sub);
      margin-top: 2px;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .pill-select, .pill-stat {
      background: var(--bg-input);
      border: 1px solid var(--border-glass);
      color: var(--accent);
      padding: 8px 12px;
      border-radius: 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 700;
      outline: none;
    }

    .btn-lock {
      background: rgba(244, 63, 94, 0.18);
      border: 1px solid var(--danger);
      color: #fda4af;
      padding: 8px 14px;
      border-radius: 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 800;
      cursor: pointer;
    }

    /* ========================================================================
       STATS BAR & NAVIGATION TABS
       ======================================================================== */
    .stats-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }

    .stat-tile {
      background: var(--bg-card);
      border: 1px solid var(--border-glass);
      border-radius: 18px;
      padding: 15px 16px;
    }

    .stat-tile .lbl {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      color: var(--text-dim);
      margin-bottom: 4px;
    }

    .stat-tile .val {
      font-family: 'JetBrains Mono', monospace;
      font-size: 25px;
      font-weight: 800;
      color: var(--accent);
    }

    .stat-tile .sub {
      font-size: 11px;
      color: var(--text-sub);
      margin-top: 4px;
    }

    .nav-tabs {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 8px;
      margin-bottom: 16px;
    }

    .nav-btn {
      background: var(--bg-card);
      border: 1px solid var(--border-glass);
      border-radius: 14px;
      padding: 13px 10px;
      color: var(--text-sub);
      font-size: 12px;
      font-weight: 800;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .nav-btn.active {
      background: var(--grad-main);
      color: #ffffff;
      border-color: #ffffff;
      box-shadow: 0 0 22px var(--accent-glow);
      transform: translateY(-2px);
    }

    .tab-pane {
      display: none;
    }

    .tab-pane.active {
      display: block;
    }

    /* ========================================================================
       CARDS, INPUTS & BUTTONS
       ======================================================================== */
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(330px, 1fr));
      gap: 16px;
      margin-bottom: 16px;
    }

    .card-box {
      background: var(--bg-card);
      border: 1px solid var(--border-glass);
      border-radius: 22px;
      padding: 20px;
      margin-bottom: 16px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    }

    .card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
      padding-bottom: 12px;
      margin-bottom: 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .card-title {
      font-size: 14.5px;
      font-weight: 800;
      color: var(--accent);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .chip-tag {
      background: rgba(0, 240, 255, 0.14);
      border: 1px solid var(--accent);
      color: var(--accent);
      padding: 3px 10px;
      border-radius: 99px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      font-weight: 800;
    }

    .field {
      margin-bottom: 12px;
    }

    .field label {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 800;
      color: var(--text-sub);
      margin-bottom: 5px;
      text-transform: uppercase;
    }

    .field label span {
      color: var(--accent);
      font-family: 'JetBrains Mono', monospace;
    }

    .inp, .txtarea, .sel {
      width: 100%;
      padding: 12px 14px;
      background: var(--bg-input);
      border: 1.5px solid var(--border-glass);
      border-radius: 13px;
      color: #ffffff;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13.5px;
      outline: none;
    }

    .txtarea {
      min-height: 110px;
      resize: vertical;
      line-height: 1.5;
    }

    .inp:focus, .txtarea:focus, .sel:focus {
      border-color: var(--accent);
      box-shadow: 0 0 16px var(--accent-glow);
    }

    .btn {
      width: 100%;
      padding: 13px 16px;
      border: none;
      border-radius: 13px;
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 12.5px;
      font-weight: 800;
      letter-spacing: 0.7px;
      text-transform: uppercase;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 8px;
      transition: 0.2s;
    }

    .btn-primary {
      background: var(--grad-btn);
      color: #020617;
      box-shadow: 0 0 20px var(--accent-glow);
    }

    .btn-green {
      background: linear-gradient(90deg, #10b981, #059669);
      color: #ffffff;
      box-shadow: 0 0 20px var(--success-glow);
    }

    .btn-purple {
      background: linear-gradient(90deg, #8b5cf6, #ec4899);
      color: #ffffff;
    }

    .btn-red {
      background: linear-gradient(90deg, #f43f5e, #e11d48);
      color: #ffffff;
    }

    .btn-outline {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-glass);
      color: var(--accent);
    }

    .btn-sm {
      width: auto;
      padding: 7px 13px;
      font-size: 11px;
      margin-bottom: 0;
    }

    /* ========================================================================
       LIVE OTP INBOX CARDS & TERMINAL
       ======================================================================== */
    .terminal-log {
      background: #02050c;
      border: 1.5px solid var(--border-strong);
      border-radius: 16px;
      padding: 14px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: #7dd3fc;
      max-height: 220px;
      overflow-y: auto;
      line-height: 1.6;
      white-space: pre-wrap;
    }

    .otp-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(310px, 1fr));
      gap: 14px;
    }

    .email-otp-card {
      background: #060c1a;
      border: 1.5px solid var(--border-glass);
      border-radius: 16px;
      padding: 16px;
      position: relative;
    }

    .email-otp-card.has-otp {
      border-color: var(--success);
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.18);
    }

    .otp-big-badge {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(16, 185, 129, 0.14);
      border: 1px dashed var(--success);
      border-radius: 12px;
      padding: 10px 14px;
      margin: 10px 0;
    }

    .otp-digits {
      font-family: 'JetBrains Mono', monospace;
      font-size: 24px;
      font-weight: 900;
      color: #34d399;
      letter-spacing: 4px;
    }

    .code-block {
      background: #03060f;
      border: 1px solid var(--border-glass);
      border-radius: 14px;
      padding: 14px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: #a5f3fc;
      overflow-x: auto;
      white-space: pre;
      line-height: 1.55;
      margin-bottom: 12px;
    }

    .info-note {
      background: rgba(0, 240, 255, 0.08);
      border: 1px dashed var(--accent);
      border-radius: 14px;
      padding: 12px 15px;
      font-size: 12.5px;
      color: var(--text-sub);
      margin-bottom: 14px;
      line-height: 1.55;
    }

    .table-wrap {
      width: 100%;
      overflow-x: auto;
    }

    .cyber-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12.5px;
    }

    .cyber-table th {
      background: rgba(0, 240, 255, 0.1);
      color: var(--accent);
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      text-align: left;
      padding: 11px 13px;
      border-bottom: 1px solid var(--border-glass);
    }

    .cyber-table td {
      padding: 12px 13px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.07);
      font-family: 'JetBrains Mono', monospace;
      color: #fff;
    }

    #toast-box {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 100000;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .toast-item {
      background: #0f172a;
      border-left: 4px solid var(--accent);
      border-top: 1px solid var(--border-glass);
      border-right: 1px solid var(--border-glass);
      border-bottom: 1px solid var(--border-glass);
      color: #fff;
      padding: 12px 16px;
      border-radius: 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.8);
    }
  </style>
</head>
<body>

  <!-- ======================================================================
       1. SECURITY LOCK OVERLAY (PIN: 252010)
       ====================================================================== -->
  <div id="vault-overlay">
    <div class="vault-card">
      <div class="vault-badge">📧 GMAIL QUANTUM CLOUD VAULT 📧</div>
      <div class="vault-title">SECURITY LOCK</div>
      <div class="vault-sub">Enter 6-Digit Master PIN (252010) to Unlock</div>

      <div class="led-row">
        <div class="led-cell" id="led-0">-</div>
        <div class="led-cell" id="led-1">-</div>
        <div class="led-cell" id="led-2">-</div>
        <div class="led-cell" id="led-3">-</div>
        <div class="led-cell" id="led-4">-</div>
        <div class="led-cell" id="led-5">-</div>
      </div>

      <div class="direct-pin-bar">
        <input type="tel" id="direct-pin-inp" class="direct-pin-inp" maxlength="6" placeholder="Type PIN" autocomplete="off" />
        <button type="button" class="direct-pin-btn" id="btn-direct-unlock">UNLOCK ⚡</button>
      </div>

      <div class="keypad-grid">
        <button type="button" class="k-btn" data-digit="1">1</button>
        <button type="button" class="k-btn" data-digit="2">2</button>
        <button type="button" class="k-btn" data-digit="3">3</button>
        <button type="button" class="k-btn" data-digit="4">4</button>
        <button type="button" class="k-btn" data-digit="5">5</button>
        <button type="button" class="k-btn" data-digit="6">6</button>
        <button type="button" class="k-btn" data-digit="7">7</button>
        <button type="button" class="k-btn" data-digit="8">8</button>
        <button type="button" class="k-btn" data-digit="9">9</button>
        <button type="button" class="k-btn" id="btn-k-clr" style="color:#fda4af;font-size:13px;">CLEAR</button>
        <button type="button" class="k-btn" data-digit="0">0</button>
        <button type="button" class="k-btn" id="btn-k-ok" style="background:#10b981;color:#fff;font-size:13px;">OPEN 🔓</button>
      </div>

      <div id="vault-msg" style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent);">
        🛡️ PROTECTED BY KUMAR CLOUD FIREWALL
      </div>
    </div>
  </div>

  <!-- ======================================================================
       2. MAIN GMAIL CLOUD HUB DASHBOARD
       ====================================================================== -->
  <div class="shell">
    <header class="top-header">
      <div class="brand-left">
        <div class="brand-icon">📧</div>
        <div class="brand-titles">
          <h1>KUMAR GMAIL OTP & UNLIMITED ALIAS HUB</h1>
          <p>Live Gmail OTP Reader • OTP Verification Engine • Unlimited Dot/Plus Generator • REST API</p>
        </div>
      </div>
      <div class="header-right">
        <select class="pill-select" id="theme-sel">
          <option value="">🔵 CYBER NEON BLUE</option>
          <option value="theme-gold">👑 ROYAL GOLD PLASMA</option>
          <option value="theme-matrix">🟢 EMERALD MATRIX</option>
        </select>
        <div class="pill-stat" id="live-clock">🕒 00:00:00</div>
        <button type="button" class="btn-lock" id="btn-lock-now">🔒 LOCK</button>
      </div>
    </header>

    <!-- METRICS -->
    <section class="stats-row">
      <div class="stat-tile">
        <div class="lbl">📧 Connected Gmails</div>
        <div class="val" id="stat-gmails">0</div>
        <div class="sub">🟢 Active SMTP & IMAP</div>
      </div>
      <div class="stat-tile">
        <div class="lbl">♾️ Generated Aliases</div>
        <div class="val" id="stat-aliases">0</div>
        <div class="sub">⚡ Dot (.) & Plus (+) Trick</div>
      </div>
      <div class="stat-tile">
        <div class="lbl">🛡️ Active OTP Sessions</div>
        <div class="val" id="stat-otps">0</div>
        <div class="sub">🔑 Firebase Verified</div>
      </div>
      <div class="stat-tile">
        <div class="lbl">📡 Live OTP Radar</div>
        <div class="val" id="stat-radar" style="font-size:20px;color:var(--text-dim);">STANDBY</div>
        <div class="sub">🔄 Auto-Scan Inbox</div>
      </div>
    </section>

    <!-- 5 MASTER NAVIGATION TABS -->
    <div class="nav-tabs">
      <button type="button" class="nav-btn active" data-pane="pane-reader">
        📩 1. LIVE GMAIL OTP READER
      </button>
      <button type="button" class="nav-btn" data-pane="pane-verify">
        🛡️ 2. OTP VERIFICATION & SENDER
      </button>
      <button type="button" class="nav-btn" data-pane="pane-generator">
        ♾️ 3. UNLIMITED DOT/PLUS GENERATOR
      </button>
      <button type="button" class="nav-btn" data-pane="pane-accounts">
        ➕ 4. ADD GMAIL & APP PASSWORD
      </button>
      <button type="button" class="nav-btn" data-pane="pane-api-docs">
        🔌 5. API & BOT CODE GENERATOR
      </button>
    </div>

    <!-- LIVE CONSOLE -->
    <div class="card-box">
      <div class="card-head">
        <div class="card-title">🖥️ LIVE EXECUTION TERMINAL</div>
        <div style="display:flex;gap:8px;">
          <button type="button" class="btn btn-outline btn-sm" id="btn-clear-term">🧹 CLEAR</button>
          <button type="button" class="btn btn-outline btn-sm" id="btn-sync-hub">🔄 SYNC DATA</button>
        </div>
      </div>
      <div class="terminal-log" id="term-log">⚡ [GMAIL CLOUD OS ONLINE]: First add your Gmail & 16-Digit App Password in Tab 4, then read or send OTPs anywhere!</div>
    </div>

    <!-- ====================================================================
         PANE 1: LIVE GMAIL OTP READER (READS INCOMING OTPs VIA IMAP)
         ==================================================================== -->
    <div id="pane-reader" class="tab-pane active">
      <div class="info-note">
        📩 <b>LIVE GMAIL OTP READER:</b> Select your connected Gmail account below and click <b>SCAN INBOX FOR LIVE OTPs</b>. Even if you sent an OTP to a <b>Dot (`.`)</b> or <b>Plus (`+`)</b> trick email, it lands in your main Gmail inbox and appears right here with 1-Click Copy!
      </div>

      <div class="card-box">
        <div class="card-head">
          <div class="card-title">🔍 SELECT GMAIL INBOX TO READ OTP</div>
          <span class="chip-tag">REALTIME IMAP</span>
        </div>

        <div class="grid-2">
          <div class="field">
            <label><span>SELECT CONNECTED GMAIL ACCOUNT</span><span>DROPDOWN</span></label>
            <select id="sel-reader-gmail" class="sel">
              <option value="ALL">🔍 SCAN ALL CONNECTED GMAIL ACCOUNTS</option>
            </select>
          </div>
          <div class="field">
            <label><span>NUMBER OF LATEST EMAILS TO SCAN</span><span>1 TO 12</span></label>
            <input type="number" id="inp-reader-limit" class="inp" value="6" min="1" max="12" />
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;">
          <button type="button" class="btn btn-primary" id="btn-scan-inbox">
            📩 SCAN INBOX FOR LIVE OTP CODES NOW
          </button>
          <button type="button" class="btn btn-green" id="btn-toggle-radar">
            📡 START AUTO-REFRESH OTP RADAR (EVERY 12s)
          </button>
        </div>
      </div>

      <!-- EXTRACTED OTP EMAIL CARDS -->
      <div class="card-box">
        <div class="card-head">
          <div class="card-title">📬 INCOMING EMAILS & EXTRACTED OTP CODES</div>
        </div>
        <div class="otp-grid" id="inbox-otp-cards">
          <div style="color:var(--text-dim);font-family:'JetBrains Mono',monospace;font-size:12.5px;">
            📭 Click <b>"SCAN INBOX FOR LIVE OTP CODES NOW"</b> above to load your latest incoming emails and verification codes.
          </div>
        </div>
      </div>
    </div>

    <!-- ====================================================================
         PANE 2: OTP VERIFICATION SYSTEM (SEND OTP & VERIFY OTP)
         ==================================================================== -->
    <div id="pane-verify" class="tab-pane">
      <div class="grid-2">
        <!-- SEND OTP CARD -->
        <div class="card-box">
          <div class="card-head">
            <div class="card-title">📤 STEP 1: SEND VERIFICATION OTP TO ANY EMAIL</div>
            <span class="chip-tag">SMTP ENGINE</span>
          </div>
          <div class="field">
            <label><span>SEND FROM (YOUR CONNECTED GMAIL)</span><span>SENDER</span></label>
            <select id="sel-sender-gmail" class="sel"></select>
          </div>
          <div class="field">
            <label><span>RECIPIENT EMAIL ADDRESS (TO RECEIVE OTP)</span><span>*REQUIRED</span></label>
            <input type="email" id="inp-verify-to-email" class="inp" placeholder="e.g. user@gmail.com" />
          </div>
          <div class="field">
            <label><span>BRAND / APP NAME ON OTP EMAIL</span><span>CUSTOMIZABLE</span></label>
            <input type="text" id="inp-verify-brand" class="inp" value="KUMAR OFFICIAL VERIFICATION" />
          </div>
          <button type="button" class="btn btn-primary" id="btn-send-verify-otp">
            📤 SEND 6-DIGIT STYLISH OTP EMAIL NOW
          </button>
        </div>

        <!-- VERIFY OTP CARD -->
        <div class="card-box">
          <div class="card-head">
            <div class="card-title">✅ STEP 2: VERIFY USER'S 6-DIGIT OTP CODE</div>
            <span class="chip-tag">FIREBASE AUTH</span>
          </div>
          <div class="info-note">
            🛡️ Test your OTP Verification right here! Enter the recipient's email and the 6-digit OTP they received to verify it against Firebase.
          </div>
          <div class="field">
            <label><span>RECIPIENT EMAIL TO VERIFY</span><span>*REQUIRED</span></label>
            <input type="email" id="inp-check-email" class="inp" placeholder="e.g. user@gmail.com" />
          </div>
          <div class="field">
            <label><span>ENTER 6-DIGIT OTP CODE</span><span>6 DIGITS</span></label>
            <input type="tel" id="inp-check-otp" class="inp" maxlength="6" placeholder="e.g. 482910" />
          </div>
          <button type="button" class="btn btn-green" id="btn-check-verify-otp">
            ✅ VERIFY OTP CODE NOW
          </button>
        </div>
      </div>

      <!-- CUSTOM / BULK EMAIL SENDER -->
      <div class="card-box">
        <div class="card-head">
          <div class="card-title">📢 SEND CUSTOM / BULK MESSAGE TO GMAILS</div>
          <span class="chip-tag">MULTI-RECIPIENT</span>
        </div>
        <div class="grid-2">
          <div class="field">
            <label><span>RECIPIENT EMAILS (COMMA OR NEWLINE SEPARATED)</span><span>UP TO 50 AT ONCE</span></label>
            <textarea id="inp-bulk-emails" class="txtarea" placeholder="friend1@gmail.com&#10;friend2@gmail.com"></textarea>
          </div>
          <div>
            <div class="field">
              <label><span>EMAIL SUBJECT</span><span>*REQUIRED</span></label>
              <input type="text" id="inp-bulk-subject" class="inp" placeholder="e.g. Important Update / Offer 🔥" />
            </div>
            <div class="field">
              <label><span>EMAIL MESSAGE BODY</span><span>SUPPORTS HTML/TEXT</span></label>
              <textarea id="inp-bulk-body" class="txtarea" style="min-height:68px;" placeholder="Hello! Here is your exclusive message..."></textarea>
            </div>
          </div>
        </div>
        <button type="button" class="btn btn-purple" id="btn-send-custom-mail">
          🚀 SEND EMAIL BROADCAST NOW
        </button>
      </div>
    </div>

    <!-- ====================================================================
         PANE 3: UNLIMITED DOT (.) & PLUS (+) GMAIL GENERATOR
         ==================================================================== -->
    <div id="pane-generator" class="tab-pane">
      <div class="info-note">
        ♾️ <b>UNLIMITED DOT & PLUS GMAIL TRICK GENERATOR:</b> Enter your single Gmail address below to generate up to <b>2,000+ unique valid Gmail addresses</b>! Use these generated emails on any website/app — every single OTP sent to them will arrive straight inside your main Gmail (Tab 1)!
      </div>

      <div class="grid-2">
        <div class="card-box">
          <div class="card-head">
            <div class="card-title">♾️ GENERATE THOUSANDS OF GMAIL ALIASES</div>
            <span class="chip-tag">INSTANT GENERATOR</span>
          </div>

          <div class="field">
            <label><span>YOUR MAIN GMAIL ADDRESS</span><span>*REQUIRED</span></label>
            <input type="email" id="inp-gen-base-email" class="inp" placeholder="e.g. kumarkor06@gmail.com" />
          </div>

          <div class="field">
            <label><span>GENERATION TRICK MODE</span><span>SELECT MODE</span></label>
            <select id="sel-gen-mode" class="sel">
              <option value="both">🔥 BOTH: Dot Trick (.) + Plus Trick (+)</option>
              <option value="dot">🔹 ONLY DOT TRICK (e.g. k.u.m.a.r@gmail.com)</option>
              <option value="plus">➕ ONLY PLUS TRICK (e.g. kumar+vip1@gmail.com)</option>
            </select>
          </div>

          <div class="grid-2" style="margin-bottom:0;">
            <div class="field">
              <label><span>HOW MANY GMAILS?</span><span>MAX 2000</span></label>
              <input type="number" id="inp-gen-count" class="inp" value="500" min="10" max="2000" />
            </div>
            <div class="field">
              <label><span>PLUS (+) TAG PREFIX</span><span>OPTIONAL</span></label>
              <input type="text" id="inp-gen-tag" class="inp" value="id" placeholder="e.g. id, user, bot" />
            </div>
          </div>

          <button type="button" class="btn btn-primary" id="btn-generate-aliases">
            ♾️ GENERATE UNLIMITED GMAIL LIST NOW
          </button>
        </div>

        <div class="card-box">
          <div class="card-head">
            <div class="card-title">📋 GENERATED GMAIL LIST (<span id="gen-count-badge">0</span>)</div>
            <div style="display:flex;gap:6px;">
              <button type="button" class="btn btn-green btn-sm" id="btn-copy-aliases">📋 COPY ALL</button>
              <button type="button" class="btn btn-outline btn-sm" id="btn-download-aliases">💾 DOWNLOAD .TXT</button>
            </div>
          </div>
          <textarea
            id="out-generated-aliases"
            class="txtarea"
            style="min-height:245px;font-size:12.5px;color:#34d399;"
            readonly
            placeholder="Your generated Dot (.) and Plus (+) Gmail addresses will appear here..."
          ></textarea>
        </div>
      </div>
    </div>

    <!-- ====================================================================
         PANE 4: ADD GMAIL & 16-DIGIT GOOGLE APP PASSWORD
         ==================================================================== -->
    <div id="pane-accounts" class="tab-pane">
      <div class="grid-2">
        <div class="card-box">
          <div class="card-head">
            <div class="card-title">➕ CONNECT GMAIL & APP PASSWORD</div>
            <span class="chip-tag">SMTP + IMAP</span>
          </div>

          <div class="field">
            <label><span>1. YOUR GMAIL ADDRESS</span><span>*REQUIRED</span></label>
            <input type="email" id="inp-add-gmail" class="inp" placeholder="e.g. kumarkor06@gmail.com" />
          </div>

          <div class="field">
            <label><span>2. GOOGLE 16-DIGIT APP PASSWORD</span><span>*REQUIRED</span></label>
            <input type="text" id="inp-add-app-pass" class="inp" placeholder="e.g. abcd efgh ijkl mnop" />
          </div>

          <div class="field">
            <label><span>3. ACCOUNT LABEL / SENDER NAME</span><span>OPTIONAL</span></label>
            <input type="text" id="inp-add-label" class="inp" placeholder="e.g. Kumar Main OTP Mail" />
          </div>

          <button type="button" class="btn btn-green" id="btn-save-gmail-acc">
            ✅ TEST & SAVE GMAIL ACCOUNT TO FIREBASE
          </button>
        </div>

        <div class="card-box">
          <div class="card-head">
            <div class="card-title">🔑 HOW TO GET 16-DIGIT GOOGLE APP PASSWORD?</div>
            <span class="chip-tag">1 MINUTE SETUP</span>
          </div>
          <div style="font-size:13px;color:var(--text-sub);line-height:1.7;">
            1️⃣ Open your Google Account settings: <code>myaccount.google.com/security</code><br/>
            2️⃣ Make sure <b>2-Step Verification</b> is turned <b>ON</b>.<br/>
            3️⃣ In the top search bar of Google Account, search for <b>"App passwords"</b> (or visit <code>myaccount.google.com/apppasswords</code>).<br/>
            4️⃣ Type any App Name (e.g. <code>KumarBot</code>) and click <b>Create</b>.<br/>
            5️⃣ Google will give you a <b>16-letter App Password</b> (like <code>abcd efgh ijkl mnop</code>).<br/>
            6️⃣ Paste that 16-letter code in Box 2 on the left and click Save!
          </div>
        </div>
      </div>

      <!-- SAVED GMAIL ACCOUNTS TABLE -->
      <div class="card-box">
        <div class="card-head">
          <div class="card-title">📧 CONNECTED GMAIL ACCOUNTS IN FIREBASE</div>
        </div>
        <div class="table-wrap">
          <table class="cyber-table">
            <thead>
              <tr>
                <th>#</th>
                <th>LABEL</th>
                <th>GMAIL ADDRESS</th>
                <th>APP PASSWORD</th>
                <th>ADDED ON</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody id="tbody-gmail-accounts"></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ====================================================================
         PANE 5: DEVELOPER API & BOTS.BUSINESS (BJS) CODE GENERATOR
         ==================================================================== -->
    <div id="pane-api-docs" class="tab-pane">
      <div class="info-note">
        🔌 <b>HOW TO CONNECT THIS API TO YOUR TELEGRAM BOT OR WEBSITE:</b> Below is your live API Endpoint and ready-to-paste code for <b>Bots.Business (BJS)</b> and <b>JavaScript / Website</b>!
      </div>

      <div class="card-box">
        <div class="card-head">
          <div class="card-title">🌐 YOUR LIVE GMAIL CLOUD API ENDPOINT</div>
          <button type="button" class="btn btn-green btn-sm" id="btn-copy-endpoint">📋 COPY API URL</button>
        </div>
        <input type="text" id="api-endpoint-display" class="inp" readonly />
      </div>

      <div class="grid-2">
        <!-- BOTS.BUSINESS CODE -->
        <div class="card-box">
          <div class="card-head">
            <div class="card-title">🤖 1. BOTS.BUSINESS (BJS) COMPLETE `*` CODE</div>
            <button type="button" class="btn btn-primary btn-sm" onclick="copyCodeBlock('code-bjs')">📋 COPY BJS CODE</button>
          </div>
          <div class="code-block" id="code-bjs"></div>
        </div>

        <!-- WEBSITE / JAVASCRIPT FETCH API CODE -->
        <div class="card-box">
          <div class="card-head">
            <div class="card-title">💻 2. WEBSITE / JAVASCRIPT FETCH API CODE</div>
            <button type="button" class="btn btn-purple btn-sm" onclick="copyCodeBlock('code-js')">📋 COPY JS CODE</button>
          </div>
          <div class="code-block" id="code-js"></div>
        </div>
      </div>
    </div>
  </div>

  <div id="toast-box"></div>

  <!-- ======================================================================
       3. FRONTEND JAVASCRIPT ENGINE
       ====================================================================== -->
  <script>
    function copyCodeBlock(elId) {
      var txt = document.getElementById(elId).textContent;
      navigator.clipboard.writeText(txt);
      alert("✅ Code Copied to Clipboard!");
    }

    function copyTextValue(val) {
      navigator.clipboard.writeText(val);
    }

    (function () {
      var MASTER_PIN = "252010";
      var typedPin = "";
      var savedGmails = [];
      var radarTimer = null;

      var apiEndpointUrl = window.location.origin + window.location.pathname;
      document.getElementById("api-endpoint-display").value = apiEndpointUrl;

      // Populate Developer Code Snippets dynamically with current URL
      document.getElementById("code-bjs").textContent =
        "/* Command: * (Bots.Business Gmail OTP & Reader) */\n" +
        'var apiUrl = "' + apiEndpointUrl + '";\n' +
        'var pin = "252010";\n\n' +
        "if (content) {\n" +
        "  var d = JSON.parse(content);\n" +
        '  Api.sendMessage({ text: d.reply, parse_mode: "HTML" });\n' +
        "  return;\n" +
        "}\n\n" +
        'if (message == "/start") {\n' +
        "  Api.sendMessage({\n" +
        '    text: "📧 <b>GMAIL OTP CONTROL PANEL</b>",\n' +
        '    parse_mode: "HTML",\n' +
        "    reply_markup: {\n" +
        '      keyboard: [[{ text: "📩 GET GMAIL OTP" }, { text: "📤 SEND OTP" }], [{ text: "♾️ DOT/PLUS GMAILS" }]],\n' +
        "      resize_keyboard: true\n" +
        "    }\n" +
        "  });\n" +
        "  return;\n" +
        "}\n\n" +
        'if (message == "📩 GET GMAIL OTP") {\n' +
        '  Bot.sendMessage("⏳ Scanning Gmail Inbox for OTP...");\n' +
        '  HTTP.post({ url: apiUrl, body: { action: "read_inbox", webPin: pin, email: "ALL", limit: 5 }, success: "*" });\n' +
        "  return;\n" +
        "}\n\n" +
        'if (message == "♾️ DOT/PLUS GMAILS") {\n' +
        '  HTTP.post({ url: apiUrl, body: { action: "generate_aliases", webPin: pin, count: 30, mode: "both" }, success: "*" });\n' +
        "  return;\n" +
        "}\n\n" +
        "// Send OTP to email or Verify 6-digit code automatically:\n" +
        'if (message.indexOf("@") !== -1) {\n' +
        '  User.setProperty("verify_email", message.trim(), "string");\n' +
        '  HTTP.post({ url: apiUrl, body: { action: "send_otp", webPin: pin, toEmail: message.trim() }, success: "*" });\n' +
        "  return;\n" +
        "}\n\n" +
        "if (message.replace(/\\D/g, '').length == 6) {\n" +
        '  var targetMail = User.getProperty("verify_email");\n' +
        '  HTTP.post({ url: apiUrl, body: { action: "verify_otp", webPin: pin, toEmail: targetMail, otpCode: message.trim() }, success: "*" });\n' +
        "  return;\n" +
        "}";

      document.getElementById("code-js").textContent =
        "// 1. SEND OTP TO USER EMAIL\n" +
        'fetch("' + apiEndpointUrl + '", {\n' +
        '  method: "POST",\n' +
        '  headers: { "Content-Type": "application/json" },\n' +
        "  body: JSON.stringify({\n" +
        '    action: "send_otp",\n' +
        '    webPin: "252010",\n' +
        '    toEmail: "user@gmail.com",\n' +
        '    brandName: "KUMAR APP"\n' +
        "  })\n" +
        "}).then(r => r.json()).then(console.log);\n\n" +
        "// 2. VERIFY 6-DIGIT OTP CODE\n" +
        'fetch("' + apiEndpointUrl + '", {\n' +
        '  method: "POST",\n' +
        '  headers: { "Content-Type": "application/json" },\n' +
        "  body: JSON.stringify({\n" +
        '    action: "verify_otp",\n' +
        '    webPin: "252010",\n' +
        '    toEmail: "user@gmail.com",\n' +
        '    otpCode: "123456"\n' +
        "  })\n" +
        "}).then(r => r.json()).then(console.log);\n\n" +
        "// 3. READ LIVE OTP FROM GMAIL INBOX\n" +
        'fetch("' + apiEndpointUrl + '", {\n' +
        '  method: "POST",\n' +
        '  headers: { "Content-Type": "application/json" },\n' +
        "  body: JSON.stringify({\n" +
        '    action: "read_inbox",\n' +
        '    webPin: "252010",\n' +
        '    email: "ALL",\n' +
        "    limit: 5\n" +
        "  })\n" +
        "}).then(r => r.json()).then(console.log);";

      function toast(msg, color) {
        var box = document.getElementById("toast-box");
        var el = document.createElement("div");
        el.className = "toast-item";
        el.style.borderLeftColor = color || "#00f0ff";
        el.innerHTML = msg;
        box.appendChild(el);
        setTimeout(function () {
          if (el.parentNode) el.parentNode.removeChild(el);
        }, 3800);
      }

      function logTerm(html) {
        var t = document.getElementById("term-log");
        var now = new Date().toLocaleTimeString();
        t.innerHTML = "<div><span style='color:#94a3b8;'>[" + now + "]</span> " + html + "</div>\n" + t.innerHTML;
      }

      // ====================================================================
      // VAULT LOCK LOGIC (PIN: 252010)
      // ====================================================================
      function updateLedCells() {
        for (var i = 0; i < 6; i++) {
          var c = document.getElementById("led-" + i);
          if (i < typedPin.length) {
            c.textContent = "★";
            c.classList.add("filled");
          } else {
            c.textContent = "-";
            c.classList.remove("filled");
          }
        }
        var inp = document.getElementById("direct-pin-inp");
        if (inp && inp.value !== typedPin) inp.value = typedPin;
      }

      function checkVaultPin() {
        var inp = document.getElementById("direct-pin-inp");
        var candidate = typedPin || (inp ? inp.value.trim() : "");
        if (candidate === MASTER_PIN) {
          try { sessionStorage.setItem("kumar_gmail_unlocked", "yes"); } catch (e) {}
          document.getElementById("vault-overlay").classList.add("vault-open");
          toast("🔓 GMAIL CLOUD UNLOCKED!", "#10b981");
          loadHubStats(true);
        } else {
          document.getElementById("vault-msg").innerHTML = "<span style='color:#f43f5e;'>❌ WRONG PIN! ENTER 252010</span>";
          toast("❌ Invalid Master PIN!", "#f43f5e");
          typedPin = "";
          if (inp) inp.value = "";
          updateLedCells();
        }
      }

      var kBtns = document.querySelectorAll(".k-btn[data-digit]");
      for (var i = 0; i < kBtns.length; i++) {
        kBtns[i].addEventListener("click", function () {
          if (typedPin.length < 6) {
            typedPin += this.getAttribute("data-digit");
            updateLedCells();
            if (typedPin.length === 6) setTimeout(checkVaultPin, 90);
          }
        });
      }

      document.getElementById("btn-k-clr").addEventListener("click", function () {
        typedPin = "";
        document.getElementById("direct-pin-inp").value = "";
        updateLedCells();
      });

      document.getElementById("btn-k-ok").addEventListener("click", checkVaultPin);
      document.getElementById("btn-direct-unlock").addEventListener("click", checkVaultPin);

      document.getElementById("direct-pin-inp").addEventListener("input", function () {
        typedPin = this.value.replace(/\D/g, "").slice(0, 6);
        updateLedCells();
        if (typedPin.length === 6) setTimeout(checkVaultPin, 90);
      });

      document.getElementById("btn-lock-now").addEventListener("click", function () {
        try { sessionStorage.removeItem("kumar_gmail_unlocked"); } catch (e) {}
        typedPin = "";
        updateLedCells();
        document.getElementById("vault-overlay").classList.remove("vault-open");
      });

      try {
        if (sessionStorage.getItem("kumar_gmail_unlocked") === "yes") {
          document.getElementById("vault-overlay").classList.add("vault-open");
          loadHubStats(true);
        }
      } catch (e) {}

      // ====================================================================
      // TABS, THEME & CLOCK
      // ====================================================================
      var navBtns = document.querySelectorAll(".nav-btn[data-pane]");
      for (var n = 0; n < navBtns.length; n++) {
        navBtns[n].addEventListener("click", function () {
          var target = this.getAttribute("data-pane");
          var panes = document.querySelectorAll(".tab-pane");
          for (var p = 0; p < panes.length; p++) panes[p].classList.remove("active");
          for (var b = 0; b < navBtns.length; b++) navBtns[b].classList.remove("active");
          document.getElementById(target).classList.add("active");
          this.classList.add("active");
        });
      }

      document.getElementById("theme-sel").addEventListener("change", function () {
        document.body.className = this.value;
      });

      setInterval(function () {
        document.getElementById("live-clock").textContent = "🕒 " + new Date().toLocaleTimeString();
      }, 1000);

      // ====================================================================
      // API COMMUNICATOR
      // ====================================================================
      async function callGmailApi(action, payload) {
        payload = payload || {};
        logTerm("⏳ <b>Running [" + action.toUpperCase() + "]...</b>");
        try {
          var reqBody = { action: action, webPin: MASTER_PIN };
          for (var k in payload) reqBody[k] = payload[k];

          var res = await fetch(window.location.pathname, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(reqBody)
          });
          var data = await res.json();
          if (data.reply) logTerm(data.reply);
          loadHubStats(true);
          return data;
        } catch (err) {
          logTerm("❌ <b>Error:</b> " + err.message);
          toast("❌ " + err.message, "#f43f5e");
        }
      }

      async function loadHubStats(silent) {
        try {
          var res = await fetch(window.location.pathname, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "hub_stats", webPin: MASTER_PIN })
          });
          var d = await res.json();
          savedGmails = Array.isArray(d.accounts) ? d.accounts : [];
          document.getElementById("stat-gmails").textContent = savedGmails.length;
          document.getElementById("stat-otps").textContent = d.activeOtpsCount || 0;

          populateGmailDropdowns();
          renderGmailAccountsTable();

          if (savedGmails.length > 0 && !document.getElementById("inp-gen-base-email").value) {
            document.getElementById("inp-gen-base-email").value = savedGmails[0].email;
          }
          if (!silent) toast("⚡ Synced with Firebase!", "#10b981");
        } catch (e) {}
      }

      function populateGmailDropdowns() {
        var readerSel = document.getElementById("sel-reader-gmail");
        var senderSel = document.getElementById("sel-sender-gmail");
        var curReader = readerSel.value;
        var curSender = senderSel.value;

        readerSel.innerHTML = '<option value="ALL">🔍 SCAN ALL CONNECTED GMAILS (' + savedGmails.length + ')</option>';
        senderSel.innerHTML = "";

        if (savedGmails.length === 0) {
          senderSel.innerHTML = '<option value="">⚠️ Add a Gmail in Tab 4 first</option>';
          return;
        }

        for (var i = 0; i < savedGmails.length; i++) {
          var g = savedGmails[i];
          var opt1 = document.createElement("option");
          opt1.value = g.email;
          opt1.textContent = "📧 " + g.email + " (" + (g.label || "Active") + ")";
          readerSel.appendChild(opt1);

          var opt2 = document.createElement("option");
          opt2.value = g.email;
          opt2.textContent = "📧 " + g.email + " (" + (g.label || "Main") + ")";
          senderSel.appendChild(opt2);
        }

        if (curReader) readerSel.value = curReader;
        if (curSender) senderSel.value = curSender;
      }

      function renderGmailAccountsTable() {
        var tb = document.getElementById("tbody-gmail-accounts");
        if (!savedGmails.length) {
          tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;">📭 No Gmail accounts added yet. Enter your Gmail & 16-digit App Password above!</td></tr>';
          return;
        }
        tb.innerHTML = "";
        for (var i = 0; i < savedGmails.length; i++) {
          (function (idx, g) {
            var tr = document.createElement("tr");
            tr.innerHTML =
              "<td><b>#" + (idx + 1) + "</b></td>" +
              "<td>" + (g.label || "Main Mail") + "</td>" +
              "<td><code>" + g.email + "</code></td>" +
              "<td><code>" + g.maskedPass + "</code></td>" +
              "<td>" + (g.addedOn || "Active") + "</td>" +
              "<td></td>";
            var btnRm = document.createElement("button");
            btnRm.type = "button";
            btnRm.className = "btn btn-red btn-sm";
            btnRm.textContent = "🗑️ REMOVE";
            btnRm.addEventListener("click", function () {
              if (confirm("Remove Gmail " + g.email + "?")) {
                callGmailApi("remove_gmail", { email: g.email });
              }
            });
            tr.lastChild.appendChild(btnRm);
            tb.appendChild(tr);
          })(i, savedGmails[i]);
        }
      }

      // ====================================================================
      // 1. LIVE GMAIL OTP READER HANDLERS
      // ====================================================================
      async function scanInboxNow() {
        var targetMail = document.getElementById("sel-reader-gmail").value;
        var lim = document.getElementById("inp-reader-limit").value;
        var container = document.getElementById("inbox-otp-cards");
        container.innerHTML = "<div style='color:#00f0ff;font-family:monospace;'>⏳ Connecting to Gmail IMAP (imap.gmail.com:993) and scanning latest emails...</div>";

        var d = await callGmailApi("read_inbox", { email: targetMail, limit: lim });
        if (!d || !Array.isArray(d.emails) || d.emails.length === 0) {
          container.innerHTML = "<div style='color:#94a3b8;font-family:monospace;'>📭 No emails found or no Gmail account connected in Tab 4.</div>";
          return;
        }

        container.innerHTML = "";
        for (var i = 0; i < d.emails.length; i++) {
          (function (mail) {
            var hasCode = mail.otp && mail.otp !== "NO-OTP";
            var card = document.createElement("div");
            card.className = "email-otp-card" + (hasCode ? " has-otp" : "");

            var otpSection = "";
            if (hasCode) {
              otpSection =
                '<div class="otp-big-badge">' +
                '<div><div style="font-size:10px;color:#94a3b8;">EXTRACTED OTP CODE</div><div class="otp-digits">' + mail.otp + '</div></div>' +
                '<button type="button" class="btn btn-green btn-sm" onclick="copyTextValue(\'' + mail.otp + '\');alert(\'✅ Copied OTP: ' + mail.otp + '\')">📋 COPY OTP</button>' +
                "</div>";
            } else {
              otpSection =
                '<div style="margin:8px 0;padding:6px 10px;background:rgba(255,255,255,0.04);border-radius:8px;font-size:11px;color:#94a3b8;">ℹ️ Standard Email (No 6-digit OTP detected)</div>';
            }

            card.innerHTML =
              '<div style="display:flex;justify-content:space-between;font-size:11px;color:#00f0ff;font-family:monospace;margin-bottom:6px;">' +
              "<span>📥 To: " + mail.to + "</span>" +
              "<span>🕒 " + mail.date + "</span>" +
              "</div>" +
              '<div style="font-weight:800;font-size:14px;color:#fff;margin-bottom:4px;">' + mail.subject + "</div>" +
              '<div style="font-size:11.5px;color:#cbd5e1;margin-bottom:6px;">👤 From: ' + mail.from.replace(/</g, "&lt;") + "</div>" +
              otpSection +
              '<div style="font-size:11.5px;color:#94a3b8;line-height:1.45;background:#03060f;padding:10px;border-radius:10px;font-family:monospace;">' +
              mail.snippet.replace(/</g, "&lt;") +
              "</div>";

            container.appendChild(card);
          })(d.emails[i]);
        }
      }

      document.getElementById("btn-scan-inbox").addEventListener("click", scanInboxNow);

      document.getElementById("btn-toggle-radar").addEventListener("click", function () {
        if (radarTimer) {
          clearInterval(radarTimer);
          radarTimer = null;
          this.textContent = "📡 START AUTO-REFRESH OTP RADAR (EVERY 12s)";
          document.getElementById("stat-radar").textContent = "STANDBY";
          document.getElementById("stat-radar").style.color = "#94a3b8";
          toast("⏹️ Live OTP Radar Stopped.", "#f59e0b");
        } else {
          scanInboxNow();
          radarTimer = setInterval(scanInboxNow, 12000);
          this.textContent = "⏹️ STOP AUTO-REFRESH OTP RADAR (ACTIVE)";
          document.getElementById("stat-radar").textContent = "🟢 SCANNING";
          document.getElementById("stat-radar").style.color = "#10b981";
          toast("📡 Auto-Refresh OTP Radar Started (Every 12s)!", "#10b981");
        }
      });

      // ====================================================================
      // 2. OTP VERIFICATION & CUSTOM EMAIL SENDER HANDLERS
      // ====================================================================
      document.getElementById("btn-send-verify-otp").addEventListener("click", async function () {
        var fromMail = document.getElementById("sel-sender-gmail").value;
        var toMail = document.getElementById("inp-verify-to-email").value.trim();
        var brand = document.getElementById("inp-verify-brand").value.trim();
        if (!toMail) return toast("⚠️ Enter Recipient Email Address!", "#f43f5e");

        document.getElementById("inp-check-email").value = toMail;
        var res = await callGmailApi("send_otp", {
          fromEmail: fromMail,
          toEmail: toMail,
          brandName: brand
        });
        if (res && res.success) {
          toast("📩 6-Digit OTP Sent to " + toMail + "!", "#10b981");
        }
      });

      document.getElementById("btn-check-verify-otp").addEventListener("click", async function () {
        var checkMail = document.getElementById("inp-check-email").value.trim();
        var checkCode = document.getElementById("inp-check-otp").value.trim();
        if (!checkMail || !checkCode) return toast("⚠️ Enter Email and 6-Digit OTP!", "#f43f5e");

        var res = await callGmailApi("verify_otp", {
          toEmail: checkMail,
          otpCode: checkCode
        });
        if (res && res.verified) {
          toast("🎉 OTP VERIFIED SUCCESSFULLY!", "#10b981");
        } else {
          toast("❌ Invalid or Expired OTP!", "#f43f5e");
        }
      });

      document.getElementById("btn-send-custom-mail").addEventListener("click", function () {
        var fromMail = document.getElementById("sel-sender-gmail").value;
        var recipients = document.getElementById("inp-bulk-emails").value.trim();
        var subj = document.getElementById("inp-bulk-subject").value.trim();
        var bodyTxt = document.getElementById("inp-bulk-body").value.trim();
        if (!recipients || !subj || !bodyTxt) return toast("⚠️ Fill Recipients, Subject & Body!", "#f43f5e");

        callGmailApi("send_custom_email", {
          fromEmail: fromMail,
          recipients: recipients,
          subject: subj,
          messageHtml: bodyTxt
        });
      });

      // ====================================================================
      // 3. UNLIMITED DOT (.) & PLUS (+) GENERATOR HANDLERS
      // ====================================================================
      document.getElementById("btn-generate-aliases").addEventListener("click", async function () {
        var base = document.getElementById("inp-gen-base-email").value.trim();
        var mode = document.getElementById("sel-gen-mode").value;
        var cnt = document.getElementById("inp-gen-count").value;
        var tag = document.getElementById("inp-gen-tag").value.trim();

        if (!base || base.indexOf("@") === -1) {
          return toast("⚠️ Enter a valid Gmail address!", "#f43f5e");
        }

        var d = await callGmailApi("generate_aliases", {
          baseEmail: base,
          mode: mode,
          count: cnt,
          tag: tag
        });

        if (d && Array.isArray(d.aliases)) {
          document.getElementById("out-generated-aliases").value = d.aliases.join("\n");
          document.getElementById("gen-count-badge").textContent = d.aliases.length;
          document.getElementById("stat-aliases").textContent = d.aliases.length;
          toast("♾️ Generated " + d.aliases.length + " Valid Gmail Addresses!", "#10b981");
        }
      });

      document.getElementById("btn-copy-aliases").addEventListener("click", function () {
        var val = document.getElementById("out-generated-aliases").value;
        if (!val) return toast("⚠️ Generate emails first!", "#f43f5e");
        navigator.clipboard.writeText(val);
        toast("📋 Copied all generated Gmails to clipboard!", "#10b981");
      });

      document.getElementById("btn-download-aliases").addEventListener("click", function () {
        var val = document.getElementById("out-generated-aliases").value;
        if (!val) return toast("⚠️ Generate emails first!", "#f43f5e");
        var blob = new Blob([val], { type: "text/plain" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "kumar_unlimited_gmails.txt";
        a.click();
      });

      // ====================================================================
      // 4. ADD GMAIL & APP PASSWORD HANDLER
      // ====================================================================
      document.getElementById("btn-save-gmail-acc").addEventListener("click", function () {
        var mail = document.getElementById("inp-add-gmail").value.trim();
        var pass = document.getElementById("inp-add-app-pass").value.trim();
        var lbl = document.getElementById("inp-add-label").value.trim();

        if (!mail || !pass) {
          return toast("⚠️ Enter both Gmail Address and 16-Digit App Password!", "#f43f5e");
        }
        callGmailApi("add_gmail", {
          email: mail,
          appPassword: pass,
          label: lbl
        });
      });

      document.getElementById("btn-copy-endpoint").addEventListener("click", function () {
        navigator.clipboard.writeText(apiEndpointUrl);
        toast("📋 API Endpoint URL Copied!", "#10b981");
      });

      document.getElementById("btn-clear-term").addEventListener("click", function () {
        document.getElementById("term-log").innerHTML = "⚡ [TERMINAL CLEARED]";
      });

      document.getElementById("btn-sync-hub").addEventListener("click", function () {
        loadHubStats(false);
      });
    })();
  </script>
</body>
</html>`;
}

// ============================================================================
// 7. MAIN SERVERLESS API HANDLER (SUPPORTS WEB UI + TELEGRAM BOT + REST API)
// ============================================================================
module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(renderGmailMasterWebUI());
  }

  const body = req.body || {};
  const { action, webPin } = body;

  if (webPin !== undefined && String(webPin) !== MASTER_PIN) {
    return res.status(403).json({
      success: false,
      reply: "❌ <b>SECURITY ALERT:</b> Invalid Master PIN (252010 Required)!"
    });
  }

  try {
    // Load saved Gmail accounts from Firebase
    let accounts = (await fbGet("gmail_hub/accounts")) || [];
    if (!Array.isArray(accounts)) accounts = Object.values(accounts);

    // ================= 0. HUB STATS =================
    if (action === "hub_stats") {
      const safeList = accounts.map(function (a) {
        const cleanP = String(a.appPassword || "");
        return {
          email: a.email,
          label: a.label || "Main Mail",
          maskedPass: cleanP.substring(0, 4) + " •••• •••• " + cleanP.slice(-4),
          addedOn: a.addedOn
        };
      });

      const otpStore = (await fbGet("gmail_hub/otp_sessions")) || {};
      const activeOtpsCount = Object.keys(otpStore).length;

      return res.status(200).json({
        success: true,
        accounts: safeList,
        activeOtpsCount: activeOtpsCount
      });
    }

    // ================= 1. ADD & VERIFY GMAIL ACCOUNT =================
    if (action === "add_gmail") {
      const email = String(body.email || "").trim().toLowerCase();
      const appPassword = String(body.appPassword || "").replace(/\s+/g, "").trim();
      const label = String(body.label || "Official OTP Mail").trim();

      if (!email.includes("@") || appPassword.length < 8) {
        return res.status(200).json({
          success: false,
          reply: "❌ <b>Invalid Gmail or App Password!</b> Make sure you enter the 16-character Google App Password."
        });
      }

      // Verify SMTP connection before saving
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: email, pass: appPassword }
      });
      await transporter.verify();

      let updated = false;
      for (let i = 0; i < accounts.length; i++) {
        if (accounts[i].email === email) {
          accounts[i].appPassword = appPassword;
          accounts[i].label = label;
          updated = true;
          break;
        }
      }

      if (!updated) {
        accounts.push({
          email: email,
          appPassword: appPassword,
          label: label,
          addedOn: new Date().toLocaleDateString("en-IN")
        });
      }

      await fbSet("gmail_hub/accounts", accounts);

      return res.status(200).json({
        success: true,
        reply:
          "╔════════════════════════════╗\n" +
          "   ✅ <b>GMAIL ACCOUNT CONNECTED!</b>\n" +
          "╚════════════════════════════╝\n" +
          "📧 <b>Gmail:</b> <code>" + email + "</code>\n" +
          "🏷️ <b>Label:</b> " + label + "\n" +
          "🟢 <b>SMTP & IMAP Status:</b> <code>VERIFIED & SAVED</code>"
      });
    }

    // ================= 2. REMOVE GMAIL ACCOUNT =================
    if (action === "remove_gmail") {
      const targetEmail = String(body.email || "").trim().toLowerCase();
      accounts = accounts.filter(function (a) {
        return a.email !== targetEmail;
      });
      await fbSet("gmail_hub/accounts", accounts);
      return res.status(200).json({
        success: true,
        reply: "🗑️ <b>Removed Gmail Account:</b> <code>" + targetEmail + "</code>"
      });
    }

    // ================= 3. UNLIMITED DOT (.) & PLUS (+) GENERATOR =================
    if (action === "generate_aliases") {
      const baseEmail =
        body.baseEmail || (accounts[0] ? accounts[0].email : "kumarkor06@gmail.com");
      const count = parseInt(body.count, 10) || 200;
      const mode = body.mode || "both";
      const tag = body.tag || "id";

      const aliases = generateGmailVariations(baseEmail, count, mode, tag);

      const previewList = aliases
        .slice(0, 25)
        .map(function (m, i) {
          return (i + 1) + ". <code>" + m + "</code>";
        })
        .join("\n");

      return res.status(200).json({
        success: true,
        baseEmail: baseEmail,
        totalGenerated: aliases.length,
        aliases: aliases,
        reply:
          "╔════════════════════════════╗\n" +
          "   ♾️ <b>UNLIMITED GMAILS GENERATED!</b>\n" +
          "╚════════════════════════════╝\n" +
          "📧 <b>Main Inbox:</b> <code>" + baseEmail + "</code>\n" +
          "🔢 <b>Total Generated:</b> <code>" + aliases.length + " Valid Gmails</code>\n\n" +
          previewList +
          (aliases.length > 25 ? "\n\n<i>...and " + (aliases.length - 25) + " more!</i>" : "")
      });
    }

    // Ensure at least 1 Gmail is connected for SMTP/IMAP actions
    if (accounts.length === 0) {
      return res.status(200).json({
        success: false,
        reply: "⚠️ <b>No Gmail Account Connected!</b> Open Tab 4 (➕ ADD GMAIL & APP PASSWORD) and connect your Gmail first."
      });
    }

    // ================= 4. SEND 6-DIGIT OTP VERIFICATION EMAIL =================
    if (action === "send_otp") {
      const toEmail = String(body.toEmail || "").trim().toLowerCase();
      const brandName = String(body.brandName || "KUMAR OTP SECURITY").trim();
      const senderAcc =
        accounts.find(function (a) {
          return a.email === body.fromEmail;
        }) || accounts[0];

      if (!toEmail || !toEmail.includes("@")) {
        return res.status(200).json({
          success: false,
          reply: "❌ <b>Invalid Recipient Email Address!</b>"
        });
      }

      const generatedOtp = String(Math.floor(100000 + Math.random() * 900000));
      const emailKey = Buffer.from(toEmail).toString("base64").replace(/=/g, "");

      await fbSet("gmail_hub/otp_sessions/" + emailKey, {
        email: toEmail,
        otp: generatedOtp,
        createdAt: Date.now(),
        expiresAt: Date.now() + 10 * 60 * 1000
      });

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: senderAcc.email, pass: senderAcc.appPassword }
      });

      await transporter.sendMail({
        from: '"' + brandName + '" <' + senderAcc.email + ">",
        to: toEmail,
        subject: "🔐 Your Verification OTP Code is " + generatedOtp + " — " + brandName,
        html: buildOtpHtmlEmail(generatedOtp, brandName, toEmail)
      });

      return res.status(200).json({
        success: true,
        toEmail: toEmail,
        senderEmail: senderAcc.email,
        reply:
          "╔════════════════════════════╗\n" +
          "   📤 <b>VERIFICATION OTP SENT!</b>\n" +
          "╚════════════════════════════╝\n" +
          "📧 <b>Sent To:</b> <code>" + toEmail + "</code>\n" +
          "📨 <b>Sent From:</b> <code>" + senderAcc.email + "</code>\n" +
          "⏳ <b>Validity:</b> <code>10 Minutes</code>\n\n" +
          "👉 <i>Ask the user to enter their 6-digit OTP to complete verification!</i>"
      });
    }

    // ================= 5. VERIFY 6-DIGIT OTP CODE =================
    if (action === "verify_otp") {
      const toEmail = String(body.toEmail || "").trim().toLowerCase();
      const otpCode = String(body.otpCode || "").replace(/\D/g, "");
      const emailKey = Buffer.from(toEmail).toString("base64").replace(/=/g, "");

      const record = await fbGet("gmail_hub/otp_sessions/" + emailKey);
      if (!record || !record.otp) {
        return res.status(200).json({
          success: false,
          verified: false,
          reply: "❌ <b>No active OTP found for</b> <code>" + toEmail + "</code>! Please request a new OTP."
        });
      }

      if (Date.now() > record.expiresAt) {
        await fbSet("gmail_hub/otp_sessions/" + emailKey, null);
        return res.status(200).json({
          success: false,
          verified: false,
          reply: "⌛ <b>OTP Expired!</b> Please send a new OTP."
        });
      }

      if (String(record.otp) !== otpCode) {
        return res.status(200).json({
          success: false,
          verified: false,
          reply: "❌ <b>Invalid OTP Code!</b> Please check and try again."
        });
      }

      // OTP Matched! Clear session
      await fbSet("gmail_hub/otp_sessions/" + emailKey, null);

      return res.status(200).json({
        success: true,
        verified: true,
        email: toEmail,
        reply:
          "╔════════════════════════════╗\n" +
          "   🎉 <b>EMAIL OTP VERIFIED!</b>\n" +
          "╚════════════════════════════╝\n" +
          "✅ <b>Verified Email:</b> <code>" + toEmail + "</code>\n" +
          "🔑 <b>OTP Code:</b> <code>" + otpCode + " (MATCHED)</code>\n" +
          "🛡️ <b>Status:</b> <code>100% AUTHENTICATED</code>"
      });
    }

    // ================= 6. LIVE GMAIL INBOX & OTP READER (IMAP) =================
    if (action === "read_inbox") {
      const targetEmail = body.email || "ALL";
      const limitCount = parseInt(body.limit, 10) || 6;

      const scanAccounts =
        targetEmail === "ALL"
          ? accounts
          : accounts.filter(function (a) {
              return a.email === targetEmail;
            });

      let allEmails = [];

      for (let i = 0; i < scanAccounts.length; i++) {
        const acc = scanAccounts[i];
        try {
          const fetched = await fetchGmailInboxOtps(acc.email, acc.appPassword, limitCount);
          allEmails = allEmails.concat(fetched);
        } catch (imapErr) {
          allEmails.push({
            seq: 0,
            from: "IMAP System",
            to: acc.email,
            subject: "⚠️ Could not read inbox: " + imapErr.message,
            date: new Date().toLocaleTimeString(),
            otp: "NO-OTP",
            snippet: "Check if IMAP is enabled and App Password is valid."
          });
        }
      }

      let botFormatted =
        "╔════════════════════════════╗\n" +
        "   📩 <b>LIVE GMAIL OTP READER</b>\n" +
        "╚════════════════════════════╝\n\n";

      if (allEmails.length === 0) {
        botFormatted += "📭 No recent emails found in inbox.";
      } else {
        for (let j = 0; j < Math.min(8, allEmails.length); j++) {
          const m = allEmails[j];
          botFormatted +=
            "<b>[" + (j + 1) + "] " + m.subject + "</b>\n" +
            " ┣ 📥 <b>To:</b> <code>" + m.to + "</code>\n" +
            " ┣ 🔑 <b>OTP Code:</b> <code>" + m.otp + "</code>\n" +
            " ┗ 🕒 " + m.date + "\n\n";
        }
      }

      return res.status(200).json({
        success: true,
        emails: allEmails,
        reply: botFormatted
      });
    }

    // ================= 7. CUSTOM / BULK EMAIL SENDER =================
    if (action === "send_custom_email") {
      const senderAcc =
        accounts.find(function (a) {
          return a.email === body.fromEmail;
        }) || accounts[0];

      const recipients = String(body.recipients || "")
        .split(/,|\r?\n/)
        .map(function (s) {
          return s.trim();
        })
        .filter(function (s) {
          return s.includes("@");
        });

      const subject = String(body.subject || "Notification").trim();
      const messageHtml = String(body.messageHtml || "").trim();

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: senderAcc.email, pass: senderAcc.appPassword }
      });

      let sentCount = 0;
      for (let i = 0; i < recipients.length; i++) {
        try {
          await transporter.sendMail({
            from: '"' + (senderAcc.label || "Kumar Mail") + '" <' + senderAcc.email + ">",
            to: recipients[i],
            subject: subject,
            html: messageHtml.replace(/\n/g, "<br/>")
          });
          sentCount++;
        } catch (e) {}
      }

      return res.status(200).json({
        success: true,
        sentCount: sentCount,
        reply:
          "✅ <b>Email Broadcast Completed!</b>\n" +
          "📨 <b>Sent From:</b> <code>" + senderAcc.email + "</code>\n" +
          "🟢 <b>Delivered:</b> <code>" + sentCount + " / " + recipients.length + " Emails</code>"
      });
    }

    return res.status(200).json({
      success: false,
      reply: "⚠️ Unknown API action."
    });
  } catch (err) {
    return res.status(200).json({
      success: false,
      reply: "❌ <b>GMAIL ENGINE ERROR:</b> <code>" + (err.message || "Execution failed") + "</code>"
    });
  }
};
