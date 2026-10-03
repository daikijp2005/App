// AIへの指示文（Webアプリのサーバーとアーティファクト版で共通）
import { GENRES } from "./analyze.js";

// ジャンルの意味（AIが迷わないように例つきで渡す）
export const GENRE_GUIDE = GENRES.filter((g) => g.id !== "other").map((g) => `${g.id}（${g.label}）: ${g.words.slice(0, 6).join("・")}など`).join("\n") + "\nother（その他）: どれにも当てはまらないとき";

export const EXTRACT_RULES = `次のルールで読み取ってください。
- placeName: 店名・施設名・スポット名だけ（「【】」や絵文字、宣伝文句は外す）。投稿に複数の店が出てくるときは、いちばん中心になっている1つ。
- address: 都道府県から番地・建物名まで。わかる範囲で。郵便番号は含めない。
- prefecture: 都道府県名（例: 東京都・大阪府・北海道）。住所や駅・地名から確実にわかるときだけ。
- city: 都道府県を除いた住所の残り全部（市区町村から番地・建物名・階まで）。例: 住所が「東京都渋谷区神宮前4-12-10 2F」なら「渋谷区神宮前4-12-10 2F」。
- station: 最寄り駅（「〜駅」まで）。walkMin: 駅からの徒歩分数（書いてあれば）。
- genre: 下のジャンルから1つ。お店の主な目的で選ぶ（パフェが名物のカフェなら sweets、パンが主ならcafe など）。
- priceMin / priceMax: 1人あたりの円。メニューの価格帯・入場料・予算から。「無料」は0。セット価格しかなければそれを使う。書いていなければ null（推測しない）。
- hours: 営業時間（例: 11:00〜20:00、ランチ・ディナーが分かれていれば両方）。期間限定イベントは開催期間。
- closed: 定休日（例: 火曜、水・木曜、不定休）。
- deadline: 期間限定なら終了日を YYYY-MM-DD で（年がなければ今日以降で一番近い日付）。期間限定でなければ空文字。
- summary: どんな場所かを40字以内で。投稿の雰囲気を残して。
書かれていないことは作らず、空文字か null にしてください。`;

export function hintsText(hints) {
  if (!hints) return "";
  const keys = ["placeName", "address", "prefecture", "city", "station", "walkMin", "genre", "priceMin", "priceMax", "hours", "closed", "deadline"];
  const h = Object.fromEntries(keys.filter((k) => hints[k] != null && hints[k] !== "" && hints[k] !== "other").map((k) => [k, hints[k]]));
  return Object.keys(h).length ? `\n<rule_based_guess>（機械的に読み取った候補。間違っていれば直してください）\n${JSON.stringify(h)}\n</rule_based_guess>` : "";
}

export const ROUTE_RULES = `日本国内の移動として、具体的な行き方を答えてください。
- 実在する路線名・駅名・空港名・バス路線（わかる範囲）で、乗り換えの駅も書く。
- steps は順番どおり。type は walk / train / subway / shinkansen / bus / highway_bus / plane / car / taxi / transfer のどれか。
- minutes はそのステップのおおよその分数。fareYen は片道1人のおおよその合計（車は1台のガソリン・高速代、わからなければ null）。
- 時刻表や運行状況はわからないので、note に「時刻は乗換案内で確認」などの注意を短く。
- 指定された手段で行くのが現実的でなければ、その理由を note に書き、現実的な代わりの行き方を steps に。`;


// 手入力のメモ（投稿ではない）から読むときの追加ルール。実在の有名店などは知識で補ってよい
export const MEMO_RULES = `これはSNSの投稿ではなく、使う人が思いつくまま短く書いたメモです。
- メモに書かれていることを最優先にしてください。
- 店名・施設名がはっきりしていて、実在する場所だとあなたが確信できるときだけ、あなたの知識で住所・最寄り駅・ジャンル・おおよその値段を補ってください。確信がない項目は空文字か null にします。
- 「表参道のパンケーキ屋」のように店名がなければ、placeName は「表参道のパンケーキ屋さん」のような短い呼び名にし、エリア（都道府県・市区町村・駅）とジャンルを読み取ってください。
- 営業時間・定休日・期限は、メモに書いてあるときだけ入れてください。
- summary はメモの内容を自然な一文に。`;
