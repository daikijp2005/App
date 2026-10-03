// どこいく — サーバー
// 依存パッケージなしで動く Node.js サーバー（AI解析だけ任意で @anthropic-ai/sdk を使う）。
// データは data/<部屋ID>.json に保存し、変更は SSE で相手の画面にすぐ反映する。

import http from "node:http";
import fs from "node:fs/promises";
import { createReadStream, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { analyzeText, parseFreeform, cleanAiResult, cityFromAddress, GENRES } from "./lib/analyze.js";
import { fetchPreview, cleanCaption, normalizeUrl } from "./lib/preview.js";
import { geocode, geocodePlace } from "./lib/geo.js";
import { aiEnabled, aiExtract, aiAsk, aiRoute } from "./lib/ai.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");
const DATA = process.env.DATA_DIR || path.join(ROOT, "data");
const IMAGES = path.join(DATA, "images");
const PORT = Number(process.env.PORT) || 3000;
mkdirSync(IMAGES, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon",
};

const newId = (n = 10) => crypto.randomBytes(n).toString("base64url").slice(0, n);
const now = () => new Date().toISOString();

// ---------- 保存 ----------
const rooms = new Map(); // id -> room（メモリキャッシュ）
const locks = new Map();

function roomFile(id) {
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(id)) return null;
  return path.join(DATA, `${id}.json`);
}

// グループごとの共有コード（読み間違えやすい 0/O・1/I を使わない6文字）
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const codeIndex = new Map(); // code -> room id
for (const f of (await fs.readdir(DATA).catch(() => [])).filter((x) => x.endsWith(".json"))) {
  try { const r = JSON.parse(await fs.readFile(path.join(DATA, f), "utf8")); if (r.code) codeIndex.set(r.code, r.id); } catch { /* 壊れたファイルは無視 */ }
}
function newCode() {
  for (;;) {
    const c = Array.from(crypto.randomBytes(6), (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
    if (!codeIndex.has(c)) return c;
  }
}

async function loadRoom(id) {
  if (rooms.has(id)) return rooms.get(id);
  const file = roomFile(id);
  if (!file || !existsSync(file)) return null;
  const room = JSON.parse(await fs.readFile(file, "utf8"));
  rooms.set(id, room);
  // 共有コードがない古いリストには、ここで付ける
  if (!room.code) { room.code = newCode(); codeIndex.set(room.code, room.id); await saveRoom(room); }
  return room;
}

async function saveRoom(room) {
  room.version = (room.version || 0) + 1;
  room.updatedAt = now();
  const file = roomFile(room.id);
  const tmp = `${file}.${process.pid}.tmp`;
  // 同じ部屋への書き込みは順番に
  const prev = locks.get(room.id) || Promise.resolve();
  const next = prev.then(async () => {
    await fs.writeFile(tmp, JSON.stringify(room, null, 1));
    await fs.rename(tmp, file);
  });
  locks.set(room.id, next.catch(() => {}));
  await next;
  broadcast(room.id, { type: "changed", version: room.version });
  return room;
}

// ---------- リアルタイム同期（SSE） ----------
const listeners = new Map(); // roomId -> Set<res>
function broadcast(roomId, payload) {
  for (const res of listeners.get(roomId) || []) res.write(`data: ${JSON.stringify(payload)}\n\n`);
}
setInterval(() => {
  for (const set of listeners.values()) for (const res of set) res.write(": ping\n\n");
}, 25000).unref();

// ---------- 画像の保存 ----------
// SNS の画像URLは時間が経つと切れるので、登録時にサーバーへ保存しておく
async function cacheImage(roomId, itemId, imageUrl) {
  if (!imageUrl || !/^https?:/.test(imageUrl)) return "";
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(imageUrl, { signal: ctrl.signal, headers: { "user-agent": "Mozilla/5.0" } });
    clearTimeout(t);
    const type = res.headers.get("content-type") || "";
    if (!res.ok || !type.startsWith("image/")) return imageUrl;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 5_000_000) return imageUrl;
    const ext = type.includes("png") ? ".png" : type.includes("webp") ? ".webp" : type.includes("gif") ? ".gif" : ".jpg";
    const name = `${roomId}_${itemId}_${newId(4)}${ext}`;
    await fs.writeFile(path.join(IMAGES, name), buf);
    return `/img/${name}`;
  } catch {
    return imageUrl;
  }
}

