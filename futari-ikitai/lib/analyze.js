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

export function extractPlace(text) {
  const address = (() => {
    const labeled = pickLabeledLine(text, ["住所", "所在地", "Address", "address", "アクセス"]);
    if (labeled && new RegExp(PREFS + "|[市区町村]").test(labeled)) return labeled;
    const m = text.match(new RegExp(`(?:〒?\\s*\\d{3}-?\\d{4}\\s*)?(?:${PREFS})[^\\s　、。,，\\n#]{2,40}`));
    if (m) return m[0].trim();
    return "";
  })();

  const pin = pickLabeledLine(text, ["📍", "📌", "🏠", "🗺️?", "場所", "店名", "店舗名", "スポット名", "施設名"]);

  let prefecture = "";
  for (const p of PREF_LIST) {
    if ((address + " " + pin + " " + text).includes(p)) { prefecture = p; break; }
  }
  let city = "";
  const cityMatch = (address || pin || text).match(/(?:都|道|府|県)?([^\s　、。,，\n#📍都道府県]{1,6}?(?:市|区|町|村))/);
  if (cityMatch) city = cityMatch[1];

  const stationMatch = text.match(/([^\s　、。,，\n#「」【】()（）📍・]{1,10}駅)(?:から|より)?\s*(?:徒歩|歩いて)?\s*([0-9０-９]+)?\s*分?/);
  const station = stationMatch ? stationMatch[1] : "";
  const walkMin = stationMatch && stationMatch[2] ? toNumber(stationMatch[2]) : null;

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

export function extractHours(text) {
  return {
    hours: pickLabeledLine(text, ["営業時間", "OPEN", "Open", "open", "時間", "⏰", "🕐"]).slice(0, 60),
    closed: pickLabeledLine(text, ["定休日", "休み", "CLOSE", "Closed"]).slice(0, 40),
  };
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
