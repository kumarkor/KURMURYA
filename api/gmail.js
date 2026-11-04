const tls = require("tls");

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

// Universal Request Parser (Supports JSON, String Body, and GET Query Params)
function parseRequestPayload(req) {
  let payload = {};
  if (req.query && typeof req.query === "object") {
    for (let k in req.query) payload[k] = req.query[k];
  }
  if (req.body) {
    if (typeof req.body === "string") {
      try {
        const parsed = JSON.parse(req.body);
        for (let k in parsed) payload[k] = parsed[k];
      } catch (e) {}
    } else if (typeof req.body === "object") {
      for (let k in req.body) payload[k] = req.body[k];
    }
  }
  return payload;
}

// ============================================================================
// 2. REAL GMAIL SMTP TLS ENGINE (PORT 465 - SENDS REAL EMAILS WITH 0 PACKAGES)
// ============================================================================
function chunkBase64(b64Str) {
  const chunks = [];
  for (let i = 0; i < b64Str.length; i += 76) {
    chunks.push(b64Str.substring(i, i + 76));
  }
  return chunks.join("\r\n");
}

function sendRealGmailSmtp(options) {
  return new Promise(function (resolve, reject) {
    const user = String(options.user || "").trim();
    const pass = String(options.pass || "").replace(/\s+/g, "").trim();
    const toEmail = String(options.to || "").trim();
    const fromName = String(options.fromName || "KUMAR OTP SECURITY").trim();
    const subject = String(options.subject || "Your Verification OTP Code").trim();
    const htmlBody = String(options.html || "").trim();
    const verifyOnly = Boolean(options.verifyOnly);

    const socket = tls.connect(
      {
        host: "smtp.gmail.com",
        port: 465,
        servername: "smtp.gmail.com",
        rejectUnauthorized: false
      },
      function () {}
    );

    let step = 0;
    let buffer = "";
    let finished = false;

    const timeoutId = setTimeout(function () {
      if (!finished) {
        finished = true;
        try { socket.destroy(); } catch (e) {}
        reject(new Error("Gmail SMTP connection timed out (9s)."));
      }
    }, 9000);

    function doneSuccess(resultObj) {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);
      try { socket.end("QUIT\r\n"); } catch (e) {}
      resolve(resultObj);
    }

    function doneError(errMsg) {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);
      try { socket.destroy(); } catch (e) {}
      reject(new Error(errMsg));
    }

    socket.on("error", function (err) {
      doneError("SMTP TLS Error: " + err.message);
    });

    socket.on("data", function (chunk) {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\r\n");
      buffer = lines.pop() || "";

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.length < 3) continue;
        const code = line.substring(0, 3);
        const isFinalLine = line.length === 3 || line.charAt(3) === " ";
        if (!isFinalLine) continue;

        if (code.charAt(0) === "4" || code.charAt(0) === "5") {
          return doneError(
            "Gmail Rejected (" + code + "): " + line + " — Check your 16-digit Google App Password!"
          );
        }

        if (step === 0 && code === "220") {
          step = 1;
          socket.write("EHLO localhost\r\n");
        } else if (step === 1 && code === "250") {
          step = 2;
          socket.write("AUTH LOGIN\r\n");
        } else if (step === 2 && code === "334") {
          step = 3;
          socket.write(Buffer.from(user).toString("base64") + "\r\n");
        } else if (step === 3 && code === "334") {
          step = 4;
          socket.write(Buffer.from(pass).toString("base64") + "\r\n");
        } else if (step === 4 && code === "235") {
          if (verifyOnly) {
            return doneSuccess({ authenticated: true });
          }
          step = 5;
          socket.write("MAIL FROM:<" + user + ">\r\n");
        } else if (step === 5 && code === "250") {
          step = 6;
          socket.write("RCPT TO:<" + toEmail + ">\r\n");
        } else if (step === 6 && code === "250") {
          step = 7;
          socket.write("DATA\r\n");
        } else if (step === 7 && code === "354") {
          step = 8;
          const b64Subj = "=?UTF-8?B?" + Buffer.from(subject, "utf8").toString("base64") + "?=";
          const b64Html = chunkBase64(Buffer.from(htmlBody, "utf8").toString("base64"));
          const msgId = "<" + Date.now() + "." + Math.random().toString(36).substring(2) + "@gmail.com>";

          const rawMime =
            "Date: " + new Date().toUTCString() + "\r\n" +
            "Message-ID: " + msgId + "\r\n" +
            'From: "' + fromName.replace(/"/g, "") + '" <' + user + ">\r\n" +
            "To: <" + toEmail + ">\r\n" +
            "Subject: " + b64Subj + "\r\n" +
            "MIME-Version: 1.0\r\n" +
            "Content-Type: text/html; charset=UTF-8\r\n" +
            "Content-Transfer-Encoding: base64\r\n" +
            "\r\n" +
            b64Html + "\r\n" +
            ".\r\n";

          socket.write(rawMime);
        } else if (step === 8 && code === "250") {
          return doneSuccess({ sent: true });
        }
      }
    });
  });
}

// ============================================================================
// 3. REAL GMAIL IMAP TLS ENGINE (PORT 993 - READS LIVE OTP FROM GMAIL INBOX)
// ============================================================================
function extractOtpCode(subject, bodyText) {
  const combined = String(subject || "") + " " + String(bodyText || "");
  const kwMatch = combined.match(
    /(?:code|otp|pin|verification|passcode|password|verify)[^0-9]{0,25}\b(\d{4,8})\b/i
  );
  if (kwMatch && kwMatch[1]) return kwMatch[1];

  const nums = combined.match(/\b(\d{5,6})\b/g);
  if (nums && nums.length > 0) {
    for (let i = 0; i < nums.length; i++) {
      const v = nums[i];
      if (v !== "2024" && v !== "2025" && v !== "2026" && v !== "2027" && v !== "000000") {
        return v;
      }
    }
  }
  return "NO-OTP";
}

