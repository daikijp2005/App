import { detectPlatform, normalizeUrl } from "./analyze.js";
export { detectPlatform, normalizeUrl };

// URL から投稿の中身（タイトル・キャプション・画像）を取ってくる。
// SNSごとに公開の oEmbed があればそれを使い、なければ HTML の OGP / JSON-LD を読む。

const TIMEOUT_MS = 8000;
const MAX_HTML = 1_500_000;



async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { redirect: "follow", ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url) {
  const res = await fetchWithTimeout(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const OEMBED = {
  tiktok: (u) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(u)}`,
  youtube: (u) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u)}`,
  x: (u) => `https://publish.twitter.com/oembed?omit_script=1&url=${encodeURIComponent(u)}`,
};

function decodeEntities(s) {
  return String(s || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function stripTags(html) {
  return decodeEntities(String(html || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t]+/g, " ").trim();
}

export function parseHtml(html) {
  const meta = {};
  const re = /<meta\s+[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const key = (tag.match(/(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i) || [])[1];
    const content = (tag.match(/content\s*=\s*"([^"]*)"/i) || tag.match(/content\s*=\s*'([^']*)'/i) || [])[1];
    if (key && content != null && !(key.toLowerCase() in meta)) meta[key.toLowerCase()] = decodeEntities(content);
  }
  const titleTag = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];

  // JSON-LD（食べログやお店の公式サイトなどに住所・価格帯・緯度経度が入っていることが多い）
  const ld = {};
  const ldRe = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = ldRe.exec(html))) {
    try {
      const data = JSON.parse(m[1].trim());
      const nodes = [].concat(data["@graph"] || data);
      for (const n of nodes) {
        if (!n || typeof n !== "object") continue;
        if (n.name && !ld.name && !/WebSite|WebPage|BreadcrumbList|Organization/.test(n["@type"])) ld.name = n.name;
        if (n.address && !ld.address) {
          const a = n.address;
          ld.address = typeof a === "string" ? a : [a.addressRegion, a.addressLocality, a.streetAddress].filter(Boolean).join("");
        }
        if (n.geo && n.geo.latitude && !ld.lat) { ld.lat = Number(n.geo.latitude); ld.lng = Number(n.geo.longitude); }
        if (n.priceRange && !ld.priceRange) ld.priceRange = n.priceRange;
        if (n.servesCuisine && !ld.cuisine) ld.cuisine = [].concat(n.servesCuisine).join(" ");
        if (n.description && !ld.description) ld.description = n.description;
      }
    } catch { /* 壊れた JSON-LD は無視 */ }
  }

  return {
    title: meta["og:title"] || meta["twitter:title"] || decodeEntities(titleTag || "").trim(),
    description: meta["og:description"] || meta["twitter:description"] || meta["description"] || ld.description || "",
    image: meta["og:image"] || meta["og:image:url"] || meta["twitter:image"] || meta["twitter:image:src"] || "",
    siteName: meta["og:site_name"] || "",
    lat: ld.lat || Number(meta["place:location:latitude"]) || null,
    lng: ld.lng || Number(meta["place:location:longitude"]) || null,
    ld,
  };
}

// 取得したページから、解析に回すテキストとプレビュー情報を組み立てる
export async function fetchPreview(rawUrl) {
  const url = normalizeUrl(rawUrl);
  if (!url) throw Object.assign(new Error("URLが正しくありません"), { status: 400 });
  const platform = detectPlatform(url);
  const out = { url, finalUrl: url, platform, title: "", description: "", image: "", author: "", siteName: "", lat: null, lng: null, ld: {}, warnings: [] };

  if (OEMBED[platform]) {
    try {
      const j = await fetchJson(OEMBED[platform](url));
      out.title = j.title || "";
      out.author = j.author_name || "";
      out.image = j.thumbnail_url || "";
      if (platform === "x" && j.html) out.description = stripTags(j.html.replace(/<a[^>]*>(?:pic\.twitter|https?:\/\/t\.co)[^<]*<\/a>/g, ""));
    } catch (e) {
      out.warnings.push(`oEmbed取得失敗: ${e.message}`);
    }
  }

  // HTML 本体。Instagram 等はクローラー向けに OGP を返すことがあるので UA を切り替えて試す
  const agents = [
    "Mozilla/5.0 (compatible; facebookexternalhit/1.1; +http://www.facebook.com/externalhit_uatext.php)",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  ];
  for (const ua of agents) {
    if (out.description && out.image) break;
    try {
      const res = await fetchWithTimeout(url, { headers: { "user-agent": ua, "accept-language": "ja,en;q=0.8", accept: "text/html,*/*" } });
      out.finalUrl = res.url || url;
      if (!res.ok) { out.warnings.push(`ページ取得 HTTP ${res.status}`); continue; }
      const html = (await res.text()).slice(0, MAX_HTML);
      const p = parseHtml(html);
      out.title ||= p.title;
      if (p.description && p.description.length > out.description.length) out.description = p.description;
      out.image ||= p.image;
      out.siteName ||= p.siteName;
      out.lat ||= p.lat;
      out.lng ||= p.lng;
      out.ld = { ...p.ld, ...out.ld };
    } catch (e) {
      out.warnings.push(`ページ取得失敗: ${e.message}`);
    }
  }

  // 短縮URL（maps.app.goo.gl など）を展開した先が Google マップなら座標が URL に入っている
  const coord = out.finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || out.finalUrl.match(/[?&](?:q|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (coord && !out.lat) { out.lat = Number(coord[1]); out.lng = Number(coord[2]); }
  if (platform === "googlemaps" && !out.title) {
    const place = out.finalUrl.match(/\/place\/([^/]+)/);
    if (place) out.title = decodeURIComponent(place[1].replace(/\+/g, " "));
  }

  if (out.image && out.image.startsWith("/")) {
    try { out.image = new URL(out.image, out.finalUrl).toString(); } catch { out.image = ""; }
  }
  out.ok = Boolean(out.title || out.description);
  return out;
}

// Instagram の og:description は「1,234 likes, 5 comments - user on June 1, 2026: "本文"」の形なので本文だけ抜く
export function cleanCaption(platform, text) {
  let t = String(text || "");
  // 埋め込み用に別ドメインを経由した場合でも同じ形式なら本文を抜く
  if (platform === "instagram" || /^[\d,.]+\s*(likes?|いいね)/i.test(t)) {
    const m = t.match(/:\s*["“]([\s\S]+)["”]\s*\.?$/);
    if (m) t = m[1];
    t = t.replace(/^[\d,.]+\s*(likes?|いいね！?)[^-–]*[-–]\s*/i, "");
  }
  return t.trim();
}
