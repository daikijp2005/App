// 投稿のテキスト（タイトル・キャプション）から
// ジャンル / 場所 / 値段 / 営業時間 などをルールベースで推定する。
// 外部APIに頼らないので、APIキーなしでも動く。

export const GENRES = [
  { id: "cafe", label: "カフェ", emoji: "☕", words: ["カフェ", "cafe", "café", "喫茶", "コーヒー", "coffee", "珈琲", "ラテ", "ベーカリー", "パン屋", "bakery"] },
  { id: "sweets", label: "スイーツ", emoji: "🍰", words: ["スイーツ", "パフェ", "ケーキ", "かき氷", "ドーナツ", "パンケーキ", "アイス", "ジェラート", "プリン", "タルト", "チョコ", "クレープ", "和菓子", "dessert", "sweets"] },
  { id: "gourmet", label: "グルメ", emoji: "🍽️", words: ["ランチ", "ディナー", "焼肉", "寿司", "鮨", "ラーメン", "居酒屋", "レストラン", "グルメ", "食べ放題", "ビストロ", "イタリアン", "フレンチ", "和食", "中華", "韓国料理", "ハンバーグ", "ステーキ", "定食", "うどん", "そば", "蕎麦", "焼き鳥", "もつ鍋", "しゃぶしゃぶ", "海鮮", "丼", "カレー", "ピザ", "パスタ", "バーガー", "食堂", "dinner", "lunch", "restaurant"] },
  { id: "bar", label: "バー・お酒", emoji: "🍷", words: ["バー", "ワイン", "ビール", "日本酒", "カクテル", "ウイスキー", "クラフトビール", "立ち飲み", "bar", "wine"] },
  { id: "nature", label: "絶景・自然", emoji: "🌅", words: ["絶景", "景色", "夜景", "花畑", "紅葉", "桜", "ネモフィラ", "ひまわり", "公園", "滝", "湖", "海辺", "ビーチ", "海岸", "山頂", "展望台", "星空", "サンセット", "夕日", "庭園", "高原"] },
  { id: "sightseeing", label: "観光・街歩き", emoji: "⛩️", words: ["神社", "寺", "観光", "散策", "街歩き", "城", "古民家", "レトロ", "商店街", "横丁", "御朱印", "名所", "パワースポット"] },
  { id: "art", label: "アート・体験", emoji: "🎨", words: ["美術館", "博物館", "展示", "展覧会", "個展", "ワークショップ", "体験", "水族館", "動物園", "プラネタリウム", "ミュージアム", "museum", "陶芸", "映画館", "ギャラリー"] },
  { id: "event", label: "イベント", emoji: "🎪", words: ["イベント", "フェス", "期間限定", "ポップアップ", "pop up", "popup", "マルシェ", "ライブ", "祭り", "花火", "イルミネーション", "クリスマスマーケット", "開催"] },
  { id: "shopping", label: "ショッピング", emoji: "🛍️", words: ["ショップ", "雑貨", "古着", "セレクトショップ", "買い物", "ショッピング", "アウトレット", "本屋", "書店", "インテリア", "shop", "store"] },
  { id: "stay", label: "宿・温泉", emoji: "♨️", words: ["ホテル", "旅館", "温泉", "サウナ", "宿", "グランピング", "スパ", "露天風呂", "貸切風呂", "オーベルジュ", "hotel", "ryokan"] },
  { id: "activity", label: "アクティビティ", emoji: "🎢", words: ["アクティビティ", "遊園地", "テーマパーク", "ボウリング", "キャンプ", "釣り", "カヤック", "SUP", "乗馬", "ゴーカート", "脱出ゲーム", "アスレチック", "ドライブ", "サイクリング", "ハイキング", "登山"] },
  { id: "other", label: "その他", emoji: "📌", words: [] },
];

const PREFS = "北海道|青森県|岩手県|宮城県|秋田県|山形県|福島県|茨城県|栃木県|群馬県|埼玉県|千葉県|東京都|神奈川県|新潟県|富山県|石川県|福井県|山梨県|長野県|岐阜県|静岡県|愛知県|三重県|滋賀県|京都府|大阪府|兵庫県|奈良県|和歌山県|鳥取県|島根県|岡山県|広島県|山口県|徳島県|香川県|愛媛県|高知県|福岡県|佐賀県|長崎県|熊本県|大分県|宮崎県|鹿児島県|沖縄県";
const PREF_LIST = PREFS.split("|");

