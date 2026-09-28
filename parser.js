// クイック入力のコマンド文字列を解析して、登録用のデータに変換する
// 例: "ランチ 800" / "昨日 電車 320" / "+給与 200000" / "9/25 家賃 42000"
// 「、」「;」または改行で区切ると、複数件をまとめて入力できる

const CATEGORY_ALIASES = {
  expense: {
    食費: ["ランチ", "昼", "昼食", "昼ごはん", "朝食", "朝ごはん", "夕食", "晩ごはん", "夜ごはん", "ご飯", "ごはん", "飯", "コンビニ", "スーパー", "カフェ", "コーヒー", "外食", "弁当", "お弁当", "飲み物", "お菓子", "おやつ", "パン", "食材"],
    日用品: ["ドラッグストア", "ドラスト", "洗剤", "ティッシュ", "トイレットペーパー", "シャンプー", "100均", "百均", "雑貨"],
    交通費: ["電車", "バス", "タクシー", "定期", "suica", "pasmo", "icoca", "切符", "新幹線", "ガソリン", "駐車場", "駐輪場"],
    住居費: ["家賃", "管理費", "更新料"],
    水道光熱費: ["電気", "電気代", "ガス", "ガス代", "水道", "水道代", "光熱費"],
    通信費: ["スマホ", "携帯", "wifi", "ネット", "回線", "sim"],
    交際費: ["飲み会", "飲み", "プレゼント", "ギフト", "お祝い", "デート"],
    "趣味・娯楽": ["本", "映画", "ゲーム", "漫画", "マンガ", "ライブ", "サブスク", "旅行", "カラオケ", "推し"],
    医療費: ["病院", "薬", "歯医者", "通院", "処方"],
  },
  income: {
    給与: ["給料", "月給", "賞与", "ボーナス"],
    アルバイト: ["バイト", "バイト代"],
    仕送り: [],
    臨時収入: ["お小遣い", "お年玉", "臨時", "フリマ", "メルカリ"],
  },
};

// 全角英数字・記号を半角に、全角スペースを半角スペースにそろえる
function normalizeCommand(str) {
  return str
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ")
    .replace(/￥/g, "¥")
    .trim();
}

function addDays(base, n) {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);
}

// 日付を表す語なら Date を返す。未来の日付になる場合は前年・前月として扱う
function parseDateToken(token, today) {
  const words = { 今日: 0, きょう: 0, 昨日: -1, きのう: -1, 一昨日: -2, おととい: -2 };
  if (token in words) return addDays(today, words[token]);

  let m = token.match(/^(\d+)日前$/);
  if (m) return addDays(today, -Number(m[1]));

  m = token.match(/^(\d{1,2})[/月](\d{1,2})日?$/);
  if (m) {
    const month = Number(m[1]) - 1;
    const day = Number(m[2]);
    if (month > 11 || day < 1 || day > 31) return null;
    let d = new Date(today.getFullYear(), month, day);
    if (d > today) d = new Date(today.getFullYear() - 1, month, day);
    return d;
  }

  m = token.match(/^(\d{1,2})日$/);
  if (m) {
    const day = Number(m[1]);
    if (day < 1 || day > 31) return null;
    let d = new Date(today.getFullYear(), today.getMonth(), day);
    if (d > today) d = new Date(today.getFullYear(), today.getMonth() - 1, day);
    return d;
  }
  return null;
}

const AMOUNT_RE = /([+-])?¥?(\d[\d,]*(?:\.\d+)?)(万|千|k)?円?/i;

function toAmount(match) {
  const mult = { 万: 10000, 千: 1000, k: 1000, K: 1000 }[match[3]] || 1;
  return { sign: match[1] || "", value: Math.round(parseFloat(match[2].replace(/,/g, "")) * mult) };
}

// 金額だけのトークン、または「ランチ800」「800円ランチ」のように語とくっついたトークンを分解する
function splitAmountToken(token) {
  let m = token.match(new RegExp(`^${AMOUNT_RE.source}$`, "i"));
  if (m) return { amount: toAmount(m), rest: "" };

  m = token.match(new RegExp(`^(\\D+?)${AMOUNT_RE.source}$`, "i"));
  if (m) return { amount: toAmount(m.slice(1)), rest: m[1] };

  m = token.match(/^¥?(\d[\d,]*(?:\.\d+)?)(万|千|k)?円(\D+)$/i);
  if (m) return { amount: toAmount([null, "", m[1], m[2]]), rest: m[3] };
  return null;
}

// 語からカテゴリを探す。名前と一致(または名前の一部)なら exact、言い換え語なら alias
function matchCategory(word, preferredType) {
  const lower = word.toLowerCase();
  const types = preferredType ? [preferredType, preferredType === "income" ? "expense" : "income"] : ["expense", "income"];

  for (const type of types) {
    for (const name of Object.keys(CATEGORIES[type])) {
      if (name === word || (word.length >= 2 && name.includes(word))) return { type, category: name, exact: true };
    }
  }
  for (const type of types) {
    for (const [name, aliases] of Object.entries(CATEGORY_ALIASES[type])) {
      if (aliases.some((a) => a.toLowerCase() === lower)) return { type, category: name, exact: false };
    }
  }
  return null;
}

function parseCommand(input, today = new Date()) {
  const text = normalizeCommand(input);
  const tokens = text.split(/\s+/).filter(Boolean);

  let date = null;
  let amount = null;
  let explicitType = null;
  const words = [];

  for (let token of tokens) {
    // 先頭の +/- は種類の指定として扱う (例: "+給与 200000")
    if (/^[+-]\D/.test(token)) {
      explicitType = token[0] === "+" ? "income" : "expense";
      token = token.slice(1);
    }
    if (token === "+" || token === "-") {
      explicitType = token === "+" ? "income" : "expense";
      continue;
    }
    if (token === "収入" || token === "支出") {
      explicitType = token === "収入" ? "income" : "expense";
      continue;
    }
    if (!date) {
      const d = parseDateToken(token, today);
      if (d) {
        date = d;
        continue;
      }
    }
    if (!amount) {
      const split = splitAmountToken(token);
      if (split) {
        amount = split.amount;
        if (split.rest) words.push(split.rest);
        continue;
      }
    }
    words.push(token);
  }

  if (amount?.sign) explicitType = amount.sign === "+" ? "income" : "expense";

  let match = null;
  const memoWords = [];
  for (const w of words) {
    const found = !match && matchCategory(w, explicitType);
    if (found) {
      match = found;
      if (!found.exact) memoWords.push(w);
    } else {
      memoWords.push(w);
    }
  }

  const type = explicitType || match?.type || "expense";
  const category = match && match.type === type ? match.category : "その他";

  const errors = [];
  if (!amount || amount.value <= 0) errors.push("金額が見つかりません");

  return {
    ok: errors.length === 0,
    errors,
    source: input.trim(),
    entry: {
      type,
      date: toDateStr(date || today),
      category,
      amount: amount ? amount.value : 0,
      memo: memoWords.join(" ").slice(0, 60),
    },
  };
}

function parseCommands(input, today = new Date()) {
  return input
    .split(/[、;；\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => parseCommand(s, today));
}