// ---------- 解析 ----------
async function buildDraft({ url, text, image = null }) {
  let preview = { url: normalizeUrl(url), platform: "web", title: "", description: "", image: "", warnings: [] };
  if (url) {
    try { preview = await fetchPreview(url); } catch (e) { preview.warnings = [e.message]; if (e.status === 400) throw e; }
  }
  const caption = [cleanCaption(preview.platform, preview.description), text].filter(Boolean).join("\n");
  const ldText = [preview.ld?.name, preview.ld?.address, preview.ld?.priceRange, preview.ld?.cuisine].filter(Boolean).join("\n");
  const allText = [preview.title, caption, ldText].filter(Boolean).join("\n");
  // リンク先が読めないメモ書き（本文だけ）は、まとめて入力と同じ読み方をする
  const rule = preview.url ? analyzeText(allText) : { ...analyzeText(allText), ...parseFreeform(allText) };
  if (preview.ld?.address && !rule.address) { rule.address = preview.ld.address; rule.city = cityFromAddress(preview.ld.address); }

  let ai = null;
  if (allText.trim() || image) ai = cleanAiResult(await aiExtract({ url: preview.url, platform: preview.platform, title: preview.title, caption: caption + "\n" + ldText, image, hints: rule, memo: !preview.url && !image }));

  const pick = (k) => (ai && ai[k] !== "" && ai[k] != null ? ai[k] : rule[k]);
  const draft = {
    url: preview.url,
    platform: preview.platform,
    title: (preview.ld?.name || preview.title || "").slice(0, 120),
    caption: caption.slice(0, 2000),
    image: preview.image || "",
    author: preview.author || "",
    genre: pick("genre"),
    placeName: pick("placeName") || preview.ld?.name || "",
    address: pick("address") || preview.ld?.address || "",
    prefecture: pick("prefecture"),
    city: pick("city"),
    station: pick("station"),
    walkMin: ai?.walkMin ?? rule.walkMin,
    priceMin: ai && ai.priceMin != null ? ai.priceMin : rule.priceMin,
    priceMax: ai && ai.priceMax != null ? ai.priceMax : rule.priceMax,
    priceNote: rule.priceNote || preview.ld?.priceRange || "",
    hours: pick("hours"),
    closed: pick("closed"),
    deadline: pick("deadline") || "",
    tags: rule.tags,
    summary: ai?.summary || "",
    lat: preview.lat || null,
    lng: preview.lng || null,
    autoRead: Boolean(preview.ok),
    aiUsed: Boolean(ai),
    warnings: preview.warnings || [],
  };
  if (draft.priceMin != null && draft.priceMax == null) draft.priceMax = draft.priceMin;

  if (draft.lat == null) {
    const g = await geocodePlace(draft);
    if (g) { draft.lat = g.lat; draft.lng = g.lng; draft.geoMatched = g.matched; }
  }
  return draft;
}

// ---------- 入力の整形 ----------
const ITEM_FIELDS = {
  url: "s", platform: "s", title: "s", caption: "s", image: "s", author: "s", genre: "s", placeName: "s", address: "s",
  prefecture: "s", city: "s", station: "s", walkMin: "n", priceMin: "n", priceMax: "n", priceNote: "s", hours: "s", closed: "s",
  tags: "a", summary: "s", lat: "n", lng: "n", memo: "s", status: "s", plannedDate: "s", visitedAt: "s", rating: "n", review: "s",
  deadline: "s", pinned: "b", planTime: "s", planOrder: "n", reaskAt: "s", reaskBy: "s",
};

function sanitizeItem(input) {
  const out = {};
  for (const [k, type] of Object.entries(ITEM_FIELDS)) {
    if (!(k in input)) continue;
    const v = input[k];
    if (type === "s") out[k] = v == null ? "" : String(v).slice(0, k === "caption" || k === "review" || k === "memo" ? 3000 : 300);
    else if (type === "n") out[k] = v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v);
    else if (type === "a") out[k] = Array.isArray(v) ? v.map(String).slice(0, 20) : [];
    else if (type === "b") out[k] = Boolean(v);
  }
  if (out.status && !["want", "planned", "visited"].includes(out.status)) delete out.status;
  if (out.genre && !GENRES.some((g) => g.id === out.genre)) out.genre = "other";
  if (out.image && !/^(https?:|\/img\/)/.test(out.image)) out.image = "";
  if (out.url && !/^https?:/.test(out.url)) out.url = "";
  return out;
}