export function classifyGenre(text) {
  const lower = text.toLowerCase();
  let best = { id: "other", score: 0 };
  for (const g of GENRES) {
    let score = 0;
    // 長い語から順に見て、同じ箇所を二重に数えない（「パンケーキ」と「ケーキ」など）
    const used = new Set();
    for (const w of [...g.words].sort((a, b) => b.length - a.length)) {
      const wl = w.toLowerCase();
      let idx = lower.indexOf(wl);
      while (idx !== -1) {
        if (!used.has(idx)) {
          for (let i = idx; i < idx + wl.length; i++) used.add(i);
          // ハッシュタグ内（#東京カフェ など）の一致は投稿者の意図が強いので重めに扱う
          const token = lower.slice(0, idx).split(/[\s　]/).pop();
          score += /[#＃]/.test(token + lower[idx - 1]) ? 2 : 1;
        }
        idx = lower.indexOf(wl, idx + wl.length);
      }
    }
    if (score > best.score) best = { id: g.id, score };
  }
  return best.id;
}

function toNumber(s) {
  return Number(s.replace(/[,，]/g, "").replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)));
}

// 「¥1,200」「1200円」「3,000円〜」「予算5000円」「入場無料」などから値段の幅を出す
export function extractPrice(text) {
  if (/(入場|参加|拝観|入館)?無料|free\s*entry|入場料なし/i.test(text) && !/[¥￥]\s*[1-9]|[1-9][0-9,]*\s*円/.test(text)) {
    return { priceMin: 0, priceMax: 0, priceNote: "無料" };
  }
  const values = [];
  const re = /(?:[¥￥]\s*([0-9０-９][0-9０-９,，]*))|(?:([0-9０-９][0-9０-９,，]*)\s*(?:円|yen))|(?:([0-9０-９]+(?:\.[0-9]+)?)\s*万円)/gi;
  let m;
  while ((m = re.exec(text))) {
    let v;
    if (m[3]) v = Math.round(parseFloat(m[3]) * 10000);
    else v = toNumber(m[1] || m[2]);
    if (Number.isFinite(v) && v >= 50 && v <= 300000) values.push(v);
  }
  if (!values.length) return { priceMin: null, priceMax: null, priceNote: "" };
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { priceMin: min, priceMax: max, priceNote: "" };
}

// 「📍東京都渋谷区神宮前1-2-3」「住所：〜」「場所 : 〜」のような行を拾う
function pickLabeledLine(text, labels) {
  for (const label of labels) {
    const re = new RegExp(`(?:${label})\\s*[:：]?\\s*([^\\n#]{2,80})`);
    const m = text.match(re);
    if (m) return m[1].trim().replace(/[\s　]+$/, "");
  }
  return "";
}

