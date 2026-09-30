// クイック入力のコマンド文字列を解析して、登録用のデータに変換する
// 例: "ランチ 800" / "昨日 電車 320" / "9/25 家賃 42000" / "家賃 4.2万"
// 「、」「;」または改行で区切ると、複数件をまとめて入力できる

const CATEGORY_ALIASES = {
  食費: ["ランチ", "昼", "昼食", "昼ごはん", "朝食", "朝ごはん", "夕食", "晩ごはん", "夜ごはん", "ご飯", "ごはん", "飯", "コンビニ", "スーパー", "カフェ", "コーヒー", "外食", "弁当", "お弁当", "飲み物", "お菓子", "おやつ", "パン", "食材", "焼肉", "寿司", "ラーメン", "うどん", "そば", "カレー", "ディナー", "ファミレス", "マック"],
  日用品: ["ドラッグストア", "ドラスト", "洗剤", "ティッシュ", "トイレットペーパー", "シャンプー", "100均", "百均", "雑貨"],
  交通費: ["電車", "バス", "タクシー", "定期", "suica", "pasmo", "icoca", "切符", "新幹線", "ガソリン", "駐車場", "駐輪場"],
  住居費: ["家賃", "管理費", "更新料"],
  水道光熱費: ["電気", "電気代", "ガス", "ガス代", "水道", "水道代", "光熱費"],
  通信費: ["スマホ", "携帯", "wifi", "ネット", "回線", "sim"],
  交際費: ["飲み会", "飲み", "プレゼント", "ギフト", "お祝い", "デート"],
  "趣味・娯楽": ["本", "映画", "ゲーム", "漫画", "マンガ", "ライブ", "サブスク", "旅行", "カラオケ", "推し"],
  医療費: ["病院", "薬", "歯医者", "通院", "処方"],
};

// 誰のために払ったかを表す言葉 (区分は script.js の PAYEES)
const PAYEE_ALIASES = {
  友人: ["友人", "友達", "友だち", "ともだち", "先輩", "後輩"],
  家族: ["家族", "親", "母", "父", "母親", "父親", "兄", "弟", "姉", "妹", "子ども", "子供", "祖母", "祖父"],
  パートナー: ["パートナー", "恋人", "彼女", "彼氏", "妻", "夫", "嫁", "旦那"],
  "職場・仕事": ["職場", "会社", "同僚", "上司", "部下", "仕事", "取引先"],
};

// 相手を表す言葉を探す。「友達の分」は全額が相手の分の立て替え、「家族に」「上司のため」は奢り、
// 「友達と」は一緒にいただけ (割り勘の人数などがなければ自分の支出)
function matchPayee(token) {
  const m = token.match(/^(.+?)(の分|のため|に|へ|と)?$/);
  for (const [payee, words] of Object.entries(PAYEE_ALIASES)) {
    if (!words.includes(m[1])) continue;
    const suffix = m[2] || "";
    return { payee, forThem: suffix === "の分", treat: ["に", "へ", "のため"].includes(suffix) };
  }
  return null;
}

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

const AMOUNT_RE = /¥?(\d[\d,]*(?:\.\d+)?)(万|千|k)?円?/i;

function toAmount(number, unit) {
  const mult = { 万: 10000, 千: 1000, k: 1000, K: 1000 }[unit] || 1;
  return Math.round(parseFloat(number.replace(/,/g, "")) * mult);
}

// 金額だけのトークン、または「ランチ800」「800円ランチ」のように語とくっついたトークンを分解する
function splitAmountToken(token) {
  let m = token.match(new RegExp(`^${AMOUNT_RE.source}$`, "i"));
  if (m) return { amount: toAmount(m[1], m[2]), rest: "" };

  m = token.match(new RegExp(`^(\\D+?)${AMOUNT_RE.source}$`, "i"));
  if (m) return { amount: toAmount(m[2], m[3]), rest: m[1] };

  m = token.match(/^¥?(\d[\d,]*(?:\.\d+)?)(万|千|k)?円(\D+)$/i);
  if (m) return { amount: toAmount(m[1], m[2]), rest: m[3] };
  return null;
}