function readRealGmailImap(emailUser, appPassword, limitCount) {
  return new Promise(function (resolve, reject) {
    const user = String(emailUser || "").trim();
    const pass = String(appPassword || "").replace(/\s+/g, "").trim();
    const maxFetch = Math.min(10, Math.max(1, parseInt(limitCount, 10) || 6));

    const socket = tls.connect(
      {
        host: "imap.gmail.com",
        port: 993,
        servername: "imap.gmail.com",
        rejectUnauthorized: false
      },
      function () {}
    );

    let step = 0;
    let rawBuffer = "";
    let fetchBuffer = "";
    let totalExists = 0;
    let finished = false;

    const timer = setTimeout(function () {
      if (!finished) {
        finished = true;
        try { socket.destroy(); } catch (e) {}
        reject(new Error("Gmail IMAP connection timed out (9s)."));
      }
    }, 9000);

    function finishOk(list) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { socket.end("A4 LOGOUT\r\n"); } catch (e) {}
      resolve(list);
    }

    function finishErr(msg) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { socket.destroy(); } catch (e) {}
      reject(new Error(msg));
    }

    socket.on("error", function (err) {
      finishErr("IMAP Socket Error: " + err.message);
    });

    socket.on("data", function (chunk) {
      const str = chunk.toString("utf8");
      rawBuffer += str;

      if (step === 0 && rawBuffer.indexOf("* OK") !== -1) {
        step = 1;
        rawBuffer = "";
        socket.write('A1 LOGIN "' + user + '" "' + pass + '"\r\n');
      } else if (step === 1) {
        if (rawBuffer.indexOf("A1 OK") !== -1) {
          step = 2;
          rawBuffer = "";
          socket.write("A2 SELECT INBOX\r\n");
        } else if (rawBuffer.indexOf("A1 NO") !== -1 || rawBuffer.indexOf("A1 BAD") !== -1) {
          return finishErr("IMAP Login Failed for " + user + " (Check App Password)");
        }
      } else if (step === 2) {
        const exMatch = rawBuffer.match(/\*\s+(\d+)\s+EXISTS/i);
        if (exMatch) totalExists = parseInt(exMatch[1], 10) || 0;
        if (rawBuffer.indexOf("A2 OK") !== -1) {
          if (totalExists === 0) return finishOk([]);
          step = 3;
          rawBuffer = "";
          const startSeq = Math.max(1, totalExists - maxFetch + 1);
          socket.write(
            "A3 FETCH " +
              startSeq +
              ":" +
              totalExists +
              " (BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE)] BODY.PEEK[TEXT]<0.1200>)\r\n"
          );
        }
      } else if (step === 3) {
        fetchBuffer += str;
        if (
          fetchBuffer.indexOf("A3 OK") !== -1 ||
          fetchBuffer.indexOf("A3 NO") !== -1 ||
          fetchBuffer.indexOf("A3 BAD") !== -1
        ) {
          const parsed = [];
          const blocks = fetchBuffer.split(/\*\s+\d+\s+FETCH\s+\(/i);

          for (let b = 1; b < blocks.length; b++) {
            const blk = blocks[b];
            const subjM = blk.match(/Subject:\s*([^\r\n]+)/i);
            const fromM = blk.match(/From:\s*([^\r\n]+)/i);
            const toM = blk.match(/To:\s*([^\r\n]+)/i);
            const dateM = blk.match(/Date:\s*([^\r\n]+)/i);

            let subject = subjM ? subjM[1].trim() : "(No Subject)";
            const fromStr = fromM ? fromM[1].trim() : "Unknown";
            const toStr = toM ? toM[1].trim() : user;
            const dateStr = dateM ? dateM[1].substring(0, 24).trim() : "Recent";

            if (subject.indexOf("=?UTF-8?B?") !== -1 || subject.indexOf("=?utf-8?B?") !== -1) {
              try {
                const b64 = subject.split(/\?[Bb]\?/)[1].split("?=")[0];
                subject = Buffer.from(b64, "base64").toString("utf8");
              } catch (e) {}
            }

            let cleanTxt = blk
              .replace(/[\r\n]+/g, " ")
              .replace(/=3D/g, "=")
              .replace(/<style[^>]*>.*?<\/style>/gi, " ")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim();

            const otp = extractOtpCode(subject, cleanTxt);
            parsed.push({
              from: fromStr,
              to: toStr,
              subject: subject,
              date: dateStr,
              otp: otp,
              snippet: cleanTxt.substring(0, 250)
            });
          }

          return finishOk(parsed.reverse());
        }
      }
    });
  });
}

// ============================================================================
// 4. UNLIMITED DOT (.) & PLUS (+) GMAIL GENERATOR
// ============================================================================
function generateGmailAliases(baseEmail, maxCount, mode, customTag) {
  const clean = String(baseEmail || "").trim().toLowerCase();
  const parts = clean.split("@");
  if (parts.length !== 2) return [];

  const rawUser = parts[0].split("+")[0].replace(/\./g, "");
  const domain = parts[1];
  const results = [];
  const limit = Math.min(2500, Math.max(10, parseInt(maxCount, 10) || 300));
  const tag = String(customTag || "vip").replace(/[^a-zA-Z0-9]/g, "");

  if (mode === "dot" || mode === "both") {
    const n = rawUser.length;
    const maxMasks = Math.min(limit, Math.pow(2, Math.min(n - 1, 12)));
    for (let mask = 1; mask < maxMasks; mask++) {
      let str = "";
      for (let i = 0; i < n; i++) {
        str += rawUser[i];
        if (i < n - 1 && (mask & (1 << i)) !== 0) str += ".";
      }
      results.push(str + "@" + domain);
      if (results.length >= limit && mode === "dot") break;
    }
  }

  if (mode === "plus" || mode === "both") {
    let idx = 1;
    while (results.length < limit) {
      results.push(rawUser + "+" + tag + idx + "@" + domain);
      idx++;
    }
  }

  return results.slice(0, limit);
}

// ============================================================================
// 5. SUPER STYLISH HTML OTP EMAIL TEMPLATE (SENT TO USER'S REAL GMAIL)
// ============================================================================
function createStylishOtpEmailHtml(otpCode, brandName, recipientEmail) {
  return (
    '<div style="background-color:#040711;padding:35px 15px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#f8fafc;">' +
    '<div style="max-width:480px;margin:0 auto;background:linear-gradient(145deg,#0f172a,#090d16);border:2px solid #00f0ff;border-radius:22px;padding:30px 24px;text-align:center;box-shadow:0 10px 40px rgba(0,240,255,0.2);">' +
    '<div style="display:inline-block;background:rgba(0,240,255,0.12);border:1px solid #00f0ff;color:#00f0ff;padding:6px 16px;border-radius:99px;font-size:11px;font-weight:800;letter-spacing:1.5px;margin-bottom:16px;">' +
    "👑 " + (brandName || "KUMAR OFFICIAL BOT VERIFICATION") + " 👑" +
    "</div>" +
    '<h1 style="margin:0 0 10px;color:#ffffff;font-size:23px;font-weight:800;">Verify Your Gmail Account</h1>' +
    '<p style="color:#cbd5e1;font-size:14px;line-height:1.6;margin:0 0 22px;">' +
    "Hello <b>" + recipientEmail + "</b>,<br/>" +
    "Copy the 6-digit OTP verification code below and paste it inside the Telegram Bot to unlock your account:" +
    "</p>" +
    '<div style="background:#020617;border:2px dashed #10b981;border-radius:16px;padding:20px;margin-bottom:22px;">' +
    '<div style="font-size:11px;color:#94a3b8;letter-spacing:1.5px;margin-bottom:6px;font-weight:700;">YOUR 6-DIGIT VERIFICATION OTP</div>' +
    '<div style="font-family:Courier New,monospace;font-size:36px;font-weight:900;letter-spacing:8px;color:#10b981;">' +
    otpCode +
    "</div>" +
    "</div>" +
    '<p style="color:#64748b;font-size:12px;line-height:1.5;margin:0;">' +
    "⏳ This verification code is valid for <b>10 minutes</b>.<br/>If you did not request this code, please ignore this email." +
    "</p>" +
    "</div>" +
    "</div>"
  );
}

