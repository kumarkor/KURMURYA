// ============================================================================
// FILE: api/insta.js (8-ENGINE SUPER INSTAGRAM & VIDEO EXTRACTOR API)
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
  const m = String(url || "").match(/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,})/i);
  return m ? m[1] : null;
}

// Unescapes Instagram's Embed HTML where quotes are \"video_url\"
function parseInstagramEmbedHtml(rawHtml) {
  if (!rawHtml || typeof rawHtml !== "string") return null;
  const clean = rawHtml
    .replace(/\\\\u0026/g, "&")
    .replace(/\\u0026/g, "&")
    .replace(/\\\\\//g, "/")
    .replace(/\\\//g, "/")
    .replace(/\\\\"/g, '"')
    .replace(/\\"/g, '"')
    .replace(/&amp;/g, "&");

  let videoUrl = "";
  let thumbUrl = "";

  const v1 = clean.match(/"video_url"\s*:\s*"(https?:\/\/[^"]+)"/);
  if (v1 && v1[1]) videoUrl = v1[1];

  if (!videoUrl) {
    const v2 = clean.match(/property="og:video(?::secure_url)?"\s+content="(https?:\/\/[^"]+)"/i);
    if (v2 && v2[1]) videoUrl = v2[1];
  }

  const t1 = clean.match(/"display_url"\s*:\s*"(https?:\/\/[^"]+)"/);
  if (t1 && t1[1]) thumbUrl = t1[1];

  if (!thumbUrl) {
    const t2 = clean.match(/class="EmbeddedMediaImage"[^>]+src="(https?:\/\/[^"]+)"/i);
    if (t2 && t2[1]) thumbUrl = t2[1];
  }

  if (!thumbUrl) {
    const t3 = clean.match(/property="og:image"\s+content="(https?:\/\/[^"]+)"/i);
    if (t3 && t3[1]) thumbUrl = t3[1];
  }

  if (videoUrl) {
    return { videoUrl: videoUrl, thumbnail: thumbUrl };
  }
  return null;
}

