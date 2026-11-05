// ============================================================================
// FILE: api/insta.js (NO-WATERMARK INSTAGRAM & VIDEO EXTRACTOR API + WEB UI)
// ============================================================================
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

function cleanMediaUrl(rawUrl) {
  const trimmed = String(rawUrl || "").trim();
  try {
    const u = new URL(trimmed);
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

async function extractCleanMediaServer(rawUrl) {
  const cleanUrl = cleanMediaUrl(rawUrl);
  const shortcode = extractInstaShortcode(cleanUrl);
  const randomStudioId = Math.floor(100000 + Math.random() * 900000);
  const cleanFileName = "Studio_Master_HD_" + randomStudioId + ".mp4";

  const apiEndpoints = [
    "https://api.ryzendesu.vip/api/downloader/igdl?url=" + encodeURIComponent(cleanUrl),
    "https://api.siputzx.my.id/api/d/igdl?url=" + encodeURIComponent(cleanUrl),
    "https://api.vkrdownloader.vercel.app/server?vkr=" + encodeURIComponent(cleanUrl)
  ];

  for (let i = 0; i < apiEndpoints.length; i++) {
    try {
      const r = await fetch(apiEndpoints[i], {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
      });
      if (r.ok) {
        const d = await r.json();
        const list = Array.isArray(d.data) ? d.data : Array.isArray(d.result) ? d.result : null;
        if (list && list.length > 0 && list[0].url) {
          return {
            success: true,
            videoUrl: list[0].url,
            thumbnail: list[0].thumbnail || list[0].thumb || "",
            cleanTitle: "Original Master Video #" + randomStudioId,
            cleanFileName: cleanFileName,
            quality: "1080p Full HD (No Watermark)",
            engine: "Quantum Engine #" + (i + 1)
          };
        }
        if (d && d.data && d.data.downloads && d.data.downloads.length > 0) {
          return {
            success: true,
            videoUrl: d.data.downloads[0].url,
            thumbnail: d.data.thumbnail || "",
            cleanTitle: "Original Master Video #" + randomStudioId,
            cleanFileName: cleanFileName,
            quality: "1080p Full HD (No Watermark)",
            engine: "Quantum VKR Engine"
          };
        }
      }
    } catch (err) {}
  }

  if (shortcode) {
    try {
      const embedUrl = "https://www.instagram.com/p/" + shortcode + "/embed/captioned/";
      const r = await fetch(embedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15"
        }
      });
      const html = await r.text();
      const videoMatch = html.match(/"video_url":"([^"]+)"/);
      const thumbMatch = html.match(/"display_url":"([^"]+)"/);
      if (videoMatch && videoMatch[1]) {
        return {
          success: true,
          videoUrl: videoMatch[1].replace(/\\u0026/g, "&").replace(/\\/g, ""),
          thumbnail: thumbMatch ? thumbMatch[1].replace(/\\u0026/g, "&").replace(/\\/g, "") : "",
          cleanTitle: "Original Master Video #" + randomStudioId,
          cleanFileName: cleanFileName,
          quality: "1080p Original Raw Stream",
          engine: "Direct CDN Scraper"
        };
      }
    } catch (e) {}
  }

  return {
    success: false,
    error: "Could not extract video. Make sure the Instagram/Video link is Public!"
  };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const body = parseBody(req);
  const action = body.action;

  if (action === "stream_mp4" && body.url) {
    const cleanFileName = String(body.name || "Studio_Master_HD.mp4").replace(/[^a-zA-Z0-9._-]/g, "");
    try {
      const videoResponse = await fetch(body.url);
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", 'attachment; filename="' + cleanFileName + '"');
      const arrayBuffer = await videoResponse.arrayBuffer();
      return res.status(200).send(Buffer.from(arrayBuffer));
    } catch (err) {
      return res.redirect(body.url);
    }
  }

  if (action === "extract" || body.url) {
    const targetUrl = body.url || body.input;
    const extracted = await extractCleanMediaServer(targetUrl);
    return res.status(200).json(extracted);
  }

  // Redirect browser GET requests to root index.html UI
  if (req.method === "GET") {
    return res.redirect("/");
  }

  return res.status(200).json({
    success: true,
    status: "ONLINE",
    endpoint: "/api/insta"
  });
};
