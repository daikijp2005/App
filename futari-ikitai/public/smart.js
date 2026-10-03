// ふたりの行きたいリストの「賢い」部分（画面に依存しない純粋なロジック）
// 営業時間の判定・旬の判定・デートコースの組み立て・外部アプリへのリンクを作る。
import { distanceKm, estimateTravel } from "./util.js";

export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const toHalf = (s) =>
  String(s || "")
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/[：]/g, ":")
    .replace(/[〜～－ー―‐–—]/g, "-");

// 「11:30〜22:00」「10時〜19時」「17:00-翌2:00」「24時間営業」「火曜定休」「定休日: 水・木」などを読む
export function parseHours(hours, closed = "") {
  const h = toHalf(hours);
  const c = toHalf(closed);
  if (!h.trim() && !c.trim()) return null;
  const T = String.raw`(\d{1,2})(?::(\d{2})|時(?:(\d{1,2})分?)?)`;
  const re = new RegExp(`${T}\\s*-\\s*(翌)?\\s*${T}`, "g");
  const ranges = [];
  let m;
  while ((m = re.exec(h))) {
    const s = Number(m[1]) * 60 + Number(m[2] || m[3] || 0);
    let e = Number(m[5]) * 60 + Number(m[6] || m[7] || 0);
    if (m[4] || e <= s) e += 1440;
    if (s < 1440 && e <= 2880) ranges.push([s, e]);
  }
  const allDay = /24\s*時間/.test(h);
  // 休みの曜日：「曜日」の「日」を日曜と取り違えないよう先に消す
  const closedText = [c, ...(h.match(/[月火水木金土日・、,／/\s]+曜?(?:日)?\s*(?:定休|休み|休業|休館)/g) || [])].join(" ");
  const days = new Set();
  const irregular = /不定休/.test(closedText + h);
  const noHoliday = /無休/.test(closedText + h);
  if (!noHoliday) {
    const cleaned = closedText.replace(/曜日/g, "曜").replace(/祝日?|祭日|年末年始|お盆|不定休|第\d/g, "").replace(/曜/g, "");
    WEEKDAYS.forEach((d, i) => { if (cleaned.includes(d)) days.add(i); });
  }
  if (!ranges.length && !allDay && !days.size && !irregular) return null;
  return { ranges, allDay, closedDays: days, irregular };
}

// 今（または指定時刻）に開いているか。わからないときは null
export function openState(spot, date = new Date()) {
  const p = parseHours(spot.hours, spot.closed);
  if (!p) return null;
  if (p.closedDays.has(date.getDay())) return { state: "closed", label: "今日は定休日" };
  if (p.allDay) return { state: "open", label: "24時間営業" };
  if (!p.ranges.length) return null;
  const now = date.getHours() * 60 + date.getMinutes();
  for (const [s, e] of p.ranges) {
    for (const t of [now, now + 1440]) {
      if (t >= s && t < e) {
        const left = e - t;
        const close = `${String(Math.floor((e % 1440) / 60)).padStart(2, "0")}:${String(e % 60).padStart(2, "0")}`;
        return left <= 60 ? { state: "closing", label: `まもなく閉店（${close}まで）` } : { state: "open", label: `営業中（${close}まで）` };
      }
    }
  }
  const next = p.ranges.map(([s]) => s).filter((s) => s > now).sort((a, b) => a - b)[0];
  return { state: "closed", label: next != null ? `${String(Math.floor(next / 60)).padStart(2, "0")}:${String(next % 60).padStart(2, "0")}から営業` : "営業時間外" };
}

// ---------- 旬 ----------
const SEASONS = [
  { words: ["梅"], months: [2, 3], label: "梅" },
  { words: ["桜", "さくら", "花見", "お花見"], months: [3, 4], label: "桜" },
  { words: ["ネモフィラ", "藤棚", "藤の花", "チューリップ", "芝桜"], months: [4, 5], label: "春の花" },
  { words: ["紫陽花", "あじさい", "アジサイ", "蛍", "ホタル"], months: [6], label: "梅雨の景色" },
  { words: ["ひまわり", "向日葵", "花火", "海水浴", "ビーチ", "夏祭り", "ビアガーデン"], months: [7, 8], label: "夏" },
  { words: ["かき氷", "かきごおり"], months: [6, 7, 8, 9], label: "かき氷" },
  { words: ["コスモス", "ハロウィン", "栗", "モンブラン"], months: [9, 10], label: "秋" },
  { words: ["紅葉", "もみじ", "イチョウ", "銀杏並木"], months: [10, 11], label: "紅葉" },
  { words: ["イルミネーション", "クリスマス", "ライトアップ"], months: [11, 12, 1, 2], label: "イルミネーション" },
  { words: ["いちご", "苺", "ストロベリー", "いちご狩り"], months: [1, 2, 3, 4, 5], label: "いちご" },
  { words: ["鍋", "おでん", "雪", "スキー", "スノーボード", "雪見"], months: [12, 1, 2], label: "冬" },
];

