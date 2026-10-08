// Spotrip（どこいく） — 画面（Webアプリとアーティファクトで共通）
// データの読み書きは backend に任せる。backend の形は README の「しくみ」を参照。
import { GENRES, analyzeText, parseFreeform, cityShort } from "/lib/analyze.js";
import { estimateTravel, formatMinutes, formatPrice, relativeDate, priceBucket, travelBucket } from "./util.js";
import { spotArt, appIcon } from "./art.js";
import { eagerOf, eagerAvg, EAGER_LABELS, ratingsOf, reviewsOf, placeAvg, overallAvg, wantAgain, AGAIN_MIN, appLinks, openState, parseHours, seasonOf, buildCourses, buildCoursesRange, MOODS, AREAS, inArea, courseRouteUrl, calendarUrl, icsText, lineShareUrl, spotShareText, platformLabel, PREF_TILES, prefShort, mapsUrl, GROUP_TYPES, requiredYes, fuzzySearch, memberStats, compatibility, monthGrid, eventsOn, travelModes, yahooTransitUrl, routeUrl } from "./smart.js";

const TINT = { cafe: "#efd5bd", sweets: "#f8cfdc", gourmet: "#f4cfae", bar: "#ddc8e6", nature: "#c9e3cf", sightseeing: "#eed7c0", art: "#d3d8f2", event: "#fbdfaa", shopping: "#cfe8ee", stay: "#f1cbc3", activity: "#cfe7c9", other: "#e6dfdc" };
const STATUS = { want: "行きたい", planned: "予定あり", visited: "行った" };
// 「まあまあ」の理由。相手のセンスを否定しない言い方だけにして、見た人へのやさしい一言と次の一手を添える
const MEH = {
  far: { label: "ちょっと遠い", emoji: "🚃", hint: "遠出の日や、近くに行く予定があるときに誘うと行きやすくなるかも。" },
  budget: { label: "予算が気になる", emoji: "👛", hint: "ランチや平日のお得なプランなら、気軽に行けるかも。" },
  mood: { label: "今は気分じゃない", emoji: "🌙", hint: "気分は変わるもの。少し時間をおいて、もう一度聞いてみよう。" },
  crowd: { label: "混んでそう", emoji: "👥", hint: "平日や朝いち・夜遅めなら、ゆったり楽しめるかも。" },
  time: { label: "時間が合わなそう", emoji: "🗓️", hint: "カレンダーで空いている日を一緒に探してみよう。" },
  other: { label: "なんとなく", emoji: "💭", hint: "言葉にしにくい日もあるもの。別の日にもう一度聞いてみよう。" },
  taste: { label: "好みがちょっと違う", emoji: "🎨", hint: "好みが違うのも楽しさのうち。相手の♡の場所と“交換こ”で行くのもアリ。" },
};
const KIND_WORDS = [
  "「まあまあ」は「条件が合えば行けるかも」のサイン。",
  "あなたの♡はちゃんと残っています。タイミングを変えればアリかも。",
  "ひとりでも行きたい場所なら、それも立派な予定。いつか一緒に行けるかも。",
  "見つけてくれたこと自体がうれしいはず。次の候補もきっと刺さります。",
];
const STYLE_LABEL = { morning: ["朝から", "9:00"], day: ["昼から", "11:00"], afternoon: ["午後から", "14:00"], evening: ["夕方から", "17:00"], night: ["夜から", "19:00"] };
const isoDay = (d) => new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const addDays = (ymd, n) => { const d = new Date(ymd + "T12:00:00"); d.setDate(d.getDate() + n); return isoDay(d); };
const yen = (n) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