// ============================================================================
// 6. SUPER STYLISH WEB CONTROL PANEL HTML (String.raw = ZERO SYNTAX BUGS)
// ============================================================================
function renderMasterWebsiteHtml() {
  return String.raw`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>👑 KUMAR GMAIL OTP VERIFICATION & LIVE READER CLOUD 👑</title>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800;900&family=Plus+Jakarta+Sans:wght@500;600;700;800&family=JetBrains+Mono:wght@500;700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg-deep: #030712;
      --bg-card: rgba(15, 23, 42, 0.92);
      --bg-input: #050a14;
      --accent: #00f0ff;
      --accent-glow: rgba(0, 240, 255, 0.42);
      --accent-2: #8b5cf6;
      --success: #10b981;
      --danger: #f43f5e;
      --warning: #f59e0b;
      --text-main: #f8fafc;
      --text-sub: #cbd5e1;
      --text-dim: #94a3b8;
      --border-glass: rgba(0, 240, 255, 0.28);
      --border-strong: rgba(0, 240, 255, 0.8);
      --grad-main: linear-gradient(135deg, #00f0ff 0%, #3b82f6 50%, #8b5cf6 100%);
      --grad-btn: linear-gradient(90deg, #00f0ff, #0284c7);
    }

    body.theme-gold {
      --bg-deep: #080414;
      --bg-card: rgba(24, 12, 48, 0.92);
      --bg-input: #090414;
      --accent: #f59e0b;
      --accent-glow: rgba(245, 158, 11, 0.42);
      --border-glass: rgba(245, 158, 11, 0.3);
      --border-strong: rgba(245, 158, 11, 0.8);
      --grad-main: linear-gradient(135deg, #f59e0b 0%, #ec4899 50%, #8b5cf6 100%);
      --grad-btn: linear-gradient(90deg, #f59e0b, #d97706);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }

    body {
      background-color: var(--bg-deep);
      color: var(--text-main);
      font-family: 'Plus Jakarta Sans', sans-serif;
      min-height: 100vh;
      overflow-x: hidden;
      background-image:
        radial-gradient(circle at 12% 15%, var(--accent-glow) 0%, transparent 35%),
        radial-gradient(circle at 88% 85%, rgba(139, 92, 246, 0.35) 0%, transparent 35%);
      background-attachment: fixed;
    }

    /* SECURITY LOCK OVERLAY (PIN: 252010) */
    #vault-overlay {
      position: fixed; inset: 0; z-index: 99999;
      background: radial-gradient(circle at top, #0f172a 0%, #020617 100%);
      display: flex; align-items: center; justify-content: center; padding: 16px;
      transition: opacity 0.35s ease, visibility 0.35s ease;
    }
    #vault-overlay.vault-open { opacity: 0; visibility: hidden; pointer-events: none; }

    .vault-card {
      width: 100%; max-width: 420px;
      background: rgba(11, 19, 37, 0.96);
      border: 2px solid var(--border-strong);
      border-radius: 28px; padding: 26px 20px;
      box-shadow: 0 0 65px var(--accent-glow); text-align: center;
    }
    .vault-badge {
      display: inline-block; background: rgba(0, 240, 255, 0.12);
      border: 1px solid var(--accent); color: var(--accent);
      padding: 6px 16px; border-radius: 99px; font-family: 'JetBrains Mono', monospace;
      font-size: 11px; font-weight: 800; letter-spacing: 1.5px; margin-bottom: 12px;
    }
    .vault-title { font-family: 'Orbitron', sans-serif; font-size: 21px; font-weight: 900; color: var(--accent); margin-bottom: 6px; }
    .vault-sub { font-size: 13px; color: var(--text-sub); margin-bottom: 16px; }
    .led-row { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 14px; }
    .led-cell {
      height: 48px; background: #040812; border: 1.5px solid var(--border-glass);
      border-radius: 12px; display: flex; align-items: center; justify-content: center;
      font-family: 'JetBrains Mono', monospace; font-size: 22px; font-weight: 800; color: var(--accent);
    }
    .led-cell.filled { border-color: var(--accent); background: rgba(0, 240, 255, 0.15); box-shadow: 0 0 14px var(--accent-glow); }
    .direct-pin-bar { display: flex; gap: 8px; margin-bottom: 14px; }
    .direct-pin-inp {
      flex: 1; padding: 12px; background: #040812; border: 1.5px solid var(--border-glass);
      border-radius: 12px; color: #fff; font-family: 'JetBrains Mono', monospace;
      font-size: 16px; text-align: center; letter-spacing: 5px; outline: none;
    }
    .direct-pin-btn {
      background: var(--grad-btn); color: #020617; border: none; border-radius: 12px;
      padding: 0 18px; font-family: 'JetBrains Mono', monospace; font-weight: 800; cursor: pointer;
    }
    .keypad-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 12px; }
    .k-btn {
      background: rgba(20, 32, 60, 0.9); border: 1px solid var(--border-glass); border-bottom: 3px solid var(--accent);
      border-radius: 14px; padding: 12px 0; color: #fff; font-family: 'JetBrains Mono', monospace;
      font-size: 20px; font-weight: 800; cursor: pointer;
    }

    /* MAIN DASHBOARD */
    .shell { max-width: 1240px; margin: 0 auto; padding: 16px 14px 100px; }
    .top-header {
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(8, 13, 26, 0.96));
      border: 1.5px solid var(--border-strong); border-radius: 24px; padding: 18px 22px; margin-bottom: 16px;
      box-shadow: 0 10px 35px rgba(0, 0, 0, 0.6), 0 0 25px var(--accent-glow);
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px;
    }
    .brand-left { display: flex; align-items: center; gap: 14px; }
    .brand-icon { width: 56px; height: 56px; border-radius: 16px; background: var(--grad-main); display: flex; align-items: center; justify-content: center; font-size: 28px; }
    .brand-titles h1 { font-family: 'Orbitron', sans-serif; font-size: 19px; font-weight: 900; color: var(--accent); }
    .brand-titles p { font-size: 12px; color: var(--text-sub); margin-top: 2px; }
    .header-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .pill-select { background: var(--bg-input); border: 1px solid var(--border-glass); color: var(--accent); padding: 8px 12px; border-radius: 12px; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; }
    .btn-lock { background: rgba(244, 63, 94, 0.18); border: 1px solid var(--danger); color: #fda4af; padding: 8px 14px; border-radius: 12px; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 800; cursor: pointer; }

    .stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .stat-tile { background: var(--bg-card); border: 1px solid var(--border-glass); border-radius: 18px; padding: 15px 16px; }
    .stat-tile .lbl { font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--text-dim); margin-bottom: 4px; }
    .stat-tile .val { font-family: 'JetBrains Mono', monospace; font-size: 25px; font-weight: 800; color: var(--accent); }
    .stat-tile .sub { font-size: 11px; color: var(--text-sub); margin-top: 4px; }

    .nav-tabs { display: grid; grid-template-columns: repeat(auto-fit, minmax(185px, 1fr)); gap: 8px; margin-bottom: 16px; }
    .nav-btn { background: var(--bg-card); border: 1px solid var(--border-glass); border-radius: 14px; padding: 13px 10px; color: var(--text-sub); font-size: 12px; font-weight: 800; text-align: center; cursor: pointer; }
    .nav-btn.active { background: var(--grad-main); color: #ffffff; border-color: #ffffff; box-shadow: 0 0 22px var(--accent-glow); }
    .tab-pane { display: none; }
    .tab-pane.active { display: block; }

    .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); gap: 16px; margin-bottom: 16px; }
    .card-box { background: var(--bg-card); border: 1px solid var(--border-glass); border-radius: 22px; padding: 20px; margin-bottom: 16px; }
    .card-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; padding-bottom: 12px; margin-bottom: 14px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); }
    .card-title { font-size: 14.5px; font-weight: 800; color: var(--accent); display: flex; align-items: center; gap: 8px; }
    .chip-tag { background: rgba(0, 240, 255, 0.14); border: 1px solid var(--accent); color: var(--accent); padding: 3px 10px; border-radius: 99px; font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 800; }

    .field { margin-bottom: 12px; }
    .field label { display: flex; justify-content: space-between; font-size: 11px; font-weight: 800; color: var(--text-sub); margin-bottom: 5px; text-transform: uppercase; }
    .field label span { color: var(--accent); font-family: 'JetBrains Mono', monospace; }
    .inp, .txtarea, .sel { width: 100%; padding: 12px 14px; background: var(--bg-input); border: 1.5px solid var(--border-glass); border-radius: 13px; color: #ffffff; font-family: 'JetBrains Mono', monospace; font-size: 13.5px; outline: none; }
    .txtarea { min-height: 110px; resize: vertical; }

    .btn { width: 100%; padding: 13px 16px; border: none; border-radius: 13px; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 12.5px; font-weight: 800; text-transform: uppercase; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 8px; }
    .btn-primary { background: var(--grad-btn); color: #020617; }
    .btn-green { background: linear-gradient(90deg, #10b981, #059669); color: #ffffff; }
    .btn-purple { background: linear-gradient(90deg, #8b5cf6, #ec4899); color: #ffffff; }
    .btn-red { background: linear-gradient(90deg, #f43f5e, #e11d48); color: #ffffff; }
    .btn-outline { background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-glass); color: var(--accent); }
    .btn-sm { width: auto; padding: 7px 13px; font-size: 11px; margin-bottom: 0; }

    .terminal-log { background: #02050c; border: 1.5px solid var(--border-strong); border-radius: 16px; padding: 14px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #7dd3fc; max-height: 220px; overflow-y: auto; line-height: 1.6; white-space: pre-wrap; }
    .otp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(310px, 1fr)); gap: 14px; }
    .email-otp-card { background: #060c1a; border: 1.5px solid var(--border-glass); border-radius: 16px; padding: 16px; }
    .email-otp-card.has-otp { border-color: var(--success); }
    .otp-big-badge { display: flex; align-items: center; justify-content: space-between; background: rgba(16, 185, 129, 0.14); border: 1px dashed var(--success); border-radius: 12px; padding: 10px 14px; margin: 10px 0; }
    .otp-digits { font-family: 'JetBrains Mono', monospace; font-size: 24px; font-weight: 900; color: #34d399; letter-spacing: 4px; }
    .info-note { background: rgba(0, 240, 255, 0.08); border: 1px dashed var(--accent); border-radius: 14px; padding: 12px 15px; font-size: 12.5px; color: var(--text-sub); margin-bottom: 14px; line-height: 1.55; }
    .table-wrap { width: 100%; overflow-x: auto; }
    .cyber-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    .cyber-table th { background: rgba(0, 240, 255, 0.1); color: var(--accent); font-family: 'JetBrains Mono', monospace; font-size: 11px; text-align: left; padding: 11px 13px; border-bottom: 1px solid var(--border-glass); }
    .cyber-table td { padding: 12px 13px; border-bottom: 1px solid rgba(255, 255, 255, 0.07); font-family: 'JetBrains Mono', monospace; color: #fff; }
    #toast-box { position: fixed; bottom: 20px; right: 20px; z-index: 100000; display: flex; flex-direction: column; gap: 8px; }
    .toast-item { background: #0f172a; border-left: 4px solid var(--accent); border: 1px solid var(--border-glass); color: #fff; padding: 12px 16px; border-radius: 12px; font-family: 'JetBrains Mono', monospace; font-size: 12px; }
  </style>
</head>
<body>

  <!-- 1. SECURITY LOCK OVERLAY (PIN: 252010) -->
  <div id="vault-overlay">
    <div class="vault-card">
      <div class="vault-badge">📧 REAL GMAIL SMTP & IMAP VAULT 📧</div>
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
      <div id="vault-msg" style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent);">🛡️ NATIVE TLS ENGINE • REAL GMAIL DELIVERY</div>
    </div>
  </div>

  <!-- 2. MAIN DASHBOARD -->
  <div class="shell">
    <header class="top-header">
      <div class="brand-left">
        <div class="brand-icon">📧</div>
        <div class="brand-titles">
          <h1>KUMAR REAL GMAIL OTP & BOT VERIFICATION SERVER</h1>
          <p>Real SMTP Email Sender (Port 465) • Live IMAP Inbox Reader (Port 993) • Unlimited Gmails • Bot API</p>
        </div>
      </div>
      <div class="header-right">
        <select class="pill-select" id="theme-sel">
          <option value="">🔵 CYBER NEON BLUE</option>
          <option value="theme-gold">👑 ROYAL GOLD PLASMA</option>
        </select>
        <button type="button" class="btn-lock" id="btn-lock-now">🔒 LOCK</button>
      </div>
    </header>

    <section class="stats-row">
      <div class="stat-tile">
        <div class="lbl">📧 Connected Gmails</div>
        <div class="val" id="stat-gmails">0</div>
        <div class="sub">🟢 Auto-Rotating SMTP</div>
      </div>
      <div class="stat-tile">
        <div class="lbl">🛡️ Pending Bot OTPs</div>
        <div class="val" id="stat-otps">0</div>
        <div class="sub">🔑 Waiting Verification</div>
      </div>
      <div class="stat-tile">
        <div class="lbl">♾️ Generated Aliases</div>
        <div class="val" id="stat-aliases">0</div>
        <div class="sub">⚡ Dot (.) & Plus (+) Trick</div>
      </div>
      <div class="stat-tile">
        <div class="lbl">🌐 Live API Endpoint</div>
        <div class="val" style="font-size:15px;color:#10b981;">ONLINE</div>
        <div class="sub">🤖 Ready for Bots.Business</div>
      </div>
    </section>

    <div class="nav-tabs">
      <button type="button" class="nav-btn active" data-pane="pane-accounts">➕ 1. ADD GMAILS & APP PASS</button>
      <button type="button" class="nav-btn" data-pane="pane-verify">📤 2. SEND & VERIFY REAL OTP</button>
      <button type="button" class="nav-btn" data-pane="pane-reader">📩 3. LIVE GMAIL OTP READER</button>
      <button type="button" class="nav-btn" data-pane="pane-generator">♾️ 4. DOT / PLUS GENERATOR</button>
    </div>

    <div class="card-box">
      <div class="card-head">
        <div class="card-title">🖥️ LIVE SERVER EXECUTION TERMINAL</div>
        <div style="display:flex;gap:8px;">
          <button type="button" class="btn btn-outline btn-sm" id="btn-copy-api-url">📋 COPY MY API URL FOR BOT</button>
          <button type="button" class="btn btn-outline btn-sm" id="btn-sync-hub">🔄 REFRESH</button>
        </div>
      </div>
      <div class="terminal-log" id="term-log">👑 [REAL SMTP/IMAP SERVER ONLINE]: First add at least 1 Gmail & 16-Digit App Password below so the server can send real OTP emails!</div>
    </div>

    <!-- PANE 1: ADD UNLIMITED GMAILS & APP PASSWORDS -->
    <div id="pane-accounts" class="tab-pane active">
      <div class="info-note">
        ➕ <b>STEP 1 — ADD YOUR SENDER GMAIL & 16-DIGIT APP PASSWORD:</b> When a user joins your Telegram Bot and enters their Gmail, this server uses your connected Gmail(s) below to send a <b>100% REAL Verification OTP Email</b> to their inbox! You can add 1 or 100+ Gmails (the server automatically rotates them).
      </div>

      <div class="grid-2">
        <div class="card-box">
          <div class="card-head"><div class="card-title">➕ ADD SINGLE GMAIL & APP PASSWORD</div><span class="chip-tag">REAL SMTP TEST</span></div>
          <div class="field">
            <label><span>1. YOUR GMAIL ADDRESS</span><span>*REQUIRED</span></label>
            <input type="email" id="inp-add-gmail" class="inp" placeholder="e.g. kumarkor06@gmail.com" />
          </div>
          <div class="field">
            <label><span>2. GOOGLE 16-DIGIT APP PASSWORD</span><span>*REQUIRED</span></label>
            <input type="text" id="inp-add-app-pass" class="inp" placeholder="e.g. abcd efgh ijkl mnop" />
          </div>
          <div class="field">
            <label><span>3. SENDER BRAND / LABEL</span><span>OPTIONAL</span></label>
            <input type="text" id="inp-add-label" class="inp" value="KUMAR OFFICIAL BOT" />
          </div>
          <button type="button" class="btn btn-green" id="btn-save-gmail-acc">✅ VERIFY SMTP & SAVE GMAIL ACCOUNT</button>
        </div>

        <div class="card-box">
          <div class="card-head"><div class="card-title">🚀 BULK ADD MULTIPLE GMAILS (1 PER LINE)</div><span class="chip-tag">UNLIMITED</span></div>
          <div class="field">
            <label><span>FORMAT: email@gmail.com:16_digit_app_password</span><span>BULK IMPORT</span></label>
            <textarea id="inp-bulk-gmails" class="txtarea" style="min-height:138px;" placeholder="kumar1@gmail.com:abcd efgh ijkl mnop&#10;kumar2@gmail.com:wxyz 1234 5678 abcd"></textarea>
          </div>
          <button type="button" class="btn btn-primary" id="btn-bulk-save-gmails">🚀 BULK SAVE ALL GMAIL ACCOUNTS</button>
        </div>
      </div>

      <div class="card-box">
        <div class="card-head"><div class="card-title">📧 CONNECTED GMAIL ACCOUNTS IN FIREBASE</div></div>
        <div class="table-wrap">
          <table class="cyber-table">
            <thead>
              <tr><th>#</th><th>LABEL</th><th>GMAIL ADDRESS</th><th>APP PASSWORD</th><th>ADDED ON</th><th>ACTION</th></tr>
            </thead>
            <tbody id="tbody-gmail-accounts"></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- PANE 2: SEND & VERIFY REAL OTP -->
    <div id="pane-verify" class="tab-pane">
      <div class="grid-2">
        <div class="card-box">
          <div class="card-head"><div class="card-title">📤 STEP 1: SEND REAL OTP EMAIL TO ANY GMAIL</div><span class="chip-tag">REAL SMTP 465</span></div>
          <div class="field">
            <label><span>SEND FROM (CONNECTED GMAIL)</span><span>AUTO-ROTATE</span></label>
            <select id="sel-sender-gmail" class="sel"><option value="AUTO">🔄 AUTO-ROTATE ALL CONNECTED GMAILS</option></select>
          </div>
          <div class="field">
            <label><span>RECIPIENT GMAIL ADDRESS (TO RECEIVE REAL OTP)</span><span>*REQUIRED</span></label>
            <input type="email" id="inp-verify-to-email" class="inp" placeholder="Enter target Gmail (e.g. friend@gmail.com)" />
          </div>
          <div class="field">
            <label><span>BRAND NAME ON EMAIL</span><span>CUSTOM</span></label>
            <input type="text" id="inp-verify-brand" class="inp" value="KUMAR OFFICIAL BOT" />
          </div>
          <button type="button" class="btn btn-primary" id="btn-send-verify-otp">📤 SEND REAL 6-DIGIT OTP TO GMAIL NOW</button>
        </div>

        <div class="card-box">
          <div class="card-head"><div class="card-title">✅ STEP 2: VERIFY USER'S 6-DIGIT OTP</div><span class="chip-tag">FIREBASE CHECK</span></div>
          <div class="field">
            <label><span>RECIPIENT GMAIL TO CHECK</span><span>*REQUIRED</span></label>
            <input type="email" id="inp-check-email" class="inp" placeholder="e.g. friend@gmail.com" />
          </div>
          <div class="field">
            <label><span>ENTER 6-DIGIT OTP RECEIVED IN GMAIL</span><span>6 DIGITS</span></label>
            <input type="tel" id="inp-check-otp" class="inp" maxlength="6" placeholder="e.g. 482910" />
          </div>
          <button type="button" class="btn btn-green" id="btn-check-verify-otp">✅ CHECK & VERIFY OTP NOW</button>
        </div>
      </div>
    </div>

    <!-- PANE 3: LIVE GMAIL OTP READER (REAL IMAP) -->
    <div id="pane-reader" class="tab-pane">
      <div class="card-box">
        <div class="card-head"><div class="card-title">📩 READ LIVE INCOMING OTPs FROM GMAIL INBOX</div><span class="chip-tag">REAL IMAP 993</span></div>
        <div class="grid-2">
          <div class="field">
            <label><span>SELECT GMAIL ACCOUNT TO SCAN</span><span>DROPDOWN</span></label>
            <select id="sel-reader-gmail" class="sel"><option value="ALL">🔍 SCAN ALL CONNECTED GMAIL ACCOUNTS</option></select>
          </div>
          <div class="field">
            <label><span>EMAILS TO FETCH</span><span>1 TO 10</span></label>
            <input type="number" id="inp-reader-limit" class="inp" value="6" min="1" max="10" />
          </div>
        </div>
        <button type="button" class="btn btn-primary" id="btn-scan-inbox">📩 SCAN REAL GMAIL INBOX FOR OTP CODES</button>
      </div>

      <div class="card-box">
        <div class="card-head"><div class="card-title">📬 EXTRACTED INBOX EMAILS & OTP CODES</div></div>
        <div class="otp-grid" id="inbox-otp-cards"></div>
      </div>
    </div>

    <!-- PANE 4: UNLIMITED DOT/PLUS GENERATOR -->
    <div id="pane-generator" class="tab-pane">
      <div class="grid-2">
        <div class="card-box">
          <div class="card-head"><div class="card-title">♾️ UNLIMITED DOT (.) & PLUS (+) GMAIL GENERATOR</div></div>
          <div class="field">
            <label><span>MAIN GMAIL ADDRESS</span><span>*REQUIRED</span></label>
            <input type="email" id="inp-gen-base-email" class="inp" placeholder="e.g. kumarkor06@gmail.com" />
          </div>
          <div class="field">
            <label><span>HOW MANY GMAILS TO GENERATE?</span><span>MAX 2500</span></label>
            <input type="number" id="inp-gen-count" class="inp" value="500" min="10" max="2500" />
          </div>
          <button type="button" class="btn btn-primary" id="btn-generate-aliases">♾️ GENERATE UNLIMITED GMAILS NOW</button>
        </div>
        <div class="card-box">
          <div class="card-head">
            <div class="card-title">📋 GENERATED GMAILS (<span id="gen-count-badge">0</span>)</div>
            <button type="button" class="btn btn-green btn-sm" id="btn-copy-aliases">📋 COPY ALL</button>
          </div>
          <textarea id="out-generated-aliases" class="txtarea" style="min-height:200px;color:#34d399;" readonly></textarea>
        </div>
      </div>
    </div>
  </div>

  <div id="toast-box"></div>

  <script>
    function copyTextValue(val) { navigator.clipboard.writeText(val); }
    (function () {
      var MASTER_PIN = "252010";
      var typedPin = "";
      var savedGmails = [];
      var apiEndpointUrl = window.location.origin + window.location.pathname;

      function toast(msg, color) {
        var box = document.getElementById("toast-box");
        var el = document.createElement("div");
        el.className = "toast-item";
        el.style.borderLeftColor = color || "#00f0ff";
        el.innerHTML = msg;
        box.appendChild(el);
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 3800);
      }

      function logTerm(html) {
        var t = document.getElementById("term-log");
        var now = new Date().toLocaleTimeString();
        t.innerHTML = "<div><span style='color:#94a3b8;'>[" + now + "]</span> " + html + "</div>\n" + t.innerHTML;
      }

      function updateLedCells() {
        for (var i = 0; i < 6; i++) {
          var c = document.getElementById("led-" + i);
          if (i < typedPin.length) { c.textContent = "★"; c.classList.add("filled"); }
          else { c.textContent = "-"; c.classList.remove("filled"); }
        }
        var inp = document.getElementById("direct-pin-inp");
        if (inp && inp.value !== typedPin) inp.value = typedPin;
      }

      function checkVaultPin() {
        var inp = document.getElementById("direct-pin-inp");
        var candidate = typedPin || (inp ? inp.value.trim() : "");
        if (candidate === MASTER_PIN) {
          try { sessionStorage.setItem("kumar_real_gmail_unlocked", "yes"); } catch (e) {}
          document.getElementById("vault-overlay").classList.add("vault-open");
          toast("🔓 VAULT UNLOCKED!", "#10b981");
          loadHubStats(true);
        } else {
          document.getElementById("vault-msg").innerHTML = "<span style='color:#f43f5e;'>❌ WRONG PIN! ENTER 252010</span>";
          typedPin = ""; if (inp) inp.value = ""; updateLedCells();
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
      document.getElementById("btn-k-clr").addEventListener("click", function () { typedPin = ""; document.getElementById("direct-pin-inp").value = ""; updateLedCells(); });
      document.getElementById("btn-k-ok").addEventListener("click", checkVaultPin);
      document.getElementById("btn-direct-unlock").addEventListener("click", checkVaultPin);
      document.getElementById("direct-pin-inp").addEventListener("input", function () { typedPin = this.value.replace(/\D/g, "").slice(0, 6); updateLedCells(); if (typedPin.length === 6) setTimeout(checkVaultPin, 90); });
      document.getElementById("btn-lock-now").addEventListener("click", function () { try { sessionStorage.removeItem("kumar_real_gmail_unlocked"); } catch (e) {} typedPin = ""; updateLedCells(); document.getElementById("vault-overlay").classList.remove("vault-open"); });

      try { if (sessionStorage.getItem("kumar_real_gmail_unlocked") === "yes") { document.getElementById("vault-overlay").classList.add("vault-open"); loadHubStats(true); } } catch (e) {}

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

      document.getElementById("theme-sel").addEventListener("change", function () { document.body.className = this.value; });

      async function callApi(action, payload) {
        payload = payload || {};
        logTerm("⏳ <b>Executing [" + action.toUpperCase() + "]...</b>");
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

          var readerSel = document.getElementById("sel-reader-gmail");
          var senderSel = document.getElementById("sel-sender-gmail");
          readerSel.innerHTML = '<option value="ALL">🔍 SCAN ALL CONNECTED GMAILS (' + savedGmails.length + ')</option>';
          senderSel.innerHTML = '<option value="AUTO">🔄 AUTO-ROTATE ALL CONNECTED GMAILS (' + savedGmails.length + ')</option>';

          var tb = document.getElementById("tbody-gmail-accounts");
          if (!savedGmails.length) {
            tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;">📭 No Gmail accounts added yet. Add your Gmail & 16-digit App Password above!</td></tr>';
          } else {
            tb.innerHTML = "";
            for (var i = 0; i < savedGmails.length; i++) {
              (function (idx, g) {
                var o1 = document.createElement("option"); o1.value = g.email; o1.textContent = "📧 " + g.email; readerSel.appendChild(o1);
                var o2 = document.createElement("option"); o2.value = g.email; o2.textContent = "📧 " + g.email; senderSel.appendChild(o2);

                var tr = document.createElement("tr");
                tr.innerHTML = "<td><b>#" + (idx + 1) + "</b></td><td>" + (g.label || "OTP Mail") + "</td><td><code>" + g.email + "</code></td><td><code>" + g.maskedPass + "</code></td><td>" + (g.addedOn || "Active") + "</td><td></td>";
                var btnRm = document.createElement("button"); btnRm.type = "button"; btnRm.className = "btn btn-red btn-sm"; btnRm.textContent = "🗑️ REMOVE";
                btnRm.addEventListener("click", function () { callApi("remove_gmail", { email: g.email }); });
                tr.lastChild.appendChild(btnRm); tb.appendChild(tr);
              })(i, savedGmails[i]);
            }
            if (!document.getElementById("inp-gen-base-email").value) {
              document.getElementById("inp-gen-base-email").value = savedGmails[0].email;
            }
          }
          if (!silent) toast("⚡ Synced with Firebase!", "#10b981");
        } catch (e) {}
      }

      document.getElementById("btn-save-gmail-acc").addEventListener("click", function () {
        var mail = document.getElementById("inp-add-gmail").value.trim();
        var pass = document.getElementById("inp-add-app-pass").value.trim();
        var lbl = document.getElementById("inp-add-label").value.trim();
        if (!mail || !pass) return toast("⚠️ Enter Gmail and 16-Digit App Password!", "#f43f5e");
        callApi("add_gmail", { email: mail, appPassword: pass, label: lbl });
      });

      document.getElementById("btn-bulk-save-gmails").addEventListener("click", function () {
        var raw = document.getElementById("inp-bulk-gmails").value.trim();
        if (!raw) return toast("⚠️ Paste Gmail:AppPassword lines!", "#f43f5e");
        callApi("bulk_add_gmails", { rawLines: raw });
      });

      document.getElementById("btn-send-verify-otp").addEventListener("click", async function () {
        var fromMail = document.getElementById("sel-sender-gmail").value;
        var toMail = document.getElementById("inp-verify-to-email").value.trim();
        var brand = document.getElementById("inp-verify-brand").value.trim();
        if (!toMail) return toast("⚠️ Enter Recipient Gmail Address!", "#f43f5e");
        document.getElementById("inp-check-email").value = toMail;
        var r = await callApi("send_otp", { fromEmail: fromMail, toEmail: toMail, brandName: brand });
        if (r && r.success) toast("📤 Real 6-Digit OTP Email Sent to " + toMail + "!", "#10b981");
      });

      document.getElementById("btn-check-verify-otp").addEventListener("click", async function () {
        var checkMail = document.getElementById("inp-check-email").value.trim();
        var checkCode = document.getElementById("inp-check-otp").value.trim();
        if (!checkMail || !checkCode) return toast("⚠️ Enter Email and 6-Digit OTP!", "#f43f5e");
        var r = await callApi("verify_otp", { toEmail: checkMail, otpCode: checkCode });
        if (r && r.verified) toast("🎉 OTP VERIFIED SUCCESSFULLY!", "#10b981");
        else toast("❌ Wrong or Expired OTP!", "#f43f5e");
      });

      document.getElementById("btn-scan-inbox").addEventListener("click", async function () {
        var targetMail = document.getElementById("sel-reader-gmail").value;
        var lim = document.getElementById("inp-reader-limit").value;
        var container = document.getElementById("inbox-otp-cards");
        container.innerHTML = "<div style='color:#00f0ff;font-family:monospace;'>⏳ Connecting to imap.gmail.com:993 and reading real emails...</div>";
        var d = await callApi("read_inbox", { email: targetMail, limit: lim });
        if (!d || !Array.isArray(d.emails) || d.emails.length === 0) {
          container.innerHTML = "<div style='color:#94a3b8;font-family:monospace;'>📭 No emails found.</div>";
          return;
        }
        container.innerHTML = "";
        for (var i = 0; i < d.emails.length; i++) {
          var m = d.emails[i];
          var hasCode = m.otp && m.otp !== "NO-OTP";
          var card = document.createElement("div");
          card.className = "email-otp-card" + (hasCode ? " has-otp" : "");
          card.innerHTML =
            '<div style="font-size:11px;color:#00f0ff;font-family:monospace;margin-bottom:4px;">📥 To: ' + m.to.replace(/</g, "&lt;") + " • " + m.date + "</div>" +
            '<div style="font-weight:800;font-size:14px;color:#fff;margin-bottom:6px;">' + m.subject.replace(/</g, "&lt;") + "</div>" +
            (hasCode ? '<div class="otp-big-badge"><span class="otp-digits">' + m.otp + '</span><button type="button" class="btn btn-green btn-sm" onclick="copyTextValue(\'' + m.otp + '\');alert(\'Copied: ' + m.otp + '\')">📋 COPY</button></div>' : "") +
            '<div style="font-size:11.5px;color:#94a3b8;font-family:monospace;">' + m.snippet.replace(/</g, "&lt;") + "</div>";
          container.appendChild(card);
        }
      });

      document.getElementById("btn-generate-aliases").addEventListener("click", async function () {
        var base = document.getElementById("inp-gen-base-email").value.trim();
        var cnt = document.getElementById("inp-gen-count").value;
        var d = await callApi("generate_aliases", { baseEmail: base, count: cnt, mode: "both" });
        if (d && Array.isArray(d.aliases)) {
          document.getElementById("out-generated-aliases").value = d.aliases.join("\n");
          document.getElementById("gen-count-badge").textContent = d.aliases.length;
          document.getElementById("stat-aliases").textContent = d.aliases.length;
        }
      });

      document.getElementById("btn-copy-aliases").addEventListener("click", function () {
        navigator.clipboard.writeText(document.getElementById("out-generated-aliases").value);
        toast("📋 Copied all generated Gmails!", "#10b981");
      });

      document.getElementById("btn-copy-api-url").addEventListener("click", function () {
        navigator.clipboard.writeText(apiEndpointUrl);
        alert("✅ Your API URL Copied:\n" + apiEndpointUrl);
      });

      document.getElementById("btn-sync-hub").addEventListener("click", function () { loadHubStats(false); });
    })();
  </script>
</body>
</html>`;
}