// 住所の直後に「 2F」「 ○○ビル3階」のような建物名が続いていればつなげる
function withBuilding(text, end, address) {
  const m = text.slice(end).match(/^[ 　]?([^\s、。,，\n#]{0,24}(?:ビル|階|[0-9０-９]F|号室|号館|館|タワー|プラザ|ハウス|マンション|ヒルズ|テラス)[^\s、。,，\n#]{0,6})/);
  return m ? `${address} ${m[1]}` : address;
}

// 住所から郵便番号と都道府県を外した残り（市区町村〜番地・建物名）
export function cityFromAddress(address, prefecture = "") {
  let a = String(address || "").replace(/^〒?\s*\d{3}-?\d{4}\s*/, "").trim();
  const pref = prefecture || PREF_LIST.find((p) => a.startsWith(p)) || "";
  if (pref && a.startsWith(pref)) a = a.slice(pref.length);
  return a.trim().slice(0, 120);
}

// 一覧やエリア分けで使う短い市区町村名（「渋谷区神宮前4-12-10」→「渋谷区」）
export function cityShort(city) {
  const c = String(city || "");
  return (c.match(/^.*?[市区町村]/) || [c])[0];
}

export function extractPlace(text) {
  const address = (() => {
    const labeled = pickLabeledLine(text, ["住所", "所在地", "Address", "address", "アクセス"]);
    if (labeled && new RegExp(PREFS + "|[市区町村]").test(labeled)) {
      // 「住所：〇〇 嵐山駅から徒歩7分」のように後ろに続く文は切り、建物名だけはつなげる
      const first = labeled.replace(/^〒?\s*\d{3}-?\d{4}[\s　]*/, "").split(/[\s　]/)[0];
      const at = text.indexOf(first);
      return at >= 0 ? withBuilding(text, at + first.length, first) : first;
    }
    const m = text.match(new RegExp(`(?:〒?\\s*\\d{3}-?\\d{4}\\s*)?(?:${PREFS})[^\\s　、。,，\\n#]{2,40}`));
    if (m) return withBuilding(text, m.index + m[0].length, m[0].trim());
    return "";
  })();

  const pin = pickLabeledLine(text, ["📍", "📌", "🏠", "🗺️?", "場所", "店名", "店舗名", "スポット名", "施設名"]);

  let prefecture = "";
  for (const p of PREF_LIST) {
    if ((address + " " + pin + " " + text).includes(p)) { prefecture = p; break; }
  }
  // 市区町村は、住所があれば都道府県より後ろを番地・建物名まで全部入れる
  let city = address ? cityFromAddress(address, prefecture) : "";
  if (!city) {
    const cityMatch = (pin || text).match(/(?:都|道|府|県)?([^\s　、。,，\n#📍都道府県]{1,6}?(?:市|区|町|村))/);
    if (cityMatch) city = cityMatch[1];
  }

  // 「駅 1200円」の数字を徒歩分と読まないよう、「徒歩」か「分」がついた数字だけを拾う
  const stationMatch = text.match(/([^\s　、。,，\n#「」【】()（）📍・]{1,10}駅)(?:から|より)?\s*(?:(?:徒歩|歩いて)\s*([0-9０-９]+)|([0-9０-９]+)\s*分)?/);
  const station = stationMatch ? stationMatch[1] : "";
  const walkRaw = stationMatch && (stationMatch[2] || stationMatch[3]);
  const walkMin = walkRaw ? toNumber(walkRaw) : null;

  // 📍の行が住所そのものならそれを住所、そうでなければ店名として扱う
  let placeName = "";
  if (pin && !new RegExp(`^(?:${PREFS})`).test(pin)) placeName = pin.replace(/[(（].*$/, "").trim();
  if (!placeName) {
    const bracket = text.match(/[【「『]([^】」』\n]{2,30})[】」』]/);
    if (bracket) placeName = bracket[1].trim();
  }

  return {
    placeName: placeName.slice(0, 60),
    address: (address || (pin && new RegExp(`^(?:${PREFS})`).test(pin) ? pin : "")).slice(0, 120),
    prefecture,
    city,
    station,
    walkMin,
  };
}

const TIME_RANGE = /\d{1,2}(?:[:：]\d{2}|時(?:\d{1,2}分?)?)\s*[〜~～\-－ー―]\s*(?:翌)?\d{1,2}(?:[:：]\d{2}|時(?:\d{1,2}分?)?)/;

export function extractHours(text) {
  // 「営業時間 11:00〜20:00」のようなラベル付きを優先し、なければ時刻の範囲そのものを拾う
  let hours = pickLabeledLine(text, ["営業時間", "OPEN", "Open", "open", "時間", "⏰", "🕐"]);
  if (!hours || !TIME_RANGE.test(hours)) hours = (text.match(TIME_RANGE) || [hours || ""])[0];
  // 「火曜休み」「水・木曜定休」「定休日：月曜」
  let closed = "";
  const strict = text.match(/((?:毎週)?[月火水木金土日](?:曜日?|曜)?(?:[・、,と][月火水木金土日](?:曜日?|曜)?)*)\s*(?:定休日?|休み|休業|休館|お休み)/);
  if (strict) closed = strict[1];
  else if (/不定休|年中無休|無休/.test(text)) closed = text.match(/不定休|年中無休|無休/)[0];
  else closed = pickLabeledLine(text, ["定休日", "CLOSE", "Closed"]);
  return { hours: String(hours || "").slice(0, 60), closed: String(closed || "").slice(0, 40) };
}

export function extractTags(text) {
  const tags = new Set();
  const re = /[#＃]([^\s#＃,，、。!！?？"“”'「」]+)/g;
  let m;
  while ((m = re.exec(text)) && tags.size < 15) tags.add(m[1]);
  return [...tags];
}

export function analyzeText(text) {
  const t = String(text || "");
  return {
    genre: classifyGenre(t),
    ...extractPrice(t),
    ...extractPlace(t),
    ...extractHours(t),
    tags: extractTags(t),
  };
}

export function detectPlatform(url) {
  let host = "";
  try { host = new URL(url).hostname.replace(/^www\.|^m\./, ""); } catch { return "web"; }
  if (/instagram\.com$/.test(host)) return "instagram";
  if (/tiktok\.com$/.test(host)) return "tiktok";
  if (/(^|\.)x\.com$|twitter\.com$/.test(host)) return "x";
  if (/youtube\.com$|youtu\.be$/.test(host)) return "youtube";
  if (/threads\.(net|com)$/.test(host)) return "threads";
  if (/tabelog\.com$/.test(host)) return "tabelog";
  if (/maps\.app\.goo\.gl$|google\.[a-z.]+$|goo\.gl$/.test(host)) return "googlemaps";
  if (/lemon8-app\.com$/.test(host)) return "lemon8";
  if (/facebook\.com$|fb\.watch$/.test(host)) return "facebook";
  return "web";
}

export function normalizeUrl(raw) {
  const m = String(raw || "").match(/https?:\/\/[^\s<>"'「」]+/);
  if (!m) return "";
  try {
    const u = new URL(m[0]);
    // 追跡用パラメータは重複判定の邪魔なので落とす
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|igsh|igshid|si$|is_from_webapp|sender_device|_r$|_t$|s$|t$|ref)/.test(k)) u.searchParams.delete(k);
    }
    u.hash = "";
    return u.toString().replace(/\?$/, "");
  } catch {
    return "";
  }
}

// ---------- まとめて入力（手入力のメモ書きから項目を埋める） ----------
// 「10/31まで」「11月3日まで」「〜2026/12/25」→ YYYY-MM-DD。年がなければ、過ぎていれば来年とみなす
export function extractDeadline(text, now = new Date()) {
  const t = String(text || "").replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
  const m = t.match(/(?:[〜~～]\s*)?(?:(\d{4})\s*[\/年.\-]\s*)?(\d{1,2})\s*[\/月.\-]\s*(\d{1,2})\s*日?\s*(?:\([^)]*\)|（[^）]*）)?\s*(まで|迄|〆|終了|までの|限定)/)
    || t.match(/[〜~～]\s*(?:(\d{4})\s*[\/年.\-]\s*)?(\d{1,2})\s*[\/月.\-]\s*(\d{1,2})\s*日?/);
  if (!m) return "";
  const mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  let y = m[1] ? Number(m[1]) : now.getFullYear();
  const pad = (n) => String(n).padStart(2, "0");
  if (!m[1]) {
    const cand = new Date(y, mo - 1, d);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (cand < today - 30 * 86400000) y += 1;
  }
  return `${y}-${pad(mo)}-${pad(d)}`;
}

const LABELS = { placeName: /^(?:店名|店舗名|名前|スポット名|施設名|場所名)\s*[:：]?\s*/, memo: /^(?:メモ|memo|備考|ひとこと|コメント)\s*[:：]?\s*/i };

export function parseFreeform(text, now = new Date()) {
  const raw = String(text || "").trim();
  const base = analyzeText(raw);
  const url = (raw.match(/https?:\/\/[^\s<>"'「」]+/) || [""])[0];
  const deadline = extractDeadline(raw, now);
  let placeName = "";
  const memo = [];
  // 1行ずつ（1行しかなければ「、」「/」やスペースで区切って）何の情報かを見分ける
  // 緯度経度（「35.66, 139.70」）は位置として別に読むので、店名などと混ぜない
  const body = raw.replace(/-?\d{1,3}\.\d{3,}\s*[,，、]\s*-?\d{1,3}\.\d{3,}/g, " ").replace(/https?:\/\/[^\s<>"'「」]+/g, (u) => `\n${u}\n`);
  let parts = body.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  let spaced = false;
  if (parts.length === 1) parts = parts[0].split(/[、,，／/｜|]|\s{2,}/).map((x) => x.trim()).filter(Boolean);
  if (parts.length === 1 && /\s/.test(parts[0])) { parts = parts[0].split(/\s+/); spaced = true; }
  const genreWords = GENRES.flatMap((g) => [g.label, ...g.words]).map((w) => w.toLowerCase());
  let nameAt = -2;
  let prevGenre = "";
  for (const [i, part] of parts.entries()) {
    if (LABELS.placeName.test(part)) { placeName = part.replace(LABELS.placeName, "").trim(); continue; }
    if (LABELS.memo.test(part)) { memo.push(part.replace(LABELS.memo, "").trim()); continue; }
    const info =
      /https?:\/\//.test(part) ||
      /[¥￥]\s*\d|\d[\d,]*\s*(円|yen)|無料/.test(part) ||
      TIME_RANGE.test(part) ||
      /[月火水木金土日](曜日?|曜)?\s*(定休|休み|休業|休館)|不定休|無休/.test(part) ||
      /駅/.test(part) ||
      new RegExp(`^(${PREFS})|[市区町村]\\S*\\d`).test(part) ||
      /^(徒歩|歩いて)\s*[0-9０-９]+\s*分?$|^[0-9０-９]+\s*分$/.test(part) ||
      /^(住所|営業時間|定休日|アクセス|時間|予算|値段|価格)/.test(part) ||
      /^[#＃]/.test(part) ||
      (extractDeadline(part, now) && /(まで|迄|〆|終了|[〜~～])/.test(part));
    const isGenreWord = genreWords.includes(part.toLowerCase());
    // スペース区切りの1行（「カフェ ルミエール 表参道駅…」）では、続いている言葉をまとめて店名にする
    if (spaced && !info && placeName && nameAt === i - 1 && placeName.length + part.length < 30) { placeName += ` ${part}`; nameAt = i; continue; }
    if (isGenreWord && !info) { prevGenre = part; continue; }
    if (info) {
      // 「10/31までの限定パフェ」のように、期限の後ろに言葉が続くならメモにも残す（住所の「4-12」は日付とみなさない）
      const hasDeadline = extractDeadline(part, now) && /(まで|迄|〆|終了|[〜~～])/.test(part);
      const rest = !hasDeadline ? part : part.replace(/(?:[〜~～]\s*)?(?:\d{4}\s*[\/年.\-]\s*)?\d{1,2}\s*[\/月.\-]\s*\d{1,2}\s*日?\s*(まで(の)?|迄|〆|終了)?/, "").trim();
      if (deadline && rest && rest !== part && rest.length >= 2 && !/^(まで|限定)$/.test(rest)) memo.push(part);
      continue;
    }
    if (!placeName && !base.placeName && part.length <= 40) {
      placeName = spaced && prevGenre && parts[i - 1] === prevGenre ? `${prevGenre} ${part}` : part;
      nameAt = i;
      continue;
    }
    memo.push(part);
  }
  // 都道府県のない住所（「渋谷区神宮前4-12-10」）も拾う
  let address = base.address;
  if (!address) {
    const a = raw.match(/[^\s、,，／/｜|]*?[市区町村][^\s、,，／/｜|]*?\d[\d\-−－‐ー丁目番地号の]*/);
    if (a) address = withBuilding(raw, a.index + a[0].length, a[0]);
  }
  const city = address ? cityFromAddress(address, base.prefecture) : base.city;
  const out = { ...base, address, city, placeName: placeName || base.placeName, deadline, memo: memo.join(" / ").slice(0, 300), url: url ? normalizeUrl(url) : "" };
  if (out.url) out.platform = detectPlatform(out.url);
  // 店名からもジャンルを推測する
  if (out.genre === "other" && out.placeName) out.genre = classifyGenre(out.placeName);
  return out;
}

// AIの答えを形のうえで確かめる（ありえない都道府県・日付・値段は捨てる、駅名と市区町村をそろえる）
export function cleanAiResult(ai) {
  if (!ai || typeof ai !== "object") return null;
  const out = { ...ai };
  const str = (v) => (v == null ? "" : String(v).trim());
  for (const k of ["placeName", "address", "prefecture", "city", "station", "hours", "closed", "deadline", "summary"]) out[k] = str(out[k]);
  if (out.prefecture && !PREF_LIST.includes(out.prefecture)) out.prefecture = PREF_LIST.find((p) => p.startsWith(out.prefecture.replace(/[都道府県]$/, ""))) || "";
  if (!out.prefecture && out.address) out.prefecture = PREF_LIST.find((p) => out.address.startsWith(p)) || "";
  if (out.station) {
    out.station = out.station.replace(/(駅).*$/, "$1");
    if (!out.station.endsWith("駅") && out.station.length <= 12) out.station += "駅";
  }
  if (out.address && (!out.city || !/\d/.test(out.city))) {
    const full = cityFromAddress(out.address, out.prefecture);
    if (full && (!out.city || full.startsWith(out.city))) out.city = full;
  }
  const d = out.deadline.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!d || Number.isNaN(new Date(out.deadline).getTime()) || Number(d[2]) > 12) out.deadline = "";
  const num = (v, max) => (v == null || v === "" || !Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > max ? null : Math.round(Number(v)));
  out.priceMin = num(out.priceMin, 500000);
  out.priceMax = num(out.priceMax, 500000);
  if (out.priceMin != null && out.priceMax != null && out.priceMax < out.priceMin) [out.priceMin, out.priceMax] = [out.priceMax, out.priceMin];
  if (out.priceMin == null && out.priceMax != null) out.priceMin = out.priceMax;
  out.walkMin = num(out.walkMin, 90);
  if (!GENRES.some((g) => g.id === out.genre)) out.genre = "other";
  if (out.lat != null) { const lat = Number(out.lat), lng = Number(out.lng); if (!(lat > 20 && lat < 46 && lng > 122 && lng < 154)) { delete out.lat; delete out.lng; } }
  return out;
}