const ICONS = {
  bell: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  heart: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z",
  plus: "M12 5v14M5 12h14",
  route: "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 15V9a4 4 0 0 1 4-4h2M18 9v6a4 4 0 0 1-4 4h-2",
  album: "M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7.1L12 17.3 5.8 21l1.6-7.1L2 9.2l7.1-.6z",
  sliders: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  filter: "M3 5h18M6 12h12M10 19h4",
  x: "M18 6 6 18M6 6l12 12",
  pin: "M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  train: "M7 3h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM4 11h16M8 21l2-3M16 21l-2-3M8.5 14.5h.01M15.5 14.5h.01",
  car: "M5 17h14M5 17a2 2 0 1 0 4 0M15 17a2 2 0 1 0 4 0M3 17v-5l2-5h14l2 5v5M3 12h18",
  walk: "M13 4a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM9 21l2-6 3 3v3M7 12l2-4 4 1 2 3 3 1M11 15l1-6",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  yen: "M6 3l6 8 6-8M12 11v10M7 13h10M7 17h10",
  ext: "M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
  cal: "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M8 3v4M16 3v4",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  copy: "M9 9h11v11H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  trash: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14",
  map: "M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  sparkle: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
  dice: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 8h.01M16 16h.01M12 12h.01M16 8h.01M8 16h.01",
  skip: "M5 4l10 8-10 8zM19 5v14",
  chev: "M6 9l6 6 6-6",
  bike: "M5.5 17.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM18.5 17.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM15 6h2l1.5 7.5M5.5 14l4-7h5l-3.5 7M9 7l-1-2H6",
  bus: "M6 4h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM4 11h16M8 18v2M16 18v2M7.5 14.5h.01M16.5 14.5h.01M8 7h8",
  shinkansen: "M3 15c0-4 4-8 11-8h3c2 0 4 2 4 4v2a2 2 0 0 1-2 2H3zM3 15v1a2 2 0 0 0 2 2h14M14 7v4h7M7 19l-1 2M17 19l1 2",
  plane: "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z",
  taxi: "M5 17h14M5 17a2 2 0 1 0 4 0M15 17a2 2 0 1 0 4 0M3 17v-5l2-5h14l2 5v5M3 12h18M10 4h4v3h-4z",
  meh: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 15h8M9 9.5h.01M15 9.5h.01",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  help: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01",
  share: "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13",
  hourglass: "M6 2h12M6 22h12M7 2v4l5 6-5 6v4M17 2v4l-5 6 5 6v4",
  leaf: "M11 20A7 7 0 0 1 4 13c0-6 7-10 16-10 0 9-4 16-10 16M4 21l7-7",
  pinned: "M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3z",
  image: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21",
  clip: "M9 4h6v3H9zM8 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2",
  insta: "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM17.5 6.5h.01",
  fork: "M7 2v20M4 2v6a3 3 0 0 0 6 0V2M17 2c-2 1-3 4-3 7 0 2 1 3 3 3v10",
  apple: "M12 7c-1-2-3-3-5-2s-3 4-2 8 3 7 5 7c1 0 1.5-.5 2-.5s1 .5 2 .5c2 0 4-3 5-6-2-1-3-3-2-5 .5-1 1-1.5 2-2-1-1.5-3-2-5-1-1 .5-1.5.5-2 0zM12 7c0-2 1-4 3-4",
};
const ic = (name, cls = "") => `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
const LOGO = `<svg viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="128" fill="var(--rose)"/><path d="M256 92c-70 0-126 55-126 124 0 92 126 204 126 204s126-112 126-204c0-69-56-124-126-124z" fill="var(--surface)"/><path d="M220 196c0-22 16-38 37-38s37 15 37 35c0 27-37 29-37 56" fill="none" stroke="var(--rose)" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/><circle cx="257" cy="292" r="16" fill="var(--rose)"/></svg>`;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const local = {
  get(k, d) { try { const v = localStorage.getItem("ikitai." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("ikitai." + k, JSON.stringify(v)); } catch { /* 保存できない環境では覚えないだけ */ } },
};
const genreOf = (id) => GENRES.find((g) => g.id === id) || GENRES[GENRES.length - 1];
const nameOf = (it) => it.placeName || it.title || "名前未設定のスポット";
// 今日=0、明日=1（日付だけで数える）
const daysUntil = (d) => { if (!d) return null; const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((new Date(d + "T00:00:00") - t) / 86400000); };
const untilLabel = (d) => { const n = daysUntil(d); return n === 0 ? "今日" : n === 1 ? "明日" : `あと${n}日`; };
const todayStr = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const nextSaturday = () => { const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const jpDate = (s) => { if (!s) return ""; const d = new Date(s + "T12:00:00"); return `${d.getMonth() + 1}/${d.getDate()}(${"日月火水木金土"[d.getDay()]})`; };
function sameUrl(a, b) {
  const n = (u) => { try { const x = new URL(u); return (x.hostname.replace(/^www\.|^m\./, "") + x.pathname).replace(/\/$/, ""); } catch { return u; } };
  return n(a) === n(b);
}
export function coordsFrom(text) {
  const t = String(text || "");
  const m = t.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/) || t.match(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

// ---------- メインカラー（端末ごとに選べる） ----------
export const ACCENTS = [["#df4a72", "ローズ"], ["#e8643c", "サンセット"], ["#c98a00", "マスタード"], ["#2e9e6b", "ミント"], ["#1f8fb0", "オーシャン"], ["#3b6fd8", "ブルー"], ["#7c5ad6", "ラベンダー"], ["#3a3236", "チャコール"]];
export function applyAccent(hex) {
  const root = document.documentElement;
  if (!/^#[0-9a-f]{6}$/i.test(hex || "")) {
    root.style.removeProperty("--user-accent");
    root.style.removeProperty("--user-accent-ink");
    return;
  }
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  root.style.setProperty("--user-accent", hex);
  root.style.setProperty("--user-accent-ink", lum > 0.62 ? "#1d1416" : "#ffffff");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", hex);
}

// ---------- 使い方スライド（最初に1回。設定からいつでも見られる） ----------
const TOUR = [
  {
    title: "「あれ、どこだっけ？」をなくそう",
    text: "行きたい場所は、思いつくまま書くだけ。AIが店名・場所・ジャンル・値段・営業時間を整理してくれます。SNSのリンクからも追加できます。",
    art: () => `<div class="tour-mock">
      <div class="adder" style="margin:0 0 12px;box-shadow:none;border:1.5px solid var(--line)">${ic("sparkle")}<span class="sub" style="flex:1;padding:8px 4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">表参道のパンケーキのカフェ</span><span class="btn rose sm">AIで追加</span></div>
      <div class="mini" style="flex:none;width:100%;box-shadow:var(--shadow-sm)"><span class="ph" style="--tint:${TINT.cafe}">☕</span><span class="tx"><b>Cafe Lumière 表参道</b><span class="sub">表参道駅 ・ ¥650〜 ・ 10:00〜19:00</span><span class="tag open">営業中</span></span></div></div>`,
  },
  {
    title: "うろ覚えでも、見つかる",
    text: "店名を忘れても大丈夫。「海が見えるカフェ」「先月見つけた安いとこ」のように、覚えているままに探せます。",
    art: () => `<div class="tour-mock">
      <div class="search" style="margin-bottom:12px;background:var(--surface)">${ic("search", "sm")}<span style="padding:9px 0">海が見えるカフェ</span></div>
      <div class="search-info" style="margin:0 0 10px"><span class="tag">海っぽい</span><span class="tag">コーヒーっぽい</span></div>
      <div class="mini" style="flex:none;width:100%;box-shadow:var(--shadow-sm)"><span class="ph" style="--tint:${TINT.cafe}">☕</span><span class="tx"><b>シーサイドカフェ</b><span class="sub">はるかが先月見つけた</span></span></div></div>`,
  },
  {
    title: "相手ごとに、部屋を分けて",
    text: "恋人・友達・家族・職場など、使う相手ごとにリストを作れます。部屋ごとの招待コードかリンクを送れば、相手は名前を入れるだけで参加できます。",
    art: () => `<div class="tour-mock"><div class="type-grid compact">${Object.values(GROUP_TYPES).map((t) => `<span class="type-tile"><span class="emoji">${t.emoji}</span>${esc(t.label)}</span>`).join("")}</div></div>`,
  },
  {
    title: "スワイプで「行きたい」を答え合わせ",
    text: "誰かが見つけた場所を、右にスワイプで「行きたい」、左で「まあまあ」。みんなが行きたい場所は「マッチ」します。",
    art: () => `<div class="tour-mock" style="display:grid;place-items:center"><div class="swipe-card" style="position:relative;width:200px;height:220px;transform:rotate(8deg) translateX(14px)">
      <div class="cover" style="--tint:${TINT.gourmet};font-size:54px">🍽️<span class="stamp yes" style="opacity:1;font-size:16px">行きたい！</span></div>
      <div class="body" style="padding:10px 12px"><b>渋谷の隠れ家ビストロ</b><span class="sub">¥4,000〜</span></div></div></div>`,
  },
  {
    title: "行く日のプランを自動で",
    text: "近い場所どうしを組み合わせて、回る順番と時間割を提案します。地図のルート・カレンダー・LINEにもワンタップ。",
    art: () => `<div class="tour-mock"><ul class="tl" style="padding:0">
      ${[["12:00", "🍽️", "ランチ"], ["13:50", "☕", "カフェ"], ["15:10", "🎨", "美術館"]].map(([t, e, n], i) => `${i ? `<li><span></span><div class="leg">${ic("walk", "sm")}徒歩 約15分</div></li>` : ""}<li><span class="time">${t}</span><div class="stop"><b>${e} ${n}</b></div></li>`).join("")}</ul></div>`,
  },
  {
    title: "行った場所は、足あとに",
    text: "★と感想で思い出に残し、都道府県マップで振り返れます。「そろそろ終わりそう」な期間限定や、今が旬の場所もそっとお知らせします。",
    art: () => `<div class="tour-mock">
      <div class="mini" style="flex:none;width:100%;box-shadow:var(--shadow-sm);margin-bottom:12px"><span class="ph">${spotArt({ id: "tour-memory", genre: "nature", placeName: "ネモフィラの丘", tags: ["ネモフィラ"] })}</span><span class="tx"><b>ネモフィラの丘</b><span style="color:#f2b400;letter-spacing:1px">★★★★★</span><span class="sub">「一面の青、また行こうね」</span></span></div>
      <div class="tour-japan">${PREF_TILES.map(([p, c, r]) => `<i class="${["東京都", "神奈川県", "京都府"].includes(p) ? "v3" : ["千葉県", "静岡県", "大阪府", "茨城県"].includes(p) ? "v1" : ["北海道", "沖縄県", "福岡県"].includes(p) ? "want" : ""}" style="grid-column:${c + 1};grid-row:${r + 1}"></i>`).join("")}</div>
      <div class="tags" style="justify-content:center;margin-top:10px"><span class="tag soon">⏳ あと5日くらい</span><span class="tag open">🌸 今が旬</span></div></div>`,
  },
];

export function showOnboarding(onDone) {
  document.querySelector(".tour")?.remove();
  const el = document.createElement("div");
  el.className = "tour";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "使い方");
  el.innerHTML = `
    <div class="tour-top"><span class="brand">${LOGO}<b>Spotrip</b></span><button class="btn sm line" data-skip>スキップ</button></div>
    <div class="tour-track" tabindex="0">${TOUR.map((t, i) => `<section class="tour-slide" aria-label="${i + 1} / ${TOUR.length}">${t.art()}<h2>${esc(t.title)}</h2><p>${esc(t.text)}</p></section>`).join("")}</div>
    <div class="tour-bottom"><div class="tour-dots">${TOUR.map((_, i) => `<button aria-label="${i + 1}枚目" data-dot="${i}"></button>`).join("")}</div><button class="btn rose" data-next>次へ</button></div>`;
  document.body.append(el);
  const track = el.querySelector(".tour-track");
  const dots = [...el.querySelectorAll("[data-dot]")];
  const nextBtn = el.querySelector("[data-next]");
  const index = () => Math.round(track.scrollLeft / track.clientWidth);
  const update = () => {
    const i = index();
    dots.forEach((d, k) => d.classList.toggle("on", k === i));
    nextBtn.textContent = i === TOUR.length - 1 ? "はじめる" : "次へ";
  };
  const goTo = (i) => track.scrollTo({ left: i * track.clientWidth, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  const done = () => { el.remove(); onDone?.(); };
  track.addEventListener("scroll", () => requestAnimationFrame(update), { passive: true });
  dots.forEach((d) => d.addEventListener("click", () => goTo(Number(d.dataset.dot))));
  nextBtn.addEventListener("click", () => (index() >= TOUR.length - 1 ? done() : goTo(index() + 1)));
  el.querySelector("[data-skip]").addEventListener("click", done);
  el.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") goTo(Math.min(TOUR.length - 1, index() + 1));
    if (e.key === "ArrowLeft") goTo(Math.max(0, index() - 1));
    if (e.key === "Escape") done();
  });
  update();
  setTimeout(() => track.focus(), 50);
}

// 写真を長い辺640pxのJPEGに縮める（保存できる大きさにするため）
async function shrinkImage(file, max = 640, limit = 140_000) {
  const url = URL.createObjectURL(file);
  try {
    const im = await new Promise((ok, ng) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ng; i.src = url; });
    const r = Math.min(1, max / Math.max(im.width, im.height));
    const c = document.createElement("canvas");
    c.width = Math.round(im.width * r); c.height = Math.round(im.height * r);
    c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
    for (const q of [0.78, 0.66, 0.54, 0.42]) { const out = c.toDataURL("image/jpeg", q); if (out.length <= limit) return out; }
    throw new Error("too big");
  } finally { URL.revokeObjectURL(url); }
}

// 全画面（ブラウザが許すときだけ。iPhone の Safari やアプリ内の表示では使えないことがある）
const canFullscreen = () => Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const isFullscreen = () => Boolean(document.fullscreenElement || document.webkitFullscreenElement);
async function toggleFullscreen() {
  try {
    if (isFullscreen()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else { const r = document.documentElement; await (r.requestFullscreen ? r.requestFullscreen({ navigationUI: "hide" }) : r.webkitRequestFullscreen()); }
  } catch {}
}

// 画面の真ん中に出る確認（削除・退出など）。true / false で答える
export function confirmBox({ title, text = "", ok = "OK", cancel = "やめる", danger = false } = {}) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const el = document.createElement("div");
    el.className = "confirm-wrap";
    el.innerHTML = `<div class="confirm" role="alertdialog" aria-modal="true" aria-labelledby="cf-t" aria-describedby="cf-d">
      <h3 id="cf-t">${esc(title)}</h3>${text ? `<p id="cf-d">${esc(text)}</p>` : ""}
      <div class="confirm-btns"><button class="btn line" data-no>${esc(cancel)}</button><button class="btn ${danger ? "danger-fill" : "rose"}" data-yes>${esc(ok)}</button></div></div>`;
    const done = (v) => { el.classList.add("out"); setTimeout(() => el.remove(), 160); document.removeEventListener("keydown", key, true); prev?.focus?.(); resolve(v); };
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); done(false); } };
    el.addEventListener("click", (e) => { if (e.target === el || e.target.closest("[data-no]")) done(false); if (e.target.closest("[data-yes]")) done(true); });
    document.addEventListener("keydown", key, true);
    document.body.append(el);
    setTimeout(() => el.querySelector("[data-no]").focus(), 30);
  });
}

// 絞り込みの初期値
const freshFilters = () => ({ genres: new Set(), price: "", travel: "", dist: "", area: "", who: "", openNow: false, day: "", added: "", deadlineOnly: false, unvoted: false, meh: false, located: false, never: false });
const DIST = [["d1", "〜1km", 1], ["d3", "〜3km", 3], ["d10", "〜10km", 10], ["d30", "〜30km", 30], ["dfar", "30km〜", Infinity]];
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

export function startApp(backend, mount = document.body) {
  const B = backend;
  const F = B.features;
  const S = {
    settings: { name: "行きたいリスト", bases: [] }, spots: [], loaded: false,
    view: local.get("view", "home"), q: "", seg: "all", groupBy: local.get("groupBy", "date"), sortBy: local.get("sortBy", "new"),
    f: freshFilters(), listMode: "grid",
    baseId: local.get("baseId", null), plan: { dateFrom: nextSaturday(), dateTo: "", style: "day", startTime: "", stops: 3, budgetMin: "", budgetMax: "", bothOnly: false, moods: [], area: "" }, courses: null,
    skipped: new Set(), planTab: "calendar", calMonth: "", calDay: "", openMode: "", routeCache: {},
  };

  mount.insertAdjacentHTML("beforeend", `<div class="app" id="app"></div><div id="modal-root"></div><div id="toast" aria-live="polite"></div>`);
  const $ = (id) => document.getElementById(id);
  const $app = $("app"), $modal = $("modal-root");

  // ---------- 人 ----------
  const me = () => B.me();
  const peopleList = () => B.people();
  const person = (id) => peopleList().find((p) => p.id === id) || B.anyone?.(id) || { id, name: "", color: "#9a8a8f" };
  const pname = (id) => (id && id === me() ? "あなた" : person(id).name || "メンバー");
  const av = (id, cls = "") => {
    const p = person(id);
    const a = p.avatar || "";
    const inner = a.startsWith("emoji:") ? `<span class="emo">${esc(a.slice(6))}</span>` : a ? `<img src="${esc(a)}" alt="">` : esc([...(p.name || "?")][0]);
    return `<span class="av ${cls}${a.startsWith("emoji:") ? " is-emoji" : ""}" style="background:${esc(p.color || "#9a8a8f")}" title="${esc(p.name)}">${inner}</span>`;
  };
  // ほかの部屋のメンバーなど、いまの部屋にいない人のアイコン
  const avOf = (m) => {
    const a = m.avatar || "";
    const inner = a.startsWith("emoji:") ? `<span class="emo">${esc(a.slice(6))}</span>` : a ? `<img src="${esc(a)}" alt="">` : esc([...(m.name || "?")][0]);
    return `<span class="av xs${a.startsWith("emoji:") ? " is-emoji" : ""}" style="background:${esc(m.color || "#9a8a8f")}" title="${esc(m.name || "")}">${inner}</span>`;
  };
  const votes = (it) => it.likes || {};
  const yesIds = (it) => Object.keys(votes(it)).filter((k) => votes(it)[k] === true);
  // 使う相手（恋人・友達…）ごとの言葉づかい
  const V = () => GROUP_TYPES[S.settings.type] || GROUP_TYPES.couple;
  const solo = () => S.settings.type === "solo";
  const memberCount = () => Math.max(1, peopleList().length);
  const isBoth = (it) => !solo() && memberCount() >= 2 && yesIds(it).length >= requiredYes(memberCount());
  // マッチの表示：「ふたりとも」「みんな」「3/5人」
  const matchText = (it) => { const y = yesIds(it).length, n = memberCount(); return y >= n ? V().all : `${y}/${n}人`; };
  const matchPhrase = () => (memberCount() <= 2 || S.settings.type === "couple" ? `${V().all}行きたい` : "過半数が行きたい");
  const myVote = (it) => votes(it)[me()];
  // 答え合わせ待ち：まだ答えていない場所＋「もう一度どう？」と聞き直された場所
  const reasked = (it) => myVote(it) === "no" && it.reaskAt && it.reaskAt <= todayStr() && it.reaskBy !== me();
  const pending = () => S.spots.filter((it) => (it.status || "want") !== "visited" && it.addedBy && it.addedBy !== me() && (myVote(it) === undefined || myVote(it) === null || reasked(it)));
  const activeBase = () => S.settings.bases.find((b) => b.id === S.baseId) || S.settings.bases[0] || null;
  const travelOf = (it) => { const b = activeBase(); return b && it.lat != null && it.lng != null ? estimateTravel(b, it) : null; };

  // ---------- 小物 ----------
  function toast(msg) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    $("toast").append(el);
    while ($("toast").children.length > 2) $("toast").firstElementChild.remove();
    setTimeout(() => el.remove(), 2800);
  }
  async function act(fn, ok) {
    try { const r = await fn(); if (ok) toast(ok); return r ?? true; }
    catch (e) { toast(e?.message || "保存できませんでした。もう一度試してください"); return false; }
  }
  const cover = (it, cls = "") => {
    const g = genreOf(it.genre);
    return `style="--tint:${TINT[g.id]}" class="${cls}"`;
  };
  // 写真（自分で選んだ写真 → 投稿の画像）。読み込めないときは下のイラストが見える
  const img = (it) => (it.photo ? `<img src="${esc(it.photo)}" alt="" loading="lazy">` : F.thumbnails && it.image ? `<img src="${esc(it.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : "");
  const thumb = (it) => `${spotArt(it)}${img(it)}`;
  function smartTags(it, { withStatus = true } = {}) {
    const out = [];
    const st = it.status || "want";
    if (withStatus && st === "planned") out.push(`<span class="tag plan">${it.plannedDate ? jpDate(it.plannedDate) + " 予定" : "予定あり"}</span>`);
    if (withStatus && st === "visited") out.push(wantAgain(it) ? `<span class="tag again">🔁 また行きたい</span>` : `<span class="tag done">行った</span>`);
    if (st !== "visited") {
      const d = daysUntil(it.deadline);
      if (d != null && d >= 0 && d <= 30) out.push(`<span class="tag soon">${d === 0 ? "今日までみたい" : `あと${d}日くらい`}</span>`);
      const s = seasonOf(it);
      if (s) out.push(`<span class="tag season">${s.short}</span>`);
      const o = openState(it);
      if (o && o.state !== "closed") out.push(`<span class="tag ${o.state}">${o.state === "open" ? "営業中" : "まもなく閉店"}</span>`);
    }
    return out.join("");
  }

  // ---------- 骨組み ----------
  function render() {
    document.title = `${S.settings.name} | Spotrip`;
    const pend = pending().length;
    const ppl = peopleList();
    $app.innerHTML = `${F.preview ? `<div class="preview-bar">ゲスト画面のプレビュー中<button data-act="exit-preview">終わる</button></div>` : ""}
      <header class="topbar"><div class="wrap">
        ${F.lists ? `<button class="brand" data-act="lists" aria-label="リストを切り替える" style="border:0;background:none;padding:0;text-align:left;color:inherit">${LOGO}<h1>${esc(S.settings.name)}</h1>${ic("chev", "sm")}</button>`
          : `<div class="brand">${LOGO}<h1>${esc(S.settings.name)}</h1></div>`}
        <button class="duo" data-act="members" aria-label="メンバー図鑑" style="border:0;background:none;padding:0">${ppl.slice(0, 4).map((p) => av(p.id)).join("")}${ppl.length > 4 ? `<span class="av" style="background:var(--surface-2);color:var(--ink)">+${ppl.length - 4}</span>` : ""}</button>
        ${!solo() || (B.kind === "artifact" && isLeader()) ? `<button class="ghost-icon notice-btn" data-act="notices" aria-label="通知">${bellInner()}</button>` : ""}
        <button class="ghost-icon" data-act="settings" aria-label="設定">${ic("sliders")}</button>
      </div></header>
      <main class="wrap" id="view"></main>
      <nav class="nav" aria-label="メニュー"><div class="wrap" style="grid-template-columns:repeat(${solo() ? 4 : 5}, 1fr)">
        ${navBtn("home", "home", "ホーム")}
        ${solo() ? "" : navBtn("match", "heart", V().vote, pend)}
        <button data-act="add" aria-label="行きたい場所を追加"><span class="add">${ic("plus")}</span></button>
        ${navBtn("plan", "route", V().plan)}
        ${navBtn("memories", "album", "思い出")}
      </div></nav>`;
    renderView();
  }
  const navBtn = (id, icon, label, badge = 0) => `<button class="${S.view === id ? "on" : ""}" data-view="${id}" aria-current="${S.view === id ? "page" : "false"}">${ic(icon)}${label}${badge ? `<span class="dot num">${badge}</span>` : ""}</button>`;

  function renderView() {
    const v = $("view");
    if (!v) return;
    if (!S.loaded) { v.innerHTML = `<div class="empty"><span class="thinking"><span class="spinner"></span>記憶をたどっています…</span></div>`; return; }
    if (B.unavailable) { v.innerHTML = `<div class="empty"><h3>この表示ではリストを開けません</h3><p>${esc(B.unavailable)}</p></div>`; return; }
    ({ home: renderHome, match: renderMatch, plan: renderPlan, memories: renderMemories }[S.view] || renderHome)(v);
  }

  // ---------- ホーム ----------
  function filtered() {
    const q = S.q.trim();
    // 探すときは行った場所も含める（「前に行ったあそこ」も探せるように）
    // 行った場所でも、みんなの平均が★2.5以上なら「また行きたい」としてリストに残す
    let items = q ? [...S.spots] : S.spots.filter((it) => (it.status || "want") !== "visited" || wantAgain(it));
    if (S.seg === "again") items = items.filter(wantAgain);
    if (S.seg === "both") items = items.filter(isBoth);
    if (S.seg === "planned") items = items.filter((it) => it.status === "planned");
    const f = S.f;
    if (f.genres.size) items = items.filter((it) => f.genres.has(it.genre));
    if (f.price) items = items.filter((it) => priceBucket(it).id === f.price);
    if (f.travel) items = items.filter((it) => travelBucket(travelOf(it)).id === f.travel);
    if (f.area) items = items.filter((it) => (it.prefecture || "未設定") === f.area);
    if (f.who) items = items.filter((it) => it.addedBy === f.who);
    if (f.openNow) items = items.filter((it) => ["open", "closing"].includes(openState(it)?.state));
    if (f.dist) { const [, , max] = DIST.find((d) => d[0] === f.dist); const min = DIST[DIST.findIndex((d) => d[0] === f.dist) - 1]?.[2] ?? 0; items = items.filter((it) => { const km = travelOf(it)?.km; return km != null && km <= max && (f.dist !== "dfar" || km > min); }); }
    if (f.day !== "") { const day = f.day === "today" ? new Date().getDay() : Number(f.day); items = items.filter((it) => !parseHours(it.hours, it.closed).closedDays.has(day)); }
    if (f.added) items = items.filter((it) => { const d = daysSince(it.createdAt); return f.added === "week" ? d <= 7 : f.added === "month" ? d <= 31 : d > 31; });
    if (f.deadlineOnly) items = items.filter((it) => it.deadline && daysUntil(it.deadline) >= 0);
    if (f.unvoted) items = items.filter((it) => myVote(it) == null);
    if (f.meh) items = items.filter((it) => Object.values(votes(it)).includes("no"));
    if (f.located) items = items.filter((it) => it.lat != null);
    if (f.never) items = items.filter((it) => (it.status || "want") !== "visited");
    const by = {
      new: (a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""),
      old: (a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""),
      near: (a, b) => (travelOf(a)?.best ?? 1e9) - (travelOf(b)?.best ?? 1e9),
      dist: (a, b) => (travelOf(a)?.km ?? 1e9) - (travelOf(b)?.km ?? 1e9),
      cheap: (a, b) => (a.priceMin ?? 1e9) - (b.priceMin ?? 1e9),
      love: (a, b) => yesIds(b).length - yesIds(a).length || (b.createdAt || "").localeCompare(a.createdAt || ""),
      deadline: (a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"),
      eager: (a, b) => (eagerAvg(b) ?? 0) - (eagerAvg(a) ?? 0),
    }[S.sortBy] || (() => 0);
    if (q) {
      const { results, understood } = fuzzySearch(items, q, { travelOf, genres: GENRES, members: Object.fromEntries(peopleList().map((p) => [p.id, p.name])) });
      S.understood = understood;
      return results.map((r) => r.spot);
    }
    S.understood = [];
    return items.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || by(a, b));
  }
  const activeFilterCount = () => S.f.genres.size + [S.f.price, S.f.travel, S.f.dist, S.f.area, S.f.who, S.f.openNow, S.f.day !== "", S.f.added, S.f.deadlineOnly, S.f.unvoted, S.f.meh, S.f.located, S.f.never].filter(Boolean).length;
  const daysSince = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 864e5 : 1e9);

  function groupKey(it) {
    switch (S.groupBy) {
      case "genre": { const g = genreOf(it.genre); return { key: g.id, label: `${g.emoji} ${g.label}`, order: GENRES.indexOf(g) }; }
      case "area": { const c = cityShort(it.city); const a = it.prefecture ? `${it.prefecture}${c ? " " + c : ""}` : c || "エリア未設定"; return { key: a, label: a, order: a === "エリア未設定" ? 1e9 : 0 }; }
      case "travel": { const b = travelBucket(travelOf(it)); return { key: b.id, label: b.label.replace(/^\S+\s/, ""), order: b.order }; }
      case "price": { const b = priceBucket(it); return { key: b.id, label: b.label.replace(/^\S+\s/, ""), order: b.order }; }
      case "who": return { key: it.addedBy || "?", label: `${pname(it.addedBy)}が見つけた`, order: it.addedBy === me() ? 0 : 1 };
      case "platform": { const k = it.url ? it.platform || "web" : "manual"; return { key: k, label: it.url ? `${platformLabel(it.platform)}から` : "手入力・メモ", order: ["instagram", "tiktok", "x", "youtube", "threads", "lemon8", "tabelog", "googlemaps", "web", "manual"].indexOf(k) }; }
      case "date": {
        const d = new Date(it.createdAt || Date.now());
        const days = (Date.now() - d) / 86400000;
        if (days < 7) return { key: "w", label: "この1週間", order: 0 };
        if (days < 31) return { key: "m", label: "この1か月", order: 1 };
        const ym = `${d.getFullYear()}年${d.getMonth() + 1}月`;
        return { key: ym, label: ym, order: 10 + (999999 - (d.getFullYear() * 100 + d.getMonth())) };
      }
      default: return { key: "all", label: "", order: 0 };
    }
  }

  // カードの右下：コメント・感想があればマーク（ジャンルの上）
  function talkBadges(it) {
    const c = (it.comments || []).length, r = Object.keys(reviewsOf(it)).length;
    if (!c && !r) return "";
    // コメントした人のアイコン（新しい順に3人まで）
    const who = [...new Set((it.comments || []).map((x) => x.by).filter(Boolean).reverse())].slice(0, 3);
    return `<span class="talk">${c ? `<span class="tag glass talk-c" title="コメント${c}件">${who.length ? `<span class="talk-avs">${who.map((id) => av(id, "xs")).join("")}</span>` : ""}💬 ${c}</span>` : ""}${r ? `<span class="tag glass" title="感想${r}件">📝 ${r}</span>` : ""}</span>`;
  }
  function card(it) {
    const g = genreOf(it.genre);
    const t = travelOf(it);
    const area = it.station || cityShort(it.city) || it.prefecture;
    const liked = myVote(it) === true;
    return `<article class="card" data-open="${esc(it.id)}" tabindex="0">
      <div ${cover(it, "cover")}>${thumb(it)}
        <div class="tr">${isBoth(it) ? `<span class="tag match">♡ ${esc(matchText(it))}</span>` : it.pinned ? `<span class="tag glass">📌</span>` : ""}</div>
        <div class="br">${talkBadges(it)}<span class="tag genre" style="--tint:${TINT[g.id]}">${g.emoji} ${esc(g.label)}</span></div>
      </div>
      <div class="body">
        <h3>${esc(nameOf(it))}</h3>
        <div class="facts">
          ${area ? `<span>${ic("pin", "sm")}${esc(area)}</span>` : ""}
          ${t ? `<span>${ic("train", "sm")}<b>${formatMinutes(t.best)}</b></span>` : ""}
          ${formatPrice(it) ? `<span>${ic("yen", "sm")}<b>${esc(formatPrice(it))}</b></span>` : ""}
          ${placeAvg(it) != null ? `<span class="stars-ro">★${placeAvg(it).toFixed(1)}<small> ${Object.keys(ratingsOf(it)).length}人</small></span>` : ""}
          ${eagerAvg(it) != null && it.status !== "visited" ? `<span class="eager-ro" title="行きたい度">🔥<b>${eagerAvg(it).toFixed(1)}</b></span>` : ""}
        </div>
        ${it.memo ? `<p class="card-memo" title="メモ">🗒️ ${esc(it.memo)}</p>` : ""}
        ${smartTags(it) ? `<div class="tags" style="margin:0">${smartTags(it)}</div>` : ""}
        <div class="card-foot">
          <span class="who">${it.addedBy ? av(it.addedBy, "xs") : ""}<span>${esc(pname(it.addedBy))} ・ ${esc(platformLabel(it.platform))} ・ ${relativeDate(it.createdAt || new Date().toISOString())}</span></span>
          <button class="heart ${liked ? "on" : ""}" data-like="${esc(it.id)}" aria-pressed="${liked}" aria-label="行きたい">${ic("heart")}</button>
        </div>
      </div>
    </article>`;
  }

  function highlights() {
    const out = new Map();
    const live = S.spots.filter((it) => (it.status || "want") !== "visited");
    for (const it of live) {
      const d = daysUntil(it.deadline);
      if (d != null && d >= 0 && d <= 14) out.set(it.id, { it, tag: `<span class="tag soon">${ic("hourglass", "sm")}${d === 0 ? "今日までみたい" : d <= 3 ? `あと${d}日くらい` : `${d}日後まで`}</span>`, w: 3 - d / 14 });
    }
    for (const it of live) {
      const s = seasonOf(it);
      if (s?.now && !out.has(it.id)) out.set(it.id, { it, tag: `<span class="tag season">${ic("leaf", "sm")}${esc(s.label)}</span>`, w: 2 });
    }
    for (const it of live) {
      const o = openState(it);
      const t = travelOf(it);
      if (o && o.state === "open" && (!t || t.best <= 60) && !out.has(it.id)) out.set(it.id, { it, tag: `<span class="tag open">${ic("clock", "sm")}${t ? `いま営業中・${formatMinutes(t.best)}` : "いま営業中"}</span>`, w: 1 + (isBoth(it) ? 0.5 : 0) });
    }
    return [...out.values()].sort((a, b) => b.w - a.w).slice(0, 10);
  }

  function renderHome(v) {
    const live = S.spots.filter((i) => (i.status || "want") !== "visited");
    const pend = pending().length;
    const hl = highlights();
    const items = filtered();
    const opt = (val, label, cur) => `<option value="${val}" ${cur === val ? "selected" : ""}>${label}</option>`;
    let list;
    if (!S.spots.length) list = welcomeEmpty();
    else if (S.q.trim()) list = searchResults(items);
    else if (!items.length) list = `<div class="empty"><p>条件に合うスポットはありません。</p><button class="btn sm" data-act="clear">絞り込みを解除</button></div>`;
    else if (S.listMode === "map") list = `<div id="map"></div><p class="sub" style="margin-top:8px">位置がわかっているスポットだけを表示しています。</p>`;
    else if (S.groupBy === "none") list = `<div class="grid">${items.map(card).join("")}</div>`;
    else {
      const map = new Map();
      for (const it of items) { const g = groupKey(it); if (!map.has(g.key)) map.set(g.key, { ...g, items: [] }); map.get(g.key).items.push(it); }
      list = [...map.values()].sort((a, b) => a.order - b.order || b.items.length - a.items.length)
        .map((g) => `<h2 class="group-h">${esc(g.label)} <small class="num">${g.items.length}件</small></h2><div class="grid">${g.items.map(card).join("")}</div>`).join("");
    }
    v.innerHTML = `
      <form class="adder" id="adder">
        ${ic("sparkle")}
        <input id="add-url" type="text" autocomplete="off" placeholder="行きたい場所を書く（例: 表参道のパンケーキ 1500円）" aria-label="行きたい場所を自由に書く">
        <button class="btn rose">${F.aiRead ? "AIで追加" : "追加"}</button>
      </form>
      ${S.spots.length ? `<div class="pulse">
        <button data-seg="all"><b>${live.length}</b><span>行きたい</span></button>
        ${solo() ? `<button data-seg="planned"><b>${live.filter((i) => i.pinned).length}</b><span>ピン留め</span></button>
          <button data-view="memories"><b>${S.spots.filter((i) => i.status === "visited").length}</b><span>行った</span></button>`
          : `<button class="hot" data-seg="both"><b>${live.filter(isBoth).length}</b><span>${esc(V().all)}♡</span></button>
          <button data-view="match"><b>${pend}</b><span>${esc(V().vote)}</span></button>`}
        <button data-view="plan"><b>${S.spots.filter((i) => i.status === "planned").length}</b><span>予定あり</span></button>
      </div>` : ""}
      ${hl.length ? `<div class="section-h"><h2>いまのおすすめ</h2><span class="sub">期限・旬・営業中から</span></div>
        <div class="rail">${hl.map(({ it, tag }) => `<button class="mini" data-open="${esc(it.id)}"><span ${cover(it, "ph")}>${thumb(it)}</span><span class="tx"><b>${esc(nameOf(it))}</b>${tag}</span></button>`).join("")}</div>` : ""}
      ${S.spots.length ? `
        <div class="section-h"><h2>行きたいリスト</h2>
          <div class="seg" role="tablist">${[["all", "すべて"], ...(solo() ? [] : [["both", V().all]]), ["planned", "予定あり"], ...(S.spots.some(wantAgain) ? [["again", "また行きたい"]] : [])].map(([k, l]) => `<button data-seg="${k}" class="${S.seg === k ? "on" : ""}">${l}</button>`).join("")}</div>
        </div>
        <div class="controls">
          <label class="search">${ic("search", "sm")}<input id="q" type="search" placeholder="あれ、どこだっけ？ うろ覚えでOK" value="${esc(S.q)}" aria-label="検索"></label>
          <button class="icon-btn" data-act="filters" aria-label="絞り込み">${ic("filter")}${activeFilterCount() ? `<span class="badge num">${activeFilterCount()}</span>` : ""}</button>
          ${F.map ? `<button class="icon-btn" data-act="mode" aria-label="${S.listMode === "map" ? "一覧で見る" : "地図で見る"}">${ic(S.listMode === "map" ? "grid" : "map")}</button>` : ""}
        </div>
        <div class="controls" style="justify-content:space-between">
          <div class="chips" style="padding:0">${S.settings.bases.length ? `<label class="chip">${ic("home", "sm")}<select id="base-select" style="border:0;background:none;font-weight:700;padding:0" aria-label="出発地">${S.settings.bases.map((b) => `<option value="${esc(b.id)}" ${activeBase()?.id === b.id ? "selected" : ""}>${esc(b.label)}から</option>`).join("")}</select></label>` : `<button class="chip" data-act="bases">${ic("home", "sm")}出発地を登録して移動時間を表示</button>`}</div>
          <label class="sub">並び <select id="group" style="border:0;background:none;font-weight:700;color:var(--ink)" aria-label="グループ分け">${opt("date", "追加日ごと", S.groupBy)}${opt("genre", "ジャンルごと", S.groupBy)}${opt("area", "エリアごと", S.groupBy)}${opt("travel", "移動時間ごと", S.groupBy)}${opt("price", "予算ごと", S.groupBy)}${opt("who", "見つけた人ごと", S.groupBy)}${opt("platform", "共有元ごと", S.groupBy)}${opt("none", "分けない", S.groupBy)}</select></label>
        </div>
        ${genreRow()}` : ""}
      ${list}`;
    if (S.listMode === "map" && items.length) renderMap(items);
  }

  function searchResults(items) {
    const ask = F.askAI ? `<button class="btn sm rose" data-act="ask">${ic("sparkle", "sm")}AIに聞く</button>` : "";
    const head = `<div class="search-info">${S.understood.length ? `<span class="sub">こう読み取りました</span>${S.understood.map((u) => `<span class="tag">${esc(u)}</span>`).join("")}` : `<span class="sub">うろ覚え検索</span>`}${ask}</div>`;
    if (!items.length) return `${head}<div class="empty"><h3>うーん、思い出せません…</h3><p>言い方を変えてみてください（例:「海が見えるカフェ」「先月見つけた安いとこ」）。${F.askAI ? "文章のまま「AIに聞く」こともできます。" : ""}</p></div>`;
    return `${head}<h2 class="group-h">「${esc(S.q.trim())}」っぽい場所 <small class="num">${items.length}件</small></h2><div class="grid">${items.map(card).join("")}</div>`;
  }

  async function openAsk() {
    const q = S.q.trim();
    if (!q) return;
    const { root } = sheet(`${head("AIに聞く")}<p class="sub" style="margin-top:0">「${esc(q)}」</p><div id="ask-out"><div class="empty"><span class="thinking"><span class="spinner"></span>記憶をたどっています…</span></div></div>`);
    const out = root.querySelector("#ask-out");
    try {
      const names = Object.fromEntries(peopleList().map((p) => [p.id, p.name]));
      const picks = await B.ask(q, S.spots.map((s) => ({ id: s.id, name: nameOf(s), genre: genreOf(s.genre).label, area: [s.prefecture, s.city, s.station].filter(Boolean).join(" "), price: formatPrice(s), status: STATUS[s.status || "want"], addedBy: names[s.addedBy] || "", addedAt: (s.createdAt || "").slice(0, 10), tags: (s.tags || []).slice(0, 8).join(" "), memo: s.memo || "", text: String(s.summary || s.caption || "").slice(0, 160) })));
      const found = (picks || []).map((p) => ({ ...p, spot: S.spots.find((s) => s.id === p.id) })).filter((p) => p.spot);
      out.innerHTML = found.length
        ? found.map((p) => `<button class="mini" data-ask-open="${esc(p.spot.id)}" style="flex:none;width:100%;margin-bottom:8px"><span ${cover(p.spot, "ph")}>${img(p.spot) || genreOf(p.spot.genre).emoji}</span><span class="tx"><b>${esc(nameOf(p.spot))}</b><span class="sub">${esc(p.reason || "")}</span></span></button>`).join("")
        : `<div class="empty"><h3>見つかりませんでした</h3><p>まだリストに入っていないのかもしれません。</p></div>`;
    } catch (e) {
      out.innerHTML = `<div class="notice warn">${esc(e?.message || "うまく聞けませんでした")}</div>`;
    }
    out.addEventListener("click", (e) => { const b = e.target.closest("[data-ask-open]"); if (b) openDetail(b.dataset.askOpen); });
  }

  // ジャンルの色つきボタン（1つ押すとそのジャンルだけ表示）
  function genreRow() {
    const live = S.spots.filter((i) => (i.status || "want") !== "visited");
    const gs = GENRES.filter((g) => live.some((i) => i.genre === g.id));
    if (gs.length < 2) return "";
    const one = S.f.genres.size === 1 ? [...S.f.genres][0] : "";
    return `<div class="chips genre-row" role="toolbar" aria-label="ジャンル">
      <button class="chip ${!S.f.genres.size ? "on" : ""}" data-genre="">すべて <small class="num">${live.length}</small></button>
      ${gs.map((g) => `<button class="chip g-chip ${one === g.id ? "on" : ""}" style="--tint:${TINT[g.id]}" data-genre="${g.id}"><i></i>${g.emoji} ${esc(g.label)} <small class="num">${live.filter((i) => i.genre === g.id).length}</small></button>`).join("")}
    </div>`;
  }

  function welcomeEmpty() {
    const steps = [
      solo() ? ["1", "SNSで探す", "気になるお店や場所を見つけたら、店名や場所をざっくり覚えておきます。"]
        : !isLeader() ? ["1", "みんなで貯める", "部屋のみんなが見つけた場所が、ここに集まります。「行きたい」で気持ちを伝えましょう。"]
        : F.invite || F.codes ? ["1", `${V().label}を招待`, "設定の「招待」から招待コードかリンクを送ります。相手は名前を入れるだけで使えます。"] : ["1", `${V().label}を招待`, "共有メニューから相手を「編集できる」で招待します。"],
      ["2", "出発地を登録", "家や職場、よく集まる駅を登録すると、移動時間の目安が出ます。"],
      ["3", "書くだけで追加", `「表参道のパンケーキ 1500円」のように書くと、${F.aiRead ? "AIが" : ""}ジャンル・場所・値段を整理します。SNSのリンクからも追加できます。`],
    ];
    return `<div class="empty"><h3>「どこいく？」の候補はまだゼロです</h3><p>SNSで「ここ行きたい！」と思ったら、上の欄に思いつくまま書いておきましょう。次の「どこいく？」で、未来のあなたが感謝します。</p>
      <div class="steps">${steps.map(([n, t, d]) => `<div class="step"><i>STEP ${n}</i><b>${t}</b><span class="sub">${d}</span></div>`).join("")}</div></div>`;
  }

  // ---------- 地図（Webアプリのみ） ----------
  async function renderMap(items) {
    if (!window.L) {
      await new Promise((res, rej) => {
        const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.append(css);
        const s = document.createElement("script"); s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; s.onload = res; s.onerror = rej; document.head.append(s);
      }).catch(() => null);
    }
    const el = $("map");
    if (!el || !window.L) { if (el) el.innerHTML = `<div class="empty">地図を読み込めませんでした</div>`; return; }
    const L = window.L;
    const map = L.map(el);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map);
    const pts = [];
    const color = { want: "#df4a72", planned: "#3b6fd8", visited: "#1d936a" };
    for (const it of items) {
      if (it.lat == null) continue;
      const icon = L.divIcon({ className: "", html: `<div class="pin" style="background:${color[it.status || "want"]}"><span>${genreOf(it.genre).emoji}</span></div>`, iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -30] });
      L.marker([it.lat, it.lng], { icon }).addTo(map).bindPopup(`<b>${esc(nameOf(it))}</b><br><a href="#" data-open="${esc(it.id)}">詳しく見る</a>`);
      pts.push([it.lat, it.lng]);
    }
    for (const b of S.settings.bases) { L.circleMarker([b.lat, b.lng], { radius: 8, color: "#2a2124", fillOpacity: 1 }).addTo(map).bindPopup(esc(b.label)); pts.push([b.lat, b.lng]); }
    if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 }); else map.setView([35.681, 139.767], 11);
    el.addEventListener("click", (e) => { const a = e.target.closest("[data-open]"); if (a) { e.preventDefault(); openDetail(a.dataset.open); } });
  }

  // ---------- 答え合わせ ----------
  function renderMatch(v) {
    const queue = pending().filter((it) => !S.skipped.has(it.id));
    const skippedOnly = !queue.length && pending().length;
    if (!queue.length) {
      const both = S.spots.filter((it) => (it.status || "want") !== "visited" && isBoth(it));
      v.innerHTML = `<div class="section-h"><h2>答え合わせ</h2></div>
        <div class="empty"><h3>${skippedOnly ? "あとで見るスポットだけ残っています" : "答え合わせは全部おわりました"}</h3>
        <p>${skippedOnly ? "" : "ほかのメンバーが新しく追加すると、ここで「行きたい？」を答えられます。"}</p>
        ${skippedOnly ? `<button class="btn sm" data-act="unskip">もう一度見る</button>` : ""}</div>
        ${both.length ? `<div class="section-h"><h2>${esc(matchPhrase())}場所</h2><span class="sub num">${both.length}件</span></div><div class="grid">${both.map(card).join("")}</div>` : ""}`;
      return;
    }
    const [cur, next] = queue;
    const swipeCard = (it, behind) => {
      const g = genreOf(it.genre);
      const t = travelOf(it);
      return `<div class="swipe-card ${behind ? "behind" : ""}" ${behind ? "" : `id="swipe" data-id="${esc(it.id)}"`}>
        <div ${cover(it, "cover")}>${thumb(it)}<div class="tl"><span class="tag glass">${esc(g.label)}</span></div>
          ${behind ? "" : `<span class="stamp yes">行きたい！</span><span class="stamp no">まあまあ</span>`}</div>
        <div class="body">
          <span class="who">${av(it.addedBy, "xs")}<span style="display:inline">${esc(pname(it.addedBy))}が ${relativeDate(it.createdAt || new Date().toISOString())}に見つけた</span></span>
          ${reasked(it) ? `<span class="tag season">もう一度どう？と聞かれています</span>` : ""}
          <h3>${esc(nameOf(it))}</h3>
          <div class="facts">${it.station || it.city ? `<span>${ic("pin", "sm")}${esc(it.station || cityShort(it.city))}</span>` : ""}${t ? `<span>${ic("train", "sm")}<b>${formatMinutes(t.best)}</b></span>` : ""}${formatPrice(it) ? `<span>${ic("yen", "sm")}<b>${esc(formatPrice(it))}</b></span>` : ""}</div>
          ${it.summary || it.memo ? `<p class="sub" style="margin:0">${esc(it.summary || it.memo)}</p>` : ""}
          <div class="tags" style="margin:0">${smartTags(it, { withStatus: false })}${it.url ? `<a class="tag" href="${esc(it.url)}" target="_blank" rel="noopener">${ic("ext", "sm")}${esc(platformLabel(it.platform))}で見る</a>` : ""}</div>
        </div>
      </div>`;
    };
    v.innerHTML = `<div class="section-h"><h2>答え合わせ</h2><span class="sub num">のこり ${queue.length}件</span></div>
      <p class="sub" style="margin:-4px 2px 0">${esc(pname(cur.addedBy))}が見つけた場所、あなたも行きたい？ 右にスワイプで「行きたい」、左で「まあまあ」。</p>
      <div class="swipe-stage">${next ? swipeCard(next, true) : ""}${swipeCard(cur, false)}</div>
      <div class="swipe-actions">
        <button class="round" data-vote="no" aria-label="まあまあ">${ic("meh")}</button>
        <button class="round skip" data-vote="skip" aria-label="あとで">${ic("skip", "sm")}</button>
        <button class="round yes" data-vote="yes" aria-label="行きたい">${ic("heart")}</button>
      </div>`;
    bindSwipe(cur);
  }

  function bindSwipe(it) {
    const el = $("swipe");
    if (!el) return;
    let x0 = null, dx = 0;
    const stamps = { yes: el.querySelector(".stamp.yes"), no: el.querySelector(".stamp.no") };
    el.addEventListener("pointerdown", (e) => { if (e.target.closest("a")) return; x0 = e.clientX; dx = 0; el.classList.add("dragging"); el.setPointerCapture(e.pointerId); });
    el.addEventListener("pointermove", (e) => {
      if (x0 == null) return;
      dx = e.clientX - x0;
      el.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
      stamps.yes.style.opacity = Math.max(0, Math.min(1, dx / 90));
      stamps.no.style.opacity = Math.max(0, Math.min(1, -dx / 90));
    });
    const end = () => {
      if (x0 == null) return;
      x0 = null;
      el.classList.remove("dragging");
      if (dx > 90) decide(it, "yes");
      else if (dx < -90) decide(it, "no");
      else { el.style.transform = ""; stamps.yes.style.opacity = 0; stamps.no.style.opacity = 0; if (Math.abs(dx) < 6) openDetail(it.id); }
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  async function decide(it, choice) {
    const el = $("swipe");
    if (choice === "skip") { S.skipped.add(it.id); return renderView(); }
    const value = choice === "yes" ? true : "no";
    // 「まあまあ」は理由を選んでから決まる（間違えて左にスワイプしたときは「やめる」で戻せる）
    let reason = null;
    if (value === "no") {
      if (el) { el.style.transform = "translateX(-60px) rotate(-6deg)"; }
      reason = await mehSheet(it);
      if (!reason) { if (el) { el.style.transform = ""; el.style.opacity = ""; } return; }
    }
    if (el) { el.style.transform = `translateX(${choice === "yes" ? 520 : -520}px) rotate(${choice === "yes" ? 24 : -24}deg)`; el.style.opacity = "0"; }
    const wasMatch = choice === "yes" && yesIds(it).some((id) => id !== me());
    await vote(it.id, value, { silent: true, reason });
    if (wasMatch) showMatch(it);
    if (value === "no") toast("「まあまあ」を伝えました。気が変わったらいつでも♡にできます");
  }

  // 「まあまあ」の理由を選ぶ（任意）。選んだ理由は相手にやさしい一言として伝わる
  function mehSheet(it) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (r) => { if (done) return; done = true; resolve(r); };
      const { root, close } = sheet(`${head("まあまあにしますか？")}
        <p class="sub" style="margin-top:0">「${esc(nameOf(it))}」を「まあまあ」にするなら、理由を選んでください。理由は${esc(pname(it.addedBy))}にやさしく伝わります。</p>
        <div class="meh-grid">${Object.entries(MEH).map(([k, m]) => `<button data-meh="${k}"><span>${m.emoji}</span>${esc(m.label)}</button>`).join("")}</div>
        <button class="btn line block" style="margin-top:10px" data-meh="">やめる（まあまあにしない）</button>`, { onClose: () => finish(null) });
      root.addEventListener("click", (e) => { const b = e.target.closest("[data-meh]"); if (!b) return; finish(b.dataset.meh || null); close(); });
    });
  }

  // 自分が見つけた場所に「まあまあ」が付いたときの、やさしい一言と次の一手
  function kindBox(it) {
    const mehs = Object.entries(votes(it)).filter(([id, v]) => v === "no" && id !== me());
    if (!mehs.length || it.status === "visited") return "";
    const mine = it.addedBy === me();
    const reasons = [...new Set(mehs.map(([id]) => it.reasons?.[id]).filter((r) => MEH[r]))];
    const seed = [...String(it.id)].reduce((n, c) => n + c.charCodeAt(0), 0);
    const lines = reasons.length ? reasons.map((r) => `${MEH[r].emoji} ${MEH[r].hint}`) : [KIND_WORDS[seed % KIND_WORDS.length]];
    const waiting = it.reaskAt && it.reaskAt > todayStr();
    return `<div class="kind-box">
      <b>${mine ? "こんなふうに誘ってみては？" : "まあまあの声も、ヒントにしよう"}</b>
      ${lines.map((l) => `<p>${esc(l)}</p>`).join("")}
      ${mine ? (waiting ? `<p class="sub">${jpDate(it.reaskAt)}に、もう一度「どう？」と聞きます。</p>`
        : it.reaskAt && it.reaskBy === me() ? `<p class="sub">🔁 もう一度「どう？」と聞いています（相手の答え合わせに出ています）。</p>`
        : `<div class="actions" style="margin-top:4px"><button class="btn sm rose" data-reask="0">今すぐもう一度聞く</button><button class="btn sm line" data-reask="7">1週間後</button><button class="btn sm line" data-reask="30">1か月後</button></div>`) : ""}
    </div>`;
  }

  function showMatch(it) {
    const hearts = Array.from({ length: 14 }, (_, i) => `<span class="float-heart" style="left:${(i * 7.3) % 100}%;animation-delay:${(i % 7) * 0.18}s">♥</span>`).join("");
    const el = document.createElement("div");
    el.className = "match-overlay";
    el.innerHTML = `${hearts}<div><h2>マッチ！</h2><p>「${esc(nameOf(it))}」<br>${memberCount() <= 2 ? `${esc(V().all)}行きたい場所です` : `${yesIds(it).length}人が行きたい場所です`}</p>
      <div class="actions" style="justify-content:center"><button class="btn" data-m="plan">${esc(V().plan)}の予定を立てる</button><button class="btn line" data-m="next">次へ</button></div></div>`;
    document.body.append(el);
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-m]");
      if (!b) return;
      el.remove();
      if (b.dataset.m === "plan") { go("plan"); openDetail(it.id); }
    });
  }

  // ---------- デート（コース作り・予定） ----------
  function renderPlan(v) {
    const tabs = `<div class="seg full" style="margin:8px 0 2px" role="tablist">${[["calendar", "カレンダー"], ["course", V().plan === "デート" ? "デートコース" : "プラン作り"]].map(([k, l]) => `<button data-ptab="${k}" class="${S.planTab === k ? "on" : ""}">${l}</button>`).join("")}</div>`;
    if (S.planTab === "course") { renderCourse(v); v.insertAdjacentHTML("afterbegin", tabs); }
    else renderCalendar(v, tabs);
  }

  function renderCalendar(v, tabs) {
    const today = todayStr();
    const ym = S.calMonth || today.slice(0, 7);
    const sel = S.calDay || today;
    const [y, m] = ym.split("-").map(Number);
    const ev = eventsOn(S.spots, sel);
    const upcoming = S.spots.filter((i) => i.status === "planned" && i.plannedDate && i.plannedDate >= today).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || (a.planTime || "").localeCompare(b.planTime || "")).slice(0, 6);
    const undated = S.spots.filter((i) => i.status === "planned" && !i.plannedDate);
    const cell = (d) => {
      if (!d) return `<span></span>`;
      const e = eventsOn(S.spots, d);
      const dow = new Date(d + "T12:00:00").getDay();
      const marks = [...e.planned.slice(0, 2).map((i) => genreOf(i.genre).emoji)].join("");
      return `<button class="cal-d ${d === today ? "today" : ""} ${d === sel ? "on" : ""} ${dow === 0 ? "sun" : dow === 6 ? "sat" : ""}" data-day="${d}" aria-label="${jpDate(d)}${e.planned.length ? ` 予定${e.planned.length}件` : ""}">
        <span class="n num">${Number(d.slice(8))}</span><span class="mk">${marks}</span>
        <span class="dots">${e.planned.length > 2 ? `<i class="p"></i>` : ""}${e.deadline.length ? `<i class="d"></i>` : ""}${e.visited.length ? `<i class="v"></i>` : ""}</span></button>`;
    };
    const agendaItem = (it, kind) => `<button class="mini" data-open="${esc(it.id)}" style="flex:none;width:100%;margin-bottom:8px"><span ${cover(it, "ph")}>${thumb(it)}</span><span class="tx"><b>${esc(nameOf(it))}</b>
      ${kind === "planned" ? `<span class="tag plan">${it.planTime ? esc(it.planTime) + " " : ""}予定</span>` : kind === "deadline" ? `<span class="tag soon">このあたりまでの期間限定</span>` : `<span class="tag done">行った${placeAvg(it) != null ? ` ★${placeAvg(it).toFixed(1)}` : ""}</span>`}</span></button>`;
    v.innerHTML = `${tabs}
      <div class="panel cal" style="margin-top:12px">
        <div class="cal-head"><button class="ghost-icon" data-cal="-1" aria-label="前の月">‹</button><h2 class="num">${y}年${m}月</h2><button class="ghost-icon" data-cal="1" aria-label="次の月">›</button></div>
        <div class="cal-grid">${["日", "月", "火", "水", "木", "金", "土"].map((w, i) => `<span class="cal-w ${i === 0 ? "sun" : i === 6 ? "sat" : ""}">${w}</span>`).join("")}${monthGrid(ym).map(cell).join("")}</div>
        <div class="legend"><span><i style="background:var(--plan)"></i>予定</span><span><i style="background:var(--warn)"></i>期間限定のおわりごろ</span><span><i style="background:var(--ok)"></i>行った</span>${ym !== today.slice(0, 7) ? `<button class="link" data-cal="today" style="border:0;background:none;color:var(--plan);font-weight:700;padding:0">今月に戻る</button>` : ""}</div>
      </div>
      <div class="section-h"><h2>${jpDate(sel)}${sel === today ? `<span class="sub" style="font-weight:500">　今日</span>` : ""}</h2><button class="btn sm rose" data-act="addday">${ic("plus", "sm")}この日に予定を入れる</button></div>
      ${ev.planned.length + ev.deadline.length + ev.visited.length ? [...ev.planned.sort((a, b) => (a.planTime || "").localeCompare(b.planTime || "")).map((i) => agendaItem(i, "planned")), ...ev.deadline.map((i) => agendaItem(i, "deadline")), ...ev.visited.map((i) => agendaItem(i, "visited"))].join("")
        : `<p class="sub" style="margin:0 2px">${sel < today ? "この日の記録はありません。" : "まだ何もありません。行きたい場所から予定を入れてみましょう。"}</p>`}
      ${ev.planned.length > 1 && ev.planned.every((i) => i.lat != null) ? `<div class="actions" style="margin-top:4px"><a class="btn sm line" href="${courseRouteUrl(ev.planned)}" target="_blank" rel="noopener">${ic("route", "sm")}この日のルート</a><a class="btn sm line" href="${lineShareUrl(`${jpDate(sel)}の${V().plan}\n${ev.planned.map((i) => `${i.planTime ? i.planTime + " " : ""}${nameOf(i)}`).join("\n")}`)}" target="_blank" rel="noopener">${ic("send", "sm")}LINEで共有</a></div>` : ""}
      ${upcoming.length ? `<div class="section-h"><h2>これからの予定</h2></div><div class="panel" style="padding:4px 14px">${upcoming.map((i) => `<div class="memory" data-open="${esc(i.id)}" style="grid-template-columns:64px 1fr;align-items:center"><span class="num" style="font-family:var(--display);font-weight:900">${jpDate(i.plannedDate)}</span><span><b>${esc(nameOf(i))}</b><div class="sub">${i.planTime ? esc(i.planTime) + " ・ " : ""}${untilLabel(i.plannedDate)}</div></span></div>`).join("")}</div>` : ""}
      ${undated.length ? `<div class="section-h"><h2>日にち未定の予定</h2><span class="sub num">${undated.length}件</span></div><div class="grid">${undated.map(card).join("")}</div>` : ""}`;
  }

  // カレンダーの日付に、行きたい場所から予定を入れる
  function openAddDay() {
    const day = S.calDay || todayStr();
    const pool = S.spots.filter((i) => (i.status || "want") !== "visited" && !(i.status === "planned" && i.plannedDate === day))
      .sort((a, b) => (isBoth(b) ? 1 : 0) - (isBoth(a) ? 1 : 0) || yesIds(b).length - yesIds(a).length);
    if (!pool.length) return toast("予定に入れられる行きたい場所がありません");
    const picked = new Set();
    const { root, close } = sheet(`${head(`${jpDate(day)}に行く場所`)}
      <p class="sub" style="margin-top:0">選んだ場所をこの日の予定にします。${solo() ? "" : "♡が多い順に並んでいます。"}</p>
      <div class="pick-list">${pool.map((i) => `<button class="mini pick" data-pick="${esc(i.id)}" style="flex:none;width:100%;margin-bottom:8px"><span ${cover(i, "ph")}>${thumb(i)}</span><span class="tx"><b>${esc(nameOf(i))}</b><span class="sub">${esc(genreOf(i.genre).label)}${isBoth(i) ? ` ・ ♡${esc(matchText(i))}` : ""}${i.status === "planned" && i.plannedDate ? ` ・ いまは${jpDate(i.plannedDate)}` : ""}</span></span><span class="check" aria-hidden="true"></span></button>`).join("")}</div>
      <div class="row2" style="margin-top:6px"><div class="field"><label for="ad-time">時間（任意）</label><input id="ad-time" type="time"></div><div></div></div>
      <div class="actions"><button class="btn line" data-course>${ic("sparkle", "sm")}この日のコースを作る</button><button class="btn rose" data-save disabled>予定に入れる</button></div>`);
    root.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-pick]");
      if (b) { picked.has(b.dataset.pick) ? picked.delete(b.dataset.pick) : picked.add(b.dataset.pick); b.classList.toggle("on"); root.querySelector("[data-save]").disabled = !picked.size; root.querySelector("[data-save]").textContent = picked.size ? `${picked.size}件を予定に入れる` : "予定に入れる"; return; }
      if (e.target.closest("[data-course]")) { close(); S.plan.dateFrom = day; S.plan.dateTo = ""; S.planTab = "course"; return renderView(); }
      if (e.target.closest("[data-save]")) {
        const t = root.querySelector("#ad-time").value;
        for (const id of picked) await B.updateSpot(id, { status: "planned", plannedDate: day, ...(t ? { planTime: t } : {}) }).catch(() => null);
        close();
        toast(`${jpDate(day)}の予定に入れました`);
      }
    });
  }

  // 行く日のかんたん選択
  const BUDGET_PRESETS = [["", "3000", "〜¥3,000"], ["3000", "5000", "¥3,000〜5,000"], ["5000", "10000", "¥5,000〜10,000"], ["10000", "20000", "¥10,000〜20,000"], ["20000", "", "¥20,000〜"], ["", "", "指定なし"]];
  function datePresetRange(k) {
    const t = todayStr();
    const sat = nextSaturday();
    const thisSat = new Date().getDay() === 6 ? t : new Date().getDay() === 0 ? addDays(t, -1) : sat;
    return { weekend: [thisSat < t ? t : thisSat, addDays(thisSat, 1)], next: [addDays(thisSat, 7), addDays(thisSat, 8)], week: [t, addDays(t, 6)], two: [t, addDays(t, 13)], month: [t, addDays(t, 30)] }[k];
  }
  const datePresets = () => [["weekend", "今週末"], ["next", "来週末"], ["week", "1週間のうち"], ["two", "2週間のうち"], ["month", "1か月のうち"]];
  const datePresetOn = (k) => { const [a, b] = datePresetRange(k); return S.plan.dateFrom === a && S.plan.dateTo === b; };
  function readPlanForm() {
    const P = S.plan;
    P.dateFrom = $("p-from")?.value || P.dateFrom || todayStr();
    P.dateTo = $("p-to")?.value || "";
    if (P.dateTo && P.dateTo < P.dateFrom) P.dateTo = "";
    P.budgetMin = $("p-bmin")?.value ?? P.budgetMin;
    P.budgetMax = $("p-bmax")?.value ?? P.budgetMax;
    if (P.budgetMin && P.budgetMax && Number(P.budgetMin) > Number(P.budgetMax)) [P.budgetMin, P.budgetMax] = [P.budgetMax, P.budgetMin];
    P.startTime = $("p-time")?.value ?? P.startTime;
  }
  // コースを作るエリアの候補（行きたい場所があるところだけ）
  function planAreas() {
    const pool = S.spots.filter((i) => (i.status || "want") !== "visited" && i.lat != null);
    const out = [{ key: "", label: "どこでも", count: pool.length }];
    const base = activeBase();
    if (base) out.push({ key: "near", label: `${base.label}の近く`, count: pool.filter((i) => inArea(i, { lat: base.lat, lng: base.lng, r: 5 })).length });
    for (const a of AREAS) { const n = pool.filter((i) => inArea(i, { id: a.id })).length; if (n) out.push({ key: a.id, label: a.label, count: n }); }
    const prefs = {};
    for (const i of pool) if (i.prefecture) prefs[i.prefecture] = (prefs[i.prefecture] || 0) + 1;
    for (const [p, n] of Object.entries(prefs).sort((a, b) => b[1] - a[1])) out.push({ key: `pref:${p}`, label: p, count: n });
    return out.filter((a) => a.key === "" || a.count);
  }
  function planArea() {
    const k = S.plan.area;
    if (!k) return null;
    if (k === "near") { const b = activeBase(); return b ? { lat: b.lat, lng: b.lng, r: 5 } : null; }
    if (k.startsWith("pref:")) return { prefecture: k.slice(5) };
    return { id: k };
  }
  const planStart = () => { const m = /^(\d{1,2}):(\d{2})/.exec(S.plan.startTime || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

  function renderCourse(v) {
    const P = S.plan;
    const planned = S.spots.filter((i) => i.status === "planned").sort((a, b) => (a.plannedDate || "9999").localeCompare(b.plannedDate || "9999") || (a.planOrder ?? 99) - (b.planOrder ?? 99));
    const byDate = new Map();
    for (const it of planned) { const k = it.plannedDate || ""; if (!byDate.has(k)) byDate.set(k, []); byDate.get(k).push(it); }
    const located = S.spots.filter((i) => (i.status || "want") !== "visited" && i.lat != null).length;
    v.innerHTML = `
      <div class="section-h"><h2>${esc(V().planTitle)}</h2><button class="link" data-act="gacha">迷ったらガチャ</button></div>
      <div class="panel">
        <p class="sub" style="margin:0 0 12px">${esc(V().us)}の「行きたい」から、近い場所どうしを組み合わせて回る順番と時間を考えます。</p>
        <div class="field"><label>どのあたりで？</label>
          <div class="chips wrap-chips">${planAreas().map((a) => `<button class="chip ${P.area === a.key ? "on" : ""}" data-parea="${esc(a.key)}">${esc(a.label)} <small>${a.count}</small></button>`).join("")}</div>
          <span class="sub">位置がわかっている行きたい場所の数です。</span></div>
        <div class="field"><label>気分・雰囲気（3つまで）</label>
          <div class="mood-grid">${Object.entries(MOODS).map(([k, m]) => `<button class="mood ${P.moods.includes(k) ? "on" : ""}" data-pmood="${k}"><span>${m.emoji}</span>${esc(m.label)}</button>`).join("")}</div>
          ${P.moods.includes("romantic") && !P.startTime && ["morning", "day"].includes(P.style) ? `<span class="sub">夜景を楽しむなら「夕方から」がおすすめです。</span>` : ""}</div>
        <div class="field"><label for="p-from">行く日（何日から何日まで）</label>
          <div class="range-row"><input id="p-from" type="date" value="${esc(P.dateFrom)}" aria-label="この日から"><span>〜</span><input id="p-to" type="date" value="${esc(P.dateTo)}" min="${esc(P.dateFrom)}" aria-label="この日まで（1日だけなら空のまま）"></div>
          <div class="chips wrap-chips" style="margin-top:8px">${datePresets().map(([k, l]) => `<button class="chip ${datePresetOn(k) ? "on" : ""}" data-pdate="${k}">${l}</button>`).join("")}</div>
          <span class="sub">${P.dateTo && P.dateTo > P.dateFrom ? `${jpDate(P.dateFrom)}〜${jpDate(P.dateTo)}の中から、お店が開いている日など一番よい日を選びます。` : "1日だけなら右は空のままで大丈夫です。"}</span></div>
        <div class="field"><label for="p-bmin">予算（1人・交通費込み）</label>
          <div class="range-row"><span class="yen-in"><input id="p-bmin" type="number" min="0" step="500" inputmode="numeric" placeholder="下限なし" value="${esc(P.budgetMin)}"><i>円</i></span><span>〜</span><span class="yen-in"><input id="p-bmax" type="number" min="0" step="500" inputmode="numeric" placeholder="上限なし" value="${esc(P.budgetMax)}"><i>円</i></span></div>
          <div class="chips wrap-chips" style="margin-top:8px">${BUDGET_PRESETS.map(([a, b2, l]) => `<button class="chip ${P.budgetMin === a && P.budgetMax === b2 ? "on" : ""}" data-pbudget="${a}-${b2}">${l}</button>`).join("")}</div></div>
        <div class="field"><label>出発する時間</label>
          <div class="seg full tight">${Object.entries(STYLE_LABEL).map(([k, [l, hm]]) => `<button data-pstyle="${k}" class="${!P.startTime && P.style === k ? "on" : ""}">${l}<small class="seg-sub">${hm}</small></button>`).join("")}</div>
          <div class="time-own"><label for="p-time">時間を指定</label><input id="p-time" type="time" step="300" value="${esc(P.startTime)}">${P.startTime ? `<span class="tag plan">${esc(P.startTime)}から</span>` : `<span class="sub">例: 10:30</span>`}</div></div>
        <div class="field"><label>回る数</label><div class="stops-grid">${Array.from({ length: 10 }, (_, i) => i + 1).map((n) => `<button data-pstops="${n}" class="${P.stops === n ? "on" : ""}">${n}<small>か所</small></button>`).join("")}</div>
          ${P.stops >= 6 ? `<span class="sub">${P.stops}か所だと1日たっぷりのコースになります。朝から出発するのがおすすめです。</span>` : ""}</div>
        <div class="chips wrap-chips" style="margin-bottom:12px">${solo() ? "" : `<button class="chip ${P.bothOnly ? "on" : ""}" data-act="pboth">♡ ${esc(matchPhrase())}場所だけ</button>`}
          <button class="chip ${P.neverOnly ? "on" : ""}" data-act="pnever">🆕 まだ行ったことない場所だけ</button></div>
        <p class="sub" style="margin:0 0 12px">${P.neverOnly ? "行ったことのある場所は入れません。" : `行ったことのある場所も、みんなの評価が★${AGAIN_MIN}以上なら「また行きたい」として候補に入ります。`}</p>
        <p class="sub" style="margin:0 0 12px">${activeBase() ? `${esc(activeBase().label)}からの行き帰りと、スポット間の移動の交通費も予算に入れて考えます。` : `出発地を登録すると、行き帰りの交通費も予算に入れて考えます。`}</p>
        <button class="btn rose block" data-act="build">${ic("sparkle")}コースを考える</button>
        ${located < 2 ? `<p class="sub" style="margin:10px 0 0">位置がわかっているスポットが2つ以上必要です（いま${located}件）。スポットの「編集」で場所を入れると使えます。</p>` : ""}
      </div>
      <div id="courses">${S.courses ? coursesHtml(S.courses) : ""}</div>
      <div class="section-h"><h2>決まっている予定</h2><span class="sub num">${planned.length}件</span></div>
      ${planned.length ? [...byDate].map(([d, list]) => `
        <div class="course">
          <div class="course-head"><h3>${d ? `${jpDate(d)}${daysUntil(d) >= 0 ? `<span class="sub" style="font-weight:500">　${untilLabel(d)}</span>` : ""}` : "日にち未定"}</h3></div>
          <ul class="tl">${list.map((it) => `<li><span class="time">${esc(it.planTime || "")}</span><div class="stop"><button data-open="${esc(it.id)}">${esc(nameOf(it))}</button><div class="sub">${esc(genreOf(it.genre).label)}${it.station ? ` ・ ${esc(it.station)}` : ""}</div></div></li>`).join("")}</ul>
          <div class="actions">
            ${list.length > 1 && list.every((i) => i.lat != null) ? `<a class="btn sm line" href="${courseRouteUrl(list)}" target="_blank" rel="noopener">${ic("route", "sm")}ルート</a>` : ""}
            <a class="btn sm line" href="${calendarUrl({ placeName: `${V().plan}：${list.map(nameOf).join(" → ")}`, address: list[0].address || list[0].city, url: list.map((i) => i.url).filter(Boolean).join("\n") }, d || todayStr(), list[0].planTime || "", 240)}" target="_blank" rel="noopener">${ic("cal", "sm")}カレンダー</a>
            <a class="btn sm line" href="${lineShareUrl(`${d ? jpDate(d) : ""}の${V().plan}\n${list.map((i) => `${i.planTime ? i.planTime + " " : ""}${nameOf(i)}`).join("\n")}`)}" target="_blank" rel="noopener">${ic("send", "sm")}LINE</a>
          </div>
        </div>`).join("") : `<div class="empty"><p>まだ予定はありません。上でコースを作るか、スポットを「予定あり」にしましょう。</p></div>`}`;
  }

  function courseTitle(c) {
    return `${c.area ? c.area + "で " : ""}${c.stops.map((s) => genreOf(s.spot.genre).label.replace(/・.*/, "")).join(" → ")}`;
  }
  function coursesHtml(courses) {
    if (!courses.length) return `<div class="empty"><p>条件に合うコースが作れませんでした。${S.plan.budgetMin || S.plan.budgetMax ? "予算には交通費も含まれます。予算の幅を広げるか、" : ""}${S.plan.dateTo ? "" : "日にちの幅を広げるか、"}${S.plan.area || S.plan.moods.length ? "エリアや気分の指定を外すか、" : ""}条件をゆるめるか、位置のわかるスポットを増やしてください。</p></div>`;
    const legIcon = (m) => (m === "徒歩" ? "walk" : m === "電車" ? "train" : "car");
    const legLi = (l, label = "") => `<li><span></span><div class="leg">${ic(legIcon(l.mode), "sm")}${label}${l.mode} 約${formatMinutes(l.min)}${l.fare ? ` ・ ${yen(l.fare)}` : ""}</div></li>`;
    return courses.map((c, i) => `
      <div class="course">
        <div class="course-head">
          <span class="sub">コース ${i + 1}${c.date && S.plan.dateTo && S.plan.dateTo > S.plan.dateFrom ? ` ・ <b class="course-date">${jpDate(c.date)}がおすすめ</b>` : ""}</span>
          <h3>${esc(courseTitle(c))}</h3>
          <div class="course-stats"><span>${ic("clock", "sm")} <b>${c.start}〜${c.end}</b></span><span>移動 <b>${c.km.toFixed(1)}km</b></span><span>合計 <b>${yen(c.total)}${c.unknownPrice ? "〜" : ""}</b>/人</span></div>
          <div class="cost-break sub">スポット代 ${yen(c.budget)}${c.unknownPrice ? "〜" : ""} ＋ 交通費 ${yen(c.transport)}${c.access ? `（${esc(activeBase()?.label || "出発地")}からの行き帰り込み）` : ""} ＝ <b>${yen(c.total)}${c.unknownPrice ? "〜" : ""}</b>/人</div>
        </div>
        ${c.moods?.length ? `<div class="tags" style="margin:6px 16px 0">${c.moods.map(({ id, full }) => `<span class="tag ${full ? "match" : ""}">${MOODS[id].emoji} ${esc(MOODS[id].label)}${full ? "にぴったり" : "も楽しめる"}</span>`).join("")}</div>` : ""}
        ${c.warnings.length ? `<div class="notice warn" style="margin:6px 16px 0">${c.warnings.map(esc).join("<br>")}</div>` : ""}
        <ul class="tl">${c.access ? legLi(c.access.go, `${esc(activeBase()?.label || "出発地")}から `) : ""}${c.stops.map((s) => `
          ${s.leg ? legLi(s.leg) : ""}
          <li><span class="time">${s.arrive}</span><div class="stop"><button data-open="${esc(s.spot.id)}">${genreOf(s.spot.genre).emoji} ${esc(nameOf(s.spot))}</button>
            <div class="sub">${s.stay ? `${s.stay}分ほど` : ""}${formatPrice(s.spot) ? ` ・ ${esc(formatPrice(s.spot))}` : ""}${isBoth(s.spot) ? ` ・ ♡${esc(matchText(s.spot))}` : ""}</div></div></li>`).join("")}${c.access ? legLi(c.access.back, `${esc(activeBase()?.label || "出発地")}へ `) : ""}
        </ul>
        <div class="actions">
          <a class="btn sm line" href="${courseRouteUrl(c.stops)}" target="_blank" rel="noopener">${ic("route", "sm")}地図でルート</a>
          <a class="btn sm line" href="${lineShareUrl(`${jpDate(c.date || S.plan.dateFrom)}の${V().plan}、これでどう？\n${c.stops.map((s) => `${s.arrive} ${nameOf(s.spot)}`).join("\n")}`)}" target="_blank" rel="noopener">${ic("send", "sm")}LINEで相談</a>
          <button class="btn sm rose" data-take="${i}">${jpDate(c.date || S.plan.dateFrom)}の予定にする</button>
        </div>
      </div>`).join("");
  }

  // ---------- 思い出 ----------
  function renderMemories(v) {
    const visited = S.spots.filter((i) => i.status === "visited").sort((a, b) => (b.visitedAt || "").localeCompare(a.visitedAt || ""));
    const prefCount = {};
    for (const it of visited) if (it.prefecture) prefCount[it.prefecture] = (prefCount[it.prefecture] || 0) + 1;
    const wantPref = new Set(S.spots.filter((i) => i.status !== "visited" && i.prefecture).map((i) => i.prefecture));
    // 総合の評価：場所ごとにメンバーの平均を出し、その平均をとる
    const avg = overallAvg(visited) || 0;
    const again = visited.filter(wantAgain).sort((a, b) => placeAvg(b) - placeAvg(a));
    const genreCount = GENRES.map((g) => [g, visited.filter((i) => i.genre === g.id).length]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]);
    const maxG = Math.max(1, ...genreCount.map(([, n]) => n));
    const months = new Map();
    for (const it of visited) { const k = it.visitedAt ? `${it.visitedAt.slice(0, 4)}年${Number(it.visitedAt.slice(5, 7))}月` : "日付なし"; if (!months.has(k)) months.set(k, []); months.get(k).push(it); }
    v.innerHTML = `
      <div class="section-h"><h2>${esc(V().us)}の足あと</h2></div>
      <div class="stats3"><div><b>${visited.length}</b><span>行った場所</span></div><div><b>${Object.keys(prefCount).length}<small style="font-size:13px">/47</small></b><span>都道府県</span></div><div><b>${avg ? avg.toFixed(1) : "–"}</b><span>みんなの平均の★</span></div></div>
      <div class="panel" style="margin-top:12px">
        <div class="japan" role="img" aria-label="行った都道府県の地図">
          ${PREF_TILES.map(([p, c, r]) => { const n = prefCount[p] || 0; return `<div class="pref ${n >= 3 ? "v3" : n === 2 ? "v2" : n === 1 ? "v1" : wantPref.has(p) ? "want" : ""}" style="grid-column:${c + 1};grid-row:${r + 1}" title="${p}${n ? ` ${n}か所` : ""}">${prefShort(p).slice(0, 2)}</div>`; }).join("")}
        </div>
        <div class="legend"><span><i style="background:color-mix(in srgb, var(--ok) 35%, var(--surface))"></i>1か所</span><span><i style="background:var(--ok)"></i>3か所〜</span><span><i style="box-shadow:inset 0 0 0 1.5px var(--rose)"></i>行きたい場所あり</span></div>
      </div>
      ${genreCount.length ? `<div class="section-h"><h2>どんなおでかけが多い？</h2></div><div class="panel bars">${genreCount.map(([g, n]) => `<div class="bar-row"><span>${g.emoji} ${g.label}</span><div class="bar-track"><div class="bar-fill" style="width:${(n / maxG) * 100}%"></div></div><span class="num">${n}</span></div>`).join("")}</div>` : ""}
      ${again.length ? `<div class="section-h"><h2>🔁 また行きたい</h2><span class="sub">みんなの平均★${AGAIN_MIN}以上</span></div>
        <div class="rail">${again.map((it) => `<button class="mini" data-open="${esc(it.id)}"><span ${cover(it, "ph")}>${thumb(it)}</span><span class="tx"><b>${esc(nameOf(it))}</b><span class="stars-ro">★${placeAvg(it).toFixed(1)}</span><span class="sub">${Object.keys(ratingsOf(it)).length}人が評価</span></span></button>`).join("")}</div>` : ""}
      <div class="section-h"><h2>思い出</h2></div>
      ${visited.length ? [...months].map(([m, list]) => `<h3 class="group-h">${m}</h3><div class="panel" style="padding:4px 14px">${list.map((it) => `
        <div class="memory" data-open="${esc(it.id)}"><span ${cover(it, "ph")}>${thumb(it)}</span>
          <div style="min-width:0"><b>${esc(nameOf(it))}</b> ${placeAvg(it) != null ? `<span class="stars-ro">★${placeAvg(it).toFixed(1)}</span>` : ""}${wantAgain(it) ? ` <span class="tag again">🔁</span>` : ""}
          <div class="sub">${it.visitedAt ? jpDate(it.visitedAt) : ""}${it.city ? ` ・ ${esc(it.city)}` : ""}</div>
          ${Object.keys(ratingsOf(it)).length ? `<div class="mem-rates">${Object.entries(ratingsOf(it)).map(([id, n]) => `<span>${av(id, "xs")}${"★".repeat(n)}</span>`).join("")}</div>` : ""}
          ${Object.entries(reviewsOf(it)).slice(0, 2).map(([id, t]) => `<div style="font-size:13.5px;margin-top:2px"><b>${esc(pname(id))}</b>「${esc(t)}」</div>`).join("")}</div></div>`).join("")}</div>`).join("")
        : `<div class="empty"><p>行った場所は、★と感想つきでここに残ります。「どこいく？」が「あそこ良かったね」に変わる場所です。</p></div>`}`;
  }

  // ---------- 投票・書き込み ----------
  async function vote(id, value, { silent = false, reason = null } = {}) {
    const it = S.spots.find((s) => s.id === id);
    if (!it || !me()) return toast("この端末でどちらが使っているかを設定してください");
    it.likes = { ...(it.likes || {}), [me()]: value };
    it.reasons = { ...(it.reasons || {}), [me()]: value === "no" ? reason : null };
    render();
    refreshDetail(id);
    await act(() => B.vote(id, value, reason));
    if (!silent && value === true && isBoth(it)) toast(`${matchPhrase()}場所になりました`);
  }
  const patch = (id, body, ok) => act(() => B.updateSpot(id, body), ok);

  // ---------- シート ----------
  function sheet(html, { onClose } = {}) {
    const instant = $modal.firstElementChild ? " instant" : "";
    const prev = $modal.querySelector(".sheet")?.scrollTop || 0;
    $modal.innerHTML = `<div class="overlay${instant}"><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div></div>`;
    const root = $modal.querySelector(".sheet");
    if (instant) root.scrollTop = prev;
    const close = () => { $modal.innerHTML = ""; onClose?.(); };
    $modal.firstElementChild.addEventListener("click", (e) => { if (e.target === $modal.firstElementChild || e.target.closest("[data-close]")) close(); });
    return { root, close };
  }
  const head = (title) => `<div class="sheet-h"><h2>${title}</h2><button class="x" data-close aria-label="閉じる">${ic("x", "sm")}</button></div>`;
  function refreshDetail(id) {
    const open = $modal.querySelector("[data-detail]");
    if (!open || (id && open.dataset.detail !== id)) return;
    const a = document.activeElement;
    const typing = open.contains(a) && a.matches("textarea, input:not([type=date])") && a.value;
    if (!typing) openDetail(open.dataset.detail);
  }

  // ---------- 追加・編集 ----------
  // 追加のメインは「思いつくまま書く → AIが整理」。リンクの読み取りはサブ
  function openAdd(raw = "", { link = false } = {}) {
    const text = String(raw || "").trim();
    const url = (text.match(/https?:\/\/[^\s<>"'「」]+/) || [""])[0];
    if (url) return readAndEdit({ url, text: text.replace(url, "").trim() });
    if (text) return openEditor({ genre: "other", caption: text }, { isNew: true, runBulk: true, autoAI: F.aiRead });
    if (link) return openLinkAdd();
    const { root } = sheet(`${head("行きたい場所を追加")}
      <div class="field"><label for="a-memo">どんな場所？ 思いつくまま書いてください</label>
        <textarea id="a-memo" rows="4" placeholder="例）&#10;表参道のパンケーキのカフェ、1500円くらい&#10;10月末までの限定メニューあり"></textarea></div>
      <button class="btn rose block" data-go>${ic("sparkle", "sm")}${F.aiRead ? "AIで整理して追加" : "読み取って追加"}</button>
      <p class="sub">${F.aiRead ? "店名・場所・ジャンル・値段・営業時間・期限をAIが読み取って、項目に入れます。" : "店名・住所・駅・値段・営業時間・期限を見分けて、項目に入れます。"}あいまいでも大丈夫です。</p>
      <div class="label">ほかの方法</div>
      <div class="actions" style="margin-top:0">
        <button class="btn line" data-link>${ic("insta", "sm")}SNSのリンクから</button>
        ${F.aiImage ? `<label class="btn line" for="a-shot">${ic("image", "sm")}スクショから<input id="a-shot" type="file" accept="image/*" hidden></label>` : ""}
        <button class="btn line" data-manual>${ic("edit", "sm")}自分で入力</button>
      </div>`);
    const go = () => { const v = root.querySelector("#a-memo").value.trim(); if (!v) return toast("行きたい場所を書いてください"); openAdd(v); };
    root.querySelector("[data-go]").onclick = go;
    root.querySelector("#a-memo").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) go(); });
    root.querySelector("[data-link]").onclick = openLinkAdd;
    root.querySelector("#a-shot")?.addEventListener("change", (e) => { const f = e.target.files?.[0]; if (f) readAndEdit({ image: f, ai: true }); });
    root.querySelector("[data-manual]").onclick = () => openEditor({ genre: "other" }, { isNew: true, manual: true });
    setTimeout(() => root.querySelector("#a-memo")?.focus(), 60);
  }

  function openLinkAdd() {
    const { root } = sheet(`${head("リンクから追加")}
      <div class="field"><label for="a-url">SNSの投稿・お店のページのリンク</label><input id="a-url" type="text" inputmode="url" placeholder="https://www.instagram.com/p/…" autocomplete="off"></div>
      <div class="actions" style="margin-top:0">
        ${F.clipboardRead ? `<button class="btn line" data-paste>${ic("clip", "sm")}コピーしたリンクを貼る</button>` : ""}
        <button class="btn rose" data-go>読み取る</button>
      </div>
      <p class="sub">Instagram・TikTok・X・YouTube・食べログ・Googleマップの共有リンクに対応しています。読み取れないときは、投稿の本文を貼ってください。</p>`);
    const go = () => { const v = root.querySelector("#a-url").value.trim(); if (!v) return toast("リンクを貼り付けてください"); openAdd(v); };
    root.querySelector("[data-go]").onclick = go;
    root.querySelector("#a-url").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    root.querySelector("[data-paste]")?.addEventListener("click", async () => {
      try { const t = await navigator.clipboard.readText(); root.querySelector("#a-url").value = t; if (/https?:\/\//.test(t)) openAdd(t); }
      catch { toast("貼り付けできませんでした。欄を長押しして貼り付けてください"); }
    });
    setTimeout(() => root.querySelector("#a-url")?.focus(), 60);
  }

  async function readAndEdit({ url = "", text = "", image = null, ai = false }) {
    const dup = url && S.spots.find((s) => s.url && sameUrl(s.url, url));
    const { root } = sheet(`${head("読み取り中")}<div class="empty"><span class="thinking"><span class="spinner"></span>${image ? "スクリーンショットを読んでいます" : "投稿からジャンル・場所・値段を読み取っています"}</span></div>`);
    let draft;
    try { draft = await B.readPost({ url, text, image, ai }); }
    catch (e) { draft = { url, caption: text, genre: "other", error: e?.message }; }
    if (!document.body.contains(root)) return;
    openEditor(draft, { isNew: true, dup });
  }

  function editorFields(d) {
    return `
      <div class="field"><label for="f-placeName">スポット名・店名</label><input id="f-placeName" name="placeName" value="${esc(d.placeName)}" placeholder="例: Cafe Lumière 表参道"></div>
      <div class="row2">
        <div class="field"><label for="f-genre">ジャンル</label><select id="f-genre" name="genre">${GENRES.map((g) => `<option value="${g.id}" ${d.genre === g.id ? "selected" : ""}>${g.emoji} ${g.label}</option>`).join("")}</select></div>
        <div class="field"><label for="f-station">最寄り駅</label><input id="f-station" name="station" value="${esc(d.station)}" placeholder="例: 表参道駅"></div>
      </div>
      <div class="field"><label for="f-address">住所</label><input id="f-address" name="address" value="${esc(d.address)}" placeholder="例: 東京都渋谷区神宮前4-12-10"></div>
      <div class="row2">
        <div class="field"><label for="f-prefecture">都道府県</label><input id="f-prefecture" name="prefecture" value="${esc(d.prefecture)}"></div>
        <div class="field"><label for="f-city">市区町村・番地</label><input id="f-city" name="city" value="${esc(d.city)}"></div>
      </div>
      <div class="field"><label for="f-coords">位置（移動時間・地図・プラン作りに使います）</label>
        <div style="display:flex;gap:6px"><input id="f-coords" name="coords" value="${d.lat != null ? `${Number(d.lat).toFixed(5)}, ${Number(d.lng).toFixed(5)}` : ""}" placeholder="GoogleマップのURLか「35.6672, 139.7087」"><button type="button" class="btn sm line" data-locate>探す</button></div>
        <span class="sub" data-locate-status>${d.lat != null ? (d.geoNote ? esc(d.geoNote) : "位置が入っています") : "住所や店名から「探す」で位置を入れられます"}</span></div>
      <div class="row2">
        <div class="field"><label for="f-priceMin">値段・下限（円）</label><input id="f-priceMin" name="priceMin" type="number" min="0" inputmode="numeric" value="${d.priceMin ?? ""}"></div>
        <div class="field"><label for="f-priceMax">値段・上限（円）</label><input id="f-priceMax" name="priceMax" type="number" min="0" inputmode="numeric" value="${d.priceMax ?? ""}"></div>
      </div>
      <div class="row2">
        <div class="field"><label for="f-hours">営業時間・開催期間</label><input id="f-hours" name="hours" value="${esc(d.hours)}" placeholder="例: 11:00〜20:00"></div>
        <div class="field"><label for="f-closed">定休日</label><input id="f-closed" name="closed" value="${esc(d.closed)}" placeholder="例: 火曜"></div>
      </div>
      <div class="field"><label for="f-deadline">期間限定なら、いつごろまで？</label><input id="f-deadline" name="deadline" type="date" value="${esc(d.deadline || "")}"></div>
      <div class="field"><label for="f-memo">メモ</label><textarea id="f-memo" name="memo" placeholder="例: 記念日に行きたい / 予約必須">${esc(d.memo || "")}</textarea></div>`;
  }
  function readForm(root, d) {
    const f = Object.fromEntries(new FormData(root.querySelector("form")));
    const c = coordsFrom(f.coords);
    const num = (v) => (v === "" || v == null ? null : Number(v));
    const out = { ...d, ...f, priceMin: num(f.priceMin), priceMax: num(f.priceMax) ?? num(f.priceMin), lat: c ? c.lat : null, lng: c ? c.lng : null };
    delete out.coords;
    return out;
  }

  function openEditor(draft, { isNew = false, dup = null, id = null, runBulk = false, autoAI = false, manual = false } = {}) {
    let d = { genre: "other", ...draft };
    const readOk = d.placeName || d.address || d.priceMin != null || (d.genre && d.genre !== "other");
    const { root, close } = sheet(`
      ${head(isNew ? "行きたい場所を追加" : "スポットを編集")}
      ${dup ? `<div class="notice warn">この投稿は${esc(pname(dup.addedBy))}が${relativeDate(dup.createdAt)}に登録しています。<a href="#" data-dup>登録済みのスポットを開く</a></div>` : ""}
      ${d.error ? `<div class="notice warn">${esc(d.error)}</div>` : ""}

      ${d.url ? `<p class="sub" style="margin:0 0 10px"><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(platformLabel(d.platform))}の元の投稿を開く</a></p>` : ""}
      ${isNew && d.url ? `<div class="notice ${readOk ? "ok" : ""}">${readOk ? `${ic("sparkle", "sm")} 投稿を読み取りました${d.aiUsed ? "（AI）" : ""}。違うところは直してから追加してください。` : "この投稿は自動では読み取れませんでした。投稿の本文を下の欄に貼ると読み取れます。"}</div>` : ""}
      ${isNew || !id ? "" : "<details class=\"bulk-wrap\"><summary class=\"sub\" style=\"cursor:pointer;margin-bottom:8px\">まとめて追記する</summary>"}
      <div class="bulk">
        <label for="f-caption"><b>${isNew && !d.url ? "どんな場所？" : "本文・メモから読み取る"}</b><span class="sub">${isNew && !d.url ? "思いつくまま書くと、下の項目に自動で入ります" : "投稿の本文などを貼ると、空いている項目に自動で入ります"}</span></label>
        <textarea id="f-caption" rows="${isNew && !d.url ? 5 : 3}" placeholder="例）&#10;カフェ ルミエール&#10;渋谷区神宮前4-12-10 表参道駅 徒歩5分&#10;1,500円くらい 11時〜20時 火曜休み&#10;10/31までの限定パフェ">${esc(isNew ? d.caption || "" : "")}</textarea>
        <div class="bulk-foot"><span class="sub" id="bulk-status">${isNew && !d.url ? "店名・住所・駅・値段・営業時間・定休日・期限・リンク・メモを見分けます" : ""}</span>
          <span class="bulk-btns">${F.aiButton || (F.askAI && F.aiImage) ? `<button type="button" class="btn sm line" data-ai>${ic("sparkle", "sm")}AIで整理</button>` : ""}${F.aiImage ? `<label class="btn sm line" for="f-shot">${ic("image", "sm")}スクショ<input id="f-shot" type="file" accept="image/*" hidden></label>` : ""}</span></div>
        <div id="ai-picks" aria-live="polite"></div>
      </div>
      ${isNew || !id ? "" : "</details>"}
      <div class="photo-pick"><div class="ph" data-photo-prev>${thumb(d)}</div>
        <div><b>サムネイル</b><span class="sub">写真がなければ、ジャンルに合ったイラストになります</span>
          <div class="actions" style="margin-top:6px"><label class="btn sm line" for="f-photo">${ic("image", "sm")}写真を選ぶ<input id="f-photo" type="file" accept="image/*" hidden></label><button type="button" class="btn sm line" data-photo-clear ${d.photo ? "" : "hidden"}>外す</button></div></div></div>
      <form>${editorFields(d)}</form>
      <div class="actions"><button class="btn line" data-close>キャンセル</button><button class="btn rose" data-save>${isNew ? "リストに追加" : "保存"}</button></div>`);

    root.querySelector("[data-dup]")?.addEventListener("click", (e) => { e.preventDefault(); openDetail(dup.id); });
    // サムネイルの写真：小さく縮めて保存する。ジャンルや店名が変わったらイラストも変える
    const drawThumb = () => { const cur = readForm(root, d); root.querySelector("[data-photo-prev]").innerHTML = thumb({ ...d, ...cur, photo: d.photo }); root.querySelector("[data-photo-clear]").hidden = !d.photo; };
    root.querySelector("#f-photo").addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try { d.photo = await shrinkImage(f); drawThumb(); } catch { toast("この写真は使えませんでした"); }
    });
    root.querySelector("[data-photo-clear]").addEventListener("click", () => { d.photo = ""; drawThumb(); });
    root.querySelector("form").addEventListener("change", (e) => { if (["genre", "placeName"].includes(e.target.name)) drawThumb(); });
    // まとめて入力：書いた内容を読み取り、空いている項目（と自動で入れた項目）だけを埋める。自分で直した項目は上書きしない
    const LABEL = { placeName: "店名", genre: "ジャンル", address: "住所", prefecture: "都道府県", city: "市区町村", station: "駅", priceMin: "値段", priceMax: "値段", hours: "営業時間", closed: "定休日", deadline: "期限", memo: "メモ", coords: "位置" };
    const auto = new Set();
    const touched = new Set();
    const field = (k) => root.querySelector(`form [name="${k}"]`);
    root.querySelector("form").addEventListener("input", (e) => { if (e.target.name) { touched.add(e.target.name); auto.delete(e.target.name); } });
    const fillFrom = (res, { overwriteAuto = true } = {}) => {
      const vals = { ...res };
      if (res.lat != null && Number.isFinite(Number(res.lat))) vals.coords = `${Number(res.lat).toFixed(5)}, ${Number(res.lng).toFixed(5)}`;
      for (const k of Object.keys(LABEL)) {
        const el = field(k);
        if (!el || touched.has(k)) continue;
        const v = vals[k];
        const empty = v == null || v === "" || (k === "genre" && v === "other");
        if (el.value && el.value !== "other" && !auto.has(k)) continue;
        if (empty) { if (auto.has(k) && overwriteAuto) { el.value = k === "genre" ? "other" : ""; auto.delete(k); } continue; }
        if (el.value !== String(v)) { el.value = String(v); el.classList.remove("autofilled"); void el.offsetWidth; el.classList.add("autofilled"); }
        auto.add(k);
      }
      if (res.url && !d.url) { d.url = res.url; d.platform = res.platform; }
      if (res.tags?.length) d.tags = [...new Set([...(d.tags || []), ...res.tags])];
      if (res.walkMin != null) d.walkMin = res.walkMin;
      if (res.summary && !d.summary) d.summary = res.summary;
      if (res.aiUsed) d.aiUsed = true;
      const names = [...new Set([...auto].map((k) => LABEL[k]))];
      root.querySelector("#bulk-status").innerHTML = names.length ? `${ic("sparkle", "sm")} 自動で入れました：${names.map((n) => `<span class="tag">${n}</span>`).join("")}` : "まだ読み取れる情報がありません";
    };
    let bulkTimer;
    root.querySelector("#f-caption")?.addEventListener("input", (e) => {
      clearTimeout(bulkTimer);
      bulkTimer = setTimeout(() => fillFrom({ ...parseFreeform(e.target.value), ...(coordsFrom(e.target.value) || {}) }), 250);
    });
    root.querySelector("#f-caption")?.addEventListener("paste", () => setTimeout(() => root.querySelector("#f-caption").dispatchEvent(new Event("input")), 0));
    // ---------- AIの候補（あいまいなメモ・チェーン店） ----------
    const picks = root.querySelector("#ai-picks");
    const PREF_RE = /^(北海道|東京都|(?:京都|大阪)府|.{2,3}県)/;
    const fromCand = (c) => {
      const area = String(c.area || ""), addr = String(c.address || "");
      const pref = (addr.match(PREF_RE) || area.match(PREF_RE) || [""])[0];
      const city = (addr || area).replace(PREF_RE, "");
      return { placeName: c.branch ? `${c.name} ${c.branch}` : c.name, genre: c.genre, address: addr || area, prefecture: pref, city, station: c.station || "", priceMin: c.priceMin ?? null, priceMax: c.priceMax ?? c.priceMin ?? null, hours: c.hours || "", closed: c.closed || "", lat: c.lat ?? null, lng: c.lng ?? null, summary: c.summary || "", aiUsed: true };
    };
    const nearHint = () => { const b = activeBase(); return b ? `${b.label}（${b.address || `${b.lat?.toFixed?.(3)}, ${b.lng?.toFixed?.(3)}`}）` : ""; };
    const choose = (c, btn) => {
      // 候補を選んだら、自動で入れた項目は候補の内容に置きかえる（自分で直した項目はそのまま）
      const keep = parseFreeform(root.querySelector("#f-caption").value || "");
      fillFrom({ memo: keep.memo, deadline: keep.deadline, ...fromCand(c) }, { overwriteAuto: true });
      if (c.lat != null && c.lng != null) d.geoNote = "AIが推定した位置です";
      picks.querySelectorAll(".cand").forEach((x) => x.classList.toggle("on", x === btn));
      root.querySelector("#bulk-status").innerHTML = `${ic("sparkle", "sm")} 「${esc(fromCand(c).placeName)}」の情報を入れました。違うところは直してください`;
      setTimeout(() => root.querySelector("form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    };
    const drawCands = (res, text, area) => {
      const list = res.candidates || [];
      const chain = res.kind === "chain";
      const title = chain ? `「${esc(list[0]?.name || text)}」の店舗${area ? `（${esc(area)}）` : ""}` : `「${esc(text.slice(0, 24))}」に合いそうな場所`;
      picks.innerHTML = `<div class="cands-h"><b>${title}</b><span class="sub">タップすると下の項目に入ります</span></div>
        <div class="cands">${list.map((c, i) => `<button type="button" class="cand" data-cand="${i}">
          <span class="cand-art">${spotArt({ id: `${c.name}${c.branch}`, genre: c.genre, placeName: c.name, summary: c.summary })}</span>
          <span class="cand-tx"><b>${esc(c.name)}${c.branch ? ` <span class="branch">${esc(c.branch)}</span>` : ""}</b>
            <span class="sub">${esc([c.area, c.station].filter(Boolean).join(" ・ "))}${c.priceMin != null ? ` ・ ¥${Number(c.priceMin).toLocaleString("ja-JP")}〜` : ""}</span>
            ${c.reason || c.summary ? `<span class="cand-why">${esc(c.reason || c.summary)}</span>` : ""}</span></button>`).join("")}</div>
        ${chain ? areaAsk("別のエリアの店舗を探す", area) : `<p class="sub" style="margin:6px 0 0">AIの知識からの候補です。営業状況は地図アプリなどで確かめてください。</p>`}`;
      picks.querySelectorAll("[data-cand]").forEach((b) => b.addEventListener("click", () => choose(list[Number(b.dataset.cand)], b)));
      bindAreaAsk(text);
    };
    // チェーン店で場所がわからないとき：どのあたりかを聞く
    const areaAsk = (label, value = "") => {
      const bases = (S.settings.bases || []).map((b) => b.address || b.label).filter(Boolean).slice(0, 3);
      return `<div class="area-ask">${label ? `<label for="ai-area">${esc(label)}</label>` : ""}
        <div style="display:flex;gap:6px"><input id="ai-area" value="${esc(value)}" placeholder="例: 名古屋市 / 栄駅 / 大阪府" autocomplete="off" aria-label="店舗を探すエリア"><button type="button" class="btn sm rose" data-area-go>探す</button></div>
        ${bases.length ? `<div class="chips wrap-chips" style="margin-top:6px">${bases.map((b) => `<button type="button" class="chip" data-area-chip="${esc(b)}">${ic("home", "sm")}${esc(b)}</button>`).join("")}</div>` : ""}</div>`;
    };
    const bindAreaAsk = (text) => {
      const go = () => { const v = picks.querySelector("#ai-area")?.value.trim(); if (!v) return toast("都道府県・市・駅などを入れてください"); smartAI(text, v); };
      picks.querySelector("[data-area-go]")?.addEventListener("click", go);
      picks.querySelector("#ai-area")?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go(); } });
      picks.querySelectorAll("[data-area-chip]").forEach((c) => c.addEventListener("click", () => { picks.querySelector("#ai-area").value = c.dataset.areaChip; go(); }));
    };
    // 書いたメモがあいまい（「名古屋のカフェ」）か、チェーン店（「スタバ」）かをAIに判定してもらい、候補を出す
    const smartAI = async (text, area = "") => {
      const status = root.querySelector("#bulk-status");
      root.querySelectorAll("[data-ai]").forEach((b) => (b.disabled = true));
      status.innerHTML = `<span class="thinking"><span class="spinner"></span>${area ? `「${esc(area)}」の店舗を探しています` : "AIが候補を探しています（10〜30秒ほど）"}</span>`;
      picks.innerHTML = "";
      try {
        const res = await B.suggestPlaces({ text, area, near: nearHint() });
        const list = res?.candidates || [];
        if (res?.needArea && !list.length) {
          status.textContent = "";
          picks.innerHTML = `<div class="cands-h"><b>${ic("pin", "sm")} 店舗がたくさんあるお店です</b><span class="sub">${esc(res.question || "どのあたりの店舗ですか？（都道府県・市・駅など）")}</span></div>${areaAsk("")}`;
          bindAreaAsk(text);
          setTimeout(() => picks.querySelector("#ai-area")?.focus(), 60);
          return;
        }
        if (res?.kind === "specific" && list.length === 1) { choose(list[0], null); return; }
        if (!list.length) {
          status.textContent = area ? "その近くの店舗が見つかりませんでした。別の書き方で試してください" : "候補が見つかりませんでした。書いた内容から読み取ります";
          if (!area) await extractAI(null);
          if (area) { picks.innerHTML = areaAsk("別のエリアで探す", area); bindAreaAsk(text); }
          return;
        }
        status.innerHTML = `${ic("sparkle", "sm")} 候補が${list.length}件見つかりました`;
        drawCands(res, text, area);
      } catch (e) { status.textContent = e?.message || "候補を探せませんでした"; }
      finally { root.querySelectorAll("[data-ai]").forEach((b) => (b.disabled = false)); }
    };
    const runAI = async (image) => {
      const caption = root.querySelector("#f-caption").value;
      if (!caption.trim() && !image && !d.url) return toast("上の欄に書くか、スクショを選んでください");
      // リンクもスクショもない、書いただけのメモは候補を出す
      if (F.suggest && B.suggestPlaces && !image && !d.url) return smartAI(caption.trim());
      return extractAI(image);
    };
    const extractAI = async (image) => {
      const status = root.querySelector("#bulk-status");
      const caption = root.querySelector("#f-caption").value;
      root.querySelectorAll("[data-ai]").forEach((b) => (b.disabled = true));
      status.innerHTML = `<span class="thinking"><span class="spinner"></span>AIが場所を調べて整理しています（10〜30秒ほど）</span>`;
      try {
        const res = await B.readPost({ url: d.url, text: caption, image, ai: true });
        fillFrom(res, { overwriteAuto: false });
      } catch (e) { status.textContent = e?.message || "読み取れませんでした"; }
      finally { root.querySelectorAll("[data-ai]").forEach((b) => (b.disabled = false)); }
    };
    root.querySelector("[data-ai]")?.addEventListener("click", () => runAI(null));
    root.querySelector("#f-shot")?.addEventListener("change", (e) => { const f = e.target.files?.[0]; if (f) runAI(f); });
    if (runBulk) {
      fillFrom({ ...parseFreeform(d.caption || ""), ...(coordsFrom(d.caption) || {}) });
      if (autoAI) runAI(null);
    } else if (manual) setTimeout(() => root.querySelector("#f-placeName")?.focus(), 80);
    else if (isNew && !d.url) setTimeout(() => root.querySelector("#f-caption")?.focus(), 80);
    root.addEventListener("click", async (e) => {
      if (!e.target.closest("[data-locate]")) return;
      const cur = readForm(root, d);
      const st = root.querySelector("[data-locate-status]");
      const queries = [cur.address, cur.placeName && `${cur.placeName} ${cur.prefecture || ""}${cur.city || ""}`.trim(), cur.station, `${cur.prefecture || ""}${cur.city || ""}`].filter((q) => q && q.trim().length > 1);
      if (!queries.length) return (st.textContent = "住所・店名・駅名のどれかを入れてください");
      st.innerHTML = `<span class="thinking"><span class="spinner"></span>位置を探しています</span>`;
      for (const q of queries) {
        const r = await B.locate(q).catch(() => null);
        if (r) { field("coords").value = `${Number(r.lat).toFixed(5)}, ${Number(r.lng).toFixed(5)}`; touched.add("coords"); st.textContent = `「${q}」の位置${r.estimated ? "（AIの推定）" : ""}を入れました`; return; }
      }
      st.textContent = "見つかりませんでした。Googleマップでその場所を開き、URLを貼ってください";
    });
    root.querySelector("[data-save]").addEventListener("click", async (e) => {
      const data = readForm(root, d);
      const bulk = root.querySelector("#f-caption")?.value || "";
      if (isNew) data.caption = bulk;
      else if (bulk.trim()) data.caption = [d.caption, bulk].filter(Boolean).join("\n");
      if (!data.placeName && !data.url) return toast("スポット名かリンクを入れてください");
      e.target.disabled = true;
      const body = {};
      for (const k of ["url", "platform", "title", "caption", "image", "photo", "author", "genre", "placeName", "address", "prefecture", "city", "station", "walkMin", "priceMin", "priceMax", "priceNote", "hours", "closed", "deadline", "tags", "summary", "memo", "lat", "lng"]) if (data[k] !== undefined) body[k] = data[k];
      if (isNew) {
        const created = await act(() => B.addSpot(body));
        if (created) { close(); toast("メモしました。次の「どこいく？」はこれで決まりかも"); }
        else e.target.disabled = false;
      } else if (await patch(id, body, "保存しました")) openDetail(id);
      else e.target.disabled = false;
    });
  }

  // ---------- 移動手段（詳細画面） ----------
  function travelHtml(it, base) {
    if (!base) return `<button class="btn sm line" data-act="bases">出発地を登録して移動時間を出す</button>`;
    if (it.lat == null) return `<span class="sub">位置が未設定なので計算できません。「編集」で位置を入れると出ます。</span>`;
    const { km, modes } = travelModes(base, it, { fromName: base.label, toName: nameOf(it), toStation: it.station, walkMin: it.walkMin });
    const row = (m) => {
      const open = S.openMode === `${it.id}:${m.id}`;
      const key = `${it.id}:${base.id}:${m.id}`;
      const ai = S.routeCache?.[key];
      const toName = it.station || it.placeName || it.address;
      const fromName = base.address && !/^https?:/.test(base.address) ? base.address : /駅$/.test(base.label) ? base.label : "現在地";
      return `<div class="mode ${open ? "open" : ""}">
        <button class="mode-row" data-mode="${m.id}" aria-expanded="${open}">${ic(m.icon, "sm")}<span class="mode-name">${m.label}${m.recommended ? ` <span class="tag open">おすすめ</span>` : ""}</span>
          <b class="num">${formatMinutes(m.min)}</b><span class="mode-fare num">${m.fare ? `¥${m.fare.toLocaleString("ja-JP")}〜` : "無料"}</span>${ic("chev", "sm")}</button>
        ${open ? `<div class="mode-detail">
          <ol class="steps-list">${m.steps.map((x) => `<li>${ic(x.icon, "sm")}<span>${esc(x.text)}</span><span class="num">約${formatMinutes(x.min)}</span></li>`).join("")}</ol>
          ${m.note ? `<p class="sub" style="margin:4px 0 0">${esc(m.note)}</p>` : ""}
          ${ai ? `<div class="ai-route"><b>${ic("sparkle", "sm")}AIが調べた具体的な行き方</b>${ai.error ? `<p class="sub">${esc(ai.error)}</p>` : ai.loading ? `<span class="thinking"><span class="spinner"></span>調べています…</span>` : `
            <ol class="steps-list">${(ai.steps || []).map((x) => `<li>${ic(({ walk: "walk", train: "train", subway: "train", shinkansen: "shinkansen", bus: "bus", highway_bus: "bus", plane: "plane", car: "car", taxi: "taxi" })[x.type] || "route", "sm")}<span>${esc(x.text)}</span><span class="num">${x.minutes ? `約${formatMinutes(Math.round(x.minutes))}` : ""}</span></li>`).join("")}</ol>
            <p class="sub" style="margin:4px 0 0">${ai.totalMinutes ? `合計 約${formatMinutes(Math.round(ai.totalMinutes))}` : ""}${ai.fareYen ? ` ・ 約¥${Math.round(ai.fareYen).toLocaleString("ja-JP")}` : ""}${ai.note ? `<br>${esc(ai.note)}` : ""}<br>AIの推定です。時刻・運賃は乗換案内で確かめてください。</p>`}</div>` : ""}
          <div class="actions" style="margin-top:8px">
            <a class="btn sm line" href="${esc(routeUrl(it, base, m.maps))}" target="_blank" rel="noopener">${ic("map", "sm")}Googleマップで経路</a>
            ${["train", "shinkansen", "bus", "highwayBus"].includes(m.id) && toName && fromName !== "現在地" ? `<a class="btn sm line" href="${esc(yahooTransitUrl(fromName, toName))}" target="_blank" rel="noopener">${ic("train", "sm")}乗換案内</a>` : ""}
            ${F.routeAI && m.id !== "walk" && m.id !== "bicycle" && !ai?.steps ? `<button class="btn sm rose" data-route-ai="${m.id}">${ic("sparkle", "sm")}AIに具体的なルートを聞く</button>` : ""}
          </div></div>` : ""}
      </div>`;
    };
    const pub = modes.filter((m) => m.transit), own = modes.filter((m) => !m.transit);
    return `<span class="sub">${esc(base.label)}から（直線${km.toFixed(1)}km・すべて目安）</span>
      ${pub.length ? `<div class="mode-group"><span class="mode-h">公共交通機関</span>${pub.map(row).join("")}</div>` : ""}
      <div class="mode-group"><span class="mode-h">車・徒歩など</span>${own.map(row).join("")}</div>
      <p class="sub" style="margin:6px 0 0">手段をタップすると、具体的な行き方が出ます。</p>`;
  }

  async function askRoute(it, modeId) {
    const base = activeBase();
    const key = `${it.id}:${base.id}:${modeId}`;
    S.routeCache = S.routeCache || {};
    S.routeCache[key] = { loading: true };
    openDetail(it.id);
    try {
      const r = await B.route({
        from: { label: base.label, address: base.address || "", lat: base.lat, lng: base.lng },
        to: { name: nameOf(it), address: it.address || [it.prefecture, it.city].filter(Boolean).join(""), station: it.station || "", lat: it.lat, lng: it.lng },
        mode: { train: "電車・地下鉄", bus: "路線バス", shinkansen: "新幹線", highwayBus: "高速バス", plane: "飛行機", car: "車", taxi: "タクシー" }[modeId] || modeId,
      });
      S.routeCache[key] = r && r.steps?.length ? r : { error: r?.note || "うまく調べられませんでした" };
    } catch (e) {
      S.routeCache[key] = { error: e?.message || "うまく調べられませんでした" };
    }
    if ($modal.querySelector(`[data-detail="${it.id}"]`)) openDetail(it.id);
  }

  // ---------- 行きたい度（詳細画面） ----------
  function eagerBlock(it) {
    const e = eagerOf(it), avg = eagerAvg(it), mine = e[me()] || 0;
    const ids = [...new Set([...peopleList().map((p) => p.id), ...Object.keys(e)])].filter((id) => id !== me());
    return `<div class="label">行きたい度 ${avg != null ? `<span class="eager-avg">🔥 ${avg.toFixed(1)}</span><span class="sub" style="letter-spacing:0"> ${Object.keys(e).length}人の平均</span>` : ""}</div>
      <div class="eager-box">
        ${me() ? `<div class="eager-pick" role="radiogroup" aria-label="あなたの行きたい度">${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" aria-checked="${mine === n}" data-eager="${n}" class="${mine >= n ? "on" : ""}"><span>${"🔥".repeat(1)}</span><small>${n}</small></button>`).join("")}</div>
          <div class="sub eager-label">${mine ? `あなた：<b>${esc(EAGER_LABELS[mine])}</b>（✓ 保存済み・もう一度押すと取り消し）` : "押すと保存されます（1：いつか 〜 5：今すぐ行きたい！）"}</div>` : ""}
        ${ids.length ? `<div class="eager-others">${ids.map((id) => `<span class="chip">${av(id, "xs")}${esc(pname(id))}<small>${e[id] ? `🔥${e[id]} ${esc(EAGER_LABELS[e[id]])}` : "まだ"}</small></span>`).join("")}</div>` : ""}
      </div>`;
  }

  // ---------- みんなの評価（詳細画面） ----------
  const starsRo = (n) => `<span class="stars-ro">${"★".repeat(Math.round(n))}<span class="off">${"★".repeat(5 - Math.round(n))}</span></span>`;
  function reviewBlock(it) {
    const r = ratingsOf(it), rv = reviewsOf(it);
    const avg = placeAvg(it);
    const ids = [...new Set([...peopleList().map((p) => p.id), ...Object.keys(r), ...Object.keys(rv)])].filter((id) => id !== me());
    return `<div class="reviews">
      <div class="reviews-h"><b>みんなの評価</b>${avg != null ? `<span class="avg-big">★${avg.toFixed(1)}</span><span class="sub">${Object.keys(r).length}人の平均</span>` : `<span class="sub">まだ評価がありません</span>`}${wantAgain(it) ? `<span class="tag again">🔁 また行きたい</span>` : ""}</div>
      ${me() ? `<div class="review-row mine">${av(me())}<div class="val"><b>あなた</b>
          <div class="stars" data-my-stars="${r[me()] || 0}">${[1, 2, 3, 4, 5].map((n) => `<button data-rate="${n}" class="${(r[me()] || 0) >= n ? "on" : ""}" aria-label="${n}つ星">★</button>`).join("")}</div>
          <textarea id="d-myreview" rows="2" placeholder="感想・思い出（みんなに見えます）">${esc(rv[me()] || "")}</textarea>
          <div class="save-row"><span class="sub" data-review-state>${r[me()] || rv[me()] ? "✓ 保存済み" : "★と感想を入れて「保存」を押してください"}</span><button type="button" class="btn sm rose" data-save-review>保存</button></div></div></div>` : ""}
      ${ids.map((id) => `<div class="review-row">${av(id, "xs")}<div class="val"><b>${esc(pname(id))}</b>${r[id] ? ` ${starsRo(r[id])}` : ` <span class="sub">まだ評価していません</span>`}${rv[id] ? `<div class="review-text">${esc(rv[id])}</div>` : ""}</div></div>`).join("")}
      <p class="sub" style="margin:6px 0 0">平均が★${AGAIN_MIN}以上の場所は「また行きたい」に入り、ホームやプラン作りにも出てきます。</p>
    </div>`;
  }

  // ---------- 詳細 ----------
  function openDetail(id) {
    const it = S.spots.find((s) => s.id === id);
    if (!it) return;
    const g = genreOf(it.genre);
    const t = travelOf(it);
    const base = activeBase();
    const st = it.status || "want";
    const fmt = (iso) => new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const o = openState(it);
    const s = seasonOf(it);
        const ppl = peopleList();
    const calDate = it.plannedDate || todayStr();
    const { root, close } = sheet(`<div data-detail="${esc(it.id)}">
      ${head(`${g.emoji} ${esc(g.label)}`)}
      <div class="hero" style="--tint:${TINT[g.id]}">${thumb(it)}</div>
      <h2 class="d-title">${esc(nameOf(it))}</h2>
      <div class="tags">${smartTags(it)}${isBoth(it) ? `<span class="tag match">♡ ${esc(matchText(it))}が行きたい</span>` : ""}</div>

      <div class="apps" aria-label="ほかのアプリで開く">${appLinks(it, base, { fromName: base ? (base.address && !/^https?:|現在地/.test(base.address) ? base.address : /駅$/.test(base.label) ? base.label : "") : "", calDate }).map((g) => `
        <div class="apps-h">${esc(g.section)}</div>
        ${g.apps.map((a) => `<div class="app-row">${appIcon(a.app)}<b class="app-name">${esc(a.name)}</b><div class="app-acts">${a.actions.filter((x) => x.act !== "ics" || F.ics).map((x) => x.url
          ? `<a class="app-act" href="${esc(x.url)}" target="_blank" rel="noopener"${x.copy ? ` data-copy-name="${esc(x.copy)}"` : ""}>${esc(x.label)}</a>`
          : `<button class="app-act" data-${x.act}>${esc(x.label)}</button>`).join("")}</div></div>`).join("")}`).join("")}
      </div>

      ${solo() ? "" : (() => {
        const others = ppl.filter((p) => p.id !== me());
        const mv = myVote(it);
        const mark = (v, id) => (v === true ? "♡ 行きたい" : v === "no" ? `まあまあ${MEH[it.reasons?.[id]] ? `（${MEH[it.reasons[id]].label}）` : ""}` : "まだ");
        return `<div class="label">行きたい？ <span class="num" style="letter-spacing:0">${yesIds(it).length}/${memberCount()}人</span></div>
        <div class="vote-row">
          ${me() ? `<div class="vote">${av(me())}<span class="name">あなた</span><div class="seg"><button data-v="yes" class="${mv === true ? "on" : ""}">♡ 行きたい</button><button data-v="no" class="${mv === "no" ? "on" : ""}">まあまあ</button></div></div>` : ""}
          ${others.length ? `<div class="chips wrap-chips">${others.map((p) => { const v = votes(it)[p.id]; return `<span class="chip ${v === true ? "on" : ""}">${av(p.id, "xs")}${esc(pname(p.id))}<small>${mark(v, p.id)}</small></span>`; }).join("")}</div>` : `<p class="sub" style="margin:0">まだほかのメンバーがいません。設定から招待できます。</p>`}
        </div>${kindBox(it)}`;
      })()}
      ${st !== "visited" ? eagerBlock(it) : ""}

      <div class="info">
        <div class="info-row">${ic("pin")}<div class="val">${esc([it.address || [it.prefecture, it.city].join(""), it.station && `${it.station}${it.walkMin ? ` 徒歩${it.walkMin}分` : ""}`].filter(Boolean).join(" ・ ") || "場所が未設定です")}</div></div>
        <div class="info-row">${ic("train")}<div class="val">${travelHtml(it, base)}</div></div>
        <div class="info-row">${ic("yen")}<div class="val">${formatPrice(it) ? esc(formatPrice(it)) : "値段はわかりません"}${it.priceNote && it.priceNote !== "無料" ? ` <span class="sub">${esc(it.priceNote)}</span>` : ""}</div></div>
        ${it.hours || it.closed ? `<div class="info-row">${ic("clock")}<div class="val">${esc(it.hours)}${it.closed ? `<div class="sub">定休日: ${esc(it.closed)}</div>` : ""}${o ? `<div><span class="tag ${o.state}">${esc(o.label)}</span></div>` : ""}</div></div>` : ""}
        ${it.deadline ? `<div class="info-row">${ic("hourglass")}<div class="val">${esc(it.deadline)} ごろまでの期間限定${daysUntil(it.deadline) >= 0 ? `（あと${daysUntil(it.deadline)}日くらい。行けたらいいね）` : "（期間は過ぎたかも。また開催されるかチェックしてみてください）"}</div></div>` : ""}
        ${s ? `<div class="info-row">${ic("leaf")}<div class="val">${esc(s.label)}</div></div>` : ""}
        ${it.summary ? `<div class="info-row">${ic("sparkle")}<div class="val">${esc(it.summary)}</div></div>` : ""}
      </div>
      ${it.tags?.length ? `<div class="chips wrap-chips">${it.tags.map((x) => `<span class="chip">#${esc(x)}</span>`).join("")}</div>` : ""}
      ${it.caption ? `<details><summary class="sub" style="cursor:pointer">投稿の本文</summary><div class="caption">${esc(it.caption)}</div></details>` : ""}

      <div class="label">ステータス</div>
      <div class="seg full">${Object.entries(STATUS).map(([k, l]) => `<button data-status="${k}" class="${st === k ? "on" : ""}">${l}</button>`).join("")}</div>
      ${st === "planned" ? `<div class="row2" style="margin-top:12px"><div class="field"><label for="d-planned">行く日</label><input id="d-planned" type="date" data-field="plannedDate" value="${esc(it.plannedDate || "")}"></div><div class="field"><label for="d-time">時間</label><input id="d-time" type="time" data-field="planTime" value="${esc(it.planTime || "")}"></div></div>` : ""}
      ${st === "visited" ? `<div class="row2" style="margin-top:12px">
          <div class="field"><label for="d-visited">行った日</label><input id="d-visited" type="date" data-field="visitedAt" value="${esc(it.visitedAt || "")}"></div>
          <div></div></div>
        ${reviewBlock(it)}` : ""}

      <div class="label">メモ</div>
      <div class="field"><textarea id="d-memo" aria-label="メモ" placeholder="予約必須、記念日に、など">${esc(it.memo || "")}</textarea>
        <div class="save-row"><span class="sub" data-memo-state>${it.memo ? "✓ 保存済み" : "書いたら「保存」を押してください"}</span><button type="button" class="btn sm rose" data-save-memo>保存</button></div></div>

      ${solo() ? "" : `<div class="label">コメント</div>
      <div class="comments">${(it.comments || []).map((c) => `<div class="comment ${c.by && c.by === me() ? "mine" : ""}">${av(c.by, "xs")}<div class="bubble">${esc(c.text)}<time>${esc(pname(c.by))} ・ ${fmt(c.at)}</time></div></div>`).join("") || `<p class="sub" style="margin:0">「いつ行く？」など、ここで相談できます</p>`}</div>
      <form class="composer"><input id="d-comment" placeholder="コメントを書く" maxlength="500" aria-label="コメント"><button class="btn rose sm">送信</button></form>`}

      <p class="sub" style="margin-top:18px">${esc(pname(it.addedBy))}が${it.createdAt ? fmt(it.createdAt) : ""}に追加${it.url ? ` ・ ${esc(platformLabel(it.platform))}から` : ""}</p>
      <div class="actions">
        <button class="btn line" data-pin>${ic("pinned", "sm")}${it.pinned ? "ピンを外す" : "ピン留め"}</button>
        <button class="btn line" data-edit>${ic("edit", "sm")}編集</button>
        <button class="btn danger" data-delete>${ic("trash", "sm")}削除</button>
      </div>
    </div>`);

    root.addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b || !root.contains(b)) return;
      if (b.dataset.v === "yes") return vote(it.id, myVote(it) === true ? null : true);
      if (b.dataset.v === "no") {
        if (myVote(it) === "no") return vote(it.id, null);
        const reason = await mehSheet(it);
        if (!reason) return openDetail(it.id);
        await vote(it.id, "no", { reason });
        return openDetail(it.id);
      }
      if (b.dataset.reask) {
        const d = new Date(); d.setDate(d.getDate() + Number(b.dataset.reask));
        const at = new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        return patch(it.id, { reaskAt: at, reaskBy: me() }, b.dataset.reask === "0" ? "もう一度「どう？」と聞きました。答え合わせに出ます" : `${jpDate(at)}にもう一度聞いてみます`);
      }
      if (b.dataset.mode) { S.openMode = S.openMode === `${it.id}:${b.dataset.mode}` ? "" : `${it.id}:${b.dataset.mode}`; return openDetail(it.id); }
      if (b.dataset.routeAi) return askRoute(it, b.dataset.routeAi);
      if (b.hasAttribute("data-pin")) return patch(it.id, { pinned: !it.pinned });
      if (b.dataset.status) {
        const body = { status: b.dataset.status };
        if (b.dataset.status === "visited" && !it.visitedAt) body.visitedAt = todayStr();
        if (b.dataset.status === "planned" && !it.plannedDate) body.plannedDate = nextSaturday();
        return patch(it.id, body, b.dataset.status === "visited" ? "思い出に追加しました" : b.dataset.status === "planned" ? "予定に入れました" : "");
      }
      // ★は「保存」を押すまで決まらない（押し間違いを防ぐ）
      if (b.dataset.rate) {
        const n = Number(b.dataset.rate);
        const box = b.closest("[data-my-stars]");
        box.dataset.myStars = String(n);
        box.querySelectorAll("[data-rate]").forEach((x) => x.classList.toggle("on", Number(x.dataset.rate) <= n));
        return markDirty("[data-review-state]");
      }
      if (b.hasAttribute("data-save-review")) {
        const n = Number(root.querySelector("[data-my-stars]")?.dataset.myStars || 0);
        const text = root.querySelector("#d-myreview").value.trim();
        if (!n && !text) return toast("★か感想を入れてください");
        b.disabled = true;
        const ok = await act(() => B.updateSpot(it.id, { ...(n ? { ratings: { [me()]: n } } : {}), reviews: { [me()]: text } }), "評価と感想を保存しました");
        b.disabled = false;
        if (ok) markSaved("[data-review-state]");
        return;
      }
      if (b.hasAttribute("data-save-memo")) {
        b.disabled = true;
        const ok = await act(() => B.updateSpot(it.id, { memo: root.querySelector("#d-memo").value, memoBy: me(), memoAt: new Date().toISOString() }), "メモを保存しました");
        b.disabled = false;
        if (ok) markSaved("[data-memo-state]");
        return;
      }
      if (b.dataset.eager) {
        const n = Number(b.dataset.eager);
        const mine = eagerOf(it)[me()];
        const next = mine === n ? 0 : n;
        if (await act(() => B.updateSpot(it.id, { eager: { [me()]: next || null } }), next ? `行きたい度「${EAGER_LABELS[next]}」を保存しました` : "行きたい度を取り消しました")) openDetail(it.id);
        return;
      }
      if (b.hasAttribute("data-edit")) return openEditor(it, { id: it.id });
      if (b.hasAttribute("data-ics")) {
        const blob = new Blob([icsText(it, calDate)], { type: "text/calendar" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${nameOf(it)}.ics`; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }
      if (b.hasAttribute("data-copy")) { try { await navigator.clipboard.writeText(spotShareText(it)); toast("コピーしました"); } catch { toast("コピーできませんでした"); } }
      if (b.hasAttribute("data-delete") && await confirmBox({ title: `「${nameOf(it)}」を削除しますか？`, text: `削除すると、${V().others || "ほかのメンバー"}のリストからも消えます。元には戻せません。`, ok: "削除する", danger: true })) {
        if (await act(() => B.deleteSpot(it.id), "削除しました")) close();
      }
    });
    root.querySelectorAll("[data-field]").forEach((el) => el.addEventListener("change", () => patch(it.id, { [el.dataset.field]: el.value })));
    // 書いている途中は「未保存」と出す
    const markDirty = (sel) => { const el = root.querySelector(sel); if (el) { el.textContent = "● まだ保存していません"; el.classList.add("dirty"); } };
    const markSaved = (sel) => { const el = root.querySelector(sel); if (el) { el.textContent = "✓ 保存しました"; el.classList.remove("dirty"); } };
    root.querySelector("#d-myreview")?.addEventListener("input", () => markDirty("[data-review-state]"));
    root.querySelector("#d-memo")?.addEventListener("input", () => markDirty("[data-memo-state]"));
    // SNSの検索：名前をコピーしておく（アプリで検索欄に文字が入らなかったとき、貼り付けられるように）
    root.querySelectorAll("[data-copy-name]").forEach((a) => a.addEventListener("click", () => {
      navigator.clipboard?.writeText(a.dataset.copyName).then(() => toast(`「${a.dataset.copyName}」をコピーしました。検索欄に貼り付けられます`)).catch(() => {});
    }));
    root.querySelector(".composer")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = root.querySelector("#d-comment");
      const text = input.value.trim().slice(0, 500);
      if (!text) return;
      input.value = "";
      await act(() => B.comment(it.id, text));
    });
  }

  // ---------- 絞り込み ----------
  function openFilters() {
    const live = S.spots.filter((i) => (i.status || "want") !== "visited");
    const count = (fn) => live.filter(fn).length;
    const areas = [...new Set(live.map((i) => i.prefecture || "未設定"))];
    const opt = (v, l, cur) => `<option value="${v}" ${cur === v ? "selected" : ""}>${l}</option>`;
    const draw = () => {
      const f = S.f;
      const { root } = sheet(`${head("絞り込み・並べ替え")}
        <div class="row2">
          <div class="field"><label for="fl-sort">並べ替え</label><select id="fl-sort">${opt("new", "新しい順", S.sortBy)}${opt("old", "古い順", S.sortBy)}${opt("near", "移動時間が短い順", S.sortBy)}${opt("dist", "距離が近い順", S.sortBy)}${opt("cheap", "安い順", S.sortBy)}${opt("love", "♡が多い順", S.sortBy)}${opt("deadline", "期限が近い順", S.sortBy)}${opt("eager", "行きたい度が高い順", S.sortBy)}</select></div>
          <div class="field"><label for="fl-group">グループ分け</label><select id="fl-group">${opt("date", "追加日", S.groupBy)}${opt("genre", "ジャンル", S.groupBy)}${opt("area", "エリア", S.groupBy)}${opt("travel", "移動時間", S.groupBy)}${opt("price", "予算", S.groupBy)}${opt("who", "見つけた人", S.groupBy)}${opt("platform", "共有元（SNS）", S.groupBy)}${opt("none", "分けない", S.groupBy)}</select></div>
        </div>
        <div class="label">いま・条件</div>
        <div class="chips wrap-chips">
          <button class="chip ${f.openNow ? "on" : ""}" data-f="openNow">${ic("clock", "sm")}いま営業中 <small>${count((i) => ["open", "closing"].includes(openState(i)?.state))}</small></button>
          <button class="chip ${f.deadlineOnly ? "on" : ""}" data-f="deadlineOnly">⏳ 期間限定 <small>${count((i) => i.deadline && daysUntil(i.deadline) >= 0)}</small></button>
          ${solo() ? "" : `<button class="chip ${f.unvoted ? "on" : ""}" data-f="unvoted">まだ答えていない <small>${count((i) => myVote(i) == null)}</small></button>
          <button class="chip ${f.meh ? "on" : ""}" data-f="meh">まあまあ票あり <small>${count((i) => Object.values(votes(i)).includes("no"))}</small></button>`}
          <button class="chip ${f.located ? "on" : ""}" data-f="located">${ic("pin", "sm")}位置がわかる <small>${count((i) => i.lat != null)}</small></button>
          <button class="chip ${f.never ? "on" : ""}" data-f="never">🆕 まだ行ったことない場所だけ <small>${count((i) => (i.status || "want") !== "visited")}</small></button>
        </div>
        <div class="label">行ける曜日（定休日を除く）</div>
        <div class="chips wrap-chips"><button class="chip ${f.day === "today" ? "on" : ""}" data-f="day" data-v="today">今日</button>${WEEK.map((w, n) => `<button class="chip ${f.day === String(n) ? "on" : ""}" data-f="day" data-v="${n}">${w}</button>`).join("")}</div>
        <div class="label">ジャンル</div>
        <div class="chips wrap-chips">${GENRES.filter((g) => live.some((i) => i.genre === g.id)).map((g) => `<button class="chip ${f.genres.has(g.id) ? "on" : ""}" data-f="genre" data-v="${g.id}">${g.emoji} ${g.label} <small>${count((i) => i.genre === g.id)}</small></button>`).join("")}</div>
        <div class="label">エリア</div>
        <div class="chips wrap-chips">${areas.map((a) => `<button class="chip ${f.area === a ? "on" : ""}" data-f="area" data-v="${esc(a)}">${esc(a)} <small>${count((i) => (i.prefecture || "未設定") === a)}</small></button>`).join("")}</div>
        <div class="label">予算（1人）</div>
        <div class="chips wrap-chips">${[["free", "無料"], ["p1", "〜¥1,000"], ["p2", "〜¥3,000"], ["p3", "〜¥5,000"], ["p4", "¥5,000〜"]].map(([v, l]) => `<button class="chip ${f.price === v ? "on" : ""}" data-f="price" data-v="${v}">${l}</button>`).join("")}</div>
        ${activeBase() ? `<div class="label">${esc(activeBase().label)}からの距離（直線）</div><div class="chips wrap-chips">${DIST.map(([v, l], n) => `<button class="chip ${f.dist === v ? "on" : ""}" data-f="dist" data-v="${v}">${l} <small>${count((i) => { const km = travelOf(i)?.km; return km != null && km <= DIST[n][2] && km > (v === "dfar" ? DIST[n - 1][2] : -1); })}</small></button>`).join("")}</div>
          <div class="label">${esc(activeBase().label)}からの移動時間</div><div class="chips wrap-chips">${[["t30", "30分以内"], ["t60", "1時間以内"], ["t120", "2時間以内"], ["tfar", "遠出"]].map(([v, l]) => `<button class="chip ${f.travel === v ? "on" : ""}" data-f="travel" data-v="${v}">${l}</button>`).join("")}</div>`
          : `<div class="label">距離・移動時間</div><button class="chip" data-act="bases">${ic("home", "sm")}出発地を登録すると距離で絞れます</button>`}
        <div class="label">追加した時期</div>
        <div class="chips wrap-chips">${[["week", "今週"], ["month", "今月"], ["older", "それより前"]].map(([v, l]) => `<button class="chip ${f.added === v ? "on" : ""}" data-f="added" data-v="${v}">${l} <small>${count((i) => { const d = daysSince(i.createdAt); return v === "week" ? d <= 7 : v === "month" ? d <= 31 : d > 31; })}</small></button>`).join("")}</div>
        <div class="label">見つけた人</div>
        <div class="chips wrap-chips">${peopleList().map((p) => `<button class="chip ${f.who === p.id ? "on" : ""}" data-f="who" data-v="${esc(p.id)}">${av(p.id, "xs")}${esc(pname(p.id))}</button>`).join("")}</div>
        <div class="actions"><button class="btn line" data-reset>リセット</button><button class="btn rose" data-close>${filtered().length}件を見る</button></div>`, { onClose: render });
      root.addEventListener("click", (e) => {
        if (e.target.closest('[data-act="bases"]')) return openSettings("bases");
        const b = e.target.closest("[data-f],[data-reset]");
        if (!b) return;
        if (b.hasAttribute("data-reset")) S.f = freshFilters();
        const k = b.dataset.f, v = b.dataset.v;
        if (["openNow", "deadlineOnly", "unvoted", "meh", "located", "never"].includes(k)) f[k] = !f[k];
        if (k === "genre") f.genres.has(v) ? f.genres.delete(v) : f.genres.add(v);
        if (["area", "price", "travel", "dist", "who", "day", "added"].includes(k)) f[k] = f[k] === v ? "" : v;
        draw();
      });
      root.querySelector("#fl-sort").onchange = (e) => { S.sortBy = e.target.value; local.set("sortBy", S.sortBy); };
      root.querySelector("#fl-group").onchange = (e) => { S.groupBy = e.target.value; local.set("groupBy", S.groupBy); };
    };
    draw();
  }

  // ---------- ガチャ ----------
  function openGacha() {
    const pool0 = S.spots.filter((i) => (i.status || "want") !== "visited" && myVote(i) !== "no");
    if (!pool0.length) return toast("まずは行きたい場所を追加しましょう");
    const { root } = sheet(`${head("今日どこ行く？")}
      <div class="row2">
        <div class="field"><label for="g-time">移動時間</label><select id="g-time" ${activeBase() ? "" : "disabled"}><option value="">指定なし</option><option value="30">30分以内</option><option value="60">1時間以内</option><option value="120">2時間以内</option></select></div>
        <div class="field"><label for="g-price">予算（1人）</label><select id="g-price"><option value="">指定なし</option><option value="0">無料</option><option value="1000">〜¥1,000</option><option value="3000">〜¥3,000</option><option value="5000">〜¥5,000</option></select></div>
      </div>
      <div class="chips wrap-chips">${solo() ? "" : `<button class="chip" data-g="both">♡ ${esc(matchPhrase())}</button>`}<button class="chip" data-g="open">いま営業中</button></div>
      <div class="dice" id="dice">🎲</div><div class="slot" id="slot">まわしてみよう</div>
      <div id="g-result"></div>
      <div class="actions"><button class="btn rose" data-spin>${ic("dice", "sm")}まわす</button></div>`);
    const flags = { both: false, open: false };
    root.querySelectorAll("[data-g]").forEach((b) => b.addEventListener("click", () => { flags[b.dataset.g] = !flags[b.dataset.g]; b.classList.toggle("on", flags[b.dataset.g]); }));
    const spin = () => {
      const time = $("g-time").value, price = $("g-price").value;
      const pool = pool0.filter((it) => (!flags.both || isBoth(it)) && (!flags.open || ["open", "closing"].includes(openState(it)?.state)) && (price === "" || (it.priceMin != null && it.priceMin <= Number(price))) && (!time || ((t) => t && t.best <= Number(time))(travelOf(it))));
      const slot = $("slot"), res = $("g-result"), dice = $("dice");
      res.innerHTML = "";
      if (!pool.length) { slot.textContent = "条件に合う場所がありません"; return; }
      const pick = pool[Math.floor(Math.random() * pool.length)];
      dice.classList.add("rolling");
      let n = 0;
      const timer = setInterval(() => {
        slot.textContent = nameOf(pool[n++ % pool.length]);
        if (n <= 14) return;
        clearInterval(timer);
        dice.classList.remove("rolling");
        slot.textContent = nameOf(pick);
        res.innerHTML = `<div class="grid" style="grid-template-columns:1fr">${card(pick)}</div><div class="actions"><button class="btn line" data-again>もう一回</button><button class="btn rose" data-plan>ここにする</button></div>`;
        res.querySelector("[data-again]").onclick = spin;
        res.querySelector("[data-plan]").onclick = async () => { if (await patch(pick.id, { status: "planned", plannedDate: todayStr() }, "今日の予定に入れました")) openDetail(pick.id); };
      }, 75);
    };
    root.querySelector("[data-spin]").addEventListener("click", spin);
    root.addEventListener("click", (e) => { const c = e.target.closest("#g-result [data-open]"); if (c) openDetail(c.dataset.open); });
  }

  // ---------- 設定 ----------
  const COMPAT_WORDS = [[80, "ほぼ以心伝心💞"], [60, "けっこう気が合う😊"], [40, "ほどよく違う🤝"], [0, "好みは真逆タイプ⚡"]];
  function openMembers() {
    const ppl = peopleList();
    const ids = ppl.map((p) => p.id);
    const { members, best } = memberStats(S.spots, ids);
    const statOf = Object.fromEntries(members.map((m) => [m.id, m]));
    const meId = me();
    const sorted = [...ppl].sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : (statOf[b.id]?.added || 0) - (statOf[a.id]?.added || 0)));
    const { root } = sheet(`${head(`メンバー <span class="sub" style="font-family:var(--body)">${ppl.length}人</span>`)}
      <p class="sub" style="margin-top:0">「${esc(S.settings.name)}」に参加している人です。${F.lists && isLeader() ? "ほかの部屋のメンバーは、上の部屋名から確認できます。" : ""}</p>
      ${best && ppl.length >= 3 ? `<div class="best-combo"><span class="sub">ベストコンビ</span><div class="duo">${av(best.a)}${av(best.b)}</div><b>${esc(pname(best.a))} × ${esc(pname(best.b))}</b><span class="num">相性 ${best.score}%</span></div>` : ""}
      <div class="member-grid">${sorted.map((p) => {
        const st = statOf[p.id] || { titles: [], added: 0, yes: 0, visited: 0 };
        const c = meId && p.id !== meId && !solo() ? compatibility(S.spots, meId, p.id) : null;
        const g = st.topGenre ? genreOf(st.topGenre) : null;
        return `<div class="member-card">
          <div class="mc-top">${av(p.id, "lg")}<div style="min-width:0"><b class="mc-name">${esc(p.name || "メンバー")}</b>${p.id === meId ? ` <span class="tag">あなた</span>` : ""}${p.leader ? ` <span class="tag match">👑 リーダー</span>` : ""}
            <div class="tags" style="margin:4px 0 0">${st.titles.map((t) => `<span class="tag title">${esc(t)}</span>`).join("")}</div></div></div>
          <div class="mc-stats"><span><b class="num">${st.added}</b>見つけた</span><span><b class="num">${st.yes}</b>行きたい♡</span><span><b class="num">${st.visited}</b>行けた</span></div>
          ${g ? `<p class="sub" style="margin:0">よく見つけるのは ${g.emoji} ${esc(g.label)}</p>` : ""}
          ${p.id !== meId && !solo() ? `<div class="compat"><span class="sub">あなたとの相性</span>${c == null ? `<span class="sub">投票が増えるとわかります</span>` : `<div class="meter"><i style="width:${c}%"></i></div><b class="num">${c}%</b><span class="sub">${COMPAT_WORDS.find(([n]) => c >= n)[1]}</span>`}</div>` : ""}
          <div class="actions" style="margin-top:2px">
            ${B.renameMember ? `<button class="btn sm line" data-rename="${esc(p.id)}">${ic("edit", "sm")}名前を変える</button>` : ""}
            ${B.kind === "artifact" && isLeader() && p.id !== meId && !p.leader ? `<button class="btn sm danger" data-kick="${esc(p.id)}" data-name="${esc(p.name || "ゲスト")}">外す</button>` : ""}
            ${p.id === meId && B.setAvatar ? `<button class="btn sm line" data-avatar>${ic("image", "sm")}アイコン</button>` : ""}
          </div>
        </div>`;
      }).join("")}</div>
      ${(F.invite || F.codes) && !solo() && isLeader() ? `<button class="btn rose block" style="margin-top:12px" data-act-invite>${ic("users", "sm")}メンバーを招待する（招待コード）</button>` : ""}
      <p class="sub" style="margin-top:12px">称号は、見つけた場所・投票・コメントから自動で付きます。相性は、ふたりとも答えた場所の「行きたい／まあまあ」がどれだけ一致したかです。</p>`);
    root.addEventListener("click", (e) => {
      const r = e.target.closest("[data-rename]");
      if (r) return renameSheet(r.dataset.rename);
      const k = e.target.closest("[data-kick]");
      if (k) {
        confirmBox({ title: `${k.dataset.name}さんを部屋から外しますか？`, text: "外すと、この人は自動で部屋から抜けます。追加したスポットは残ります。", ok: "外す", danger: true })
          .then(async (yes) => { if (yes && await act(() => B.revoke(k.dataset.kick, B.currentRoom()), "外しました")) openMembers(); });
        return;
      }
      if (e.target.closest("[data-avatar]")) return avatarSheet();
      if (e.target.closest("[data-act-invite]")) return openInvite();
    });
  }

  function renameSheet(id) {
    const p = person(id);
    const isMe = id === me();
    const { root } = sheet(`${head(isMe ? "あなたの名前" : `${esc(p.name || "メンバー")}さんの名前`)}
      <p class="sub" style="margin-top:0">${isMe ? "" : "ニックネームに変えられます。変えた名前はメンバー全員に表示されます。"}</p>
      <form id="rn-form"><div class="field"><label for="rn-name">名前</label><input id="rn-name" required maxlength="20" value="${esc(p.name)}"></div>
      <div class="actions"><button type="button" class="btn line" data-back>戻る</button><button class="btn rose">保存</button></div></form>`);
    root.querySelector("[data-back]").addEventListener("click", openMembers);
    root.querySelector("#rn-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = root.querySelector("#rn-name").value.trim();
      if (name && (await act(() => B.renameMember(id, name), "名前を変えました"))) openMembers();
    });
    setTimeout(() => root.querySelector("#rn-name")?.select(), 60);
  }

  const AVATAR_EMOJI = ["🐻", "🐰", "🐱", "🐶", "🦊", "🐼", "🐨", "🐯", "🦁", "🐸", "🐧", "🐥", "🐙", "🦄", "🐳", "🦖", "🍓", "🍑", "🍙", "🍣", "☕", "🍰", "🌸", "🌻", "⭐", "🔥", "🌈", "🎈", "🎧", "⚽", "🚲", "📸"];
  async function shrinkPhoto(file) {
    const bmp = await createImageBitmap(file);
    const size = 128, c = document.createElement("canvas");
    c.width = c.height = size;
    const k = Math.min(bmp.width, bmp.height);
    c.getContext("2d").drawImage(bmp, (bmp.width - k) / 2, (bmp.height - k) / 2, k, k, 0, 0, size, size);
    return c.toDataURL("image/jpeg", 0.82);
  }
  function avatarSheet() {
    const { root } = sheet(`${head("アイコンを変える")}
      <div class="mc-top" style="margin-bottom:12px">${av(me(), "lg")}<span class="sub">絵文字を選ぶか、写真を使えます。</span></div>
      <div class="emoji-grid">${AVATAR_EMOJI.map((e) => `<button data-emo="${e}" aria-label="${e}">${e}</button>`).join("")}</div>
      <div class="actions"><label class="btn line" for="av-file">${ic("image", "sm")}写真を選ぶ<input id="av-file" type="file" accept="image/*" hidden></label><button class="btn line" data-reset-av>元に戻す</button></div>
      <button class="btn line block" style="margin-top:8px" data-back>メンバー図鑑に戻る</button>`);
    const save = async (v) => { if (await act(() => B.setAvatar(me(), v), "アイコンを変えました")) avatarSheet(); };
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-emo]");
      if (b) return save(`emoji:${b.dataset.emo}`);
      if (e.target.closest("[data-reset-av]")) return save("");
      if (e.target.closest("[data-back]")) return openMembers();
    });
    root.querySelector("#av-file").addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try { save(await shrinkPhoto(f)); } catch { toast("この写真は使えませんでした"); }
    });
  }

  function inviteText(code = "") {
    return `${V().invite || "行きたい場所のリストを作りました"}\n${F.invite ? B.inviteUrl() : ""}${code ? `\n招待コード: ${code}` : ""}`.replace(/\n\n/g, "\n");
  }
  // 招待：リンク（Webアプリ）と、部屋ごとの招待コード
  function openInvite() {
    if (!isLeader()) return toast("招待できるのはリーダーだけです");
    const who = esc(V().label === "ひとりで" ? "メンバー" : V().label);
    const { root } = sheet(`${head(`${who}を招待`)}
      ${B.kind === "artifact" ? `<div class="notice warn" style="text-align:left"><b>招待する前に</b><br>① 右上の「共有」で<b>リンクでの公開をオフ</b>にする（オンだと招待した人も見るだけになります）<br>② 相手のメールアドレスを<b>「編集者」</b>で招待する<br>③ 相手にこの招待コードを伝える</div>` : ""}
      ${F.codes ? `<div class="code-box"><span class="sub">「${esc(S.settings.name)}」の招待コード</span><b class="num" id="s-code"><span class="spinner"></span></b><button class="btn sm line" data-copy-code disabled>コードをコピー</button></div>
        <p class="sub" style="margin:8px 0 14px">${F.invite ? "相手はアプリの最初の画面で「招待コードで参加する」に入れるだけ。" : "このページのリンクを共有したあと、相手にリストの切り替え →「招待コードで参加」でこのコードを入れてもらいます。"}コードは部屋ごとに別なので、恋人用・友達用を混ぜずに使えます。</p>` : ""}
      ${F.invite ? `<div class="label" style="margin-top:0">リンクで招待</div>
        <div style="display:flex;gap:6px"><input id="s-invite" readonly value="${esc(B.inviteUrl())}" aria-label="招待リンク" style="flex:1;min-width:0;border:1.5px solid var(--line);border-radius:12px;padding:10px 12px;background:var(--surface)"><button class="btn sm line" data-copy-invite>コピー</button></div>
        <p class="sub" style="margin-top:6px">リンクを開いて名前を入れるだけで参加できます。アカウント登録はいりません。</p>` : `<div class="notice">${esc(B.shareNote || "画面上部の共有メニューから、このページを共有してください。")}</div>`}
      <div class="actions">
        <a class="btn rose" data-line href="${esc(lineShareUrl(inviteText()))}" target="_blank" rel="noopener">${ic("send", "sm")}LINEで送る</a>
        ${navigator.share ? `<button class="btn line" data-share-invite>${ic("share", "sm")}ほかのアプリで送る</button>` : ""}
      </div>
      <p class="sub" style="margin-top:12px">リンクやコードを知っている人は誰でも参加できます。使う人以外には教えないでください。</p>`);
    let code = "";
    if (F.codes) Promise.resolve(B.shareCode()).then((c) => {
      code = c || "";
      const el = root.querySelector("#s-code");
      if (!el) return;
      el.textContent = code || "—";
      root.querySelector("[data-copy-code]").disabled = !code;
      root.querySelector("[data-line]").href = lineShareUrl(inviteText(code));
    }).catch(() => { const el = root.querySelector("#s-code"); if (el) el.textContent = "—"; });
    root.querySelector("[data-copy-code]")?.addEventListener("click", async () => { try { await navigator.clipboard.writeText(code); toast("招待コードをコピーしました"); } catch { toast(code); } });
    root.querySelector("[data-copy-invite]")?.addEventListener("click", async () => { try { await navigator.clipboard.writeText(B.inviteUrl()); toast("コピーしました"); } catch { root.querySelector("#s-invite").select(); } });
    root.querySelector("[data-share-invite]")?.addEventListener("click", () => navigator.share({ title: S.settings.name, text: inviteText(code) }).catch(() => {}));
  }

  function openSettings(focus = "") {
    const st = S.settings;
    const ppl = peopleList();
    const mine = person(me());
    const { root, close } = sheet(`${head("設定")}
      ${B.kind === "artifact" ? `<div class="role-line">${isLeader() ? `<span class="tag match">👑 リーダー</span><span class="sub">部屋を作って、招待コードでみんなを招待できます。</span>` : `<span class="tag">ゲスト</span><span class="sub">この部屋のメンバーです。部屋の作成・ジャンルの変更・招待はリーダーが行います。そのほかはみんなと同じように使えます。</span>`}</div>` : ""}
      ${solo() || !isLeader() ? "" : F.invite || F.codes ? `<button class="btn rose block" data-invite>${ic("users", "sm")}${esc(V().label)}を招待する（招待コード）</button>`
        : `<div class="notice">一緒に使う人は、画面上部の共有メニューから「編集できる」で招待してください。${esc(B.shareNote || "")}</div>`}

      <div class="label">この部屋</div>
      <div class="panel">
        ${isLeader() ? `<div class="field"><label for="s-name">部屋の名前</label><div style="display:flex;gap:6px"><input id="s-name" value="${esc(st.name)}" maxlength="40" style="flex:1"><button class="btn sm line" data-save-name>保存</button></div></div>
        <div class="field" style="margin:0"><label>部屋のジャンル（誰と使う？）</label>
          <div class="type-grid compact">${Object.entries(GROUP_TYPES).map(([k, t]) => `<button class="type-tile ${(st.type || "couple") === k ? "on" : ""}" data-type="${k}"><span class="emoji">${t.emoji}</span>${esc(t.label)}</button>`).join("")}</div>
          <span class="sub">選んだ相手に合わせて、言葉づかいやタブの名前が変わります。</span></div>`
        : `<div class="room-ro"><span class="room-emoji">${V().emoji}</span><div><b>${esc(st.name)}</b><div class="sub">${esc(V().label)}と使う部屋${B.leaderId?.() ? ` ・ リーダー: ${esc(person(B.leaderId()).name || "リーダー")}` : ""}</div></div></div>
          <p class="sub" style="margin:8px 0 0">部屋の名前とジャンルは、リーダーだけが変えられます。</p>`}
      </div>

      ${F.members || F.memberList ? `<div class="label">メンバー（${ppl.length}人）<button class="link" data-members style="border:0;background:none;color:var(--plan);font-weight:700;float:right;letter-spacing:0">メンバー図鑑を見る</button></div>
        <div class="panel">
          ${ppl.map((p) => { const st = memberStats(S.spots, [p.id]).members[0] || {}; return `<div class="base-item" style="padding:6px 0;margin:0;background:none">${av(p.id)}<div class="val"><b>${esc(p.name || "メンバー")}</b>${p.id === me() ? ` <span class="tag">あなた</span>` : ""}${p.leader ? ` <span class="tag match">👑 リーダー</span>` : ""}<div class="sub">見つけた ${st.added || 0}件 ・ 行きたい♡ ${st.yes || 0}件</div></div></div>`; }).join("")}
          ${F.members && mine && me() ? `<form id="me-form" style="margin-top:10px"><div class="row2"><div class="field"><label for="me-name">あなたの名前</label><input id="me-name" value="${esc(mine.name)}" maxlength="20"></div><div class="field"><label for="me-color">あなたの色</label><input id="me-color" type="color" value="${esc(mine.color)}" style="height:46px;padding:4px"></div></div>
            <div class="actions" style="margin-top:0"><button class="btn line">保存</button><button type="button" class="btn line" data-switch>別の人として使う</button></div></form>` : ""}
        </div>` : ""}

      <div class="label">出発地（移動時間の計算に使います）</div>
      ${st.bases.map((b) => `<div class="base-item">${ic("home", "sm")}<div class="val"><b>${esc(b.label)}</b><div class="sub">${esc(b.address || `${b.lat.toFixed(4)}, ${b.lng.toFixed(4)}`)}</div></div><button class="btn sm danger" data-del-base="${esc(b.id)}">削除</button></div>`).join("") || `<p class="sub" style="margin-top:0">家や職場、よく集まる駅を登録しましょう。出発地はメンバー全員で共有され、どれを使うかは各自で選べます。</p>`}
      <form id="base-form" class="panel" style="margin-top:6px">
        <div class="row2"><div class="field"><label for="b-label">名前</label><input id="b-label" required placeholder="例: 自宅 / 会社 / 渋谷駅"></div>
        <div class="field"><label for="b-where">場所</label><input id="b-where" required placeholder="駅名・住所・GoogleマップのURL"></div></div>
        <p class="sub" id="b-status" style="margin:0 0 10px"></p>
        <div class="actions" style="margin-top:0">${F.geolocation ? `<button type="button" class="btn line" data-here>${ic("pin", "sm")}現在地</button>` : ""}<button class="btn rose">出発地を追加</button></div>
      </form>

      <div class="label">メインカラー（この端末）</div>
      <div class="panel">
        <div class="swatches">${ACCENTS.map(([hex, label]) => `<button class="swatch ${(local.get("accent", "") || "#df4a72") === hex ? "on" : ""}" style="--sw:${hex}" data-accent="${hex}" aria-label="${label}"><i></i><small>${label}</small></button>`).join("")}
          <label class="swatch custom" aria-label="好きな色"><input type="color" id="accent-custom" value="${esc(local.get("accent", "") || "#df4a72")}"><small>好きな色</small></label></div>
      </div>

      <div class="label">アプリ</div>
      <div class="actions" style="margin-top:0">
        <button class="btn line" data-tour>${ic("help", "sm")}使い方を見る</button>
        <button class="btn line" data-theme>表示テーマを切り替え</button>
        ${canFullscreen() ? `<button class="btn line" data-fullscreen>${isFullscreen() ? "全画面をやめる" : "全画面で表示"}</button>` : ""}
        ${F.export ? `<a class="btn line" href="${esc(B.exportUrl())}" download>バックアップ</a>` : ""}
      </div>
      ${F.owner ? `<div class="label">リーダー用</div><div class="panel"><b>ゲストの画面を確かめる</b><p class="sub" style="margin:4px 0 10px">${F.preview ? "いまゲスト画面のプレビュー中です。" : "招待された友人に見える画面（招待コードの入力から）を、このタブで試せます。書き込みはあなたとして行われます。"}</p>
        <button class="btn line block" data-preview>${F.preview ? "プレビューを終わる" : "ゲスト画面をプレビュー"}</button></div>` : ""}
      ${B.kind === "artifact" && isLeader() ? `<button class="btn danger block" style="margin-top:14px" data-delete-room>${ic("trash", "sm")}この部屋を削除する</button>` : ""}
      ${F.members && ppl.length > 1 && me() ? `<button class="btn danger block" style="margin-top:14px" data-leave>この部屋から抜ける</button>
        ` : ""}
      <p class="sub" style="margin-top:14px">読み取り: ${esc(B.readerNote)}<br>移動時間は直線距離から出した目安です。正確な時間はスポットの「経路」から確認できます。</p>`);
    if (focus === "bases") setTimeout(() => root.querySelector("#b-label")?.focus(), 60);
    let here = null;
    root.querySelector("[data-here]")?.addEventListener("click", () => {
      const s = root.querySelector("#b-status");
      s.textContent = "現在地を取得しています…";
      navigator.geolocation.getCurrentPosition((p) => { here = { lat: p.coords.latitude, lng: p.coords.longitude }; s.textContent = "現在地を使います"; if (!root.querySelector("#b-where").value) root.querySelector("#b-where").value = "現在地"; }, () => (s.textContent = "現在地を取得できませんでした"), { timeout: 10000 });
    });
    root.querySelector("#base-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const label = root.querySelector("#b-label").value.trim(), where = root.querySelector("#b-where").value.trim();
      const s = root.querySelector("#b-status");
      let pos = here || coordsFrom(where);
      if (!pos) {
        s.innerHTML = `<span class="thinking"><span class="spinner"></span>位置を探しています</span>`;
        pos = await B.locate(where).catch((err) => { s.textContent = err?.message || ""; return null; });
      }
      if (!pos) { s.textContent ||= "位置がわかりませんでした。Googleマップでその場所を開き、URLを貼ってください"; return; }
      const id = Math.random().toString(36).slice(2, 8);
      const bases = [...st.bases, { id, label, address: /^https?:/.test(where) ? "" : where, lat: pos.lat, lng: pos.lng }];
      if (await act(() => B.saveSettings({ bases }), "出発地を追加しました")) {
        S.settings = { ...S.settings, bases };
        if (!S.baseId) { S.baseId = id; local.set("baseId", id); }
        openSettings();
      }
    });
    root.querySelectorAll("[data-del-base]").forEach((b) => b.addEventListener("click", async () => {
      const bases = st.bases.filter((x) => x.id !== b.dataset.delBase);
      if (await act(() => B.saveSettings({ bases }))) { S.settings = { ...S.settings, bases }; openSettings(); }
    }));
    root.querySelectorAll("[data-type]").forEach((b) => b.addEventListener("click", async () => {
      if (await act(() => B.saveSettings({ type: b.dataset.type }), `「${GROUP_TYPES[b.dataset.type].label}」向けにしました`)) { S.settings = { ...S.settings, type: b.dataset.type }; render(); openSettings(); }
    }));
    root.querySelector("#me-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = root.querySelector("#me-name").value.trim(), color = root.querySelector("#me-color").value;
      if (await act(() => B.saveMembers([{ id: me(), name, color }]), "保存しました")) { render(); openSettings(); }
    });
    root.querySelector("[data-switch]")?.addEventListener("click", () => joinSheet(true));
    root.querySelector("[data-members]")?.addEventListener("click", openMembers);
    root.querySelector("[data-invite]")?.addEventListener("click", openInvite);
    root.querySelector("[data-tour]").addEventListener("click", () => { close(); showOnboarding(() => {}); });
    const setAccent = (hex) => { local.set("accent", hex === "#df4a72" ? "" : hex); applyAccent(hex === "#df4a72" ? "" : hex); root.querySelectorAll("[data-accent]").forEach((b) => b.classList.toggle("on", b.dataset.accent === hex)); };
    root.querySelectorAll("[data-accent]").forEach((b) => b.addEventListener("click", () => setAccent(b.dataset.accent)));
    root.querySelector("#accent-custom").addEventListener("input", (e) => setAccent(e.target.value));
    root.querySelector("[data-delete-room]")?.addEventListener("click", async () => {
      const guests = ppl.filter((p) => p.id !== me()).length;
      if (await confirmBox({ title: `「${st.name}」を削除しますか？`, text: `部屋の行きたい場所もすべて消え、元には戻せません。${guests ? `ゲスト${guests}人も自動でこの部屋から抜けます。` : ""}`, ok: "削除する", danger: true })) {
        close();
        if (await act(() => B.deleteRoom(), "部屋を削除しました")) render();
      }
    });
    root.querySelector("[data-leave]")?.addEventListener("click", async () => {
      if (await confirmBox({ title: `「${st.name}」から抜けますか？`, text: "抜けると、この部屋は一覧に出なくなります（あなたが追加したスポットは残ります）。", ok: "抜ける", danger: true })) act(() => B.leave());
    });
    root.querySelector("[data-preview]")?.addEventListener("click", () => B.setPreview(!F.preview));
    root.querySelector("[data-fullscreen]")?.addEventListener("click", async () => { close(); await toggleFullscreen(); });
    root.querySelector("[data-save-name]")?.addEventListener("click", async () => { const name = root.querySelector("#s-name").value.trim() || V().listName; if (await act(() => B.saveSettings({ name }), "保存しました")) { S.settings = { ...S.settings, name }; render(); } });
    root.querySelector("[data-theme]").addEventListener("click", () => {
      const r = document.documentElement;
      const dark = r.dataset.theme === "dark" || (!r.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
      r.dataset.theme = dark ? "light" : "dark";
      local.set("theme", r.dataset.theme);
    });
  }

  // 招待リンクから来た人：すでにメンバーなら名前を選び、初めてなら名前を入れて参加する
  function joinSheet(switching = false) {
    const ppl = peopleList();
    const { root, close } = sheet(`${head(switching ? "誰として使いますか？" : `「${esc(S.settings.name)}」に参加`)}
      ${switching ? "" : `<p class="sub" style="margin-top:0">${esc(V().emoji)} ${esc(V().label)}と使う行きたいリストです。名前を入れて参加してください。</p>`}
      <form id="join-form" class="panel">
        <div class="field"><label for="j-name">あなたの名前</label><input id="j-name" required maxlength="20" placeholder="例: さくら" autocomplete="nickname"></div>
        <button class="btn rose block">${switching ? "新しいメンバーとして参加" : "参加する"}</button>
      </form>
      ${ppl.length ? `<div class="label">すでにメンバーの人はこちら</div><div class="chips wrap-chips">${ppl.map((p) => `<button class="chip" data-me="${esc(p.id)}">${av(p.id, "xs")}${esc(p.name)}</button>`).join("")}</div>` : ""}`);
    root.addEventListener("click", (e) => { const b = e.target.closest("[data-me]"); if (!b) return; B.setMe(b.dataset.me); close(); toast(`${person(b.dataset.me).name}さん、おかえりなさい`); render(); });
    root.querySelector("#join-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = root.querySelector("#j-name").value.trim();
      if (!name) return;
      const m = await act(() => B.join(name));
      if (m) { close(); toast(`${name}さん、ようこそ`); render(); }
    });
    setTimeout(() => root.querySelector("#j-name")?.focus(), 80);
  }

  // 誰と使うかを選ぶ（アーティファクト版で最初に開いた人用）
  function typeSheet() {
    const { root, close } = sheet(`${head("誰と使いますか？")}<p class="sub" style="margin-top:0">あとから設定で変えられます。</p>
      <div class="type-grid">${Object.entries(GROUP_TYPES).map(([k, t]) => `<button class="type-tile" data-type="${k}"><span class="emoji">${t.emoji}</span><b>${esc(t.label)}</b><small>${esc(t.desc)}</small></button>`).join("")}</div>`);
    root.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-type]");
      if (!b) return;
      const t = GROUP_TYPES[b.dataset.type];
      const patch = { type: b.dataset.type, ...(S.settings.name === "行きたいリスト" || !S.settings.name ? { name: t.listName } : {}) };
      if (await act(() => B.saveSettings(patch))) { S.settings = { ...S.settings, ...patch }; close(); render(); }
    });
  }

  // 部屋（リスト）の切り替え・新規作成・招待コードで参加
  function openLists() {
    if (!isLeader()) return openMembers(); // ゲストは1つの部屋だけ
    const lists = B.lists();
    const row = (l) => {
      const t = GROUP_TYPES[l.type] || GROUP_TYPES.friends;
      const mem = l.members || [];
      const inner = `<span class="ph" style="width:44px;height:44px;font-size:22px;--tint:${TINT.other}">${t.emoji}</span>
        <span style="min-width:0"><b>${esc(l.name)}</b><div class="sub">${esc(t.label)}${l.count != null ? ` ・ ${l.count}件` : ""}${mem.length ? ` ・ ${mem.length}人` : ""}</div>
          ${mem.length ? `<span class="g-members">${mem.slice(0, 6).map(avOf).join("")}${mem.length > 6 ? `<span class="av xs more">+${mem.length - 6}</span>` : ""}<span class="g-names">${esc(mem.slice(0, 4).map((m) => (m.id === me() ? "あなた" : m.name || "メンバー")).join("・"))}${mem.length > 4 ? " ほか" : ""}</span></span>` : ""}</span>
        ${l.current ? `<span class="tag plan">表示中</span>` : l.leader && l.leader === me() ? `<span class="tag match">👑</span>` : ""}`;
      const style = "text-decoration:none;color:inherit;grid-template-columns:44px 1fr auto;align-items:center;width:100%;border:0;background:none;text-align:left;font:inherit";
      return l.url ? `<a class="memory" href="${esc(l.url)}" style="${style}">${inner}</a>` : `<button class="memory" data-gid="${esc(l.id)}" style="${style}">${inner}</button>`;
    };
    const { root, close } = sheet(`${head("部屋")}
      <p class="sub" style="margin-top:0">恋人用・友達用・家族用など、相手ごとに部屋を分けられます。招待コードは部屋ごとに別です。</p>
      <div class="panel" style="padding:6px 14px">${lists.map(row).join("")}</div>
      <button class="btn line block" style="margin-top:10px" data-see-members>${ic("users", "sm")}表示中の部屋のメンバーを見る（${peopleList().length}人）</button>
      ${isLeader() ? `<div class="label">新しい部屋を作る</div>
      ${B.kind === "artifact" ? `<div class="type-grid compact">${Object.entries(GROUP_TYPES).map(([k, t]) => `<button class="type-tile" data-newtype="${k}"><span class="emoji">${t.emoji}</span>${esc(t.label)}</button>`).join("")}</div>
        <form id="new-group" hidden style="margin-top:8px"><div style="display:flex;gap:6px"><input id="ng-name" maxlength="40" required style="flex:1;min-width:0;border:1.5px solid var(--line);border-radius:12px;padding:10px 12px;background:var(--surface)"><button class="btn rose">作る</button></div></form>`
        : `<a class="btn rose block" href="${esc(B.newListUrl())}">${ic("plus", "sm")}新しい部屋を作る</a>`}` : `<p class="sub" style="margin-top:12px">新しい部屋は、リーダーが作って招待してくれます。</p>`}
      ${B.kind === "artifact" ? ""
        : F.codes ? `<div class="label">招待コードで参加する</div>
        <form id="join-code"><div style="display:flex;gap:6px"><input id="jc" maxlength="12" placeholder="例: K7M2QX" autocomplete="off" style="flex:1;min-width:0;border:1.5px solid var(--line);border-radius:12px;padding:10px 12px;background:var(--surface);text-transform:uppercase;letter-spacing:.15em;font-weight:700"><button class="btn line">参加</button></div>
        <p class="sub" id="jc-status" style="margin:6px 0 0">誘ってくれた人から聞いた6文字のコードを入れてください。</p></form>` : ""}`);
    let newType = null;
    root.addEventListener("click", async (e) => {
      if (e.target.closest("[data-see-members]")) return openMembers();
      if (e.target.closest("[data-join-another]")) { close(); return joinAnother(); }
      const g = e.target.closest("[data-gid]");
      if (g) { if (g.dataset.gid !== lists.find((l) => l.current)?.id) { close(); await act(() => B.openList(g.dataset.gid)); } return; }
      const t = e.target.closest("[data-newtype]");
      if (t) {
        newType = t.dataset.newtype;
        root.querySelectorAll("[data-newtype]").forEach((b) => b.classList.toggle("on", b === t));
        const f = root.querySelector("#new-group"); f.hidden = false;
        const inp = root.querySelector("#ng-name"); inp.value = GROUP_TYPES[newType].listName; inp.focus(); inp.select();
      }
    });
    root.querySelector("#new-group")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = root.querySelector("#ng-name").value.trim();
      if (!name || !newType) return;
      e.submitter && (e.submitter.disabled = true);
      close();
      if (await act(() => B.createList({ type: newType, name }))) toast(`「${name}」を作りました。設定の「招待」から招待コードを送れます`);
    });
    root.querySelector("#join-code")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const st = root.querySelector("#jc-status");
      st.innerHTML = `<span class="thinking"><span class="spinner"></span>探しています…</span>`;
      try { const g = await B.joinByCode(root.querySelector("#jc").value); close(); if (g?.name) toast(`「${g.name}」に参加しました`); }
      catch (err) { st.textContent = err?.message || "参加できませんでした"; }
    });
    return root;
  }

  // ---------- 入口：招待コード → 部屋の確認 → ロゴ → 基本情報 → 使い方 → ホーム ----------
  // リーダー（アーティファクトの持ち主）は部屋を作って招待する人。ゲストは招待コードで入る
  const isLeader = () => F.leader !== false;
  let loadedWait = [];
  const whenLoaded = () => (S.loaded ? Promise.resolve() : new Promise((ok) => loadedWait.push(ok)));
  function screen(html) {
    document.querySelector(".gate")?.remove();
    const el = document.createElement("div");
    el.className = "gate";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.innerHTML = `${F.preview ? `<div class="preview-bar">ゲスト画面のプレビュー中<button data-exit-preview>終わる</button></div>` : ""}<div class="welcome">${html}</div>`;
    el.querySelector("[data-exit-preview]")?.addEventListener("click", () => B.setPreview(false));
    document.body.append(el);
    el.scrollTop = 0;
    return el;
  }
  const closeScreen = () => document.querySelector(".gate")?.remove();
  const steps = (n, all = 5) => `<div class="steps-bar">${Array.from({ length: all }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</div>`;

  // 1. 招待コード
  function codeStep(onJoined, { first = true, msg = "" } = {}) {
    const el = screen(`${steps(1)}
      <h1>招待コードを入力</h1>
      <p>招待してくれた人（リーダー）から届いた、6文字のコードを入れてください。</p>
      ${B.readOnly ? `<div class="notice warn" style="text-align:left">いまは見るだけの権限で開いています。参加するには、リーダーに共有メニューから<b>メールで「編集者」として招待</b>してもらってください。</div>` : ""}
      <form id="gate-code">
        <input id="gate-code-in" class="code-in" maxlength="8" placeholder="K7M2QX" autocomplete="off" autocapitalize="characters" aria-label="招待コード" spellcheck="false">
        <p class="sub" id="gate-st" role="status" style="min-height:1.5em;margin:8px 0">${esc(msg)}</p>
        <button class="btn rose block">次へ</button>
      </form>
      ${first ? "" : `<p class="sub" style="margin-top:14px"><a href="#" data-back>もどる</a></p>`}`);
    const inp = el.querySelector("#gate-code-in");
    inp.addEventListener("input", () => { const v = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); if (v !== inp.value) inp.value = v; });
    el.querySelector("#gate-code").addEventListener("submit", async (e) => {
      e.preventDefault();
      const st = el.querySelector("#gate-st");
      const btn = el.querySelector("#gate-code button");
      btn.disabled = true;
      st.innerHTML = `<span class="thinking"><span class="spinner"></span>部屋を探しています…</span>`;
      try { roomStep(await B.peekCode(inp.value), onJoined); }
      catch (err) { st.textContent = err?.message || "見つかりませんでした"; btn.disabled = false; }
    });
    el.querySelector("[data-back]")?.addEventListener("click", (e) => { e.preventDefault(); closeScreen(); });
    setTimeout(() => inp.focus(), 60);
  }
  // 2. 部屋の確認
  function roomStep(info, onJoined) {
    const t = GROUP_TYPES[info.type] || GROUP_TYPES.friends;
    const others = info.members.filter((m) => !m.leader);
    const el = screen(`${steps(2)}
      <h1>この部屋に参加しますか？</h1>
      <div class="room-card">
        <span class="room-emoji">${t.emoji}</span>
        <b class="room-name">${esc(info.name)}</b>
        <span class="tag">${esc(t.label)}と使う部屋</span>
        ${info.leader ? `<div class="room-leader">${avOf(info.leader)}<span><small>リーダー</small>${esc(info.leader.name)}</span></div>` : ""}
        <div class="room-members">${others.length ? `${others.slice(0, 8).map(avOf).join("")}<span class="sub">${others.length}人が参加中</span>` : `<span class="sub">あなたが最初のメンバーです</span>`}</div>
      </div>
      ${info.joined ? `<p class="sub">この部屋にはもう参加しています。</p>` : ""}
      <div class="actions" style="justify-content:center"><button class="btn line" data-redo>コードを入れ直す</button><button class="btn rose" data-ok>OK、次へ</button></div>`);
    el.querySelector("[data-redo]").addEventListener("click", () => codeStep(onJoined, { first: !S.loaded }));
    el.querySelector("[data-ok]").addEventListener("click", async (e) => {
      e.target.disabled = true;
      if (isLeader()) { if (await act(() => B.joinRoom(info.id))) onJoined(info); else e.target.disabled = false; return; }
      try { await B.requestJoin(info.id); waitingStep(info, onJoined); }
      catch (err) {
        e.target.disabled = false;
        if (err?.code === "invalid_argument" || B.readOnly) permStep(info, onJoined);
        else toast(err?.message || "申請できませんでした。もう一度試してください");
      }
    });
  }
  // 書き込みの権限がないとき：原因と直し方を出す（リンク公開中は、メールで招待した人も見るだけになる）
  async function permStep(info, onJoined) {
    const who = await B.viewerName?.().catch(() => "") || "";
    const el = screen(`${steps(2)}
      <div class="wait-art"><span class="room-emoji">🔒</span></div>
      <h1>まだ参加できません</h1>
      <p>このアカウントには、まだ書き込みの権限がありません。リーダーに次の2つを確かめてもらってください。</p>
      <ol class="perm-list">
        <li><b>リンクでの公開をオフにする</b><span>右上の「共有」で「リンクを知っている人」がオンだと、メールで招待した人も「見るだけ」になります。</span></li>
        <li><b>あなたのメールアドレスを「編集者」で招待する</b><span>「閲覧者」「コメント可」では参加できません。</span></li>
      </ol>
      <p class="sub">${who ? `いま「${esc(who)}」のアカウントで開いています。` : ""}招待されたメールアドレスのアカウントでサインインしているかも確かめてください。設定が変わったら、このページを開き直してください。</p>
      <button class="btn rose block" data-reload style="margin-top:14px">開き直す</button>
      <p class="sub" style="margin-top:14px"><a href="#" data-redo>招待コードを入れ直す</a></p>`);
    el.querySelector("[data-reload]").addEventListener("click", () => location.reload());
    el.querySelector("[data-redo]").addEventListener("click", (ev) => { ev.preventDefault(); codeStep(onJoined); });
    void info;
  }
  // 2'. リーダーの承認待ち（承認されると自動で次へ）
  function waitingStep(info, onJoined) {
    const t = GROUP_TYPES[info.type] || GROUP_TYPES.friends;
    const el = screen(`${steps(2)}
      <div class="wait-art"><span class="room-emoji">${t.emoji}</span><span class="spinner big"></span></div>
      <h1>リーダーの承認を待っています</h1>
      <p>「${esc(info.name)}」への参加を申請しました。${info.leader ? `リーダーの${esc(info.leader.name)}さん` : "リーダー"}が承認すると、自動で次に進みます。この画面は閉じても大丈夫です。</p>
      ${F.preview ? `<button class="btn rose block" data-preview-ok style="margin-top:18px">（プレビュー）承認されたことにして進む</button>` : ""}
      <p class="sub" style="margin-top:18px"><a href="#" data-redo>別の招待コードを入れる</a></p>`);
    let stop = () => {};
    const proceed = async () => { stop(); if (await act(() => B.joinRoom(info.id))) onJoined(info); };
    stop = B.waitApproval((result) => { if (result === "approved") proceed(); else declinedStep(info, onJoined); }) || (() => {});
    el.querySelector("[data-preview-ok]")?.addEventListener("click", () => { B.previewApprove(); proceed(); });
    el.querySelector("[data-redo]").addEventListener("click", (e) => { e.preventDefault(); stop(); codeStep(onJoined); });
  }
  function declinedStep(info, onJoined) {
    const el = screen(`${steps(2)}
      <div class="wait-art"><span class="room-emoji">🙏</span></div>
      <h1>今回は参加が見送られました</h1>
      <p>「${esc(info.name)}」のリーダーが、今回は参加を見送りました。コードが合っているか、リーダーに確かめてみてください。</p>
      <button class="btn rose block" data-redo style="margin-top:18px">招待コードを入れ直す</button>`);
    el.querySelector("[data-redo]").addEventListener("click", () => codeStep(onJoined));
  }
  // リーダーの部屋がひとつもないとき：新しい部屋を作る
  function createRoomStep(done) {
    let type = null;
    const el = screen(`<h1>新しい部屋を作りましょう</h1><p>誰と使う部屋ですか？ 作ったあと、招待コードで友人を招待できます。</p>
      <div class="type-grid" style="margin-top:16px">${Object.entries(GROUP_TYPES).map(([k, t]) => `<button class="type-tile" data-type="${k}"><span class="emoji">${t.emoji}</span><b>${esc(t.label)}</b><small>${esc(t.desc)}</small></button>`).join("")}</div>
      <form id="cr-form" hidden style="margin-top:14px"><div class="field"><label for="cr-name">部屋の名前</label><input id="cr-name" required maxlength="40"></div><button class="btn rose block">作る</button></form>`);
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-type]");
      if (!b) return;
      type = b.dataset.type;
      el.querySelectorAll("[data-type]").forEach((x) => x.classList.toggle("on", x === b));
      const f = el.querySelector("#cr-form"); f.hidden = false;
      const inp = el.querySelector("#cr-name"); inp.value = GROUP_TYPES[type].listName; inp.focus(); inp.select();
    });
    el.querySelector("#cr-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = el.querySelector("#cr-name").value.trim();
      if (!name || !type) return;
      e.submitter && (e.submitter.disabled = true);
      if (await act(() => B.createList({ type, name }))) { closeScreen(); done(); toast(`「${name}」を作りました。設定の「招待」から招待コードを送れます`); }
      else if (e.submitter) e.submitter.disabled = false;
    });
  }
  // ゲストの入口：申請の状態に合わせて始める
  async function guestGate(onJoined) {
    const stage = B.joinStage?.() || "code";
    if (stage === "code") return codeStep(onJoined);
    const req = B.pendingRequest();
    const info = await B.describeRoom(req.room).catch(() => null);
    if (!info) return codeStep(onJoined);
    if (stage === "waiting") return waitingStep(info, onJoined);
    declinedStep(info, onJoined);
  }
  // 3. ロゴ・アプリ名・キャッチフレーズ
  function splashStep(next, n = 3, all = 5) {
    const el = screen(`${steps(n, all)}
      <div class="splash">${LOGO}<b class="splash-name">Spotrip</b><p class="splash-catch">行きたい場所、もう忘れない。</p>
      <p>SNSで見つけた「ここ行きたい！」をみんなで貯めて、次の「どこいく？」にすぐ答えられるアプリです。</p></div>
      <button class="btn rose block" data-next>はじめる</button>`);
    el.querySelector("[data-next]").addEventListener("click", next);
  }
  // （リーダーだけ）部屋のジャンル
  function typeStep(next) {
    const el = screen(`<h1>誰と使いますか？</h1><p>この部屋のジャンルです。あとから設定で変えられます。</p>
      <div class="type-grid" style="margin-top:16px">${Object.entries(GROUP_TYPES).map(([k, t]) => `<button class="type-tile" data-type="${k}"><span class="emoji">${t.emoji}</span><b>${esc(t.label)}</b><small>${esc(t.desc)}</small></button>`).join("")}</div>`);
    el.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-type]");
      if (!b) return;
      const t = GROUP_TYPES[b.dataset.type];
      const patch = { type: b.dataset.type, ...(S.settings.name === "行きたいリスト" || !S.settings.name ? { name: t.listName } : {}) };
      if (await act(() => B.saveSettings(patch))) { S.settings = { ...S.settings, ...patch }; render(); next(); }
    });
  }
  // 4. 名前・アイコン・テーマカラー・出発地
  async function profileStep(next, n = 4, all = 5) {
    await whenLoaded();
    const mine = person(me());
    // ここで選んだ内容は「次へ」でまとめて保存する（設定画面で変えられるものは全部ここで決められる）
    let avatar = mine.avatar || "";
    let accent = local.get("accent", "") || "#df4a72";
    let theme = local.get("theme", null) || "auto";
    const added = [];
    const roomBases = S.settings.bases || [];
    const el = screen(`${steps(n, all)}
      <h1>あなたの設定</h1><p>設定画面で変えられることは、ここで全部決められます。あとからいつでも変えられます。</p>
      <form id="gate-prof">
        <div class="set-sec"><b class="set-h">${ic("users", "sm")}名前とアイコン</b>
          <div class="prof-top"><span class="av lg" id="gp-av" style="background:${esc(mine.color || "#9a8a8f")}"></span>
            <div class="field" style="flex:1;margin:0"><label for="gp-name">名前（ニックネーム）</label><input id="gp-name" required maxlength="20" value="${esc(mine.name || "")}" placeholder="例: はるか" autocomplete="nickname"></div></div>
          <div class="emoji-row">${["", ...AVATAR_EMOJI].map((x) => `<button type="button" data-emo="${x}" class="${(x ? `emoji:${x}` : "") === avatar ? "on" : ""}" aria-label="${x || "名前の頭文字"}">${x || "Aa"}</button>`).join("")}</div>
          <label class="btn sm line" for="gp-photo" style="margin-top:8px">${ic("image", "sm")}写真をアイコンにする<input id="gp-photo" type="file" accept="image/*" hidden></label></div>
        <div class="set-sec"><b class="set-h">${ic("sparkle", "sm")}テーマカラー</b>
          <div class="swatches">${ACCENTS.map(([hex, label]) => `<button type="button" class="swatch ${accent === hex ? "on" : ""}" style="--sw:${hex}" data-accent="${hex}" aria-label="${label}"><i></i><small>${label}</small></button>`).join("")}
            <label class="swatch custom" aria-label="好きな色"><input type="color" id="gp-accent" value="${esc(accent)}"><small>好きな色</small></label></div></div>
        <div class="set-sec"><b class="set-h">${ic("help", "sm")}表示テーマ</b>
          <div class="seg full">${[["auto", "端末に合わせる"], ["light", "ライト"], ["dark", "ダーク"]].map(([k, l]) => `<button type="button" data-th="${k}" class="${theme === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
        <div class="set-sec"><b class="set-h">${ic("home", "sm")}出発地（いくつでも・任意）</b>
          <span class="sub">家・職場・よく集まる駅など。移動時間やデートコースの交通費の計算に使います。出発地は部屋のみんなで共有されます。</span>
          ${roomBases.length ? `<div class="sub" style="margin-top:6px">この部屋の出発地: ${roomBases.map((b) => esc(b.label)).join("・")}</div>` : ""}
          <div id="gp-bases"></div>
          <div class="row2" style="margin:8px 0 0"><div class="field" style="margin:0"><label for="gp-label">名前</label><input id="gp-label" value="自宅" maxlength="20"></div><div class="field" style="margin:0"><label for="gp-where">場所</label><input id="gp-where" placeholder="駅名・住所など"></div></div>
          <button type="button" class="btn sm line" data-add-base style="margin-top:8px">${ic("plus", "sm")}出発地を追加</button>
          <p class="sub" id="gp-bst" role="status" style="min-height:1.2em;margin:6px 0 0"></p></div>
        ${canFullscreen() ? `<div class="set-sec"><b class="set-h">${ic("grid", "sm")}全画面</b><button type="button" class="btn sm line" data-fs>${isFullscreen() ? "全画面をやめる" : "全画面で表示"}</button></div>` : ""}
        <p class="sub" id="gp-st" role="status" style="min-height:1.4em"></p>
        ${F.preview ? `<p class="sub">プレビュー中なので、名前・アイコン・出発地は保存しません（色と表示テーマはこの端末に保存されます）。</p>` : ""}
        <button class="btn rose block">次へ</button>
      </form>`);
    const drawAv = () => {
      const a = el.querySelector("#gp-av");
      const nm = el.querySelector("#gp-name").value || "?";
      a.classList.toggle("is-emoji", avatar.startsWith("emoji:"));
      a.innerHTML = avatar.startsWith("emoji:") ? `<span class="emo">${esc(avatar.slice(6))}</span>` : avatar ? `<img src="${esc(avatar)}" alt="">` : esc([...nm][0]);
    };
    const drawBases = () => {
      el.querySelector("#gp-bases").innerHTML = added.map((b, i) => `<div class="base-item" style="margin:8px 0 0">${ic("home", "sm")}<div class="val"><b>${esc(b.label)}</b><div class="sub">${esc(b.address)}</div></div><button type="button" class="btn sm danger" data-del-b="${i}">外す</button></div>`).join("");
    };
    const setAccent = (hex) => { accent = hex; el.querySelectorAll("[data-accent]").forEach((b) => b.classList.toggle("on", b.dataset.accent === hex)); applyAccent(hex === "#df4a72" ? "" : hex); };
    const setTheme = (k) => { theme = k; el.querySelectorAll("[data-th]").forEach((b) => b.classList.toggle("on", b.dataset.th === k)); if (k === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = k; };
    drawAv();
    el.querySelector("#gp-name").addEventListener("input", drawAv);
    el.addEventListener("click", async (e) => {
      const em = e.target.closest("[data-emo]");
      if (em) { avatar = em.dataset.emo ? `emoji:${em.dataset.emo}` : ""; el.querySelectorAll("[data-emo]").forEach((b) => b.classList.toggle("on", b === em)); drawAv(); }
      const ac = e.target.closest("[data-accent]");
      if (ac) setAccent(ac.dataset.accent);
      const th = e.target.closest("[data-th]");
      if (th) setTheme(th.dataset.th);
      const del = e.target.closest("[data-del-b]");
      if (del) { added.splice(Number(del.dataset.delB), 1); drawBases(); }
      if (e.target.closest("[data-fs]")) { await toggleFullscreen(); e.target.closest("[data-fs]").textContent = isFullscreen() ? "全画面をやめる" : "全画面で表示"; }
      if (e.target.closest("[data-add-base]")) await addBase();
    });
    el.querySelector("#gp-accent").addEventListener("input", (e) => setAccent(e.target.value));
    el.querySelector("#gp-photo").addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try { avatar = await shrinkPhoto(f); el.querySelectorAll("[data-emo]").forEach((b) => b.classList.remove("on")); drawAv(); } catch { toast("この写真は使えませんでした"); }
    });
    // 出発地：書いた場所の位置を探して、一覧に足す
    const addBase = async () => {
      const st = el.querySelector("#gp-bst");
      const where = el.querySelector("#gp-where").value.trim();
      const label = el.querySelector("#gp-label").value.trim() || "自宅";
      if (!where) { st.textContent = "場所（駅名・住所など）を入れてください"; return false; }
      st.innerHTML = `<span class="thinking"><span class="spinner"></span>位置を探しています</span>`;
      const pos = await B.locate(where).catch(() => null);
      if (!pos) { st.textContent = "位置が見つかりませんでした。別の書き方で試してください"; return false; }
      added.push({ label, address: /^https?:/.test(where) ? "" : where, lat: pos.lat, lng: pos.lng });
      el.querySelector("#gp-where").value = "";
      el.querySelector("#gp-label").value = "";
      st.textContent = `「${label}」を追加しました`;
      drawBases();
      return true;
    };
    el.querySelector("#gp-where").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addBase(); } });
    el.querySelector("#gate-prof").addEventListener("submit", async (e) => {
      e.preventDefault();
      const st = el.querySelector("#gp-st");
      const btn = e.target.querySelector("button.rose.block");
      const name = el.querySelector("#gp-name").value.trim();
      if (!name) { st.textContent = "名前を入れてください"; el.querySelector("#gp-name").focus(); return; }
      btn.disabled = true;
      // 書きかけの出発地も追加する
      if (el.querySelector("#gp-where").value.trim() && !(await addBase())) { btn.disabled = false; return; }
      local.set("accent", accent === "#df4a72" ? "" : accent);
      local.set("theme", theme === "auto" ? null : theme);
      if (!F.preview) {
        st.innerHTML = `<span class="thinking"><span class="spinner"></span>保存しています</span>`;
        if (name !== mine.name && !(await act(() => B.renameMember(me(), name)))) { btn.disabled = false; return; }
        if (avatar !== (mine.avatar || "") && (avatar || (mine.avatar || "").startsWith("emoji:") || (mine.avatar || "").startsWith("data:"))) await act(() => B.setAvatar(me(), avatar));
        if (added.length) {
          const cur = S.settings.bases || [];
          const fresh = added.map((b, i) => ({ ...b, id: `b${Date.now().toString(36)}${i}`, label: cur.some((c) => c.label === b.label) ? `${name}の${b.label}` : b.label }));
          const bases = [...cur, ...fresh];
          if (await act(() => B.saveSettings({ bases }))) { S.settings = { ...S.settings, bases }; S.baseId = fresh[0].id; local.set("baseId", fresh[0].id); }
        }
      }
      next();
    });
    setTimeout(() => el.querySelector("#gp-name")?.focus(), 60);
  }
  // 5. 使い方 → ホーム
  function tourStep() {
    closeScreen();
    showOnboarding(() => { local.set(F.preview ? "onboardedPreview" : "onboarded", true); render(); toast(`ようこそ、「${S.settings.name}」へ`); });
  }
  // コードから来たときは「コード・部屋の確認」が済んでいるので 3/5 から
  function runSetup({ fromCode = false } = {}) {
    const all = fromCode ? 5 : 3, off = fromCode ? 0 : 2;
    splashStep(async () => {
      const toProfile = () => profileStep(tourStep, 4 - off, all);
      if (isLeader() && !S.settings.type) { await whenLoaded(); return typeStep(toProfile); }
      toProfile();
    }, 3 - off, all);
  }
  // リーダー：参加申請の通知。ゲスト：承認が取り消されたら知らせる
  S.notices = { pending: [], approved: [] };
  function startWatches() {
    let known = null;
    B.watchNotices?.((n) => {
      const ids = new Set(n.pending.map((r) => r.id));
      if (known) for (const r of n.pending) if (!known.has(r.id)) toast(`${r.name}さんが「${r.roomName}」への参加を申請しています`);
      known = ids;
      S.notices = n;
      updateBell();
      if ($modal.querySelector("[data-notices]")) openNotices();
    });
    B.watchMyApproval?.((why) => {
      $modal.innerHTML = "";
      const el = screen(why === "deleted"
        ? `<div class="wait-art"><span class="room-emoji">🏠</span></div><h1>部屋がなくなりました</h1><p>リーダーが「${esc(S.settings.name)}」を削除したため、この部屋から自動で抜けました。新しい部屋に招待されたら、招待コードを入れてください。</p>`
        : `<div class="wait-art"><span class="room-emoji">🚪</span></div><h1>部屋から抜けました</h1><p>リーダーがあなたを「${esc(S.settings.name)}」から外したため、自動で抜けました。もう一度参加するには、招待コードを入れて申請してください。</p>`);
      el.querySelector(".welcome").insertAdjacentHTML("beforeend", `<button class="btn rose block" data-again style="margin-top:18px">招待コードを入れる</button>`);
      el.querySelector("[data-again]").addEventListener("click", () => location.reload());
    });
  }
  // ---------- 通知（ベル） ----------
  // 自分が見つけた場所への「行きたい／まあまあ」、ほかの人のコメントとメモを通知する（新しい場所の追加は通知しない）
  const seenKey = () => `noticeSeen.${B.currentRoom?.() || S.settings.code || "room"}`;
  function activity() {
    const out = [];
    for (const it of S.spots) {
      if (it.addedBy === me()) {
        for (const [id, v] of Object.entries(votes(it))) {
          const at = it.voteAt?.[id];
          if (id !== me() && at && (v === true || v === "no")) out.push({ type: v === true ? "yes" : "no", by: id, at, spot: it, reason: it.reasons?.[id] });
        }
      }
      for (const c of it.comments || []) if (c.by && c.by !== me() && c.at) out.push({ type: "comment", by: c.by, at: c.at, spot: it, text: c.text });
      if (it.memoBy && it.memoBy !== me() && it.memoAt && it.memo) out.push({ type: "memo", by: it.memoBy, at: it.memoAt, spot: it, text: it.memo });
    }
    return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50);
  }
  const unreadCount = () => { const seen = local.get(seenKey(), ""); return activity().filter((x) => x.at > seen).length + (S.notices?.pending.length || 0); };
  const bellInner = () => { const n = unreadCount(); return `${ic("bell")}${n ? `<span class="badge num">${n > 99 ? "99+" : n}</span>` : ""}`; };
  function updateBell() { const b = document.querySelector("[data-act=notices]"); if (b) b.innerHTML = bellInner(); }
  function openNotices() {
    const n = S.notices || { pending: [], approved: [] };
    const seen = local.get(seenKey(), "");
    const items = activity();
    const time = (iso) => (iso ? relativeDate(iso) : "");
    const person2 = (x) => avOf({ id: x.id, name: x.name, color: x.color, avatar: x.avatar });
    const line = (x) => {
      const who = esc(pname(x.by)), place = `「${esc(nameOf(x.spot))}」`;
      if (x.type === "yes") return `${who}が${place}を<b class="t-yes">♡ 行きたい</b>にしました`;
      if (x.type === "no") return `${who}が${place}を<b class="t-no">まあまあ</b>にしました${MEH[x.reason] ? `（${MEH[x.reason].emoji} ${esc(MEH[x.reason].label)}）` : ""}`;
      if (x.type === "comment") return `${who}が${place}にコメント：<span class="t-quote">${esc(String(x.text || "").slice(0, 60))}</span>`;
      return `${who}が${place}にメモ：<span class="t-quote">${esc(String(x.text || "").slice(0, 60))}</span>`;
    };
    const leaderPart = isLeader() && B.kind === "artifact" ? `
      <div class="label" style="margin-top:0">参加の申請 ${n.pending.length ? `<span class="badge-inline num">${n.pending.length}</span>` : ""}</div>
      ${n.pending.length ? `<div class="panel" style="padding:4px 14px">${n.pending.map((r) => `<div class="notice-row">
          ${person2(r)}<div class="val"><b>${esc(r.name)}</b><div class="sub">「${esc(r.roomName)}」に参加したい ・ ${esc(time(r.at))}</div></div>
          <div class="notice-acts"><button class="btn sm line" data-decline="${esc(r.id)}" data-room="${esc(r.room)}">見送る</button><button class="btn sm rose" data-approve="${esc(r.id)}" data-room="${esc(r.room)}">承認</button></div></div>`).join("")}</div>`
        : `<p class="sub" style="margin:0 2px 8px">いま届いている申請はありません。</p>`}` : "";
    const unread = items.filter((x) => x.at > seen).length;
    const { root } = sheet(`<div data-notices>${head("通知")}
      ${leaderPart}
      <div class="label"${leaderPart ? "" : ` style="margin-top:0"`}>お知らせ ${unread ? `<span class="badge-inline num">${unread}</span>` : ""}</div>
      ${items.length ? `<div class="panel" style="padding:4px 14px">${items.map((x) => `<button class="act-row ${x.at > seen ? "unread" : ""}" data-open-spot="${esc(x.spot.id)}">
          ${av(x.by, "xs")}<span class="val"><span class="act-line">${line(x)}</span><span class="sub">${esc(time(x.at))}</span></span>${x.at > seen ? `<i class="new-dot" aria-label="未読"></i>` : ""}</button>`).join("")}</div>`
        : `<p class="sub" style="margin:0 2px">まだお知らせはありません。あなたが見つけた場所に「行きたい」「まあまあ」が付いたときや、コメント・メモが書かれたときに届きます。</p>`}
      ${isLeader() && B.kind === "artifact" ? `<div class="label">参加中のゲスト</div>
      ${n.approved.length ? `<div class="panel" style="padding:4px 14px">${n.approved.map((a) => `<div class="notice-row">
          ${person2(a)}<div class="val"><b>${esc(a.name)}</b><div class="sub">「${esc(a.roomName)}」 ・ ${esc(time(a.at))}に承認</div></div>
          <div class="notice-acts"><button class="btn sm line" data-revoke="${esc(a.id)}" data-room="${esc(a.room)}" data-name="${esc(a.name)}">外す</button></div></div>`).join("")}</div>`
        : `<p class="sub" style="margin:0 2px">まだ承認したゲストはいません。</p>`}` : ""}</div>`);
    // 開いたら既読にする（一覧の「未読」の印はこの画面を開いている間は残す）
    if (items.length) local.set(seenKey(), items[0].at > new Date().toISOString() ? items[0].at : new Date().toISOString());
    updateBell();
    root.addEventListener("click", async (e) => {
      const sp = e.target.closest("[data-open-spot]");
      if (sp) return openDetail(sp.dataset.openSpot);
      const ap = e.target.closest("[data-approve]"), de = e.target.closest("[data-decline]"), rv = e.target.closest("[data-revoke]");
      if (ap) { ap.disabled = true; if (await act(() => B.approve(ap.dataset.approve, ap.dataset.room), "承認しました")) return; ap.disabled = false; }
      if (de && await confirmBox({ title: "参加を見送りますか？", text: "この人には「今回は参加が見送られました」と表示されます。", ok: "見送る", danger: true })) act(() => B.decline(de.dataset.decline, de.dataset.room), "見送りました");
      if (rv && await confirmBox({ title: `${rv.dataset.name}さんを部屋から外しますか？`, text: "外すと、この人は自動で部屋から抜けます。追加したスポットは残ります。", ok: "外す", danger: true })) act(() => B.revoke(rv.dataset.revoke, rv.dataset.room), "外しました");
    });
  }

  // ほかの部屋の招待コードで参加する（部屋の一覧から）
  function joinAnother() {
    codeStep((info) => { closeScreen(); toast(`「${info.name}」に参加しました`); }, { first: false });
  }

  function firstRun() {
    // Webアプリ版：使い方 → 名前を入れて参加
    if (B.kind !== "artifact") {
      const next = () => { if (F.members && !me()) joinSheet(); };
      if (!local.get("onboarded", false)) return showOnboarding(() => { local.set("onboarded", true); next(); });
      return next();
    }
    if (!local.get(F.preview ? "onboardedPreview" : "onboarded", false)) return runSetup();
    if (isLeader() && !S.settings.type) typeSheet();
  }

  // ---------- 画面遷移・イベント ----------
  function go(view) { S.view = view; local.set("view", view); render(); window.scrollTo({ top: 0 }); }

  $app.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-act],[data-view],[data-seg],[data-like],[data-open],[data-vote],[data-pstyle],[data-pstops],[data-pdate],[data-pbudget],[data-parea],[data-pmood],[data-take],[data-genre],[data-ptab],[data-cal],[data-day]");
    if (!t) return;
    if (t.dataset.like) { e.stopPropagation(); const it = S.spots.find((s) => s.id === t.dataset.like); return vote(it.id, myVote(it) === true ? null : true); }
    if (t.dataset.vote) { const it = S.spots.find((s) => s.id === $("swipe")?.dataset.id); return it && decide(it, t.dataset.vote); }
    if (t.dataset.open) return openDetail(t.dataset.open);
    if (t.dataset.genre !== undefined) { S.f.genres = t.dataset.genre ? new Set([t.dataset.genre]) : new Set(); return renderView(); }
    if (t.dataset.ptab) { S.planTab = t.dataset.ptab; return renderView(); }
    if (t.dataset.day) { S.calDay = t.dataset.day; return renderView(); }
    if (t.dataset.cal) {
      if (t.dataset.cal === "today") { S.calMonth = ""; S.calDay = ""; return renderView(); }
      const [y, m] = (S.calMonth || todayStr().slice(0, 7)).split("-").map(Number);
      const d = new Date(y, m - 1 + Number(t.dataset.cal), 1);
      S.calMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return renderView();
    }
    if (t.dataset.view) return go(t.dataset.view);
    if (t.dataset.seg) { S.seg = t.dataset.seg; if (S.view !== "home") return go("home"); return renderView(); }
    if (t.dataset.pstyle) { readPlanForm(); S.plan.style = t.dataset.pstyle; S.plan.startTime = ""; return renderView(); }
    if (t.dataset.pstops) { readPlanForm(); S.plan.stops = Number(t.dataset.pstops); if (S.plan.stops >= 6 && !S.plan.startTime && ["afternoon", "evening", "night"].includes(S.plan.style)) S.plan.style = "morning"; return renderView(); }
    if (t.dataset.pdate) { readPlanForm(); [S.plan.dateFrom, S.plan.dateTo] = datePresetRange(t.dataset.pdate); return renderView(); }
    if (t.dataset.parea !== undefined) { readPlanForm(); S.plan.area = S.plan.area === t.dataset.parea ? "" : t.dataset.parea; return renderView(); }
    if (t.dataset.pmood) {
      readPlanForm();
      const m = t.dataset.pmood, list = S.plan.moods;
      if (list.includes(m)) S.plan.moods = list.filter((x) => x !== m);
      else if (list.length >= 3) toast("気分は3つまで選べます");
      else S.plan.moods = [...list, m];
      return renderView();
    }
    if (t.dataset.pbudget) { readPlanForm(); [S.plan.budgetMin, S.plan.budgetMax] = t.dataset.pbudget.split("-"); return renderView(); }
    if (t.dataset.take) {
      const c = S.courses?.[Number(t.dataset.take)];
      if (!c) return;
      const day = c.date || S.plan.dateFrom;
      for (const [i, s] of c.stops.entries()) await B.updateSpot(s.spot.id, { status: "planned", plannedDate: day, planTime: s.arrive, planOrder: i }).catch(() => null);
      S.courses = null;
      toast(`${jpDate(day)}の予定に入れました`);
      return render();
    }
    const a = t.dataset.act;
    if (a === "settings") openSettings();
    if (a === "exit-preview") B.setPreview(false);
    if (a === "notices") openNotices();
    if (a === "lists") openLists();
    if (a === "invite") openInvite();
    if (a === "ask") openAsk();
    if (a === "members") openMembers();
    if (a === "addday") openAddDay();
    if (a === "bases") openSettings("bases");
    if (a === "add") openAdd();
    if (a === "filters") openFilters();
    if (a === "gacha") openGacha();
    if (a === "mode") { S.listMode = S.listMode === "map" ? "grid" : "map"; renderView(); }
    if (a === "clear") { S.f = freshFilters(); S.q = ""; S.seg = "all"; renderView(); }
    if (a === "unskip") { S.skipped.clear(); renderView(); }
    if (a === "pboth") { S.plan.bothOnly = !S.plan.bothOnly; renderView(); }
    if (a === "pnever") { readPlanForm(); S.plan.neverOnly = !S.plan.neverOnly; renderView(); }
    if (a === "build") {
      readPlanForm();
      const P = S.plan;
      S.courses = buildCoursesRange(S.spots, { dateFrom: P.dateFrom, dateTo: P.dateTo || null, stops: P.stops, style: P.style, start: planStart(), budget: P.budgetMax ? Number(P.budgetMax) : null, budgetMin: P.budgetMin ? Number(P.budgetMin) : null, bothOnly: P.bothOnly, peopleCount: Math.max(2, peopleList().length), base: activeBase(), moods: P.moods, area: planArea(), neverOnly: P.neverOnly });
      renderView();
      document.getElementById("courses")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  $app.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches(".card")) openDetail(e.target.dataset.open);
    if (S.view === "match" && !$modal.firstElementChild && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      const it = S.spots.find((s) => s.id === $("swipe")?.dataset.id);
      if (it) decide(it, e.key === "ArrowRight" ? "yes" : "no");
    }
  });
  $app.addEventListener("submit", (e) => {
    if (e.target.id !== "adder") return;
    e.preventDefault();
    const v = $("add-url").value.trim();
    if (!v) return openAdd();
    $("add-url").value = "";
    openAdd(v);
  });
  // コピーしたリンクをどこかで貼り付けたら、そのまま追加画面へ
  $app.addEventListener("paste", (e) => {
    if (e.target.id !== "add-url") return;
    const text = e.clipboardData?.getData("text") || "";
    if (/https?:\/\//.test(text)) { e.preventDefault(); openAdd(text); }
  });
  let qTimer;
  $app.addEventListener("input", (e) => {
    if (e.target.id !== "q") return;
    S.q = e.target.value;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { const pos = e.target.selectionStart; renderView(); const q = $("q"); q?.focus(); q?.setSelectionRange(pos, pos); }, 200);
  });
  $app.addEventListener("change", (e) => {
    if (e.target.id === "group") { S.groupBy = e.target.value; local.set("groupBy", S.groupBy); renderView(); }
    if (e.target.id === "base-select") { S.baseId = e.target.value; local.set("baseId", S.baseId); renderView(); }
    if (["p-from", "p-to", "p-bmin", "p-bmax"].includes(e.target.id)) readPlanForm();
    if (e.target.id === "p-from" || e.target.id === "p-time") { readPlanForm(); renderView(); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $modal.firstElementChild) $modal.innerHTML = ""; });

  // ---------- データの受け取り ----------
  const theme = local.get("theme", null);
  if (theme) document.documentElement.dataset.theme = theme;
  applyAccent(local.get("accent", ""));
  render();
  const boot = () => B.subscribe(({ settings, spots, reset }) => {
    // 部屋を切り替えたときは、前の部屋の状態を持ち越さない
    if (reset) {
      Object.assign(S, { spots: [], q: "", f: freshFilters(), seg: "all", courses: null, openMode: "", calDay: "", skipped: new Set(), routeCache: {} });
      $modal.innerHTML = "";
    }
    const before = new Set(S.spots.map((s) => s.id));
    const wasLoaded = S.loaded && !reset;
    if (settings) S.settings = { name: "行きたいリスト", bases: [], ...settings };
    if (spots) S.spots = spots;
    S.loaded = true;
    if (wasLoaded && spots) {
      void before; // 新しい場所の追加は通知しない（通知はベルにまとめる）
    }
    render();
    refreshDetail();
    if (S.loaded) { loadedWait.forEach((ok) => ok()); loadedWait = []; }
    if (!wasLoaded && !joining) firstRun();
    joining = false;
  });
  // ゲストで、まだどの部屋にも入っていないとき：招待コードから始める
  let joining = false;
  if (B.needsJoin?.() && isLeader()) createRoomStep(() => { boot(); startWatches(); });
  else if (B.needsJoin?.()) guestGate(() => { joining = true; boot(); runSetup({ fromCode: true }); startWatches(); });
  else { boot(); startWatches(); }

  return { openAdd, go, invite: openInvite };
}