// ============================================================================
// 7. MAIN SERVERLESS HANDLER (SUPPORTS WEBSITE GET + BOT API POST/GET)
// ============================================================================
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const body = parseRequestPayload(req);
  const action = body.action;
  const webPin = body.webPin;

  // If browser opens URL directly without ?action=..., render the Website UI
  if (req.method === "GET" && !action) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(renderMasterWebsiteHtml());
  }

  if (webPin !== undefined && String(webPin) !== MASTER_PIN) {
    return res.status(403).json({
      success: false,
      reply: "❌ <b>SECURITY ALERT:</b> Invalid Master PIN (252010 Required)!"
    });
  }

  try {
    let accounts = (await fbGet("gmail_hub/accounts")) || [];
    if (!Array.isArray(accounts)) accounts = Object.values(accounts);
    accounts = accounts.filter(Boolean);

    // ================= 0. HUB STATS =================
    if (action === "hub_stats") {
      const safeList = accounts.map(function (a) {
        const cleanP = String(a.appPassword || "");
        return {
          email: a.email,
          label: a.label || "OTP Mail",
          maskedPass: cleanP.substring(0, 4) + " •••• •••• " + cleanP.slice(-4),
          addedOn: a.addedOn
        };
      });
      const otpStore = (await fbGet("gmail_hub/otp_sessions")) || {};
      return res.status(200).json({
        success: true,
        accounts: safeList,
        activeOtpsCount: Object.keys(otpStore).length
      });
    }

    // ================= 1. ADD SINGLE GMAIL & VERIFY SMTP =================
    if (action === "add_gmail") {
      const email = String(body.email || "").trim().toLowerCase();
      const appPassword = String(body.appPassword || "").replace(/\s+/g, "").trim();
      const label = String(body.label || "KUMAR OFFICIAL BOT").trim();

      if (!email.includes("@") || appPassword.length < 8) {
        return res.status(200).json({
          success: false,
          reply: "❌ <b>Invalid Gmail or 16-Digit App Password!</b>"
        });
      }

      // Test Real Gmail SMTP Login
      await sendRealGmailSmtp({
        user: email,
        pass: appPassword,
        verifyOnly: true
      });

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
          "✅ <b>GMAIL SMTP VERIFIED & SAVED!</b>\n" +
          "📧 <b>Gmail:</b> <code>" + email + "</code>\n" +
          "📊 <b>Total Saved Gmails:</b> <code>" + accounts.length + "</code>"
      });
    }

    // ================= 2. BULK ADD MULTIPLE GMAILS =================
    if (action === "bulk_add_gmails") {
      const lines = String(body.rawLines || "").split(/\r?\n/);
      let addedCount = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || !line.includes("@")) continue;
        const parts = line.split(/[:|,;]/);
        if (parts.length < 2) continue;

        const email = parts[0].trim().toLowerCase();
        const pass = parts[1].replace(/\s+/g, "").trim();
        const label = parts[2] ? parts[2].trim() : "OTP Server #" + (accounts.length + 1);
        if (pass.length < 8) continue;

        let exists = false;
        for (let j = 0; j < accounts.length; j++) {
          if (accounts[j].email === email) {
            accounts[j].appPassword = pass;
            accounts[j].label = label;
            exists = true;
            break;
          }
        }
        if (!exists) {
          accounts.push({
            email: email,
            appPassword: pass,
            label: label,
            addedOn: new Date().toLocaleDateString("en-IN")
          });
        }
        addedCount++;
      }

      await fbSet("gmail_hub/accounts", accounts);
      return res.status(200).json({
        success: true,
        reply: "🚀 <b>Bulk Saved " + addedCount + " Gmail Accounts!</b> Total Gmails: <code>" + accounts.length + "</code>"
      });
    }

    // ================= 3. REMOVE GMAIL ACCOUNT =================
    if (action === "remove_gmail") {
      const targetEmail = String(body.email || "").trim().toLowerCase();
      accounts = accounts.filter(function (a) {
        return a.email !== targetEmail;
      });
      await fbSet("gmail_hub/accounts", accounts);
      return res.status(200).json({
        success: true,
        reply: "🗑️ <b>Removed Gmail:</b> <code>" + targetEmail + "</code>"
      });
    }

    // ================= 4. GENERATE DOT/PLUS ALIASES =================
    if (action === "generate_aliases") {
      const baseEmail = body.baseEmail || (accounts[0] ? accounts[0].email : "kumarkor06@gmail.com");
      const count = parseInt(body.count, 10) || 200;
      const aliases = generateGmailAliases(baseEmail, count, body.mode || "both", body.tag || "vip");
      return res.status(200).json({
        success: true,
        aliases: aliases,
        reply: "♾️ <b>Generated " + aliases.length + " Valid Gmails</b> from <code>" + baseEmail + "</code>!"
      });
    }

    if (accounts.length === 0) {
      return res.status(200).json({
        success: false,
        reply:
          "⚠️ <b>NO SENDER GMAIL CONFIGURED ON SERVER!</b>\n" +
          "Admin must first add at least 1 Gmail & 16-Digit App Password on the Website Panel (or via Admin Panel in Bot)."
      });
    }

    // ================= 5. SEND REAL 6-DIGIT OTP TO USER'S GMAIL =================
    if (action === "send_otp") {
      const toEmail = String(body.toEmail || "").trim().toLowerCase();
      const brandName = String(body.brandName || "KUMAR OFFICIAL BOT").trim();

      if (!toEmail || !toEmail.includes("@") || !toEmail.includes(".")) {
        return res.status(200).json({
          success: false,
          reply: "❌ <b>Invalid Email Address!</b> Please send a valid Gmail address (e.g. <code>yourname@gmail.com</code>)."
        });
      }

      // Pick specific sender or auto-rotate randomly across all connected Gmails
      let senderAcc = null;
      if (body.fromEmail && body.fromEmail !== "AUTO") {
        senderAcc = accounts.find(function (a) {
          return a.email === body.fromEmail;
        });
      }
      if (!senderAcc) {
        senderAcc = accounts[Math.floor(Math.random() * accounts.length)];
      }

      const generatedOtp = String(Math.floor(100000 + Math.random() * 900000));
      const emailKey = Buffer.from(toEmail).toString("base64").replace(/[^a-zA-Z0-9]/g, "");

      // Save OTP in Firebase with 10-minute expiration
      await fbSet("gmail_hub/otp_sessions/" + emailKey, {
        email: toEmail,
        otp: generatedOtp,
        sender: senderAcc.email,
        createdAt: Date.now(),
        expiresAt: Date.now() + 10 * 60 * 1000
      });

      // Dispatch REAL Email via Gmail SMTP TLS (Port 465)
      await sendRealGmailSmtp({
        user: senderAcc.email,
        pass: senderAcc.appPassword,
        to: toEmail,
        fromName: brandName,
        subject: "🔐 Your Verification OTP Code is " + generatedOtp + " — " + brandName,
        html: createStylishOtpEmailHtml(generatedOtp, brandName, toEmail)
      });

      return res.status(200).json({
        success: true,
        otpSent: true,
        toEmail: toEmail,
        senderEmail: senderAcc.email,
        reply:
          "╔════════════════════════════╗\n" +
          "   📩 <b>OTP SENT TO YOUR GMAIL!</b>\n" +
          "╚════════════════════════════╝\n\n" +
          "📧 <b>Your Gmail:</b> <code>" + toEmail + "</code>\n" +
          "📨 <b>Sent By:</b> <code>" + senderAcc.email + "</code>\n" +
          "⏳ <b>Validity:</b> <code>10 Minutes</code>\n\n" +
          "━━━━━━━━━━━━━━━━━━━━━━\n" +
          "👇 <b>Open your Gmail App, check your Inbox (or Spam folder), and send the 6-Digit OTP code here now:</b>"
      });
    }

    // ================= 6. VERIFY USER'S 6-DIGIT OTP CODE =================
    if (action === "verify_otp") {
      const toEmail = String(body.toEmail || "").trim().toLowerCase();
      const otpCode = String(body.otpCode || "").replace(/\D/g, "");
      const emailKey = Buffer.from(toEmail).toString("base64").replace(/[^a-zA-Z0-9]/g, "");

      const record = await fbGet("gmail_hub/otp_sessions/" + emailKey);

      if (!record || !record.otp) {
        return res.status(200).json({
          success: false,
          verified: false,
          reply:
            "╔════════════════════════════╗\n" +
            "   ❌ <b>NO OTP SESSION FOUND</b>\n" +
            "╚════════════════════════════╝\n\n" +
            "⚠️ No pending OTP was found for <code>" + toEmail + "</code>.\n" +
            "👉 Tap <b>🔄 RESEND OTP</b> or send your Gmail address again."
        });
      }

      if (Date.now() > record.expiresAt) {
        await fbSet("gmail_hub/otp_sessions/" + emailKey, null);
        return res.status(200).json({
          success: false,
          verified: false,
          reply:
            "╔════════════════════════════╗\n" +
            "   ⌛ <b>OTP CODE EXPIRED!</b>\n" +
            "╚════════════════════════════╝\n\n" +
            "⚠️ Your 10-minute verification window has expired.\n" +
            "👉 Tap <b>🔄 RESEND OTP</b> to get a new 6-digit code!"
        });
      }

      if (String(record.otp) !== otpCode) {
        return res.status(200).json({
          success: false,
          verified: false,
          reply:
            "╔════════════════════════════╗\n" +
            "   ❌ <b>WRONG OTP CODE!</b>\n" +
            "╚════════════════════════════╝\n\n" +
            "⚠️ The code <code>" + otpCode + "</code> does not match the OTP sent to <code>" + toEmail + "</code>.\n\n" +
            "👇 <b>Please check your Gmail Inbox carefully and send the exact 6-digit OTP:</b>"
        });
      }

      // OTP IS 100% CORRECT! Delete temp session & log verified user
      await fbSet("gmail_hub/otp_sessions/" + emailKey, null);

      return res.status(200).json({
        success: true,
        verified: true,
        email: toEmail,
        reply:
          "╔════════════════════════════╗\n" +
          "   🎉 <b>GMAIL OTP VERIFIED!</b>\n" +
          "╚════════════════════════════╝\n\n" +
          "✅ <b>Verified Gmail:</b> <code>" + toEmail + "</code>\n" +
          "🔑 <b>OTP Status:</b> <code>100% MATCHED</code>\n" +
          "🛡️ <b>Account Access:</b> <code>UNLOCKED</code>"
      });
    }

    // ================= 7. READ LIVE GMAIL INBOX OTPs (REAL IMAP 993) =================
    if (action === "read_inbox") {
      const targetEmail = body.email || "ALL";
      const limitCount = parseInt(body.limit, 10) || 6;
      const scanPool =
        targetEmail === "ALL"
          ? accounts
          : accounts.filter(function (a) {
              return a.email === targetEmail;
            });

      let allEmails = [];
      for (let i = 0; i < scanPool.length; i++) {
        const acc = scanPool[i];
        try {
          const msgs = await readRealGmailImap(acc.email, acc.appPassword, limitCount);
          allEmails = allEmails.concat(msgs);
        } catch (err) {
          allEmails.push({
            from: "IMAP System",
            to: acc.email,
            subject: "⚠️ IMAP Error: " + err.message,
            date: new Date().toLocaleTimeString(),
            otp: "NO-OTP",
            snippet: "Check your 16-digit App Password."
          });
        }
      }

      let botReply =
        "╔════════════════════════════╗\n" +
        "   📩 <b>LIVE GMAIL INBOX OTPs</b>\n" +
        "╚════════════════════════════╝\n\n";

      if (allEmails.length === 0) {
        botReply += "📭 No recent emails found in inbox.";
      } else {
        for (let j = 0; j < Math.min(8, allEmails.length); j++) {
          const m = allEmails[j];
          botReply +=
            "<b>[" + (j + 1) + "] " + m.subject + "</b>\n" +
            " ┣ 📥 <b>To:</b> <code>" + m.to + "</code>\n" +
            " ┣ 🔑 <b>OTP Code:</b> <code>" + m.otp + "</code>\n" +
            " ┗ 🕒 " + m.date + "\n\n";
        }
      }

      return res.status(200).json({
        success: true,
        emails: allEmails,
        reply: botReply
      });
    }

    return res.status(200).json({ success: false, reply: "⚠️ Unknown API Action." });
  } catch (err) {
    return res.status(200).json({
      success: false,
      reply: "❌ <b>SERVER EXECUTION ERROR:</b> <code>" + (err.message || "Failed") + "</code>"
    });
  }
};
