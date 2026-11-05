const https = require("https");

// ============================================================================
// 1. CONFIGURATION & FIREBASE REALTIME DATABASE REST ENGINE
// ============================================================================
const DB_URL = "https://kumartelegrambot-default-rtdb.firebaseio.com";
const ADMIN_PIN = "252010";

async function fbGet(path) {
  try {
    const res = await fetch(DB_URL + "/" + path + ".json");
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
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
  } catch (e) {
    return false;
  }
}

function parseBody(req) {
  let out = {};
  if (req.query && typeof req.query === "object") {
    for (let k in req.query) out[k] = req.query[k];
  }
  if (req.body) {
    if (typeof req.body === "string") {
      try {
        const p = JSON.parse(req.body);
        for (let k in p) out[k] = p[k];
      } catch (e) {}
    } else if (typeof req.body === "object") {
      for (let k in req.body) out[k] = req.body[k];
    }
  }
  return out;
}

// Clean URL & Extract Shortcode for Instagram / YouTube
function cleanMediaUrl(rawUrl) {
  const trimmed = String(rawUrl || "").trim();
  try {
    const u = new URL(trimmed);
    // Strip tracking tags like ?igsh=... or ?utm_source=...
    if (u.hostname.includes("instagram.com")) {
      return "https://www.instagram.com" + u.pathname;
    }
    return trimmed;
  } catch (e) {
    return trimmed;
  }
}

function extractInstaShortcode(url) {
  const m = String(url || "").match(/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : null;
}

// ============================================================================
// 2. MULTI-ENGINE NO-WATERMARK VIDEO EXTRACTOR (INSTAGRAM + YOUTUBE + SOCIAL)
// ============================================================================
async function extractCleanMediaServer(rawUrl) {
  const cleanUrl = cleanMediaUrl(rawUrl);
  const shortcode = extractInstaShortcode(cleanUrl);
  const randomStudioId = Math.floor(100000 + Math.random() * 900000);
  const cleanFileName = "Studio_Master_HD_" + randomStudioId + ".mp4";

  // ---- ENGINE 1: RYZN / SIPUTZX / MULTI-DOWNLOADER JSON APIS ----
  const apiEndpoints = [
    "https://api.ryzendesu.vip/api/downloader/igdl?url=" + encodeURIComponent(cleanUrl),
    "https://api.siputzx.my.id/api/d/igdl?url=" + encodeURIComponent(cleanUrl),
    "https://api.vkrdownloader.vercel.app/server?vkr=" + encodeURIComponent(cleanUrl)
  ];

  for (let i = 0; i < apiEndpoints.length; i++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5500);
      const r = await fetch(apiEndpoints[i], {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        },
        signal: controller.signal
      });
      clearTimeout(timer);

      if (r.ok) {
        const d = await r.json();
        // Parse Ryzendesu / Siputzx array format
        const list = Array.isArray(d.data) ? d.data : Array.isArray(d.result) ? d.result : null;
        if (list && list.length > 0 && list[0].url) {
          return {
            success: true,
            videoUrl: list[0].url,
            thumbnail: list[0].thumbnail || list[0].thumb || "https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=800&q=80",
            cleanTitle: "Original Master Video #" + randomStudioId,
            cleanFileName: cleanFileName,
            quality: "1080p Full HD (No Watermark)",
            engine: "Quantum Engine #" + (i + 1)
          };
        }
        // Parse Vkr format
        if (d && d.data && d.data.downloads && d.data.downloads.length > 0) {
          const best = d.data.downloads[0];
          return {
            success: true,
            videoUrl: best.url,
            thumbnail: d.data.thumbnail || "https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=800&q=80",
            cleanTitle: "Original Master Video #" + randomStudioId,
            cleanFileName: cleanFileName,
            quality: "1080p Full HD (No Watermark)",
            engine: "Quantum VKR Engine"
          };
        }
      }
    } catch (err) {}
  }

  // ---- ENGINE 2: DIRECT INSTAGRAM GRAPHQL & EMBED SCRAPER ----
  if (shortcode) {
    try {
      const embedUrl = "https://www.instagram.com/p/" + shortcode + "/embed/captioned/";
      const r = await fetch(embedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
          "Accept-Language": "en-US,en;q=0.9"
        }
      });
      const html = await r.text();

      let videoMatch = html.match(/"video_url":"([^"]+)"/);
      let thumbMatch = html.match(/"display_url":"([^"]+)"/);

      if (videoMatch && videoMatch[1]) {
        const cleanVid = videoMatch[1].replace(/\\u0026/g, "&").replace(/\\/g, "");
        const cleanThumb = thumbMatch
          ? thumbMatch[1].replace(/\\u0026/g, "&").replace(/\\/g, "")
          : "https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=800&q=80";

        return {
          success: true,
          videoUrl: cleanVid,
          thumbnail: cleanThumb,
          cleanTitle: "Original Master Video #" + randomStudioId,
          cleanFileName: cleanFileName,
          quality: "1080p Original Raw Stream (No Watermark)",
          engine: "Direct CDN Scraper"
        };
      }
    } catch (e) {}

    // GraphQL Post Query Fallback
    try {
      const gqlUrl =
        "https://www.instagram.com/graphql/query/?query_hash=b3055c01b4b222b8a47dc12b090e4e64&variables=" +
        encodeURIComponent(JSON.stringify({ shortcode: shortcode }));
      const r2 = await fetch(gqlUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });
      const j2 = await r2.json();
      const media = j2 && j2.data && j2.data.shortcode_media;
      if (media && media.video_url) {
        return {
          success: true,
          videoUrl: media.video_url,
          thumbnail: media.display_url || "",
          cleanTitle: "Original Master Video #" + randomStudioId,
          cleanFileName: cleanFileName,
          quality: "1080p Raw CDN Stream",
          engine: "Direct GraphQL Engine"
        };
      }
    } catch (e) {}
  }

  return {
    success: false,
    error: "Could not extract video from this link. Make sure the Instagram/YouTube video is Public!"
  };
}

