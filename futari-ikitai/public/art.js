// スポットのサムネイル用イラスト（写真がないときに出す）。
// ジャンルと店名・タグの言葉から絵柄を選び、IDから色合いを少しずつ変える。外部の画像は使わないので、どこでも表示できる。

const hash = (s) => { let h = 2166136261; for (const c of String(s || "")) h = Math.imul(h ^ c.codePointAt(0), 16777619); return h >>> 0; };

// ジャンルごとの色（空・地面・差し色）。同じジャンルでも ID によって3通りに変わる
const PALETTES = {
  cafe: [["#f6e3cf", "#e9c9a6", "#8a5a3c"], ["#f3e6d8", "#d9b99a", "#6f4a33"], ["#fbe9da", "#efc8a8", "#9b5f3d"]],
  sweets: [["#fde3ec", "#f7c1d3", "#e2577f"], ["#fff0e3", "#f9cdb8", "#e46f6a"], ["#f3e4fb", "#e2c4f2", "#b45fc9"]],
  gourmet: [["#fde8d4", "#f4c9a0", "#c8562e"], ["#fff1dc", "#f2d09c", "#b8482a"], ["#fbe4dc", "#efbca8", "#a6402b"]],
  bar: [["#2b2350", "#4a3a7a", "#f2b84b"], ["#1f2a4a", "#36487a", "#ef7d9b"], ["#30214a", "#5a3a6e", "#7fd1c7"]],
  nature: [["#d9efff", "#bfe3c8", "#3f8f5a"], ["#e6f6ff", "#cfe9c4", "#4c9a52"], ["#fff3dd", "#cfe6c2", "#3a8a6a"]],
  sightseeing: [["#ffe9d6", "#f6d3b5", "#d8452f"], ["#e5f1ff", "#f2dcc4", "#c8402c"], ["#fff2e0", "#eacfb2", "#bf3b2a"]],
  art: [["#e8ebfa", "#cfd5f1", "#4d5bc2"], ["#f1ecf8", "#d9cdef", "#7a4fc0"], ["#e9f3f7", "#c9dfea", "#2f7fa3"]],
  event: [["#fff1d0", "#fbd98e", "#e2574c"], ["#1e2448", "#38407a", "#ffcf4a"], ["#ffe6e0", "#f9c9b6", "#e2574c"]],
  shopping: [["#e1f4f7", "#c3e5ec", "#e36b8f"], ["#fdf0e6", "#f5d6c0", "#3f8fb0"], ["#eef0fb", "#d5daf3", "#e8875a"]],
  stay: [["#fbe3dd", "#f0c3b6", "#c4553f"], ["#25304f", "#3c4b75", "#f6c86a"], ["#f4e8dc", "#e5cdb3", "#8e5a3a"]],
  activity: [["#e1f5dc", "#c3e6bb", "#e7584e"], ["#e6f2ff", "#c6dcf4", "#f0a03c"], ["#fff2db", "#f3dbb0", "#3c8fd1"]],
  other: [["#efe9e6", "#ddd2cd", "#df4a72"], ["#e9eef2", "#d2dbe2", "#5b6fb5"], ["#f2ece2", "#e1d5c2", "#c4683f"]],
};

const has = (text, re) => re.test(text);

// 絵柄を選ぶ
function motifOf(s) {
  const t = [s.placeName, s.title, s.summary, (s.tags || []).join(" "), String(s.caption || "").slice(0, 200)].join(" ");
  switch (s.genre) {
    case "cafe": return has(t, /パンケーキ|ホットケーキ/) ? "pancake" : has(t, /パフェ/) ? "parfait" : "cup";
    case "sweets": return has(t, /パフェ/) ? "parfait" : has(t, /パンケーキ|ホットケーキ/) ? "pancake" : has(t, /かき氷|アイス|ジェラート|ソフトクリーム/) ? "ice" : "cake";
    case "gourmet": return has(t, /ラーメン|らーめん|つけ麺|うどん|そば|蕎麦|麺/) ? "ramen" : has(t, /寿司|鮨|すし|海鮮|刺身/) ? "sushi" : has(t, /焼肉|ステーキ|焼き鳥|焼鳥|ハンバーグ|肉/) ? "meat" : "dish";
    case "bar": return has(t, /ビール|ブルワリー|居酒屋|クラフト|ハイボール/) ? "beer" : "cocktail";
    case "nature": return has(t, /海|ビーチ|島|海岸|湖/) ? "sea" : has(t, /花|桜|紅葉|ネモフィラ|ひまわり|ラベンダー|梅|あじさい|紫陽花|チューリップ|コスモス/) ? "flower" : "mountain";
    case "sightseeing": return has(t, /タワー|展望|スカイツリー|夜景/) ? "tower" : has(t, /城/) ? "castle" : "torii";
    case "art": return has(t, /水族館|アクアリウム/) ? "fish" : "frame";
    case "event": return has(t, /花火|祭|まつり|フェス/) ? "fireworks" : "bunting";
    case "shopping": return "bags";
    case "stay": return has(t, /温泉|旅館|湯|サウナ|スパ/) ? "onsen" : "hotel";
    case "activity": return has(t, /キャンプ|グランピング|bbq|BBQ/) ? "tent" : "ferris";
    default: return "pin";
  }
}

