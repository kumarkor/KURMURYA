// ============================================================================
// FILE: api/insta.js (PARALLEL TURBO ENGINE - 100% REEL EXTRACTION FIX)
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

function extractInstaShortcode(url) {
  const m = String(url || "").match(/(?:p|reel|reels|tv|share\/reel|share\/p)\/([A-Za-z0-9_-]{5,})/i);
  return m ? m[1] : null;
}

function unescapeInstaString(rawStr) {
  if (!rawStr || typeof rawStr !== "string") return "";
  return rawStr
    .replace(/\\\\u0026/g, "&")
    .replace(/\\u0026/g, "&")
    .replace(/\\\\u003d/gi, "=")
    .replace(/\\u003d/gi, "=")
    .replace(/\\\\\//g, "/")
    .replace(/\\\//g, "/")
    .replace(/\\\\"/g, '"')
    .replace(/\\"/g, '"')
    .replace(/&amp;/g, "&");
}

// Deep HTML & JSON Parser (Supports video_url, video_versions, contentUrl, playable_url, og:video)
function parseInstagramHtmlDeep(rawHtml) {
  if (!rawHtml || typeof rawHtml !== "string") return null;
  const clean = unescapeInstaString(rawHtml);

  let videoUrl = "";
  let thumbUrl = "";

  const videoPatterns = [
    /"video_url"\s*:\s*"(https?:\/\/[^"]+)"/i,
    /"video_versions"\s*:\s*\[\s*\{[^}]*?"url"\s*:\s*"(https?:\/\/[^"]+)"/i,
    /"contentUrl"\s*:\s*"(https?:\/\/[^"]+)"/i,
    /"playable_url_quality_hd"\s*:\s*"(https?:\/\/[^"]+)"/i,
    /"playable_url"\s*:\s*"(https?:\/\/[^"]+)"/i,
    /property="og:video(?::secure_url)?"\s+content="(https?:\/\/[^"]+)"/i,
    /content="(https?:\/\/[^"]+)"\s+property="og:video(?::secure_url)?"/i,
    /<meta\s+name="twitter:player:stream"\s+content="(https?:\/\/[^"]+)"/i,
    /<video[^>]+src="(https?:\/\/[^"]+)"/i
  ];

  for (let i = 0; i < videoPatterns.length; i++) {
    const m = clean.match(videoPatterns[i]);
    if (m && m[1] && !m[1].includes(".jpg") && !m[1].includes(".png")) {
      videoUrl = m[1];
      break;
    }
  }

  const thumbPatterns = [
    /"display_url"\s*:\s*"(https?:\/\/[^"]+)"/i,
    /"thumbnail_src"\s*:\s*"(https?:\/\/[^"]+)"/i,
    /class="EmbeddedMediaImage"[^>]+src="(https?:\/\/[^"]+)"/i,
    /property="og:image"\s+content="(https?:\/\/[^"]+)"/i
  ];

  for (let j = 0; j < thumbPatterns.length; j++) {
    const tm = clean.match(thumbPatterns[j]);
    if (tm && tm[1]) {
      thumbUrl = tm[1];
      break;
    }
  }

  if (videoUrl) {
    return { videoUrl: videoUrl, thumbnail: thumbUrl };
  }
  return null;
}

// Recursive JSON scanner to find any valid MP4 / CDN video URL inside unknown API responses
function findVideoInJsonObject(obj) {
  if (!obj) return null;
  let foundVideo = "";
  let foundThumb = "";

  function walk(node) {
    if (foundVideo) return;
    if (typeof node === "string") {
      const s = unescapeInstaString(node);
      if (
        s.startsWith("http") &&
        (s.includes(".mp4") || s.includes("cdninstagram.com/o1/v/") || s.includes("fbcdn.net/v/")) &&
        !s.includes(".jpg") &&
        !s.includes(".webp") &&
        !s.includes(".png")
      ) {
        foundVideo = s;
      }
      return;
    }
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) walk(node[i]);
      return;
    }
    if (typeof node === "object") {
      const priorityKeys = ["video_url", "url", "dl_url", "download_url", "play", "hd", "video", "mp4"];
      for (let k of priorityKeys) {
        if (typeof node[k] === "string" && node[k].startsWith("http")) {
          const v = unescapeInstaString(node[k]);
          if (!v.includes(".jpg") && !v.includes(".png") && !v.includes(".webp")) {
            foundVideo = v;
            break;
          }
        }
      }
      if (!foundThumb) {
        const tKeys = ["thumbnail", "thumb", "display_url", "cover", "image"];
        for (let tk of tKeys) {
          if (typeof node[tk] === "string" && node[tk].startsWith("http")) {
            foundThumb = unescapeInstaString(node[tk]);
            break;
          }
        }
      }
      for (let key in node) {
        walk(node[key]);
      }
    }
  }

  walk(obj);
  return foundVideo ? { videoUrl: foundVideo, thumbnail: foundThumb } : null;
}