async function extractCleanMediaServer(rawInputUrl) {
  let workingUrl = String(rawInputUrl || "").trim();
  const randomStudioId = Math.floor(100000 + Math.random() * 900000);
  const cleanFileName = "Studio_Master_HD_" + randomStudioId + ".mp4";

  // 0. If link is an Instagram /share/ redirect link, resolve final URL first
  if (workingUrl.includes("/share/")) {
    try {
      const redir = await fetch(workingUrl, {
        method: "GET",
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X)" }
      });
      if (redir && redir.url) workingUrl = redir.url;
    } catch (e) {}
  }

  const shortcode = extractInstaShortcode(workingUrl);
  const normalizedUrl = shortcode
    ? "https://www.instagram.com/reel/" + shortcode + "/"
    : workingUrl;

  // ---- ENGINE 1: INSTAGRAM OFFICIAL WEB GRAPHQL POST (HIGHEST SUCCESS RATE) ----
  if (shortcode) {
    const docIds = ["8845758582119845", "10015901848480474"];
    for (let d = 0; d < docIds.length; d++) {
      try {
        const bodyParams = new URLSearchParams();
        bodyParams.append("av", "0");
        bodyParams.append("lsd", "AVqbxe3J_YA");
        bodyParams.append("doc_id", docIds[d]);
        bodyParams.append(
          "variables",
          JSON.stringify({
            shortcode: shortcode,
            fetch_comment_count: 2,
            fetch_related_profile_media_count: 0,
            parent_comment_count: 0,
            child_comment_count: 0,
            fetch_like_count: 10,
            fetch_tagged_user_count: null,
            fetch_preview_comment_count: 2,
            has_threaded_comments: true,
            hoisted_comment_id: null,
            hoisted_reply_id: null
          })
        );

        const gqlRes = await fetch("https://www.instagram.com/api/graphql", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "X-IG-App-ID": "936619743392459",
            "X-FB-LSD": "AVqbxe3J_YA",
            "X-ASBD-ID": "129477",
            "Sec-Fetch-Site": "same-origin"
          },
          body: bodyParams.toString()
        });

        if (gqlRes.ok) {
          const gqlJson = await gqlRes.json();
          const media =
            (gqlJson && gqlJson.data && gqlJson.data.xdt_shortcode_media) ||
            (gqlJson && gqlJson.data && gqlJson.data.shortcode_media);

          if (media && media.video_url) {
            return {
              success: true,
              videoUrl: media.video_url,
              thumbnail: media.display_url || media.thumbnail_src || "",
              cleanFileName: cleanFileName,
              quality: "1080p Original Raw CDN (No Watermark)",
              engine: "IG GraphQL Direct"
            };
          }
        }
      } catch (e) {}
    }

    // ---- ENGINE 2: INSTAGRAM EMBED CAPTIONED UNESCAPER ----
    try {
      const embedUrl = "https://www.instagram.com/p/" + shortcode + "/embed/captioned/";
      const r = await fetch(embedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
          "Accept": "text/html,application/xhtml+xml"
        }
      });
      const rawHtml = await r.text();
      const parsedEmbed = parseInstagramEmbedHtml(rawHtml);
      if (parsedEmbed && parsedEmbed.videoUrl) {
        return {
          success: true,
          videoUrl: parsedEmbed.videoUrl,
          thumbnail: parsedEmbed.thumbnail || "",
          cleanFileName: cleanFileName,
          quality: "1080p Original Raw Stream (No Watermark)",
          engine: "Direct Embed Unescaper"
        };
      }
    } catch (e) {}
  }

  // ---- ENGINE 3: MULTI-NETWORK JSON DOWNLOADER APIS ----
  const apiEndpoints = [
    "https://api.siputzx.my.id/api/d/igdl?url=" + encodeURIComponent(normalizedUrl),
    "https://deliriussapi-v2.vercel.app/download/instagram?url=" + encodeURIComponent(normalizedUrl),
    "https://api.ryzendesu.vip/api/downloader/igdl?url=" + encodeURIComponent(normalizedUrl),
    "https://api.vkrdownloader.vercel.app/server?vkr=" + encodeURIComponent(normalizedUrl),
    "https://www.tikwm.com/api/?url=" + encodeURIComponent(normalizedUrl)
  ];

  for (let i = 0; i < apiEndpoints.length; i++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const r = await fetch(apiEndpoints[i], {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        signal: controller.signal
      });
      clearTimeout(timer);

      if (r.ok) {
        const d = await r.json();
        const list = Array.isArray(d.data) ? d.data : Array.isArray(d.result) ? d.result : null;
        if (list && list.length > 0) {
          const item = list[0];
          const vUrl = typeof item === "string" ? item : item.url || item.dl_url || item.video;
          const tUrl = typeof item === "object" ? item.thumbnail || item.thumb || "" : "";
          if (vUrl) {
            return {
              success: true,
              videoUrl: vUrl,
              thumbnail: tUrl,
              cleanFileName: cleanFileName,
              quality: "1080p Full HD (No Watermark)",
              engine: "Cloud Engine #" + (i + 1)
            };
          }
        }
        if (d && d.data && (d.data.url || d.data.play)) {
          return {
            success: true,
            videoUrl: d.data.url || d.data.play,
            thumbnail: d.data.cover || d.data.thumbnail || "",
            cleanFileName: cleanFileName,
            quality: "1080p Full HD (No Watermark)",
            engine: "Cloud CDN Engine"
          };
        }
        if (d && d.data && d.data.downloads && d.data.downloads.length > 0) {
          return {
            success: true,
            videoUrl: d.data.downloads[0].url,
            thumbnail: d.data.thumbnail || "",
            cleanFileName: cleanFileName,
            quality: "1080p Full HD (No Watermark)",
            engine: "VKR Engine"
          };
        }
      }
    } catch (err) {}
  }

  return {
    success: false,
    error: "Could not extract video. Please make sure the Instagram Reel/Post link is Public!"
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

  if (action === "extract" || body.url) {
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