// 花の色（桜・紅葉・ネモフィラ…）
function flowerColor(s) {
  const t = `${s.placeName || ""} ${(s.tags || []).join(" ")} ${s.summary || ""}`;
  if (/紅葉/.test(t)) return "#e8673a";
  if (/ネモフィラ|あじさい|紫陽花/.test(t)) return "#6f9be8";
  if (/ひまわり/.test(t)) return "#f4c430";
  if (/ラベンダー/.test(t)) return "#a07ad6";
  return "#f29bb8";
}

const W = "#ffffff";
const MOTIFS = {
  cup: (a) => `<rect x="40" y="176" width="240" height="64" fill="${a}" opacity=".18"/>
    <ellipse cx="160" cy="182" rx="74" ry="14" fill="${W}"/><ellipse cx="160" cy="180" rx="56" ry="9" fill="${a}" opacity=".15"/>
    <path d="M112 110h96l-8 58c-2 9-9 14-18 14h-44c-9 0-16-5-18-14z" fill="${W}"/><path d="M208 122c22 0 26 30 2 34" fill="none" stroke="${W}" stroke-width="10" stroke-linecap="round"/>
    <ellipse cx="160" cy="112" rx="48" ry="9" fill="${a}"/><path d="M152 109c0-5 8-5 8 0 0-5 8-5 8 0 0 6-8 9-8 11-0-2-8-5-8-11z" fill="${W}" opacity=".9"/>
    <path d="M140 92c-8-10 8-16 0-28M162 90c-8-10 8-16 0-28M184 92c-8-10 8-16 0-28" fill="none" stroke="${W}" stroke-width="5" stroke-linecap="round" opacity=".8"/>`,
  pancake: (a) => `<ellipse cx="160" cy="190" rx="96" ry="18" fill="${W}"/>
    <ellipse cx="160" cy="176" rx="72" ry="16" fill="#d9954f"/><ellipse cx="160" cy="166" rx="72" ry="16" fill="#f0c27a"/>
    <ellipse cx="160" cy="152" rx="72" ry="16" fill="#d9954f"/><ellipse cx="160" cy="142" rx="72" ry="16" fill="#f0c27a"/>
    <ellipse cx="160" cy="128" rx="72" ry="16" fill="#d9954f"/><ellipse cx="160" cy="118" rx="72" ry="16" fill="#f3cd8a"/>
    <path d="M110 118c10 8 22 2 30 10s-2 26 6 30 8-18 18-20 26 6 36-6c6-6 4-12 0-14" fill="#a8562a" opacity=".75"/>
    <rect x="146" y="102" width="28" height="16" rx="4" fill="#fff4c2"/><circle cx="196" cy="108" r="9" fill="${a}"/>`,
  parfait: (a) => `<path d="M120 86h80l-14 86h-52z" fill="${W}" opacity=".9"/>
    <path d="M124 104h72l-4 24h-64z" fill="${a}" opacity=".55"/><path d="M128 128h64l-3 22h-58z" fill="#fff3d6"/><path d="M131 150h58l-3 22h-52z" fill="#8a5a3c" opacity=".7"/>
    <rect x="150" y="172" width="20" height="18" fill="${W}"/><ellipse cx="160" cy="194" rx="34" ry="8" fill="${W}"/>
    <path d="M118 88c0-22 20-30 42-30s42 8 42 30z" fill="#fffaf2"/><path d="M134 70c8-10 44-10 52 0" fill="none" stroke="${a}" stroke-width="4" opacity=".4"/>
    <circle cx="168" cy="50" r="11" fill="#e0344d"/><path d="M168 40c2-10 8-14 14-16" fill="none" stroke="#3f7a3a" stroke-width="3"/>
    <path d="M190 64l22-30" stroke="#8a5a3c" stroke-width="5" stroke-linecap="round"/>`,
  cake: (a) => `<ellipse cx="160" cy="190" rx="92" ry="16" fill="${W}"/>
    <path d="M96 176l64-80 64 80z" fill="#fff3d6"/><path d="M96 176h128v-24H96z" fill="#fff8ea"/>
    <path d="M96 160h128" stroke="${a}" stroke-width="7" opacity=".7"/><path d="M110 140h100" stroke="${a}" stroke-width="5" opacity=".5"/>
    <path d="M128 112c10-8 22-8 32-16 10 8 22 8 32 16" fill="none" stroke="${W}" stroke-width="10" stroke-linecap="round"/>
    <path d="M160 70c-12 0-18 10-14 20 4 8 10 10 14 14 4-4 10-6 14-14 4-10-2-20-14-20z" fill="#e0344d"/><path d="M152 70l8-8 8 8" fill="#3f7a3a"/>`,
  ice: (a) => `<ellipse cx="160" cy="192" rx="80" ry="14" fill="${W}"/>
    <path d="M108 140h104l-14 46h-76z" fill="${W}"/><path d="M112 140c0-42 22-62 48-62s48 20 48 62z" fill="#fdfdfd"/>
    <path d="M118 120c14-24 30-30 42-30 20 0 34 12 42 30-10 10-24-6-42 4s-30 4-42-4z" fill="${a}" opacity=".75"/>
    <circle cx="160" cy="76" r="9" fill="#e0344d"/><path d="M128 156h64" stroke="${a}" stroke-width="5" opacity=".35"/>`,
  ramen: (a) => `<path d="M76 128h168c0 40-36 66-84 66s-84-26-84-66z" fill="${a}"/><path d="M90 150h140" stroke="${W}" stroke-width="5" opacity=".5" stroke-dasharray="10 10"/>
    <ellipse cx="160" cy="128" rx="84" ry="18" fill="#f2c27a"/>
    <path d="M100 128c14-8 26 8 40 0s26 8 40 0 26 8 40 0" fill="none" stroke="#fff1c4" stroke-width="5"/>
    <circle cx="132" cy="124" r="12" fill="${W}"/><circle cx="132" cy="124" r="6" fill="#f4b23a"/><rect x="164" y="116" width="26" height="14" rx="5" fill="#b36a43"/>
    <path d="M196 120l40-62M210 124l38-58" stroke="#a87b4f" stroke-width="6" stroke-linecap="round"/>
    <path d="M136 98c-6-8 6-12 0-22M168 96c-6-8 6-12 0-22" fill="none" stroke="${W}" stroke-width="4" stroke-linecap="round" opacity=".8"/>`,
  sushi: (a) => `<rect x="64" y="160" width="192" height="26" rx="10" fill="#7a4b2f"/><rect x="64" y="154" width="192" height="12" rx="6" fill="#a8693f"/>
    <rect x="92" y="122" width="58" height="32" rx="14" fill="${W}"/><path d="M88 124c10-14 54-14 66 0-6 10-58 10-66 0z" fill="#f07a5a"/><path d="M98 120l14 6M112 116l14 8M128 116l12 8" stroke="#fff" stroke-width="3" opacity=".6"/>
    <rect x="168" y="122" width="58" height="32" rx="14" fill="${W}"/><path d="M164 124c10-14 54-14 66 0-6 10-58 10-66 0z" fill="#e2344d"/><rect x="190" y="118" width="10" height="38" fill="#24402f"/>`,
  meat: (a) => `<circle cx="160" cy="150" r="70" fill="#3b3b3f"/><circle cx="160" cy="150" r="60" fill="none" stroke="#6b6b70" stroke-width="3"/>
    <path d="M110 130h100M104 150h112M110 170h100" stroke="#6b6b70" stroke-width="3"/>
    <path d="M120 122c10-10 34-8 40 2s-6 22-22 22-26-12-18-24z" fill="#c8563c"/><path d="M128 128c8 2 16 0 22 6" stroke="#f3c2a8" stroke-width="3" fill="none"/>
    <path d="M168 146c12-10 36-6 40 6s-10 20-24 18-24-14-16-24z" fill="#b84a34"/><path d="M176 152c8 2 16 0 22 6" stroke="#f3c2a8" stroke-width="3" fill="none"/>
    <path d="M140 90c-6-8 6-12 0-22M172 88c-6-8 6-12 0-22" fill="none" stroke="${W}" stroke-width="4" stroke-linecap="round" opacity=".7"/>`,
  dish: (a) => `<ellipse cx="160" cy="160" rx="96" ry="30" fill="${W}"/><ellipse cx="160" cy="156" rx="70" ry="20" fill="${a}" opacity=".15"/>
    <path d="M108 150c0-30 24-50 52-50s52 20 52 50z" fill="#d4dde3"/><path d="M118 146c0-24 20-38 42-38" fill="none" stroke="${W}" stroke-width="5" opacity=".7"/>
    <circle cx="160" cy="96" r="7" fill="#aab6bf"/>
    <path d="M58 120v56M50 120v18c0 6 16 6 16 0v-18" fill="none" stroke="${W}" stroke-width="5" stroke-linecap="round"/><path d="M262 120c10 6 10 30 0 36v20" fill="none" stroke="${W}" stroke-width="5" stroke-linecap="round"/>`,
  cocktail: (a, s, p) => `<circle cx="244" cy="56" r="20" fill="#fff4c9"/><circle cx="252" cy="50" r="18" fill="${p.sky1}"/>
    <g fill="#fff" opacity=".8"><circle cx="60" cy="40" r="2"/><circle cx="96" cy="70" r="1.6"/><circle cx="196" cy="34" r="1.8"/><circle cx="40" cy="96" r="1.4"/><circle cx="284" cy="104" r="1.6"/></g>
    <path d="M104 84h112l-56 62z" fill="${a}" opacity=".9"/><path d="M104 84h112" stroke="#fff" stroke-width="4"/><path d="M160 146v40" stroke="#fff" stroke-width="6"/><ellipse cx="160" cy="192" rx="30" ry="6" fill="#fff"/>
    <circle cx="186" cy="98" r="8" fill="#9cc65a"/><path d="M168 108l40-44" stroke="#fff" stroke-width="3"/>`,
  beer: (a) => `<g fill="#fff" opacity=".7"><circle cx="60" cy="40" r="2"/><circle cx="270" cy="60" r="2"/><circle cx="40" cy="110" r="1.5"/></g>
    <rect x="116" y="96" width="76" height="96" rx="10" fill="#f2b83a"/><path d="M192 112h14c12 0 12 50 0 50h-14" fill="none" stroke="#fff" stroke-width="10"/>
    <path d="M110 100c0-18 14-22 22-16 6-12 24-12 30-2 8-8 26-4 26 10 6 2 10 8 4 12h-82z" fill="#fff"/>
    <g fill="#fff" opacity=".6"><circle cx="136" cy="140" r="4"/><circle cx="160" cy="162" r="3"/><circle cx="148" cy="176" r="3"/></g>`,
  mountain: (a) => `<circle cx="240" cy="62" r="22" fill="#ffd36b"/>
    <path d="M0 200l80-110 50 60 40-40 70 90z" fill="${a}" opacity=".85"/><path d="M80 90l-18 26 12-4 6 8 8-10 10 4z" fill="#fff"/>
    <path d="M120 200l90-120 110 120z" fill="${a}"/><path d="M210 80l-22 30 14-6 8 10 10-12 12 6z" fill="#fff"/>
    <rect x="0" y="196" width="320" height="44" fill="#7fbf7a"/>
    <g fill="#3d7f47"><path d="M40 200l12-30 12 30z"/><path d="M60 204l10-24 10 24z"/><path d="M262 202l12-30 12 30z"/></g>`,
  sea: (a) => `<circle cx="96" cy="70" r="24" fill="#ffd36b"/>
    <rect x="0" y="140" width="320" height="100" fill="#4ea8d8"/><path d="M0 150c20-8 40 8 60 0s40 8 60 0 40 8 60 0 40 8 60 0 40 8 60 0" fill="none" stroke="#fff" stroke-width="4" opacity=".7"/>
    <path d="M0 176c20-8 40 8 60 0s40 8 60 0 40 8 60 0 40 8 60 0 40 8 60 0" fill="none" stroke="#fff" stroke-width="3" opacity=".5"/>
    <path d="M0 210c60-24 140-24 200-8 40 10 80 6 120-4v42H0z" fill="#f3dcae"/>
    <path d="M220 136v-50l34 44z" fill="#fff"/><path d="M204 136h56l-8 10h-40z" fill="${a}"/>`,
  flower: (a, s) => { const c = flowerColor(s); const f = (x, y, r) => `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map((d) => `<ellipse rx="${r * 0.55}" ry="${r}" transform="rotate(${d}) translate(0 ${-r * 0.9})" fill="${c}"/>`).join("")}<circle r="${r * 0.5}" fill="#ffe08a"/></g>`;
    return `<circle cx="250" cy="56" r="20" fill="#ffd36b"/><path d="M0 170c80-30 220-30 320 0v70H0z" fill="#8fcf84"/><path d="M0 196c80-20 220-20 320 0v44H0z" fill="#6dbb6a"/>
      ${f(70, 168, 14)}${f(130, 186, 18)}${f(200, 172, 15)}${f(256, 192, 17)}${f(36, 204, 12)}${f(170, 212, 12)}${f(292, 160, 11)}${f(102, 150, 10)}`; },
  torii: (a) => `<circle cx="160" cy="96" r="54" fill="#ffd9a8" opacity=".9"/>
    <rect x="0" y="196" width="320" height="44" fill="${a}" opacity=".15"/>
    <path d="M70 70c40 10 140 10 180 0l-6 18c-40 8-128 8-168 0z" fill="${a}"/><rect x="88" y="98" width="144" height="12" fill="${a}"/>
    <rect x="104" y="86" width="16" height="114" fill="${a}"/><rect x="200" y="86" width="16" height="114" fill="${a}"/><rect x="152" y="86" width="16" height="24" fill="${a}"/>
    <rect x="98" y="196" width="28" height="8" fill="#3b3b3f"/><rect x="194" y="196" width="28" height="8" fill="#3b3b3f"/>`,
  tower: (a) => `<g fill="#fff" opacity=".6"><circle cx="50" cy="50" r="2"/><circle cx="270" cy="40" r="2"/><circle cx="240" cy="90" r="1.5"/></g>
    <path d="M160 30l-8 40h16zM150 70l-24 130h68l-24-130z" fill="${a}"/><path d="M136 120h48M130 150h60M124 180h72" stroke="#fff" stroke-width="4"/>
    <path d="M144 100l32 40M176 100l-32 40M140 140l40 40M180 140l-40 40" stroke="#fff" stroke-width="2" opacity=".6"/>
    <rect x="0" y="196" width="320" height="44" fill="#3b3b5f" opacity=".5"/><g fill="#ffe28a" opacity=".8"><rect x="30" y="206" width="6" height="6"/><rect x="60" y="214" width="6" height="6"/><rect x="250" y="208" width="6" height="6"/><rect x="280" y="216" width="6" height="6"/></g>`,
  castle: (a) => `<rect x="0" y="196" width="320" height="44" fill="#9a9a9a" opacity=".4"/>
    <rect x="96" y="150" width="128" height="50" fill="#fff"/><path d="M80 154h160l-20-20H100z" fill="#4a5568"/>
    <rect x="116" y="104" width="88" height="34" fill="#fff"/><path d="M102 108h116l-18-18h-80z" fill="#4a5568"/>
    <rect x="134" y="66" width="52" height="28" fill="#fff"/><path d="M122 70h76l-16-18h-44z" fill="#4a5568"/><path d="M138 52l-6-8M182 52l6-8" stroke="#e2b23a" stroke-width="4"/>
    <g fill="#4a5568"><rect x="140" y="116" width="8" height="10"/><rect x="172" y="116" width="8" height="10"/><rect x="120" y="164" width="10" height="12"/><rect x="190" y="164" width="10" height="12"/><rect x="152" y="176" width="16" height="24"/></g>`,
  fish: (a) => `<rect x="0" y="0" width="320" height="240" fill="#4f9fd8" opacity=".5"/>
    <g fill="#fff" opacity=".5"><circle cx="70" cy="60" r="6"/><circle cx="84" cy="40" r="4"/><circle cx="250" cy="150" r="5"/><circle cx="262" cy="130" r="3"/></g>
    <path d="M110 120c30-36 90-36 110 0-20 36-80 36-110 0z" fill="${a}"/><path d="M110 120l-30-26v52z" fill="${a}"/><circle cx="196" cy="114" r="6" fill="#fff"/><circle cx="197" cy="114" r="3" fill="#222"/>
    <path d="M140 104c6 10 6 22 0 32M160 100c6 12 6 28 0 40" stroke="#fff" stroke-width="3" opacity=".5" fill="none"/>
    <path d="M30 240c0-40 10-60 20-80M60 240c0-30 -10-50 0-70M280 240c0-40 -8-56 -18-76" stroke="#3d9a6a" stroke-width="8" fill="none" stroke-linecap="round"/>`,
  frame: (a) => `<rect x="0" y="190" width="320" height="50" fill="${a}" opacity=".12"/>
    <rect x="92" y="54" width="136" height="110" rx="4" fill="#c79a54"/><rect x="104" y="66" width="112" height="86" fill="#fff"/>
    <circle cx="140" cy="96" r="16" fill="${a}" opacity=".8"/><path d="M104 152l40-40 26 22 22-18 24 36z" fill="${a}"/><circle cx="196" cy="88" r="8" fill="#f4c430"/>
    <path d="M160 54l-20-20h40z" fill="none" stroke="#8a6a3a" stroke-width="3"/><rect x="124" y="200" width="72" height="8" rx="4" fill="${a}" opacity=".3"/>`,
  fireworks: (a) => { const burst = (x, y, r, c) => `<g transform="translate(${x} ${y})" stroke="${c}" stroke-width="4" stroke-linecap="round">${Array.from({ length: 12 }, (_, i) => { const d = (i * Math.PI) / 6; return `<path d="M${(Math.cos(d) * r * 0.35).toFixed(1)} ${(Math.sin(d) * r * 0.35).toFixed(1)}L${(Math.cos(d) * r).toFixed(1)} ${(Math.sin(d) * r).toFixed(1)}"/>`; }).join("")}</g>`;
    return `${burst(110, 80, 44, a)}${burst(220, 64, 34, "#ff8fb1")}${burst(196, 140, 26, "#7fe0d0")}<rect x="0" y="200" width="320" height="40" fill="#151a33"/><g fill="#ffcf4a"><circle cx="40" cy="214" r="4"/><circle cx="90" cy="218" r="4"/><circle cx="240" cy="216" r="4"/><circle cx="290" cy="212" r="4"/></g>`; },
  bunting: (a) => `<path d="M0 40c80 40 240 40 320 0" fill="none" stroke="#8a6a3a" stroke-width="2"/>
    ${[20, 60, 100, 140, 180, 220, 260, 300].map((x, i) => { const y = 40 + Math.sin((x / 320) * Math.PI) * 30; return `<path d="M${x - 14} ${y - 4}l14 30 14-30z" fill="${["#e2574c", "#f4c430", "#4ea8d8", "#6dbb6a"][i % 4]}"/>`; }).join("")}
    <path d="M90 200l70-90 70 90z" fill="${a}"/><path d="M160 110l-20 90h40z" fill="#fff" opacity=".85"/><path d="M160 110v-24l20 8-20 8" fill="${a}"/>
    <rect x="0" y="198" width="320" height="42" fill="#6dbb6a" opacity=".6"/>`,
  bags: (a) => `<rect x="0" y="196" width="320" height="44" fill="${a}" opacity=".12"/>
    <path d="M88 110h80l8 90H80z" fill="${a}"/><path d="M108 110c0-30 40-30 40 0" fill="none" stroke="${a}" stroke-width="7"/>
    <path d="M152 126h84l-6 76h-72z" fill="#fff"/><path d="M176 126c0-26 36-26 36 0" fill="none" stroke="#fff" stroke-width="7"/><rect x="164" y="150" width="60" height="10" fill="${a}" opacity=".4"/>
    <path d="M222 150h50l4 52h-58z" fill="#f4c430"/><path d="M236 150c0-16 22-16 22 0" fill="none" stroke="#f4c430" stroke-width="5"/>`,
  onsen: (a) => `<circle cx="250" cy="56" r="20" fill="#fff4c9"/>
    <ellipse cx="160" cy="176" rx="104" ry="26" fill="#7cc4e0"/><ellipse cx="160" cy="172" rx="88" ry="18" fill="#a8dcef"/>
    <g fill="#8a8f98"><circle cx="64" cy="178" r="14"/><circle cx="256" cy="180" r="16"/><circle cx="90" cy="194" r="10"/><circle cx="232" cy="198" r="11"/></g>
    <path d="M124 150c-14-16 14-26 0-44M160 146c-14-16 14-26 0-44M196 150c-14-16 14-26 0-44" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round"/>`,
  hotel: (a) => `<circle cx="252" cy="54" r="18" fill="#fff4c9"/>
    <rect x="96" y="60" width="128" height="140" fill="${a}"/><rect x="88" y="52" width="144" height="12" fill="${a}" opacity=".8"/>
    <g fill="#ffe28a">${[0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => `<rect x="${108 + c * 28}" y="${76 + r * 26}" width="16" height="14" rx="2" opacity="${(r + c) % 3 ? 0.95 : 0.4}"/>`).join("")).join("")}</g>
    <rect x="146" y="176" width="28" height="24" fill="#fff" opacity=".85"/><rect x="0" y="198" width="320" height="42" fill="#000" opacity=".15"/>`,
  ferris: (a) => `<rect x="0" y="200" width="320" height="40" fill="#7fbf7a" opacity=".7"/>
    <circle cx="160" cy="110" r="72" fill="none" stroke="#fff" stroke-width="6"/>
    ${Array.from({ length: 8 }, (_, i) => { const d = (i * Math.PI) / 4; const x = 160 + Math.cos(d) * 72, y = 110 + Math.sin(d) * 72; return `<path d="M160 110L${x.toFixed(1)} ${y.toFixed(1)}" stroke="#fff" stroke-width="3"/><rect x="${(x - 10).toFixed(1)}" y="${(y - 4).toFixed(1)}" width="20" height="16" rx="5" fill="${["#e7584e", "#f0a03c", "#3c8fd1", "#6dbb6a"][i % 4]}"/>`; }).join("")}
    <circle cx="160" cy="110" r="10" fill="${a}"/><path d="M160 110l-34 92M160 110l34 92" stroke="#fff" stroke-width="7"/>`,
  tent: (a) => `<circle cx="248" cy="56" r="20" fill="#ffd36b"/><rect x="0" y="190" width="320" height="50" fill="#7fbf7a"/>
    <path d="M76 196l84-110 84 110z" fill="${a}"/><path d="M160 86l-28 110h56z" fill="#fff" opacity=".85"/>
    <g fill="#3d7f47"><path d="M26 196l18-50 18 50z"/><path d="M268 196l16-44 16 44z"/></g><path d="M200 210c8-8 20-8 28 0" stroke="#e2574c" stroke-width="6" fill="none"/>`,
  pin: (a) => `<g stroke="#fff" stroke-width="2" opacity=".6"><path d="M0 80h320M0 160h320M80 0v240M200 0v240"/></g>
    <path d="M40 200c60-40 120 20 240-60" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".8"/>
    <path d="M160 52c-26 0-46 20-46 46 0 34 46 80 46 80s46-46 46-80c0-26-20-46-46-46z" fill="${a}"/><circle cx="160" cy="98" r="16" fill="#fff"/>`,
};

let seq = 0;
// サムネイルのSVG（親いっぱいに広がる）
export function spotArt(s) {
  const motif = motifOf(s);
  const pals = PALETTES[s.genre] || PALETTES.other;
  const h = hash(s.id || s.placeName || s.url || "x");
  // 花火は夜空にする
  const [sky1, sky2, accent] = motif === "fireworks" ? PALETTES.event[1] : pals[h % pals.length];
  const id = `ga${(seq = (seq + 1) % 1e6)}`;
  const tilt = ((h >> 4) % 3) - 1; // ほんの少し傾けて、同じ絵柄でも並ぶと表情が変わる
  return `<svg class="art" viewBox="0 0 320 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky1}"/><stop offset="1" stop-color="${sky2}"/></linearGradient></defs>
    <rect width="320" height="240" fill="url(#${id})"/>
    <circle cx="${40 + (h % 60)}" cy="${30 + ((h >> 3) % 40)}" r="${26 + ((h >> 6) % 20)}" fill="#fff" opacity=".18"/><circle cx="${250 + ((h >> 9) % 50)}" cy="${170 + ((h >> 12) % 40)}" r="${30 + ((h >> 15) % 24)}" fill="#fff" opacity=".12"/>
    <g transform="rotate(${tilt} 160 140)">${MOTIFS[motif](accent, s, { sky1, sky2 })}</g></svg>`;
}

// ---------- ほかのアプリのアイコン（形と色をそろえた簡易マーク。各社の公式ロゴではない） ----------
const APP_GLYPH = {
  gmaps: `<path d="M12 2.5c-3.6 0-6.5 2.8-6.5 6.4 0 4.8 6.5 12.6 6.5 12.6s6.5-7.8 6.5-12.6c0-3.6-2.9-6.4-6.5-6.4z" fill="#ea4335"/><path d="M5.5 8.9c0 1.6.7 3.4 1.7 5.1L12 9.2V2.5c-3.6 0-6.5 2.8-6.5 6.4z" fill="#fbbc04"/><path d="M12 2.5v6.7l4.8 4.8c1-1.7 1.7-3.5 1.7-5.1 0-3.6-2.9-6.4-6.5-6.4z" fill="#4285f4"/><circle cx="12" cy="9" r="2.4" fill="#fff"/>`,
  apple: `<path d="M5 12.5 18.5 5.5 13 19l-1.6-5z" fill="#0a84ff"/>`,
  transit: `<rect x="6" y="3.5" width="12" height="13" rx="3" fill="#fff"/><rect x="8" y="6" width="8" height="4" rx="1" fill="#ff0033"/><circle cx="9" cy="13.2" r="1.1" fill="#ff0033"/><circle cx="15" cy="13.2" r="1.1" fill="#ff0033"/><path d="M8 20.5l2-3.5M16 20.5l-2-3.5" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>`,
  instagram: `<rect x="4.5" y="4.5" width="15" height="15" rx="4.5" fill="none" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="3.5" fill="none" stroke="#fff" stroke-width="2"/><circle cx="16.6" cy="7.4" r="1.1" fill="#fff"/>`,
  tiktok: `<path d="M14 4v10.2a3.3 3.3 0 1 1-3.3-3.3" fill="none" stroke="#25f4ee" stroke-width="2.4" stroke-linecap="round" transform="translate(-.8 -.6)"/><path d="M14 4v10.2a3.3 3.3 0 1 1-3.3-3.3" fill="none" stroke="#fe2c55" stroke-width="2.4" stroke-linecap="round" transform="translate(.8 .6)"/><path d="M14 4v10.2a3.3 3.3 0 1 1-3.3-3.3M14 4c.4 2.4 2 3.8 4.4 4" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`,
  x: `<path d="M5.5 5h3.6l9.4 14h-3.6zM18.2 5 6 19" stroke="#fff" stroke-width="1.9" fill="none" stroke-linejoin="round"/>`,
  youtube: `<rect x="3.5" y="6.5" width="17" height="11" rx="3.5" fill="#fff"/><path d="M10.5 9.5v5l4.5-2.5z" fill="#ff0000"/>`,
  tabelog: `<text x="12" y="16.6" text-anchor="middle" font-size="12.5" font-weight="900" fill="#fff" font-family="system-ui,sans-serif">食</text>`,
  google: `<text x="12" y="17" text-anchor="middle" font-size="15" font-weight="800" fill="#4285f4" font-family="Arial,system-ui,sans-serif">G</text>`,
  threads: `<text x="12" y="17" text-anchor="middle" font-size="15" font-weight="800" fill="#fff" font-family="system-ui,sans-serif">@</text>`,
  lemon8: `<circle cx="12" cy="12" r="6" fill="#fff"/><text x="12" y="15.5" text-anchor="middle" font-size="9" font-weight="900" fill="#222" font-family="system-ui,sans-serif">8</text>`,
  googlemaps: null,
  facebook: `<text x="12.5" y="18" text-anchor="middle" font-size="17" font-weight="900" fill="#fff" font-family="system-ui,sans-serif">f</text>`,
  web: `<circle cx="12" cy="12" r="7.5" fill="none" stroke="#fff" stroke-width="1.8"/><path d="M4.5 12h15M12 4.5c-4 4.5-4 10.5 0 15M12 4.5c4 4.5 4 10.5 0 15" fill="none" stroke="#fff" stroke-width="1.5"/>`,
  calendar: `<rect x="4.5" y="6" width="15" height="13.5" rx="2.5" fill="#fff"/><rect x="4.5" y="6" width="15" height="4" rx="2" fill="#e8453c"/><text x="12" y="17.8" text-anchor="middle" font-size="7.5" font-weight="800" fill="#333" font-family="system-ui,sans-serif">31</text>`,
  line: `<path d="M12 4.5c-4.7 0-8.5 3-8.5 6.8 0 3.4 3 6.2 7.1 6.7l-.4 2.5 3.4-2.4c3.7-.6 6.9-3.4 6.9-6.8 0-3.8-3.8-6.8-8.5-6.8z" fill="#fff"/><text x="12" y="13.2" text-anchor="middle" font-size="4.6" font-weight="900" fill="#06c755" font-family="system-ui,sans-serif">LINE</text>`,
  copy: `<rect x="8" y="8" width="11" height="11" rx="2.5" fill="none" stroke="#fff" stroke-width="1.9"/><path d="M15.5 5.5H7.5a2 2 0 0 0-2 2v8" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/>`,
};
export function appIcon(app) {
  const id = app === "googlemaps" ? "gmaps" : APP_GLYPH[app] ? app : "web";
  return `<span class="app-ic app-${id}" aria-hidden="true"><svg viewBox="0 0 24 24">${APP_GLYPH[id]}</svg></span>`;
}