export function seasonOf(spot, date = new Date()) {
  const text = [spot.title, spot.placeName, spot.caption, spot.summary, spot.memo, ...(spot.tags || [])].join(" ");
  const month = date.getMonth() + 1;
  const nextMonth = (month % 12) + 1;
  for (const s of SEASONS) {
    if (!s.words.some((w) => text.includes(w))) continue;
    if (s.months.includes(month)) return { now: true, label: `${s.label}が今まさに見頃`, short: "今が旬" };
    if (s.months.includes(nextMonth)) return { now: false, label: `来月から${s.label}のシーズン`, short: "もうすぐ旬" };
  }
  return null;
}

// ---------- デートコース ----------
const STAY = { cafe: 60, sweets: 45, gourmet: 90, bar: 90, nature: 90, sightseeing: 60, art: 90, event: 90, shopping: 60, stay: 0, activity: 120, other: 60 };
const IDEAL = { day: { start: 11 * 60, gourmet: 12 * 60 }, afternoon: { start: 14 * 60, gourmet: 18.5 * 60 }, evening: { start: 17 * 60, gourmet: 18.5 * 60 } };
const IDEAL_HOUR = { nature: 10, activity: 10, sightseeing: 11, art: 13, shopping: 14, cafe: 15, sweets: 15.5, event: 16, other: 14, bar: 21, stay: 23 };

export function idealMinute(genre, style) {
  if (genre === "gourmet") return IDEAL[style].gourmet;
  return (IDEAL_HOUR[genre] ?? 14) * 60;
}

function loveScore(spot, peopleCount) {
  const likes = Object.values(spot.likes || {});
  const yes = likes.filter((v) => v === true).length;
  const no = likes.filter((v) => v === "no").length;
  let s = yes >= Math.max(2, peopleCount) ? 3 : yes ? 1.5 : 0.5;
  s -= no * 2;
  if (seasonOf(spot)?.now) s += 1;
  if (spot.deadline) {
    const d = (new Date(spot.deadline + "T23:59:59") - Date.now()) / 86400000;
    if (d >= 0 && d <= 21) s += 1.5;
  }
  if (spot.pinned) s += 0.5;
  return s;
}