const MEMBER_COLORS = ["#df4a72", "#3b6fd8", "#1d936a", "#c47b0c", "#8a56d6", "#d6561f", "#0f8fa0", "#b0469a"];
const GROUP_TYPES = ["couple", "friends", "family", "work", "circle", "solo"];
const MAX_MEMBERS = 50;
const REASONS = ["far", "budget", "mood", "crowd", "time", "taste"];

function sanitizeMember(m, i) {
  return {
    id: String(m.id || `m${i + 1}`).slice(0, 20),
    name: String(m.name || "メンバー").trim().slice(0, 20) || "メンバー",
    color: /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : MEMBER_COLORS[i % MEMBER_COLORS.length],
    avatar: cleanAvatar(m.avatar),
  };
}

// アイコン：絵文字（"emoji:🐻"）か、画面で小さく縮めた写真（data URL、80KBまで）
function cleanAvatar(v) {
  const s = String(v || "");
  if (/^emoji:.{1,16}$/u.test(s)) return s;
  if (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length <= 80_000) return s;
  return "";
}

function sanitizeBase(b) {
  return {
    id: String(b.id || newId(6)).slice(0, 20),
    label: String(b.label || "出発地").slice(0, 30),
    lat: Number(b.lat),
    lng: Number(b.lng),
    address: String(b.address || "").slice(0, 200),
  };
}