function fetchWithTimeout(url, options, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms || 5000);
  const opts = Object.assign({}, options || {}, { signal: controller.signal });
  return fetch(url, opts).finally(() => clearTimeout(timer));
}

// ============================================================================
// INDIVIDUAL EXTRACTION ENGINES (RUN IN PARALLEL FOR MAXIMUM RELIABILITY)
// ============================================================================

// ENGINE 1: Instagram Embed Captioned & Reel Embed
async function engineInstaEmbed(shortcode) {
  if (!shortcode) throw new Error("No shortcode");
  const urls = [
    "https://www.instagram.com/p/" + shortcode + "/embed/captioned/",
    "https://www.instagram.com/reel/" + shortcode + "/embed/captioned/",
    "https://www.instagram.com/p/" + shortcode + "/embed/"
  ];

  for (let u of urls) {
    const r = await fetchWithTimeout(
      u,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9"
        }
      },
      4500
    );
    if (r.ok) {
      const html = await r.text();
      const parsed = parseInstagramHtmlDeep(html);
      if (parsed && parsed.videoUrl) {
        return {
          videoUrl: parsed.videoUrl,
          thumbnail: parsed.thumbnail,
          engine: "Direct Embed Engine"
        };
      }
    }
  }
  throw new Error("Embed failed");
}

// ENGINE 2: Instagram Official GraphQL POST (Supports Single Reel + Carousel Sidecar + video_versions)
async function engineInstaGraphQL(shortcode) {
  if (!shortcode) throw new Error("No shortcode");
  const randToken = Math.random().toString(36).substring(2, 14) + Math.random().toString(36).substring(2, 14);
  const docIds = ["8845758582119845", "10015901848480474", "7341532402634560"];

  for (let docId of docIds) {
    const bodyParams = new URLSearchParams();
    bodyParams.append("av", "0");
    bodyParams.append("lsd", randToken);
    bodyParams.append("doc_id", docId);
    bodyParams.append(
      "variables",
      JSON.stringify({
        shortcode: shortcode,
        fetch_comment_count: 0,
        fetch_related_profile_media_count: 0,
        parent_comment_count: 0,
        child_comment_count: 0,
        fetch_like_count: 0,
        fetch_tagged_user_count: null,
        fetch_preview_comment_count: 0,
        has_threaded_comments: false
      })
    );

    const r = await fetchWithTimeout(
      "https://www.instagram.com/api/graphql",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          "X-IG-App-ID": "936619743392459",
          "X-FB-LSD": randToken,
          "X-CSRFToken": randToken,
          "X-ASBD-ID": "129477",
          "Cookie": "csrftoken=" + randToken + ";",
          "Referer": "https://www.instagram.com/reel/" + shortcode + "/"
        },
        body: bodyParams.toString()
      },
      4500
    );

    if (r.ok) {
      const text = await r.text();
      const parsed = parseInstagramHtmlDeep(text);
      if (parsed && parsed.videoUrl) {
        return {
          videoUrl: parsed.videoUrl,
          thumbnail: parsed.thumbnail,
          engine: "IG GraphQL Engine"
        };
      }
    }
  }
  throw new Error("GraphQL failed");
}

// ENGINE 3: TelegramBot OpenGraph Proxies (vxinstagram / ddinstagram / kkinstagram)
async function engineOpenGraphProxies(shortcode) {
  if (!shortcode) throw new Error("No shortcode");
  const proxyUrls = [
    "https://d.ddinstagram.com/reel/" + shortcode + "/",
    "https://www.vxinstagram.com/reel/" + shortcode + "/",
    "https://www.kkinstagram.com/reel/" + shortcode + "/"
  ];

  for (let pUrl of proxyUrls) {
    try {
      const r = await fetchWithTimeout(
        pUrl,
        {
          headers: {
            "User-Agent": "TelegramBot (like TwitterBot)"
          },
          redirect: "follow"
        },
        4500
      );
      // If redirected directly to an MP4 stream
      if (r.url && (r.url.includes(".mp4") || r.url.includes("cdninstagram.com"))) {
        return {
          videoUrl: r.url,
          thumbnail: "",
          engine: "OpenGraph Direct Stream"
        };
      }
      if (r.ok) {
        const html = await r.text();
        const parsed = parseInstagramHtmlDeep(html);
        if (parsed && parsed.videoUrl) {
          return {
            videoUrl: parsed.videoUrl,
            thumbnail: parsed.thumbnail,
            engine: "OpenGraph Proxy Engine"
          };
        }
      }
    } catch (e) {}
  }
  throw new Error("OG Proxy failed");
}

