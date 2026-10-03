// 画面とテストの両方から使う計算まわり

export function distanceKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 直線距離から移動時間の目安を出す（経路検索APIなしで動かすための概算）。
// 道のりは直線の約1.3倍、電車は乗り換え・待ち時間込みで遠いほど速くなる想定。
export function estimateTravel(from, to) {
  const km = distanceKm(from, to);
  const road = km * 1.3;
  const walk = km <= 2.5 ? Math.max(1, Math.round((road / 4.5) * 60)) : null;
  // 平均速度(km/h)は距離が長いほど上がる（近場は乗り換え・信号が多く、遠くは特急・新幹線・高速道路）
  const trainSpeed = Math.min(150, 20 + road * 0.5);
  const train = Math.round(10 + (road / trainSpeed) * 60);
  const carSpeed = Math.min(70, 18 + road * 0.6);
  const car = Math.round(5 + (road / carSpeed) * 60);
  // 歩いて15分以内なら徒歩、それ以外は電車と車の速いほう
  const best = walk != null && walk <= 15 ? walk : Math.min(train, car);
  return { km, walk, train, car, best };
}

export function formatMinutes(min) {
  if (min == null) return "";
  if (min < 60) return `${min}分`;
  const h = Math.floor(min / 60);
  const m = Math.round((min % 60) / 5) * 5;
  return m ? `${h}時間${m}分` : `${h}時間`;
}

export function formatPrice(it) {
  if (it.priceMin == null && it.priceMax == null) return it.priceNote === "無料" ? "無料" : "";
  if (it.priceMin === 0 && (it.priceMax ?? 0) === 0) return "無料";
  const f = (n) => `¥${Number(n).toLocaleString("ja-JP")}`;
  if (it.priceMax == null || it.priceMax === it.priceMin) return `${f(it.priceMin)}〜`;
  return `${f(it.priceMin)}〜${f(it.priceMax)}`;
}

export function priceBucket(it) {
  const p = it.priceMin;
  if (p == null) return { id: "none", label: "💴 値段不明", order: 9 };
  if (p === 0) return { id: "free", label: "💴 無料", order: 0 };
  if (p <= 1000) return { id: "p1", label: "💴 〜¥1,000", order: 1 };
  if (p <= 3000) return { id: "p2", label: "💴 〜¥3,000", order: 2 };
  if (p <= 5000) return { id: "p3", label: "💴 〜¥5,000", order: 3 };
  return { id: "p4", label: "💴 ¥5,000〜", order: 4 };
}

export function travelBucket(t) {
  if (!t) return { id: "none", label: "🚃 移動時間不明", order: 9 };
  if (t.best <= 30) return { id: "t30", label: "🚃 30分以内", order: 0 };
  if (t.best <= 60) return { id: "t60", label: "🚃 1時間以内", order: 1 };
  if (t.best <= 120) return { id: "t120", label: "🚃 2時間以内", order: 2 };
  return { id: "tfar", label: "🚄 遠出（2時間〜）", order: 3 };
}

export function relativeDate(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60) return "たった今";
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}日前`;
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${sameYear ? "" : d.getFullYear() + "/"}${d.getMonth() + 1}/${d.getDate()}`;
}