// ---------- HTTP ----------
async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 8_000_000) throw Object.assign(new Error("リクエストが大きすぎます"), { status: 413 });
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw Object.assign(new Error("JSONが不正です"), { status: 400 }); }
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function serveFile(res, file, cache = "no-cache") {
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile()) throw new Error();
    res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "content-length": stat.size, "cache-control": cache });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean); // ["api", ...]
  const method = req.method;

  if (parts[1] === "meta" && method === "GET") {
    return send(res, 200, { genres: GENRES.map(({ id, label, emoji }) => ({ id, label, emoji })), ai: aiEnabled() });
  }

  // URL（またはキャプション）から下書きを作る。保存はしない
  if (parts[1] === "preview" && method === "POST") {
    const body = await readJson(req);
    if (!body.url && !body.text && !body.image) return send(res, 400, { error: "リンクか本文を入れてください" });
    if (body.image && !aiEnabled()) return send(res, 400, { error: "スクリーンショットの読み取りにはAIの設定が必要です" });
    const image = body.image ? { data: String(body.image), mediaType: /^image\/(png|jpeg|webp|gif)$/.test(body.mediaType) ? body.mediaType : "image/jpeg" } : null;
    return send(res, 200, await buildDraft({ url: body.url, text: body.text, image }));
  }

  if (parts[1] === "route" && method === "POST") {
    if (!aiEnabled()) return send(res, 400, { error: "AIで行き方を調べるには、サーバーに ANTHROPIC_API_KEY の設定が必要です" });
    const { from, to, mode } = await readJson(req);
    const clip = (o) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => ["name", "label", "address", "station", "lat", "lng"].includes(k)).map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 120) : v]));
    try { return send(res, 200, (await aiRoute({ from: clip(from), to: clip(to), mode: String(mode || "train").slice(0, 20) })) || { steps: [], note: "" }); }
    catch (e) { console.warn("[ai] route", e.message); return send(res, 502, { error: "AIにうまく聞けませんでした。少し待ってからもう一度試してください" }); }
  }

  if (parts[1] === "geocode" && method === "GET") {
    const r = await geocode(url.searchParams.get("q"));
    return r ? send(res, 200, r) : send(res, 404, { error: "場所が見つかりませんでした" });
  }

  // 共有コードからグループを探す（大文字小文字・空白・ハイフンは気にしない）
  if (parts[1] === "join" && method === "GET") {
    const code = String(parts[2] || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const id = codeIndex.get(code);
    const room = id && (await loadRoom(id));
    if (!room) return send(res, 404, { error: "その共有コードのグループは見つかりませんでした。コードを確かめてください" });
    return send(res, 200, { id: room.id, name: room.name, type: room.type || "couple", members: room.members.length });
  }

  if (parts[1] !== "rooms") return send(res, 404, { error: "not found" });

  if (parts.length === 2 && method === "POST") {
    const body = await readJson(req);
    // 作った人が最初のメンバー。ほかの人は招待リンクから参加する
    const members = (Array.isArray(body.members) && body.members.length ? body.members : [{}]).slice(0, MAX_MEMBERS).map((m, i) => ({ ...sanitizeMember(m, i), id: `m${i + 1}` }));
    const type = GROUP_TYPES.includes(body.type) ? body.type : "friends";
    const room = { id: newId(12), code: newCode(), name: String(body.name || "行きたいリスト").slice(0, 40), type, createdAt: now(), members, bases: [], items: [] };
    codeIndex.set(room.code, room.id);
    rooms.set(room.id, room);
    await saveRoom(room);
    return send(res, 201, room);
  }

  const room = await loadRoom(parts[2] || "");
  if (!room) return send(res, 404, { error: "リストが見つかりません。リンクを確認してください" });

  if (parts.length === 3) {
    if (method === "GET") return send(res, 200, room);
    if (method === "PATCH") {
      const body = await readJson(req);
      if (body.name) room.name = String(body.name).slice(0, 40);
      if (GROUP_TYPES.includes(body.type)) room.type = body.type;
      // 名前と色の変更だけ受け付ける（参加・退出は members の API で）
      if (Array.isArray(body.members)) {
        for (const m of body.members) {
          const cur = room.members.find((x) => x.id === m.id);
          if (!cur) continue;
          const clean = sanitizeMember({ ...cur, ...m }, room.members.indexOf(cur));
          cur.name = clean.name;
          cur.color = clean.color;
          if ("avatar" in m) cur.avatar = clean.avatar;
        }
      }
      if (Array.isArray(body.bases)) room.bases = body.bases.slice(0, 10).map(sanitizeBase).filter((b) => Number.isFinite(b.lat) && Number.isFinite(b.lng));
      await saveRoom(room);
      return send(res, 200, room);
    }
  }

  if (parts[3] === "ask" && method === "POST") {
    if (!aiEnabled()) return send(res, 400, { error: "AIに聞くには、サーバーに ANTHROPIC_API_KEY の設定が必要です" });
    const { q } = await readJson(req);
    const question = String(q || "").trim().slice(0, 300);
    if (!question) return send(res, 400, { error: "質問を入れてください" });
    const names = Object.fromEntries(room.members.map((m) => [m.id, m.name]));
    const genre = Object.fromEntries(GENRES.map((g) => [g.id, g.label]));
    const items = room.items.map((s) => ({ id: s.id, name: s.placeName || s.title, genre: genre[s.genre], area: [s.prefecture, s.city, s.station].filter(Boolean).join(" "), priceMin: s.priceMin, status: s.status, addedBy: names[s.addedBy] || "", addedAt: (s.createdAt || "").slice(0, 10), tags: (s.tags || []).slice(0, 8), memo: s.memo || "", text: String(s.summary || s.caption || "").slice(0, 160) }));
    try { return send(res, 200, { picks: await aiAsk(question, items) }); }
    catch (e) { console.warn("[ai] ask", e.message); return send(res, 502, { error: "AIにうまく聞けませんでした。少し待ってからもう一度試してください" }); }
  }

  if (parts[3] === "members") {
    if (parts.length === 4 && method === "POST") {
      const body = await readJson(req);
      const name = String(body.name || "").trim().slice(0, 20);
      if (!name) return send(res, 400, { error: "名前を入れてください" });
      if (room.members.length >= MAX_MEMBERS) return send(res, 400, { error: `このリストに参加できるのは${MAX_MEMBERS}人までです` });
      const member = { ...sanitizeMember({ name }, room.members.length), id: `m${newId(6)}` };
      room.members.push(member);
      await saveRoom(room);
      return send(res, 201, member);
    }
    if (parts.length === 5 && method === "DELETE") {
      if (!room.members.some((m) => m.id === parts[4])) return send(res, 404, { error: "メンバーが見つかりません" });
      if (room.members.length <= 1) return send(res, 400, { error: "最後のメンバーは抜けられません" });
      room.members = room.members.filter((m) => m.id !== parts[4]);
      await saveRoom(room);
      return send(res, 200, { ok: true });
    }
  }

  if (parts[3] === "events" && method === "GET") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" });
    res.write(`data: ${JSON.stringify({ type: "hello", version: room.version })}\n\n`);
    if (!listeners.has(room.id)) listeners.set(room.id, new Set());
    listeners.get(room.id).add(res);
    req.on("close", () => listeners.get(room.id)?.delete(res));
    return;
  }

  if (parts[3] === "export" && method === "GET") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="ikitai-${room.id}.json"` });
    return res.end(JSON.stringify(room, null, 2));
  }

  if (parts[3] === "items") {
    const itemId = parts[4];
    if (!itemId && method === "POST") {
      const body = await readJson(req);
      const fields = sanitizeItem(body);
      if (fields.url) {
        const dup = room.items.find((i) => i.url && normalizeUrl(i.url) === normalizeUrl(fields.url));
        if (dup && !body.allowDuplicate) return send(res, 409, { error: "この投稿はもう登録されています", item: dup });
      }
      const id = newId(8);
      const memberId = room.members.some((m) => m.id === body.addedBy) ? body.addedBy : room.members[0].id;
      const item = {
        id, status: "want", genre: "other", tags: [], memo: "", comments: [], likes: { [memberId]: true },
        ...fields,
        addedBy: memberId, createdAt: now(), updatedAt: now(),
      };
      if (item.image && !item.image.startsWith("/img/")) item.image = await cacheImage(room.id, id, item.image);
      room.items.unshift(item);
      await saveRoom(room);
      return send(res, 201, item);
    }

    const item = room.items.find((i) => i.id === itemId);
    if (!item) return send(res, 404, { error: "見つかりません" });

    if (parts.length === 5 && method === "PATCH") {
      const body = await readJson(req);
      Object.assign(item, sanitizeItem(body), { updatedAt: now() });
      if (body.status === "visited" && !item.visitedAt) item.visitedAt = now().slice(0, 10);
      await saveRoom(room);
      return send(res, 200, item);
    }
    if (parts.length === 5 && method === "DELETE") {
      room.items = room.items.filter((i) => i.id !== itemId);
      if (item.image?.startsWith("/img/")) fs.unlink(path.join(IMAGES, path.basename(item.image))).catch(() => {});
      await saveRoom(room);
      return send(res, 200, { ok: true });
    }
    if (parts[5] === "like" && method === "POST") {
      const body = await readJson(req);
      const { memberId } = body;
      if (!room.members.some((m) => m.id === memberId)) return send(res, 400, { error: "この端末を使っている人を設定から選んでください" });
      // true = 行きたい / "no" = うーん / false = 答えたけど♡なし / null = まだ答えていない
      const value = "value" in body ? body.value : body.on ? true : null;
      item.likes = { ...(item.likes || {}) };
      if (value === true || value === false || value === "no") item.likes[memberId] = value;
      else delete item.likes[memberId];
      // 「まあまあ」の理由（相手を責めない選択肢だけ）
      item.reasons = { ...(item.reasons || {}) };
      if (value === "no" && REASONS.includes(body.reason)) item.reasons[memberId] = body.reason;
      else delete item.reasons[memberId];
      if (value === true || value === "no") { if (item.reaskBy && item.reaskAt) { item.reaskAt = ""; item.reaskBy = ""; } }
      await saveRoom(room);
      return send(res, 200, item);
    }
    if (parts[5] === "comments" && method === "POST") {
      const { memberId, text } = await readJson(req);
      const t = String(text || "").trim().slice(0, 500);
      if (!t) return send(res, 400, { error: "コメントが空です" });
      item.comments = [...(item.comments || []), { id: newId(6), by: memberId, text: t, at: now() }];
      await saveRoom(room);
      return send(res, 201, item);
    }
  }

  return send(res, 404, { error: "not found" });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    if (url.pathname.startsWith("/img/")) return serveFile(res, path.join(IMAGES, path.basename(url.pathname)), "public, max-age=31536000, immutable");
    // 解析ロジックは画面側とも共有する
    if (url.pathname === "/lib/analyze.js") return serveFile(res, path.join(ROOT, "lib", "analyze.js"));
    // それ以外は静的ファイル。/r/xxxx や /share などは SPA の index.html を返す
    const safe = path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
    const file = path.join(PUBLIC, safe);
    if (file.startsWith(PUBLIC) && existsSync(file) && path.extname(file)) return serveFile(res, file);
    return serveFile(res, path.join(PUBLIC, "index.html"));
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : "サーバーでエラーが起きました" });
  }
});

server.listen(PORT, () => {
  console.log(`どこいく: http://localhost:${PORT}  (AI解析: ${aiEnabled() ? "ON" : "OFF"})`);
});