// ENGINE 4: Parallel Cloud Downloader APIs
async function engineCloudApi(apiUrl, label) {
  const r = await fetchWithTimeout(
    apiUrl,
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json"
      }
    },
    5500
  );
  if (!r.ok) throw new Error(label + " HTTP error");
  const json = await r.json();
  const found = findVideoInJsonObject(json);
  if (found && found.videoUrl) {
    return {
      videoUrl: found.videoUrl,
      thumbnail: found.thumbnail || "",
      engine: label
    };
  }
  throw new Error(label + " no videoUrl");
}

// ============================================================================
// MASTER PARALLEL EXTRACTOR
// ============================================================================
async function extractCleanMediaServer(rawInputUrl) {
  let workingUrl = String(rawInputUrl || "").trim();
  const randomStudioId = Math.floor(100000 + Math.random() * 900000);
  const cleanFileName = "Studio_Master_HD_" + randomStudioId + ".mp4";

  // Resolve /share/ redirect links if needed
  if (workingUrl.includes("/share/")) {
    try {
      const redir = await fetchWithTimeout(
        workingUrl,
        {
          method: "GET",
          redirect: "follow",
          headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" }
        },
        3500
      );
      if (redir && redir.url) workingUrl = redir.url;
    } catch (e) {}
  }

  const shortcode = extractInstaShortcode(workingUrl);
  const normalizedUrl = shortcode
    ? "https://www.instagram.com/reel/" + shortcode + "/"
    : workingUrl;

  const encodedUrl = encodeURIComponent(normalizedUrl);

  // Launch ALL engines in parallel so whichever succeeds first wins immediately!
  const tasks = [
    engineInstaEmbed(shortcode),
    engineInstaGraphQL(shortcode),
    engineOpenGraphProxies(shortcode),
    engineCloudApi("https://api.siputzx.my.id/api/d/igdl?url=" + encodedUrl, "Siputzx Engine"),
    engineCloudApi("https://api.ryzendesu.vip/api/downloader/igdl?url=" + encodedUrl, "Ryzen Engine"),
    engineCloudApi("https://deliriussapi-v2.vercel.app/download/instagram?url=" + encodedUrl, "Delirius Engine"),
    engineCloudApi("https://bk9.fun/download/instagram?url=" + encodedUrl, "BK9 Engine"),
    engineCloudApi("https://api.agatz.xyz/api/instagram?url=" + encodedUrl, "Agatz Engine"),
    engineCloudApi("https://api.vkrdownloader.vercel.app/server?vkr=" + encodedUrl, "VKR Engine")
  ];

  try {
    const winner = await Promise.any(tasks);
    if (winner && winner.videoUrl) {
      return {
        success: true,
        videoUrl: winner.videoUrl,
        thumbnail: winner.thumbnail || "",
        cleanFileName: cleanFileName,
        quality: "1080p Full HD (No Watermark)",
        engine: winner.engine || "Quantum Parallel Engine"
      };
    }
  } catch (aggErr) {}

  return {
    success: false,
    error: "Could not extract video. Please make sure the Instagram Reel/Post link is Public!"
  };
}

// ============================================================================
// MAIN VERCEL SERVERLESS HANDLER
// ============================================================================
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
      const videoResponse = await fetch(body.url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
      });
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", 'attachment; filename="' + cleanFileName + '"');
      const arrayBuffer = await videoResponse.arrayBuffer();
      return res.status(200).send(Buffer.from(arrayBuffer));
    } catch (err) {
      return res.redirect(body.url);
    }
  }

  if (action === "extract" || body.url || body.input) {
    const targetUrl = body.url || body.input;
    const extracted = await extractCleanMediaServer(targetUrl);
    return res.status(200).json(extracted);
  }

  if (req.method === "GET") {
    return res.redirect("/");
  }

  return res.status(200).json({
    success: true,
    status: "ONLINE",
    endpoint: "/api/insta"
  });
};