const fmt = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(Math.round(min % 60)).padStart(2, "0")}`;

// 行きたい場所から、近い場所どうしを組み合わせて回る順番と時間割を作る
export function buildCourses(spots, { stops = 3, style = "day", budget = null, bothOnly = false, date = null, peopleCount = 2 } = {}) {
  const day = date ? new Date(date + "T12:00:00") : new Date();
  const pool = spots.filter((s) => {
    if ((s.status || "want") === "visited" || s.lat == null || s.lng == null) return false;
    const yes = Object.values(s.likes || {}).filter((v) => v === true).length;
    if (bothOnly && yes < 2) return false;
    if (Object.values(s.likes || {}).filter((v) => v === "no").length >= Math.max(2, peopleCount)) return false;
    if (budget != null && s.priceMin != null && s.priceMin > budget) return false;
    if (style === "day" && s.genre === "bar") return false;
    if (s.genre === "stay") return false; // 宿は日帰りコースに入れない
    return true;
  });
  const scored = pool.map((s) => ({ s, score: loveScore(s, peopleCount) })).sort((a, b) => b.score - a.score);
  const seen = new Set();
  const courses = [];
  for (const { s: anchor } of scored.slice(0, 15)) {
    for (const radius of [2, 6, 15]) {
      const near = scored
        .filter(({ s }) => s !== anchor && distanceKm(anchor, s) <= radius)
        .sort((a, b) => b.score - a.score - (distanceKm(anchor, a.s) - distanceKm(anchor, b.s)) * 0.4);
      const picked = [anchor];
      for (const { s } of near) {
        if (picked.length >= stops) break;
        if (picked.some((p) => p.genre === s.genre && s.genre !== "other")) continue;
        picked.push(s);
      }
      if (picked.length < Math.min(2, stops)) continue;
      const key = picked.map((p) => p.id).sort().join("|");
      if (seen.has(key)) break;
      seen.add(key);
      courses.push(timeline(picked, style, day, peopleCount));
      break;
    }
  }
  return courses.sort((a, b) => b.score - a.score).slice(0, 3);
}

function timeline(picked, style, day, peopleCount) {
  // 理想の時間帯順に並べてから、移動が往復にならないよう隣どうしを入れ替えて詰める
  let order = [...picked].sort((a, b) => idealMinute(a.genre, style) - idealMinute(b.genre, style));
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < order.length - 2; i++) {
      const [a, b, c] = order.slice(i, i + 3);
      if (distanceKm(a, c) + distanceKm(c, b) + 0.5 < distanceKm(a, b) + distanceKm(b, c) && Math.abs(idealMinute(b.genre, style) - idealMinute(c.genre, style)) <= 180) {
        order = [...order.slice(0, i + 1), c, b, ...order.slice(i + 3)];
      }
    }
  }
  let t = Math.max(IDEAL[style].start, Math.min(idealMinute(order[0].genre, style), IDEAL[style].start + 60));
  const stops = [];
  const warnings = [];
  let km = 0;
  let budget = 0;
  let unknownPrice = false;
  order.forEach((spot, i) => {
    let leg = null;
    if (i > 0) {
      const tr = estimateTravel(order[i - 1], spot);
      const mode = tr.walk != null && tr.walk <= 20 ? "徒歩" : tr.train <= tr.car + 10 ? "電車" : "車";
      const min = mode === "徒歩" ? tr.walk : mode === "電車" ? tr.train : tr.car;
      leg = { mode, min, km: tr.km };
      km += tr.km;
      t = Math.ceil((t + min) / 5) * 5; // 到着時刻は5分単位にそろえる
    }
    // ごはんは食事どきまで待つ
    if (spot.genre === "gourmet" && t < idealMinute("gourmet", style) - 30) t = idealMinute("gourmet", style) - 30;
    const stay = STAY[spot.genre] ?? 60;
    const when = new Date(day);
    when.setHours(Math.floor(t / 60), t % 60, 0, 0);
    const open = openState(spot, when);
    if (open && open.state === "closed") warnings.push(`${spot.placeName || spot.title}は${fmt(t)}ごろ営業していないかもしれません`);
    stops.push({ spot, arrive: fmt(t), leave: fmt(t + stay), stay, leg });
    t += stay;
    if (spot.priceMin != null) budget += spot.priceMin;
    else unknownPrice = true;
  });
  const score = order.reduce((s, x) => s + loveScore(x, peopleCount), 0) - km * 0.25 - warnings.length;
  const area = order[0].station?.replace(/駅$/, "") || order[0].city || order[0].prefecture || "";
  return { stops, warnings, km, budget, unknownPrice, score, area, start: stops[0].arrive, end: stops[stops.length - 1].leave };
}

// ---------- 外部アプリ ----------
const enc = encodeURIComponent;
export function spotQuery(s) {
  return [s.placeName || s.title, s.city || s.prefecture].filter(Boolean).join(" ");
}
export function mapsUrl(s) {
  const q = s.placeName ? spotQuery(s) : s.lat != null ? `${s.lat},${s.lng}` : spotQuery(s);
  return `https://www.google.com/maps/search/?api=1&query=${enc(q || "")}`;
}
export function routeUrl(s, base, mode = "transit") {
  const dest = s.lat != null ? `${s.lat},${s.lng}` : spotQuery(s);
  return `https://www.google.com/maps/dir/?api=1${base ? `&origin=${base.lat},${base.lng}` : ""}&destination=${enc(dest)}&travelmode=${mode}`;
}
export function courseRouteUrl(stops) {
  const pt = (s) => (s.lat != null ? `${s.lat},${s.lng}` : spotQuery(s));
  const all = stops.map((x) => x.spot || x);
  const allWalk = stops.every((x, i) => i === 0 || x.leg?.mode === "徒歩");
  const mid = all.slice(1, -1).map(pt).join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${enc(pt(all[0]))}&destination=${enc(pt(all[all.length - 1]))}${mid ? `&waypoints=${enc(mid)}` : ""}&travelmode=${allWalk ? "walking" : "driving"}`;
}
export function calendarUrl(s, date, startHM = "", minutes = 120) {
  const d = (date || new Date().toISOString().slice(0, 10)).replace(/-/g, "");
  let dates;
  if (startHM) {
    const [h, m] = startHM.split(":").map(Number);
    const end = h * 60 + m + minutes;
    dates = `${d}T${String(h).padStart(2, "0")}${String(m).padStart(2, "0")}00/${d}T${String(Math.floor(end / 60) % 24).padStart(2, "0")}${String(end % 60).padStart(2, "0")}00`;
  } else {
    const next = new Date(date ? date + "T12:00:00" : Date.now());
    next.setDate(next.getDate() + 1);
    dates = `${d}/${next.toISOString().slice(0, 10).replace(/-/g, "")}`;
  }
  const details = [s.url, s.memo].filter(Boolean).join("\n");
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${enc(s.placeName || s.title || "おでかけ")}&dates=${dates}&details=${enc(details)}&location=${enc(s.address || spotQuery(s))}`;
}
export function icsText(s, date) {
  const d = (date || new Date().toISOString().slice(0, 10)).replace(/-/g, "");
  const esc = (t) => String(t || "").replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//futari-ikitai//JA", "BEGIN:VEVENT", `UID:${s.id || Date.now()}@futari-ikitai`, `DTSTART;VALUE=DATE:${d}`,
    `SUMMARY:${esc(s.placeName || s.title)}`, `LOCATION:${esc(s.address || spotQuery(s))}`, `DESCRIPTION:${esc([s.url, s.memo].filter(Boolean).join("\n"))}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}
export function lineShareUrl(text) {
  return `https://line.me/R/share?text=${enc(text)}`;
}
export function spotShareText(s) {
  return [`📍${s.placeName || s.title}`, s.station || s.city || "", s.url || mapsUrl(s)].filter(Boolean).join("\n");
}

