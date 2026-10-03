// 住所・店名から緯度経度を出す（OpenStreetMap の Nominatim を利用）。
// 利用規約に従い User-Agent を付け、同じ問い合わせはキャッシュする。

const cache = new Map();
let lastCall = 0;

export async function geocode(query) {
  const q = String(query || "").trim();
  if (!q) return null;
  if (cache.has(q)) return cache.get(q);

  // Nominatim は 1秒1リクエストまで
  const wait = Math.max(0, lastCall + 1100 - Date.now());
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();

  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=ja&countrycodes=jp&q=${encodeURIComponent(q)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": process.env.GEOCODER_UA || "futari-ikitai/1.0 (self-hosted couple wishlist)" },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const [hit] = await res.json();
    const result = hit ? { lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name } : null;
    cache.set(q, result);
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// 店名 → 住所 → 駅 → 市区町村 の順に試す
export async function geocodePlace({ placeName, address, station, city, prefecture }) {
  const candidates = [
    address,
    placeName && (prefecture || city) ? `${placeName} ${prefecture}${city}` : "",
    placeName,
    station,
    `${prefecture}${city}`,
  ].filter((s, i, arr) => s && s.trim().length > 1 && arr.indexOf(s) === i);
  for (const c of candidates) {
    const r = await geocode(c);
    if (r) return { ...r, matched: c };
  }
  return null;
}