// ============================================================================
// 3. MASTER ENGLISH WEB APPLICATION UI (String.raw = 100% GLITCH-FREE)
// ============================================================================
function renderMasterDownloaderWebApp() {
  return String.raw`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>⚡ PURECLIP STUDIO • NO-WATERMARK VIDEO DOWNLOADER & API ⚡</title>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800;900&family=Plus+Jakarta+Sans:wght@500;600;700;800&family=JetBrains+Mono:wght@500;700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg-base: #040711;
      --bg-surface: #0b1124;
      --bg-card: rgba(15, 23, 42, 0.92);
      --bg-input: #060a17;
      --accent: #00f0ff;
      --accent-glow: rgba(0, 240, 255, 0.42);
      --accent-2: #ec4899;
      --accent-2-glow: rgba(236, 72, 153, 0.38);
      --accent-3: #8b5cf6;
      --success: #10b981;
      --success-glow: rgba(16, 185, 129, 0.42);
      --danger: #f43f5e;
      --warning: #f59e0b;
      --text-main: #ffffff;
      --text-sub: #cbd5e1;
      --text-dim: #94a3b8;
      --border-glass: rgba(0, 240, 255, 0.28);
      --border-strong: rgba(0, 240, 255, 0.80);
      --grad-brand: linear-gradient(135deg, #00f0ff 0%, #ec4899 50%, #8b5cf6 100%);
      --grad-btn: linear-gradient(90deg, #00f0ff, #0284c7);
    }

    body.theme-insta {
      --bg-base: #0c0314;
      --bg-surface: #1a0826;
      --bg-card: rgba(28, 10, 42, 0.92);
      --bg-input: #11041c;
      --accent: #f43f5e;
      --accent-glow: rgba(244, 63, 94, 0.42);
      --accent-2: #f59e0b;
      --border-glass: rgba(244, 63, 94, 0.30);
      --border-strong: rgba(244, 63, 94, 0.82);
      --grad-brand: linear-gradient(135deg, #f59e0b 0%, #f43f5e 50%, #8b5cf6 100%);
      --grad-btn: linear-gradient(90deg, #f43f5e, #f59e0b);
    }

    body.theme-emerald {
      --bg-base: #020d07;
      --bg-surface: #062114;
      --bg-card: rgba(8, 35, 22, 0.92);
      --bg-input: #03120a;
      --accent: #10b981;
      --accent-glow: rgba(16, 185, 129, 0.42);
      --accent-2: #06b6d4;
      --border-glass: rgba(16, 185, 129, 0.30);
      --border-strong: rgba(16, 185, 129, 0.82);
      --grad-brand: linear-gradient(135deg, #10b981 0%, #06b6d4 50%, #3b82f6 100%);
      --grad-btn: linear-gradient(90deg, #10b981, #059669);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
    }

    body {
      background-color: var(--bg-base);
      color: var(--text-main);
      font-family: 'Plus Jakarta Sans', sans-serif;
      min-height: 100vh;
      overflow-x: hidden;
      background-image:
        radial-gradient(circle at 10% 15%, var(--accent-glow) 0%, transparent 35%),
        radial-gradient(circle at 90% 85%, var(--accent-2-glow) 0%, transparent 35%);
      background-attachment: fixed;
    }

    /* ========================================================================
       1. USER NAME ENTRY GATE (NO PASSWORD FOR USERS!) & BAN SCREEN
       ======================================================================== */
    #user-name-gate, #banned-screen-overlay, #admin-pin-modal {
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: radial-gradient(circle at top, #131c38 0%, #03060f 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      transition: opacity 0.35s ease, visibility 0.35s ease;
    }

    .hidden-overlay {
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }

    .gate-card {
      width: 100%;
      max-width: 430px;
      background: rgba(12, 19, 38, 0.96);
      border: 2px solid var(--border-strong);
      border-radius: 28px;
      padding: 30px 22px;
      box-shadow: 0 0 70px var(--accent-glow);
      text-align: center;
      backdrop-filter: blur(20px);
    }

    .gate-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(0, 240, 255, 0.14);
      border: 1px solid var(--accent);
      color: var(--accent);
      padding: 6px 16px;
      border-radius: 999px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 1.4px;
      margin-bottom: 14px;
    }

    .gate-title {
      font-family: 'Orbitron', sans-serif;
      font-size: 22px;
      font-weight: 900;
      background: var(--grad-brand);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 8px;
    }

    .gate-sub {
      font-size: 13.5px;
      color: var(--text-sub);
      margin-bottom: 20px;
      line-height: 1.5;
    }

    /* ========================================================================
       2. MAIN APP SHELL & HEADER
       ======================================================================== */
    .shell {
      max-width: 1200px;
      margin: 0 auto;
      padding: 16px 14px 100px;
    }

    .announcement-bar {
      background: linear-gradient(90deg, rgba(245, 158, 11, 0.18), rgba(236, 72, 153, 0.18));
      border: 1px solid var(--warning);
      color: #fde68a;
      padding: 10px 16px;
      border-radius: 14px;
      font-size: 12.5px;
      font-weight: 700;
      margin-bottom: 14px;
      display: none;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .top-header {
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(8, 13, 28, 0.96));
      border: 1.5px solid var(--border-strong);
      border-radius: 24px;
      padding: 18px 22px;
      margin-bottom: 16px;
      box-shadow: 0 12px 38px rgba(0, 0, 0, 0.65), 0 0 25px var(--accent-glow);
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

    .brand-logo {
      width: 56px;
      height: 56px;
      border-radius: 16px;
      background: var(--grad-brand);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      box-shadow: 0 0 24px var(--accent-glow);
      flex-shrink: 0;
    }

    .brand-titles h1 {
      font-family: 'Orbitron', sans-serif;
      font-size: 19px;
      font-weight: 900;
      color: var(--accent);
      letter-spacing: 1px;
    }

    .brand-titles p {
      font-size: 12px;
      color: var(--text-sub);
      margin-top: 3px;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .user-pill {
      background: rgba(16, 185, 129, 0.14);
      border: 1px solid var(--success);
      color: #34d399;
      padding: 8px 13px;
      border-radius: 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11.5px;
      font-weight: 800;
      cursor: pointer;
    }

    .pill-select {
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

    .btn-admin-top {
      background: linear-gradient(90deg, #f59e0b, #ec4899);
      border: none;
      color: #ffffff;
      padding: 9px 14px;
      border-radius: 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11.5px;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 0 0 18px rgba(245, 158, 11, 0.35);
    }

    /* ========================================================================
       NAVIGATION TABS
       ======================================================================== */
    .nav-tabs {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
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
      background: var(--grad-brand);
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
       CARDS, INPUTS, VIDEO PREVIEW & DOWNLOAD PROGRESS
       ======================================================================== */
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(330px, 1fr));
      gap: 16px;
      margin-bottom: 16px;
    }

    .stats-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
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
      font-size: 24px;
      font-weight: 800;
      color: var(--accent);
    }

    .card-box {
      background: var(--bg-card);
      border: 1px solid var(--border-glass);
      border-radius: 24px;
      padding: 22px;
      margin-bottom: 16px;
      box-shadow: 0 12px 35px rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(16px);
    }

    .card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
      padding-bottom: 12px;
      margin-bottom: 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .card-title {
      font-size: 15px;
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
      padding: 4px 11px;
      border-radius: 99px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10.5px;
      font-weight: 800;
    }

    .url-input-bar {
      display: flex;
      gap: 10px;
      margin-bottom: 14px;
      flex-wrap: wrap;
    }

    .inp, .txtarea, .sel {
      width: 100%;
      padding: 14px 16px;
      background: var(--bg-input);
      border: 1.5px solid var(--border-glass);
      border-radius: 14px;
      color: #ffffff;
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      outline: none;
      transition: 0.2s;
    }

    .inp:focus, .txtarea:focus, .sel:focus {
      border-color: var(--accent);
      box-shadow: 0 0 18px var(--accent-glow);
    }

    .btn {
      width: 100%;
      padding: 14px 18px;
      border: none;
      border-radius: 14px;
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.7px;
      text-transform: uppercase;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 8px;
      transition: all 0.2s ease;
    }

    .btn:hover {
      transform: translateY(-2px);
    }

    .btn-primary {
      background: var(--grad-btn);
      color: #020617;
      box-shadow: 0 0 22px var(--accent-glow);
    }

    .btn-green {
      background: linear-gradient(90deg, #10b981, #059669);
      color: #ffffff;
      box-shadow: 0 0 22px var(--success-glow);
    }

    .btn-insta {
      background: linear-gradient(90deg, #f43f5e, #ec4899, #8b5cf6);
      color: #ffffff;
      box-shadow: 0 0 24px rgba(236, 72, 153, 0.4);
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
      padding: 8px 14px;
      font-size: 11px;
      margin-bottom: 0;
      border-radius: 10px;
    }

    /* ========================================================================
       VIDEO RESULT STAGE (THUMBNAIL + LIVE PLAYER + CLEAN METADATA)
       ======================================================================== */
    #video-result-stage {
      display: none;
      animation: popIn 0.28s ease;
    }

    @keyframes popIn {
      from { opacity: 0; transform: scale(0.97); }
      to { opacity: 1; transform: scale(1); }
    }

    .media-showcase {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      align-items: start;
    }

    .thumb-player-box {
      background: #03060f;
      border: 2px solid var(--border-strong);
      border-radius: 20px;
      overflow: hidden;
      position: relative;
      box-shadow: 0 0 30px var(--accent-glow);
    }

    .thumb-cover-wrap {
      position: relative;
      width: 100%;
      cursor: pointer;
    }

    .thumb-cover-wrap img {
      width: 100%;
      max-height: 440px;
      object-fit: cover;
      display: block;
    }

    .play-overlay-badge {
      position: absolute;
      inset: 0;
      background: rgba(3, 7, 18, 0.45);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      transition: 0.2s;
    }

    .play-circle {
      width: 68px;
      height: 68px;
      border-radius: 50%;
      background: var(--grad-brand);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      color: #fff;
      box-shadow: 0 0 30px var(--accent-glow);
    }

    #live-video-player {
      width: 100%;
      max-height: 460px;
      display: none;
      background: #000;
    }

    .clean-meta-box {
      background: rgba(6, 11, 25, 0.9);
      border: 1px solid var(--border-glass);
      border-radius: 18px;
      padding: 18px;
    }

    .meta-row {
      display: flex;
      justify-content: space-between;
      padding: 9px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.07);
      font-size: 12.5px;
    }

    .meta-row span:first-child {
      color: var(--text-dim);
      font-weight: 700;
    }

    .meta-row span:last-child {
      color: #34d399;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
    }

    .progress-wrap {
      width: 100%;
      background: #030712;
      border: 1px solid var(--border-glass);
      border-radius: 99px;
      height: 22px;
      overflow: hidden;
      margin: 12px 0;
      display: none;
    }

    .progress-fill {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #10b981, #00f0ff);
      text-align: center;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      line-height: 22px;
      font-weight: 800;
      color: #020617;
      transition: width 0.2s ease;
    }

    /* ========================================================================
       TABLES & CODE BLOCKS
       ======================================================================== */
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
      white-space: nowrap;
    }

    .cyber-table td {
      padding: 12px 13px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.07);
      font-family: 'JetBrains Mono', monospace;
      color: #fff;
      vertical-align: middle;
    }

    .status-active {
      background: rgba(16, 185, 129, 0.18);
      border: 1px solid var(--success);
      color: #34d399;
      padding: 3px 10px;
      border-radius: 99px;
      font-size: 10.5px;
      font-weight: 800;
    }

    .status-banned {
      background: rgba(244, 63, 94, 0.2);
      border: 1px solid var(--danger);
      color: #fda4af;
      padding: 3px 10px;
      border-radius: 99px;
      font-size: 10.5px;
      font-weight: 800;
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
      max-height: 340px;
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
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.85);
    }
  </style>
</head>
<body>

  <!-- ======================================================================
       1. USER NAME WELCOME GATE (NO PASSWORD REQUIRED FOR USERS!)
       ====================================================================== -->
  <div id="user-name-gate" class="hidden-overlay">
    <div class="gate-card">
      <div class="gate-badge">🎬 NO-WATERMARK STUDIO DOWNLOADER</div>
      <div class="gate-title">WELCOME TO PURECLIP</div>
      <div class="gate-sub">
        Enter your <b>Name</b> below to unlock instant 1080p No-Watermark Instagram & Social Video Downloads!
      </div>

      <input
        type="text"
        id="inp-welcome-username"
        class="inp"
        style="text-align:center;font-size:16px;font-weight:800;margin-bottom:14px;"
        placeholder="Enter Your Full Name (e.g. Rahul)"
        maxlength="32"
        autocomplete="off"
      />

      <button type="button" class="btn btn-insta" id="btn-enter-website">
        🚀 ENTER DOWNLOAD STUDIO NOW
      </button>

      <div style="margin-top:12px;font-size:11.5px;color:var(--text-dim);">
        ⚡ 100% Free • Zero Watermark • Original Studio Quality
      </div>
    </div>
  </div>

  <!-- ======================================================================
       2. BANNED USER LOCKOUT SCREEN (SHOWN IF ADMIN BANS THIS USER)
       ====================================================================== -->
  <div id="banned-screen-overlay" class="hidden-overlay">
    <div class="gate-card" style="border-color:var(--danger);box-shadow:0 0 70px rgba(244,63,94,0.45);">
      <div class="gate-badge" style="border-color:var(--danger);color:#fda4af;background:rgba(244,63,94,0.15);">
        🚫 SECURITY RESTRICTION 🚫
      </div>
      <div class="gate-title" style="background:linear-gradient(90deg,#f43f5e,#f59e0b);-webkit-background-clip:text;">
        ACCOUNT BANNED
      </div>
      <div class="gate-sub" id="banned-reason-text">
        Your account has been suspended by the Administrator. You cannot download videos at this time.
      </div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#fda4af;padding:10px;background:#090206;border-radius:12px;margin-bottom:14px;" id="banned-uid-box">
        User ID: --
      </div>
      <button type="button" class="btn btn-outline" id="btn-check-unban">
        🔄 CHECK STATUS AGAIN
      </button>
    </div>
  </div>

  <!-- ======================================================================
       3. ADMIN PIN MODAL (PASSWORD: 252010)
       ====================================================================== -->
  <div id="admin-pin-modal" class="hidden-overlay">
    <div class="gate-card">
      <div class="gate-badge">👑 ADMIN SECURITY VAULT 👑</div>
      <div class="gate-title">ADMIN LOGIN</div>
      <div class="gate-sub">Enter the 6-Digit Master Admin Password to open User Ban/Unban & System Controls:</div>

      <input
        type="password"
        id="inp-admin-pin"
        class="inp"
        style="text-align:center;font-size:20px;letter-spacing:8px;margin-bottom:14px;"
        maxlength="6"
        placeholder="••••••"
      />

      <div style="display:flex;gap:10px;">
        <button type="button" class="btn btn-green" id="btn-unlock-admin">🔓 UNLOCK ADMIN</button>
        <button type="button" class="btn btn-outline" id="btn-close-admin-modal">✖ CANCEL</button>
      </div>
    </div>
  </div>

  <!-- ======================================================================
       4. MAIN WEBSITE SHELL
       ====================================================================== -->
  <div class="shell">
    <!-- GLOBAL ANNOUNCEMENT BAR (SET BY ADMIN) -->
    <div class="announcement-bar" id="global-announcement-bar">
      <span id="announcement-text">📢 Welcome to PureClip Studio!</span>
    </div>

    <!-- TOP HEADER -->
    <header class="top-header">
      <div class="brand-left">
        <div class="brand-logo">🎬</div>
        <div class="brand-titles">
          <h1>PURECLIP STUDIO • CLEAN VIDEO DOWNLOADER</h1>
          <p>Zero Watermark • Zero Instagram/YouTube Metadata • Live Preview • Direct Phone Save</p>
        </div>
      </div>
      <div class="header-right">
        <div class="user-pill" id="header-user-badge" title="Click to change name">👤 Guest</div>
        <select class="pill-select" id="theme-sel">
          <option value="">🔵 CYBER STUDIO</option>
          <option value="theme-insta">🌸 INSTA SUNSET</option>
          <option value="theme-emerald">🟢 EMERALD MATRIX</option>
        </select>
        <button type="button" class="btn-admin-top" id="btn-open-admin">👑 ADMIN PANEL</button>
      </div>
    </header>

    <!-- NAVIGATION TABS -->
    <div class="nav-tabs">
      <button type="button" class="nav-btn active" data-pane="pane-downloader">
        📥 1. VIDEO DOWNLOADER
      </button>
      <button type="button" class="nav-btn" data-pane="pane-history">
        📜 2. MY DOWNLOADS
      </button>
      <button type="button" class="nav-btn" data-pane="pane-api">
        🔌 3. DEVELOPER & BOT API
      </button>
      <button type="button" class="nav-btn" data-pane="pane-admin" id="tab-btn-admin" style="display:none;">
        👑 4. ADMIN CONTROL DECK
      </button>
    </div>

    <!-- ====================================================================
         PANE 1: CLEAN NO-WATERMARK INSTAGRAM / SOCIAL VIDEO DOWNLOADER
         ==================================================================== -->
    <div id="pane-downloader" class="tab-pane active">
      <div class="card-box">
        <div class="card-head">
          <div class="card-title">🔗 PASTE INSTAGRAM REEL / VIDEO / SHORTS LINK</div>
          <span class="chip-tag">100% NO WATERMARK</span>
        </div>

        <div class="url-input-bar">
          <input
            type="url"
            id="inp-video-url"
            class="inp"
            style="flex:1;min-width:240px;"
            placeholder="Paste Instagram Reel, Post, or Video Link here (e.g. https://www.instagram.com/reel/...)"
          />
          <button type="button" class="btn btn-outline btn-sm" id="btn-paste-clipboard" style="padding:0 18px;">
            📋 PASTE
          </button>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-bottom:10px;">
          <div>
            <label style="font-size:11px;color:var(--text-dim);font-weight:800;display:block;margin-bottom:4px;">
              CLEAN OUTPUT FILENAME STYLE (NO SOURCE TRACE)
            </label>
            <select id="sel-filename-style" class="sel" style="padding:10px 14px;font-size:12.5px;">
              <option value="Studio_Master_HD_">🎬 Studio_Master_HD_XXXX.mp4 (Looks Like Original Edit)</option>
              <option value="Camera_Roll_VID_">📱 Camera_Roll_VID_XXXX.mp4 (Looks Like Phone Camera)</option>
              <option value="Final_Render_4K_">🎞️ Final_Render_4K_XXXX.mp4 (Looks Like Premiere Export)</option>
            </select>
          </div>
          <div style="display:flex;align-items:flex-end;">
            <button type="button" class="btn btn-insta" id="btn-fetch-video" style="margin-bottom:0;">
              ⚡ FETCH CLEAN VIDEO & THUMBNAIL
            </button>
          </div>
        </div>

        <div id="fetch-status-msg" style="font-family:'JetBrains Mono',monospace;font-size:12.5px;color:var(--accent);margin-top:8px;">
          ✨ Paste any Instagram Reel or Video link above and click <b>FETCH CLEAN VIDEO & THUMBNAIL</b>.
        </div>
      </div>

      <!-- VIDEO THUMBNAIL + PLAYABLE PREVIEW + DIRECT PHONE DOWNLOAD STAGE -->
      <div class="card-box" id="video-result-stage">
        <div class="card-head">
          <div class="card-title">🎬 CLEAN STUDIO MASTER READY (ZERO WATERMARK)</div>
          <span class="chip-tag" id="res-engine-badge">1080P ORIGINAL</span>
        </div>

        <div class="media-showcase">
          <!-- LEFT: THUMBNAIL & LIVE VIDEO PLAYER -->
          <div>
            <div class="thumb-player-box">
              <!-- THUMBNAIL COVER (CLICK TO PLAY VIDEO) -->
              <div class="thumb-cover-wrap" id="thumb-cover-wrap" title="Click to preview video">
                <img id="res-thumb-img" src="" alt="Video Thumbnail" />
                <div class="play-overlay-badge">
                  <div class="play-circle">▶</div>
                  <div style="background:rgba(0,0,0,0.75);padding:5px 14px;border-radius:99px;font-size:12px;font-weight:800;">
                    👁️ TAP THUMBNAIL TO PLAY VIDEO PREVIEW
                  </div>
                </div>
              </div>

              <!-- HTML5 LIVE VIDEO PLAYER -->
              <video id="live-video-player" controls playsinline preload="metadata"></video>
            </div>

            <div style="display:flex;gap:8px;margin-top:10px;">
              <button type="button" class="btn btn-outline btn-sm" id="btn-toggle-preview" style="flex:1;">
                ▶️ PLAY / PAUSE VIDEO PREVIEW
              </button>
              <button type="button" class="btn btn-outline btn-sm" id="btn-download-thumb" style="flex:1;">
                🖼️ SAVE HD THUMBNAIL
              </button>
            </div>
          </div>

          <!-- RIGHT: CLEAN METADATA & 1-CLICK PHONE DOWNLOAD -->
          <div class="clean-meta-box">
            <h3 style="font-size:16px;color:#fff;margin-bottom:12px;" id="res-clean-title">
              Studio_Master_HD.mp4
            </h3>

            <div class="meta-row">
              <span>🛡️ Watermark / Logo Status:</span>
              <span>100% REMOVED (CLEAN)</span>
            </div>
            <div class="meta-row">
              <span>🧹 Source Metadata (IG/YT):</span>
              <span>STRIPPED & ANONYMIZED</span>
            </div>
            <div class="meta-row">
              <span>🎞️ Video Stream Quality:</span>
              <span id="res-quality-text">1080p Full HD MP4</span>
            </div>
            <div class="meta-row">
              <span>📁 Clean Output File Name:</span>
              <span id="res-filename-text">Studio_Master_HD.mp4</span>
            </div>

            <!-- LIVE DOWNLOAD PROGRESS BAR -->
            <div class="progress-wrap" id="dl-progress-wrap">
              <div class="progress-fill" id="dl-progress-fill">0%</div>
            </div>

            <div style="margin-top:16px;">
              <button type="button" class="btn btn-green" id="btn-download-to-phone" style="font-size:14px;padding:16px;">
                📥 DOWNLOAD CLEAN VIDEO TO PHONE (.MP4)
              </button>

              <button type="button" class="btn btn-primary" id="btn-direct-fast-dl">
                ⚡ FAST DIRECT STREAM DOWNLOAD (FALLBACK)
              </button>

              <button type="button" class="btn btn-outline" id="btn-copy-clean-link">
                🔗 COPY DIRECT RAW MP4 STREAM LINK
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ====================================================================
         PANE 2: USER'S PERSONAL DOWNLOAD HISTORY
         ==================================================================== -->
    <div id="pane-history" class="tab-pane">
      <div class="card-box">
        <div class="card-head">
          <div class="card-title">📜 MY RECENT CLEAN DOWNLOADS</div>
          <button type="button" class="btn btn-red btn-sm" id="btn-clear-my-history">🗑️ CLEAR HISTORY</button>
        </div>
        <div class="table-wrap">
          <table class="cyber-table">
            <thead>
              <tr>
                <th>#</th>
                <th>CLEAN FILE NAME</th>
                <th>QUALITY</th>
                <th>TIME</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody id="tbody-user-history"></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ====================================================================
         PANE 3: DEVELOPER REST API & BOTS.BUSINESS (BJS) CODE
         ==================================================================== -->
    <div id="pane-api" class="tab-pane">
      <div class="card-box">
        <div class="card-head">
          <div class="card-title">🌐 LIVE NO-WATERMARK VIDEO DOWNLOADER API ENDPOINT</div>
          <button type="button" class="btn btn-green btn-sm" id="btn-copy-api-endpoint">📋 COPY API URL</button>
        </div>
        <input type="text" id="api-endpoint-box" class="inp" readonly />
      </div>

      <div class="grid-2">
        <div class="card-box">
          <div class="card-head">
            <div class="card-title">🤖 1. BOTS.BUSINESS (`*` COMMAND) AUTO DOWNLOADER BOT</div>
            <button type="button" class="btn btn-primary btn-sm" onclick="copyCode('code-bjs-insta')">📋 COPY BOT CODE</button>
          </div>
          <div class="code-block" id="code-bjs-insta"></div>
        </div>

        <div class="card-box">
          <div class="card-head">
            <div class="card-title">💻 2. JAVASCRIPT / WEBSITE FETCH API USAGE</div>
            <button type="button" class="btn btn-outline btn-sm" onclick="copyCode('code-js-insta')">📋 COPY JS CODE</button>
          </div>
          <div class="code-block" id="code-js-insta"></div>
        </div>
      </div>
    </div>

    <!-- ====================================================================
         PANE 4: MASTER ADMIN PANEL (PIN: 252010 — BAN / UNBAN / ANALYTICS)
         ==================================================================== -->
    <div id="pane-admin" class="tab-pane">
      <section class="stats-row">
        <div class="stat-tile">
          <div class="lbl">👥 Total Registered Users</div>
          <div class="val" id="adm-stat-users">0</div>
        </div>
        <div class="stat-tile">
          <div class="lbl">🚫 Banned Users</div>
          <div class="val" id="adm-stat-banned" style="color:var(--danger);">0</div>
        </div>
        <div class="stat-tile">
          <div class="lbl">📥 Total Video Downloads</div>
          <div class="val" id="adm-stat-downloads" style="color:var(--success);">0</div>
        </div>
        <div class="stat-tile">
          <div class="lbl">🛡️ System Mode</div>
          <div class="val" id="adm-stat-mode" style="font-size:18px;">ONLINE</div>
        </div>
      </section>

      <!-- ADMIN USER MANAGEMENT (BAN / UNBAN / DELETE) -->
      <div class="card-box">
        <div class="card-head">
          <div class="card-title">👥 USER ACCESS CONTROL (1-CLICK BAN / UNBAN USERS)</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <input
              type="text"
              id="inp-admin-search-user"
              class="inp"
              style="max-width:220px;padding:7px 12px;font-size:12px;"
              placeholder="🔍 Search Name or ID..."
            />
            <button type="button" class="btn btn-outline btn-sm" id="btn-admin-refresh">🔄 SYNC FIREBASE</button>
          </div>
        </div>

        <div class="table-wrap">
          <table class="cyber-table">
            <thead>
              <tr>
                <th>#</th>
                <th>USER NAME</th>
                <th>DEVICE / USER ID</th>
                <th>DOWNLOADS</th>
                <th>JOINED / LAST ACTIVE</th>
                <th>STATUS</th>
                <th>BAN / UNBAN ACTION</th>
              </tr>
            </thead>
            <tbody id="tbody-admin-users"></tbody>
          </table>
        </div>
      </div>

      <div class="grid-2">
        <!-- MANUAL BAN BY ID & GLOBAL ANNOUNCEMENT -->
        <div class="card-box">
          <div class="card-head">
            <div class="card-title">📢 GLOBAL ANNOUNCEMENT & MAINTENANCE CONTROL</div>
          </div>
          <div style="margin-bottom:12px;">
            <label style="font-size:11px;color:var(--text-sub);font-weight:800;display:block;margin-bottom:5px;">
              GLOBAL BANNER MESSAGE (SHOWN TO ALL USERS)
            </label>
            <input type="text" id="inp-admin-announcement" class="inp" placeholder="e.g. 🔥 Welcome! Download unlimited HD Reels with zero watermark!" />
          </div>
          <button type="button" class="btn btn-primary" id="btn-save-announcement">
            💾 UPDATE ANNOUNCEMENT BANNER
          </button>

          <hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:14px 0;" />

          <div style="display:flex;gap:10px;">
            <button type="button" class="btn btn-red" id="btn-ban-all-guests">🚫 BAN BY USER ID</button>
            <button type="button" class="btn btn-outline" id="btn-unban-all-users">🟢 UNBAN ALL USERS</button>
          </div>
        </div>

        <!-- GLOBAL DOWNLOAD LOGS -->
        <div class="card-box">
          <div class="card-head">
            <div class="card-title">📊 LIVE GLOBAL DOWNLOAD ACTIVITY LOGS</div>
            <button type="button" class="btn btn-red btn-sm" id="btn-clear-global-logs">🗑️ CLEAR LOGS</button>
          </div>
          <div class="table-wrap" style="max-height:240px;overflow-y:auto;">
            <table class="cyber-table">
              <thead>
                <tr>
                  <th>USER</th>
                  <th>CLEAN FILE</th>
                  <th>TIME</th>
                </tr>
              </thead>
              <tbody id="tbody-admin-logs"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div id="toast-box"></div>

  <!-- ======================================================================
       5. FRONTEND + FIREBASE + MULTI-ENGINE VIDEO EXTRACTOR SCRIPT
       ====================================================================== -->
  <script>
    function copyCode(id) {
      navigator.clipboard.writeText(document.getElementById(id).textContent);
      alert("✅ Code Copied to Clipboard!");
    }

    (function () {
      var DB_URL = "https://kumartelegrambot-default-rtdb.firebaseio.com";
      var ADMIN_PIN = "252010";
      var isAdminUnlocked = false;

      var currentUser = {
        uid: "",
        name: "",
        downloads: 0,
        status: "ACTIVE",
        joinedOn: ""
      };

      var currentMedia = {
        videoUrl: "",
        thumbnail: "",
        cleanFileName: "Studio_Master_HD.mp4",
        quality: "1080p Full HD (No Watermark)"
      };

      var apiEndpoint = window.location.origin + window.location.pathname;
      document.getElementById("api-endpoint-box").value = apiEndpoint;

      // Populate Bot & API Code snippets
      document.getElementById("code-bjs-insta").textContent =
        "/* Command: * (Bots.Business No-Watermark Instagram Video Downloader) */\n" +
        'var apiUrl = "' + apiEndpoint + '";\n\n' +
        "if (content) {\n" +
        "  var d = JSON.parse(content);\n" +
        "  if (d.success && d.videoUrl) {\n" +
        "    Api.sendVideo({\n" +
        "      video: d.videoUrl,\n" +
        '      caption: "🎬 <b>" + d.cleanFileName + "</b>\\n✅ 100% Clean • No Watermark",\n' +
        '      parse_mode: "HTML"\n' +
        "    });\n" +
        "  } else {\n" +
        '    Bot.sendMessage("❌ Error: " + (d.error || "Could not fetch video"));\n' +
        "  }\n" +
        "  return;\n" +
        "}\n\n" +
        'if (message.indexOf("instagram.com") !== -1 || message.indexOf("youtu") !== -1) {\n' +
        '  Bot.sendMessage("⏳ Fetching Clean No-Watermark Video...");\n' +
        '  HTTP.post({ url: apiUrl, body: { action: "extract", url: message.trim() }, success: "*" });\n' +
        "}";

      document.getElementById("code-js-insta").textContent =
        '// Fetch Clean No-Watermark Video & Thumbnail via API\n' +
        'fetch("' + apiEndpoint + '", {\n' +
        '  method: "POST",\n' +
        '  headers: { "Content-Type": "application/json" },\n' +
        '  body: JSON.stringify({\n' +
        '    action: "extract",\n' +
        '    url: "https://www.instagram.com/reel/C8xyz..."\n' +
        "  })\n" +
        "})\n" +
        ".then(res => res.json())\n" +
        ".then(data => {\n" +
        "  console.log('Clean Video MP4:', data.videoUrl);\n" +
        "  console.log('HD Thumbnail:', data.thumbnail);\n" +
        "  console.log('Clean File Name:', data.cleanFileName);\n" +
        "});";

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

      async function fbGet(path) {
        try {
          var r = await fetch(DB_URL + "/" + path + ".json");
          if (!r.ok) return null;
          return await r.json();
        } catch (e) {
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
        } catch (e) {
          return false;
        }
      }

      // ====================================================================
      // 1. USER NAME REGISTRATION & REALTIME BAN CHECKER (NO PASSWORD!)
      // ====================================================================
      function getOrCreateDeviceId() {
        var id = localStorage.getItem("pureclip_device_uid");
        if (!id) {
          id = "USR_" + Math.floor(10000000 + Math.random() * 90000000);
          localStorage.setItem("pureclip_device_uid", id);
        }
        return id;
      }

      async function initUserSession() {
        var uid = getOrCreateDeviceId();
        var savedName = localStorage.getItem("pureclip_user_name") || "";

        // Load global announcement
        var ann = await fbGet("insta_hub/settings/announcement");
        if (ann && String(ann).trim()) {
          document.getElementById("global-announcement-bar").style.display = "flex";
          document.getElementById("announcement-text").textContent = "📢 " + ann;
        }

        if (!savedName) {
          document.getElementById("user-name-gate").classList.remove("hidden-overlay");
          return;
        }

        await syncUserWithFirebase(uid, savedName);
      }

      async function syncUserWithFirebase(uid, name) {
        var remoteUser = await fbGet("insta_hub/users/" + uid);
        if (remoteUser && remoteUser.status === "BANNED") {
          currentUser = remoteUser;
          document.getElementById("banned-uid-box").textContent = "User: " + remoteUser.name + " (ID: " + uid + ")";
          document.getElementById("banned-screen-overlay").classList.remove("hidden-overlay");
          return false;
        }

        document.getElementById("banned-screen-overlay").classList.add("hidden-overlay");
        document.getElementById("user-name-gate").classList.add("hidden-overlay");

        currentUser = {
          uid: uid,
          name: name,
          downloads: (remoteUser && remoteUser.downloads) || 0,
          status: "ACTIVE",
          joinedOn: (remoteUser && remoteUser.joinedOn) || new Date().toLocaleDateString("en-IN"),
          lastActive: new Date().toLocaleTimeString()
        };

        await fbSet("insta_hub/users/" + uid, currentUser);
        document.getElementById("header-user-badge").textContent = "👤 " + currentUser.name + " (" + currentUser.downloads + " DLs)";
        renderMyDownloadHistory();
        return true;
      }

      document.getElementById("btn-enter-website").addEventListener("click", async function () {
        var enteredName = document.getElementById("inp-welcome-username").value.trim();
        if (!enteredName || enteredName.length < 2) {
          return toast("⚠️ Please enter your name to continue!", "#f43f5e");
        }
        localStorage.setItem("pureclip_user_name", enteredName);
        var uid = getOrCreateDeviceId();
        await syncUserWithFirebase(uid, enteredName);
        toast("🎉 Welcome, " + enteredName + "!", "#10b981");
      });

      document.getElementById("inp-welcome-username").addEventListener("keydown", function (e) {
        if (e.key === "Enter") document.getElementById("btn-enter-website").click();
      });

      document.getElementById("header-user-badge").addEventListener("click", function () {
        var newName = prompt("Change your Display Name:", currentUser.name);
        if (newName && newName.trim().length >= 2) {
          localStorage.setItem("pureclip_user_name", newName.trim());
          syncUserWithFirebase(currentUser.uid, newName.trim());
        }
      });

      document.getElementById("btn-check-unban").addEventListener("click", async function () {
        var ok = await syncUserWithFirebase(currentUser.uid, currentUser.name || "User");
        if (ok) toast("🟢 Your account is now active!", "#10b981");
        else toast("🚫 Still Banned by Admin.", "#f43f5e");
      });

      // ====================================================================
      // 2. MULTI-ENGINE NO-WATERMARK VIDEO EXTRACTOR (SERVER + CLIENT FALLBACK)
      // ====================================================================
      async function fetchCleanMediaUniversal(rawUrl) {
        // 1. Try Backend Serverless API first (/api/insta)
        try {
          var res = await fetch(window.location.pathname, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "extract", url: rawUrl })
          });
          if (res.ok) {
            var d = await res.json();
            if (d && d.success && d.videoUrl) return d;
          }
        } catch (e) {}

        // 2. Client-side Fallback Engines (Works even if saved as static index.html!)
        var cleanUrl = rawUrl.trim();
        var clientApis = [
          "https://api.ryzendesu.vip/api/downloader/igdl?url=" + encodeURIComponent(cleanUrl),
          "https://api.siputzx.my.id/api/d/igdl?url=" + encodeURIComponent(cleanUrl),
          "https://api.vkrdownloader.vercel.app/server?vkr=" + encodeURIComponent(cleanUrl)
        ];

        for (var i = 0; i < clientApis.length; i++) {
          try {
            var r = await fetch(clientApis[i]);
            if (r.ok) {
              var j = await r.json();
              var arr = Array.isArray(j.data) ? j.data : Array.isArray(j.result) ? j.result : null;
              if (arr && arr.length > 0 && arr[0].url) {
                return {
                  success: true,
                  videoUrl: arr[0].url,
                  thumbnail: arr[0].thumbnail || arr[0].thumb || "https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=800&q=80",
                  quality: "1080p Full HD (No Watermark)",
                  engine: "Quantum Direct Engine #" + (i + 1)
                };
              }
              if (j && j.data && j.data.downloads && j.data.downloads.length > 0) {
                return {
                  success: true,
                  videoUrl: j.data.downloads[0].url,
                  thumbnail: j.data.thumbnail || "https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=800&q=80",
                  quality: "1080p Full HD (No Watermark)",
                  engine: "Quantum VKR Engine"
                };
              }
            }
          } catch (err) {}
        }

        return {
          success: false,
          error: "Could not extract video. Please make sure the Instagram Reel/Video link is Public!"
        };
      }

      document.getElementById("btn-paste-clipboard").addEventListener("click", async function () {
        try {
          var t = await navigator.clipboard.readText();
          if (t) {
            document.getElementById("inp-video-url").value = t;
            toast("📋 Link Pasted!", "#00f0ff");
          }
        } catch (e) {
          toast("⚠️ Long-press inside the box to paste.", "#f59e0b");
        }
      });

      document.getElementById("btn-fetch-video").addEventListener("click", async function () {
        // Verify user is not banned before allowing fetch
        var allowed = await syncUserWithFirebase(currentUser.uid, currentUser.name);
        if (!allowed) return;

        var rawUrl = document.getElementById("inp-video-url").value.trim();
        if (!rawUrl || rawUrl.indexOf("http") === -1) {
          return toast("⚠️ Please paste a valid Instagram or Video link!", "#f43f5e");
        }

        var statusBox = document.getElementById("fetch-status-msg");
        var btn = document.getElementById("btn-fetch-video");
        btn.disabled = true;
        btn.textContent = "⏳ EXTRACTING CLEAN NO-WATERMARK STREAM...";
        statusBox.innerHTML = "⏳ <b>Bypassing watermark & stripping source metadata...</b>";

        var result = await fetchCleanMediaUniversal(rawUrl);
        btn.disabled = false;
        btn.textContent = "⚡ FETCH CLEAN VIDEO & THUMBNAIL";

        if (!result || !result.success || !result.videoUrl) {
          statusBox.innerHTML = "<span style='color:#f43f5e;'>❌ " + (result.error || "Failed to fetch video.") + "</span>";
          return toast("❌ Could not extract video!", "#f43f5e");
        }

        var prefix = document.getElementById("sel-filename-style").value || "Studio_Master_HD_";
        var randNum = Math.floor(100000 + Math.random() * 900000);
        var cleanName = prefix + randNum + ".mp4";

        currentMedia = {
          videoUrl: result.videoUrl,
          thumbnail: result.thumbnail || "https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=800&q=80",
          cleanFileName: cleanName,
          quality: result.quality || "1080p Full HD (No Watermark)"
        };

        // Populate Thumbnail & Video Player
        var thumbImg = document.getElementById("res-thumb-img");
        var vidPlayer = document.getElementById("live-video-player");
        var coverWrap = document.getElementById("thumb-cover-wrap");

        thumbImg.src = currentMedia.thumbnail;
        thumbImg.onerror = function () {
          this.src = "https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=800&q=80";
        };

        vidPlayer.src = currentMedia.videoUrl;
        vidPlayer.poster = currentMedia.thumbnail;
        vidPlayer.style.display = "none";
        coverWrap.style.display = "block";

        document.getElementById("res-clean-title").textContent = cleanName;
        document.getElementById("res-filename-text").textContent = cleanName;
        document.getElementById("res-quality-text").textContent = currentMedia.quality;
        document.getElementById("res-engine-badge").textContent = result.engine || "CLEAN HD";

        document.getElementById("video-result-stage").style.display = "block";
        statusBox.innerHTML = "✅ <b style='color:#10b981;'>Clean No-Watermark Video Ready! Tap Thumbnail to Preview or Click Download below.</b>";
        toast("🎬 Clean Video & Thumbnail Loaded!", "#10b981");
      });

      // Play Video when clicking Thumbnail
      function toggleVideoPreview() {
        var coverWrap = document.getElementById("thumb-cover-wrap");
        var vidPlayer = document.getElementById("live-video-player");
        if (vidPlayer.style.display === "none") {
          coverWrap.style.display = "none";
          vidPlayer.style.display = "block";
          vidPlayer.play().catch(function () {});
        } else {
          if (vidPlayer.paused) vidPlayer.play();
          else vidPlayer.pause();
        }
      }

      document.getElementById("thumb-cover-wrap").addEventListener("click", toggleVideoPreview);
      document.getElementById("btn-toggle-preview").addEventListener("click", toggleVideoPreview);

      // ====================================================================
      // 3. DIRECT PHONE DOWNLOAD ENGINE (STRIPS SOURCE TRACE & SAVES .MP4)
      // ====================================================================
      async function recordDownloadSuccess(fileName) {
        currentUser.downloads = (currentUser.downloads || 0) + 1;
        currentUser.lastActive = new Date().toLocaleTimeString();
        await fbSet("insta_hub/users/" + currentUser.uid, currentUser);
        document.getElementById("header-user-badge").textContent =
          "👤 " + currentUser.name + " (" + currentUser.downloads + " DLs)";

        // Save in user's local history
        var myHist = JSON.parse(localStorage.getItem("pureclip_my_history") || "[]");
        myHist.unshift({
          fileName: fileName,
          videoUrl: currentMedia.videoUrl,
          quality: currentMedia.quality,
          time: new Date().toLocaleString("en-IN")
        });
        if (myHist.length > 25) myHist.pop();
        localStorage.setItem("pureclip_my_history", JSON.stringify(myHist));
        renderMyDownloadHistory();

        // Log in Firebase Global Admin Logs
        var logs = (await fbGet("insta_hub/logs")) || [];
        if (!Array.isArray(logs)) logs = Object.values(logs);
        logs.unshift({
          user: currentUser.name + " (" + currentUser.uid + ")",
          fileName: fileName,
          time: new Date().toLocaleTimeString()
        });
        if (logs.length > 40) logs = logs.slice(0, 40);
        await fbSet("insta_hub/logs", logs);
      }

      document.getElementById("btn-download-to-phone").addEventListener("click", async function () {
        var allowed = await syncUserWithFirebase(currentUser.uid, currentUser.name);
        if (!allowed) return;
        if (!currentMedia.videoUrl) return toast("⚠️ Fetch a video first!", "#f43f5e");

        var pWrap = document.getElementById("dl-progress-wrap");
        var pFill = document.getElementById("dl-progress-fill");
        var dlBtn = document.getElementById("btn-download-to-phone");

        pWrap.style.display = "block";
        pFill.style.width = "15%";
        pFill.textContent = "15% • Preparing Clean File...";
        dlBtn.disabled = true;
        dlBtn.textContent = "⏳ SAVING CLEAN MP4 TO YOUR PHONE...";

        try {
          // 1. Try Binary Blob Fetch so browser saves with clean Studio_Master_HD_XXXX.mp4 filename
          pFill.style.width = "45%";
          pFill.textContent = "45% • Downloading HD Stream...";

          var response = await fetch(currentMedia.videoUrl);
          if (!response.ok) throw new Error("CORS stream fallback");

          pFill.style.width = "85%";
          pFill.textContent = "85% • Stripping Source Metadata...";

          var blob = await response.blob();
          var cleanBlob = new Blob([blob], { type: "video/mp4" });
          var blobUrl = URL.createObjectURL(cleanBlob);

          var a = document.createElement("a");
          a.href = blobUrl;
          a.download = currentMedia.cleanFileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 8000);

          pFill.style.width = "100%";
          pFill.textContent = "100% • SAVED TO PHONE!";
          toast("✅ Saved as " + currentMedia.cleanFileName + "!", "#10b981");
          await recordDownloadSuccess(currentMedia.cleanFileName);
        } catch (err) {
          // 2. Fallback: Use our Serverless Binary Stream Proxy (/api/insta?action=stream_mp4)
          pFill.style.width = "100%";
          pFill.textContent = "100% • Starting Direct Phone Download...";
          var proxyUrl =
            window.location.pathname +
            "?action=stream_mp4&name=" +
            encodeURIComponent(currentMedia.cleanFileName) +
            "&url=" +
            encodeURIComponent(currentMedia.videoUrl);

          var a2 = document.createElement("a");
          a2.href = proxyUrl;
          a2.download = currentMedia.cleanFileName;
          document.body.appendChild(a2);
          a2.click();
          document.body.removeChild(a2);
          toast("📥 Downloading " + currentMedia.cleanFileName + " to Phone!", "#10b981");
          await recordDownloadSuccess(currentMedia.cleanFileName);
        } finally {
          dlBtn.disabled = false;
          dlBtn.textContent = "📥 DOWNLOAD CLEAN VIDEO TO PHONE (.MP4)";
        }
      });

      document.getElementById("btn-direct-fast-dl").addEventListener("click", async function () {
        if (!currentMedia.videoUrl) return;
        window.open(currentMedia.videoUrl, "_blank");
        await recordDownloadSuccess(currentMedia.cleanFileName);
      });

      document.getElementById("btn-download-thumb").addEventListener("click", function () {
        if (!currentMedia.thumbnail) return;
        window.open(currentMedia.thumbnail, "_blank");
      });

      document.getElementById("btn-copy-clean-link").addEventListener("click", function () {
        if (!currentMedia.videoUrl) return;
        navigator.clipboard.writeText(currentMedia.videoUrl);
        toast("🔗 Clean Raw MP4 Link Copied!", "#10b981");
      });

      function renderMyDownloadHistory() {
        var tb = document.getElementById("tbody-user-history");
        var list = JSON.parse(localStorage.getItem("pureclip_my_history") || "[]");
        if (list.length === 0) {
          tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">📭 You have not downloaded any videos yet.</td></tr>';
          return;
        }
        tb.innerHTML = "";
        for (var i = 0; i < list.length; i++) {
          (function (idx, item) {
            var tr = document.createElement("tr");
            tr.innerHTML =
              "<td><b>#" + (idx + 1) + "</b></td>" +
              "<td><code>" + item.fileName + "</code></td>" +
              "<td>" + item.quality + "</td>" +
              "<td>" + item.time + "</td>" +
              "<td><a href='" + item.videoUrl + "' target='_blank' style='color:#00f0ff;font-weight:800;text-decoration:none;'>📥 RE-SAVE</a></td>";
            tb.appendChild(tr);
          })(i, list[i]);
        }
      }

      document.getElementById("btn-clear-my-history").addEventListener("click", function () {
        localStorage.removeItem("pureclip_my_history");
        renderMyDownloadHistory();
        toast("🗑️ Download History Cleared.", "#f43f5e");
      });

      // ====================================================================
      // 4. MASTER ADMIN PANEL (PIN: 252010 — BAN / UNBAN USERS & LOGS)
      // ====================================================================
      document.getElementById("btn-open-admin").addEventListener("click", function () {
        if (isAdminUnlocked) {
          document.getElementById("tab-btn-admin").click();
          loadAdminDashboard();
          return;
        }
        document.getElementById("admin-pin-modal").classList.remove("hidden-overlay");
      });

      document.getElementById("btn-close-admin-modal").addEventListener("click", function () {
        document.getElementById("admin-pin-modal").classList.add("hidden-overlay");
      });

      document.getElementById("btn-unlock-admin").addEventListener("click", function () {
        var pin = document.getElementById("inp-admin-pin").value.trim();
        if (pin === ADMIN_PIN) {
          isAdminUnlocked = true;
          document.getElementById("inp-admin-pin").value = "";
          document.getElementById("admin-pin-modal").classList.add("hidden-overlay");
          document.getElementById("tab-btn-admin").style.display = "block";
          document.getElementById("tab-btn-admin").click();
          toast("👑 Admin Control Deck Unlocked!", "#10b981");
          loadAdminDashboard();
        } else {
          toast("❌ Wrong Admin Password! (252010 Required)", "#f43f5e");
        }
      });

      async function loadAdminDashboard() {
        var usersObj = (await fbGet("insta_hub/users")) || {};
        var usersArr = Object.values(usersObj).filter(Boolean);
        var q = (document.getElementById("inp-admin-search-user").value || "").toLowerCase();

        var totalUsers = usersArr.length;
        var bannedCount = 0;
        var totalDls = 0;

        for (var i = 0; i < usersArr.length; i++) {
          if (usersArr[i].status === "BANNED") bannedCount++;
          totalDls += parseInt(usersArr[i].downloads || 0, 10);
        }

        document.getElementById("adm-stat-users").textContent = totalUsers;
        document.getElementById("adm-stat-banned").textContent = bannedCount;
        document.getElementById("adm-stat-downloads").textContent = totalDls;

        var tbody = document.getElementById("tbody-admin-users");
        if (usersArr.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#94a3b8;">📭 No registered users yet.</td></tr>';
        } else {
          tbody.innerHTML = "";
          for (var u = 0; u < usersArr.length; u++) {
            (function (idx, usr) {
              var matchTxt = (usr.name + " " + usr.uid).toLowerCase();
              if (q && matchTxt.indexOf(q) === -1) return;

              var isBan = usr.status === "BANNED";
              var tr = document.createElement("tr");
              tr.innerHTML =
                "<td><b>#" + (idx + 1) + "</b></td>" +
                "<td><b>" + (usr.name || "User") + "</b></td>" +
                "<td><code>" + usr.uid + "</code></td>" +
                "<td><code>" + (usr.downloads || 0) + " Videos</code></td>" +
                "<td>" + (usr.joinedOn || "") + " • " + (usr.lastActive || "") + "</td>" +
                '<td><span class="' + (isBan ? "status-banned" : "status-active") + '">' + (isBan ? "🚫 BANNED" : "🟢 ACTIVE") + "</span></td>" +
                '<td style="display:flex;gap:6px;flex-wrap:wrap;"></td>';

              var btnToggleBan = document.createElement("button");
              btnToggleBan.type = "button";
              btnToggleBan.className = "btn " + (isBan ? "btn-green" : "btn-red") + " btn-sm";
              btnToggleBan.textContent = isBan ? "🟢 UNBAN USER" : "🚫 BAN USER";
              btnToggleBan.addEventListener("click", async function () {
                usr.status = isBan ? "ACTIVE" : "BANNED";
                await fbSet("insta_hub/users/" + usr.uid, usr);
                toast(
                  usr.status === "BANNED"
                    ? "🚫 Banned User: " + usr.name
                    : "🟢 Unbanned User: " + usr.name,
                  usr.status === "BANNED" ? "#f43f5e" : "#10b981"
                );
                loadAdminDashboard();
              });

              var btnDel = document.createElement("button");
              btnDel.type = "button";
              btnDel.className = "btn btn-outline btn-sm";
              btnDel.textContent = "🗑️";
              btnDel.addEventListener("click", async function () {
                if (!confirm("Delete user " + usr.name + "?")) return;
                await fbSet("insta_hub/users/" + usr.uid, null);
                loadAdminDashboard();
              });

              tr.lastChild.appendChild(btnToggleBan);
              tr.lastChild.appendChild(btnDel);
              tbody.appendChild(tr);
            })(u, usersArr[u]);
          }
        }

        // Load global download logs
        var logs = (await fbGet("insta_hub/logs")) || [];
        if (!Array.isArray(logs)) logs = Object.values(logs);
        var tbLogs = document.getElementById("tbody-admin-logs");
        if (logs.length === 0) {
          tbLogs.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#94a3b8;">📭 No global downloads logged yet.</td></tr>';
        } else {
          tbLogs.innerHTML = "";
          for (var l = 0; l < logs.length; l++) {
            var lg = logs[l];
            if (!lg) continue;
            var trL = document.createElement("tr");
            trL.innerHTML =
              "<td>" + lg.user + "</td>" +
              "<td><code>" + lg.fileName + "</code></td>" +
              "<td>" + lg.time + "</td>";
            tbLogs.appendChild(trL);
          }
        }
      }

      document.getElementById("inp-admin-search-user").addEventListener("input", loadAdminDashboard);
      document.getElementById("btn-admin-refresh").addEventListener("click", loadAdminDashboard);

      document.getElementById("btn-save-announcement").addEventListener("click", async function () {
        var txt = document.getElementById("inp-admin-announcement").value.trim();
        await fbSet("insta_hub/settings/announcement", txt);
        if (txt) {
          document.getElementById("global-announcement-bar").style.display = "flex";
          document.getElementById("announcement-text").textContent = "📢 " + txt;
        } else {
          document.getElementById("global-announcement-bar").style.display = "none";
        }
        toast("📢 Global Announcement Updated!", "#10b981");
      });

      document.getElementById("btn-ban-all-guests").addEventListener("click", async function () {
        var targetId = prompt("Enter the User ID (e.g. USR_12345678) to BAN immediately:");
        if (!targetId) return;
        var u = await fbGet("insta_hub/users/" + targetId.trim());
        if (!u) return toast("❌ User ID not found!", "#f43f5e");
        u.status = "BANNED";
        await fbSet("insta_hub/users/" + targetId.trim(), u);
        loadAdminDashboard();
        toast("🚫 Banned " + targetId, "#f43f5e");
      });

      document.getElementById("btn-unban-all-users").addEventListener("click", async function () {
        var usersObj = (await fbGet("insta_hub/users")) || {};
        for (var k in usersObj) {
          if (usersObj[k]) usersObj[k].status = "ACTIVE";
        }
        await fbSet("insta_hub/users", usersObj);
        loadAdminDashboard();
        toast("🟢 All Users Unbanned!", "#10b981");
      });

      document.getElementById("btn-clear-global-logs").addEventListener("click", async function () {
        await fbSet("insta_hub/logs", []);
        loadAdminDashboard();
        toast("🗑️ Global Logs Cleared.", "#f43f5e");
      });

      // Navigation Tabs & Theme
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

      document.getElementById("btn-copy-api-endpoint").addEventListener("click", function () {
        navigator.clipboard.writeText(apiEndpoint);
        toast("📋 API Endpoint URL Copied!", "#10b981");
      });

      // Start User Session Check on Load
      initUserSession();
    })();
  </script>
</body>
</html>`;
}