// 語からカテゴリを探す。名前と一致(または名前の一部)なら exact、言い換え語なら alias
function matchCategory(word) {
  const lower = word.toLowerCase();
  for (const name of Object.keys(CATEGORIES)) {
    if (name === word || (word.length >= 2 && name.includes(word))) return { category: name, exact: true };
  }
  for (const [name, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (aliases.some((a) => a.toLowerCase() === lower)) return { category: name, exact: false };
  }
  return null;
}

function parseCommand(input, today = new Date()) {
  const text = normalizeCommand(input);
  const tokens = text.split(/\s+/).filter(Boolean);

  let date = null;
  let amount = null;
  let myAmount = null;
  let people = 0;
  let payee = null;
  let forThem = false;
  let treat = false;
  let expectMy = false;
  const words = [];

  for (let token of tokens) {
    // 奢り:「奢り」「おごった」、または「後輩に奢り」のように相手とつながった形
    const t = token.match(/^(.*?)(奢り|おごり|奢った|おごった|奢る|おごる|奢)$/);
    if (t) {
      treat = true;
      if (!t[1]) continue;
      token = t[1];
    }
    // 自分の分:「自分500」「うち500」「自分の分 500」(金額と離れていてもよい)
    const my = token.match(/^(?:自分の分|自分|うち)[:：]?(.*)$/);
    if (my) {
      if (!my[1]) {
        expectMy = true;
        continue;
      }
      const s = splitAmountToken(my[1]);
      if (s && !s.rest) {
        myAmount = s.amount;
        continue;
      }
    }
    if (expectMy) {
      expectMy = false;
      const s = splitAmountToken(token);
      if (s && !s.rest) {
        myAmount = s.amount;
        continue;
      }
    }
    // 割り勘の人数:「3人」「3人で割り勘」「割り勘」(人数がなければ2人)
    const n = token.match(/^(?:割り勘|割勘)?(\d{1,2})人(?:で)?(?:割り勘|割勘|割り)?$/);
    if (n) {
      people = Number(n[1]);
      continue;
    }
    if (token === "割り勘" || token === "割勘") {
      people = people || 2;
      continue;
    }
    // 誰のために払ったか:「友達の分」「家族に」「会社と」
    const p = !payee && matchPayee(token);
    if (p) {
      payee = p.payee;
      forThem = p.forThem;
      treat = treat || p.treat;
      continue;
    }
    if (!date) {
      const d = parseDateToken(token, today);
      if (d) {
        date = d;
        continue;
      }
    }
    if (amount === null) {
      const split = splitAmountToken(token);
      if (split) {
        amount = split.amount;
        if (split.rest) words.push(split.rest);
        continue;
      }
    }
    words.push(token);
  }

  let match = null;
  const memoWords = [];
  for (const w of words) {
    const found = !match && matchCategory(w);
    if (found) {
      match = found;
      if (!found.exact) memoWords.push(w);
    } else {
      memoWords.push(w);
    }
  }

  const errors = [];
  if (!amount || amount <= 0) errors.push("金額が見つかりません");

  // 自分の分: 直接書いた金額 → 人数で割った金額 → 奢りや「〜の分」なら全額が相手の分
  let mine = null;
  if (amount) {
    if (myAmount !== null) mine = myAmount;
    else if (people >= 2) mine = Math.round(amount / people);
    else if (treat || (payee && forThem)) mine = 0;
  }
  if (mine !== null && mine > amount) errors.push("自分の分が合計より多くなっています");
  const share =
    mine !== null && mine < amount ? { myAmount: mine, forWhom: payee || "友人", shareType: treat ? "treat" : "split" } : {};

  return {
    ok: errors.length === 0,
    // カテゴリを言葉から特定できたか (できなければ Claude に任せたほうが正確)
    matched: Boolean(match),
    errors,
    source: input.trim(),
    entry: {
      type: "expense",
      date: toDateStr(date || today),
      category: match ? match.category : "その他",
      amount: amount || 0,
      memo: memoWords.join(" ").slice(0, 60),
      ...share,
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
