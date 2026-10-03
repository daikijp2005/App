import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeText, extractPrice, classifyGenre } from "../lib/analyze.js";
import { parseHtml, normalizeUrl, detectPlatform, cleanCaption } from "../lib/preview.js";
import { estimateTravel, formatPrice, formatMinutes } from "../public/util.js";

const caption = `表参道にできた新しいカフェ☕️
ふわふわのパンケーキが絶品でした🥞

📍Cafe Lumière 表参道
住所：東京都渋谷区神宮前4-12-10
表参道駅から徒歩5分
営業時間 10:00〜19:00
定休日 火曜日
パンケーキ ¥1,580 / ラテ 650円

#表参道カフェ #パンケーキ #東京カフェ`;

test("Instagramによくあるキャプションから情報を抜き出す", () => {
  const r = analyzeText(caption);
  assert.equal(r.genre, "cafe");
  assert.equal(r.placeName, "Cafe Lumière 表参道");
  assert.equal(r.address, "東京都渋谷区神宮前4-12-10");
  assert.equal(r.prefecture, "東京都");
  assert.equal(r.city, "渋谷区");
  assert.equal(r.station, "表参道駅");
  assert.equal(r.walkMin, 5);
  assert.equal(r.priceMin, 650);
  assert.equal(r.priceMax, 1580);
  assert.equal(r.hours, "10:00〜19:00");
  assert.equal(r.closed, "火曜日");
  assert.deepEqual(r.tags, ["表参道カフェ", "パンケーキ", "東京カフェ"]);
});

test("値段: 無料・万円・年号は誤検出しない", () => {
  assert.deepEqual(extractPrice("入場無料のイベント 2026年10月開催"), { priceMin: 0, priceMax: 0, priceNote: "無料" });
  assert.equal(extractPrice("1泊2.5万円の宿").priceMin, 25000);
  assert.equal(extractPrice("2026年にオープン").priceMin, null);
});

test("ジャンル分類", () => {
  assert.equal(classifyGenre("箱根の露天風呂付き客室がある旅館 #温泉"), "stay");
  assert.equal(classifyGenre("夜景がきれいな展望台"), "nature");
  assert.equal(classifyGenre("期間限定のポップアップイベント開催中"), "event");
  assert.equal(classifyGenre("絶品焼肉ディナー"), "gourmet");
  assert.equal(classifyGenre("こんにちは"), "other");
});

test("OGP と JSON-LD を読む", () => {
  const html = `<html><head><title>fallback</title>
    <meta property="og:title" content="焼肉 たろう &amp; はなこ">
    <meta property="og:description" content="和牛ランチ ¥2,000〜">
    <meta property="og:image" content="https://example.com/a.jpg">
    <script type="application/ld+json">{"@type":"Restaurant","name":"焼肉たろう","address":{"addressRegion":"大阪府","addressLocality":"大阪市北区","streetAddress":"梅田1-1"},"geo":{"latitude":34.70,"longitude":135.49},"priceRange":"¥3,000～¥3,999"}</script>
  </head></html>`;
  const p = parseHtml(html);
  assert.equal(p.title, "焼肉 たろう & はなこ");
  assert.equal(p.image, "https://example.com/a.jpg");
  assert.equal(p.ld.name, "焼肉たろう");
  assert.equal(p.ld.address, "大阪府大阪市北区梅田1-1");
  assert.equal(p.lat, 34.7);
});

test("URLの正規化とSNS判定", () => {
  assert.equal(normalizeUrl("見て！ https://www.instagram.com/p/ABC123/?igsh=xyz&utm_source=ig"), "https://www.instagram.com/p/ABC123/");
  assert.equal(detectPlatform("https://vt.tiktok.com/ZS123/"), "tiktok");
  assert.equal(detectPlatform("https://x.com/user/status/1"), "x");
  assert.equal(detectPlatform("https://tabelog.com/tokyo/A1301/"), "tabelog");
  assert.equal(normalizeUrl("URLなし"), "");
});

test("Instagram の og:description から本文だけ取り出す", () => {
  const raw = `1,234 likes, 56 comments - cafe_lover on June 1, 2026: "表参道の新しいカフェ📍東京都渋谷区神宮前".`;
  assert.equal(cleanCaption("instagram", raw), "表参道の新しいカフェ📍東京都渋谷区神宮前");
});

test("移動時間の目安は距離が延びると長くなる", () => {
  const shibuya = { lat: 35.658, lng: 139.7016 };
  const near = estimateTravel(shibuya, { lat: 35.6654, lng: 139.7121 }); // 表参道
  const mid = estimateTravel(shibuya, { lat: 35.4437, lng: 139.638 }); // 横浜
  const far = estimateTravel(shibuya, { lat: 35.0116, lng: 135.7681 }); // 京都
  assert.ok(near.walk != null && near.best <= 25);
  assert.ok(mid.best > near.best && mid.best < 90);
  assert.ok(far.train > 120 && far.train < 400);
  let prev = 0;
  for (let km = 0.5; km < 600; km += 0.5) {
    const t = estimateTravel({ lat: 35, lng: 139 }, { lat: 35 + km / 111, lng: 139 });
    assert.ok(t.train >= prev, `電車の時間が ${km}km で逆転しています`);
    prev = t.train;
  }
});

test("表示用フォーマット", () => {
  assert.equal(formatPrice({ priceMin: 1000, priceMax: 3000 }), "¥1,000〜¥3,000");
  assert.equal(formatPrice({ priceMin: 0, priceMax: 0 }), "無料");
  assert.equal(formatPrice({ priceMin: null, priceMax: null }), "");
  assert.equal(formatMinutes(45), "45分");
  assert.equal(formatMinutes(95), "1時間35分");
});