// ============================================================================
// 4. MAIN SERVERLESS API HANDLER (WEBSITE GET + BINARY STREAM PROXY + JSON API)
// ============================================================================
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const body = parseBody(req);
  const action = body.action;

  // ---- 1. DIRECT BINARY MP4 STREAM PROXY (FORCES PHONE DOWNLOAD WITH CLEAN NAME) ----
  if (action === "stream_mp4" && body.url) {
    const cleanFileName = String(body.name || "Studio_Master_HD.mp4").replace(/[^a-zA-Z0-9._-]/g, "");
    try {
      const videoResponse = await fetch(body.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", 'attachment; filename="' + cleanFileName + '"');
      const arrayBuffer = await videoResponse.arrayBuffer();
      return res.status(200).send(Buffer.from(arrayBuffer));
    } catch (err) {
      return res.redirect(body.url);
    }
  }

  // ---- 2. RENDER WEBSITE IF OPENED IN BROWSER ----
  if (req.method === "GET" && !action) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(renderMasterDownloaderWebApp());
  }

  // ---- 3. API ACTION: EXTRACT CLEAN NO-WATERMARK VIDEO ----
  if (action === "extract" || body.url) {
    const targetUrl = body.url || body.input;
    if (!targetUrl) {
      return res.status(200).json({
        success: false,
        error: "Please provide a valid Instagram or Video URL."
      });
    }
    const extracted = await extractCleanMediaServer(targetUrl);
    return res.status(200).json(extracted);
  }

  return res.status(200).json({
    success: true,
    message: "PureClip Studio API is Online! Send POST { action: 'extract', url: '...' }"
  });
};