// 詳細画面の「ひらく」ボタン。スマホではそれぞれのアプリが開く
export function externalLinks(s, base) {
  const q = spotQuery(s);
  const links = [];
  if (s.url) links.push({ id: "post", label: platformLabel(s.platform), sub: "元の投稿", url: s.url });
  links.push({ id: "route", label: "経路", sub: base ? "電車で" : "Googleマップ", url: routeUrl(s, base, "transit") });
  links.push({ id: "car", label: "車で", sub: "ナビ", url: routeUrl(s, base, "driving") });
  links.push({ id: "map", label: "地図", sub: "Googleマップ", url: mapsUrl(s) });
  links.push({ id: "apple", label: "Appleマップ", sub: "iPhone", url: `https://maps.apple.com/?q=${enc(s.placeName || q)}${s.lat != null ? `&ll=${s.lat},${s.lng}` : ""}` });
  if (q) {
    if (["gourmet", "cafe", "sweets", "bar"].includes(s.genre)) links.push({ id: "tabelog", label: "食べログ", sub: "口コミ・予約", url: `https://tabelog.com/rstLst/?sw=${enc(s.placeName || q)}` });
    links.push({ id: "reserve", label: "予約を探す", sub: "Google", url: `https://www.google.com/search?q=${enc(q + (s.genre === "stay" ? " 宿泊 予約" : " 予約"))}` });
    links.push({ id: "insta", label: "Instagram", sub: "ほかの投稿", url: `https://www.instagram.com/explore/search/keyword/?q=${enc(s.placeName || q)}` });
  }
  return links;
}

export function platformLabel(p) {
  return { instagram: "Instagram", tiktok: "TikTok", x: "X", youtube: "YouTube", threads: "Threads", tabelog: "食べログ", googlemaps: "Googleマップ", lemon8: "Lemon8", facebook: "Facebook" }[p] || "Webページ";
}

// ---------- 都道府県タイルマップ（思い出の足あと） ----------
export const PREF_TILES = [
  ["北海道", 12, 0], ["青森県", 12, 1], ["秋田県", 11, 2], ["岩手県", 12, 2], ["山形県", 11, 3], ["宮城県", 12, 3],
  ["石川県", 8, 4], ["富山県", 9, 4], ["新潟県", 10, 4], ["福島県", 11, 4],
  ["島根県", 2, 5], ["鳥取県", 3, 5], ["兵庫県", 4, 5], ["京都府", 5, 5], ["滋賀県", 6, 5], ["福井県", 7, 5], ["岐阜県", 8, 5], ["長野県", 9, 5], ["群馬県", 10, 5], ["栃木県", 11, 5], ["茨城県", 12, 5],
  ["山口県", 1, 6], ["広島県", 2, 6], ["岡山県", 3, 6], ["大阪府", 4, 6], ["奈良県", 5, 6], ["三重県", 6, 6], ["愛知県", 7, 6], ["静岡県", 8, 6], ["山梨県", 9, 6], ["埼玉県", 10, 6], ["東京都", 11, 6], ["千葉県", 12, 6],
  ["佐賀県", 0, 7], ["福岡県", 1, 7], ["愛媛県", 2, 7], ["香川県", 3, 7], ["和歌山県", 5, 7], ["神奈川県", 11, 7],
  ["長崎県", 0, 8], ["大分県", 1, 8], ["高知県", 2, 8], ["徳島県", 3, 8],
  ["熊本県", 0, 9], ["宮崎県", 1, 9], ["鹿児島県", 0, 10], ["沖縄県", 0, 12],
];
export const prefShort = (p) => (p === "北海道" ? "北海道" : p.replace(/[都府県]$/, ""));
