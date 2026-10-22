// データの保存と初期データ
// すべての画面（Dawn / Season / Journey）が同じ state を見るので、
// どこかで直せば全画面にすぐ反映される
(function (LL) {
  const KEY = "lifeloom:v1";
  const T = LL.parseTime;

  LL.DEFAULT_SETTINGS = {
    wake: T("7:00"),
    sleep: T("24:30"),
    prepOut: 45,
    prepSleep: 45,
    lunchThreshold: T("12:00"),
    breakfastLen: 15,
    breakfastOffset: 120,
    defaultOut: T("10:30"),
    defaultHome: T("22:45"),
    remindTime: T("21:00"),
    remindOn: true,
  };

  // ---------- 初期データ：2026年 残り3ヶ月の計画（plan-2026-q4.md より） ----------
  function seedPlan() {
    const g = { exam: "g-exam", script: "g-script", contest: "g-contest", pf: "g-pf", job: "g-job" };
    const task = (goalId, text, due, extra = {}) => ({ id: LL.uid(), goalId, text, due, done: false, status: "active", history: [], ...extra });
    const ext = (from) => ({ history: [{ date: "2026-10-18", from, to: "2026-10-24", note: "10/18分の延長" }] });

    return {
      id: "plan-2026-q4",
      name: "2026年 残り3ヶ月の計画",
      start: "2026-10-01",
      end: "2026-12-31",
      created: "2026-09-30",
      revised: "2026-10-11",
      goals: [
        { id: g.exam, title: "資格試験", vision: "TOEIC（10/25）・基本情報（11/25）・簿記2級（12/23）の3つを受けきる", color: "#3a6db5", status: "active" },
        { id: g.script, title: "サークル脚本", vision: "映画制作サークル冬作品の脚本を 11/4 に提出", color: "#e07b39", status: "active" },
        { id: g.contest, title: "コンテスト1つ", vision: "日本学生BtoB新聞広告大賞を年内に提出（目標12/16、遅くとも12/31）", color: "#c9407e", status: "active" },
        { id: g.pf, title: "ポートフォリオ", vision: "5ジャンルの作品をそろえ、第1版（PDF）を12/31に完成。深めたい分野を1つ決める", color: "#3a9a6a", status: "active" },
        { id: g.job, title: "就活と進路", vision: "インターン3社応募・1社参加、説明会5回、ES完成、本命5社前後に絞る、進路を仮決め", color: "#8a6bc4", status: "active" },
      ],
      rules: [
        "試験の集中期間は、試験当日を含む1週間前から。その試験の勉強8割、ほかの資格・芸術（制作）・筋トレで2割",
        "集中期間は就活・コンテストを止める。締切はすべて集中期間の外に置く",
        "コンテストはBtoB新聞広告の1つに絞り、時間をかけて作る。作品はそのままポートフォリオのページにする",
        "迷ったら挑戦する方を選ぶ",
        "説明会はオンラインも1回に数える",
        "毎週日曜の夜に10分だけ振り返る",
        "SPIは別プロジェクトで管理しているので、この計画には入れない",
      ],
      blocks: [
        { id: "b1", kind: "phase", name: "準備ウィーク", start: "2026-10-11", end: "2026-10-18", color: "#d8cbb4", focus: "脚本のあらすじ→書き始める、BtoBの課題確認、過去のグラフィック作品の整理、インターン募集の確認と応募", ratio: "", stopGoals: [] },
        { id: "b2", kind: "focus", name: "TOEIC集中", start: "2026-10-19", end: "2026-10-25", color: "#3a6db5", focus: "TOEIC集中", ratio: "TOEIC 8割 ／ ほかの資格・芸術・筋トレ 2割", stopGoals: [g.contest, g.job], examDate: "2026-10-25" },
        { id: "b3", kind: "phase", name: "冬作品ダッシュ", start: "2026-10-26", end: "2026-11-04", color: "#f2c9a6", focus: "冬作品: 小説→劇伴・主題歌3曲→脚本を10/31までに一通り、11/1〜11/3で手直し。個人の映像制作を始める。冬インターン応募、ES下書き", ratio: "", stopGoals: [] },
        { id: "b4", kind: "phase", name: "案出し期", start: "2026-11-05", end: "2026-11-18", color: "#efc1d5", focus: "BtoB新聞広告の課題選び・案出し、ES下書き、ポートフォリオ用の作品整理", ratio: "", stopGoals: [] },
        { id: "b5", kind: "focus", name: "基本情報集中", start: "2026-11-19", end: "2026-11-25", color: "#4aa3b5", focus: "基本情報集中", ratio: "基本情報 8割 ／ ほかの資格・芸術・筋トレ 2割", stopGoals: [g.contest, g.job], examDate: "2026-11-25" },
        { id: "b6", kind: "phase", name: "制作期", start: "2026-11-26", end: "2026-12-16", color: "#c3e0cf", focus: "BtoB新聞広告の制作、ES完成、ポートフォリオの構成づくり", ratio: "", stopGoals: [] },
        { id: "b7", kind: "focus", name: "簿記集中", start: "2026-12-17", end: "2026-12-23", color: "#8a6bc4", focus: "簿記集中", ratio: "簿記 8割 ／ ほかの資格・芸術・筋トレ 2割", stopGoals: [g.contest, g.job], examDate: "2026-12-23" },
        { id: "b8", kind: "phase", name: "仕上げウィーク", start: "2026-12-24", end: "2026-12-31", color: "#f3dd9b", focus: "ポートフォリオ第1版の仕上げ、ZINE、YouTube10本の編集、冬インターン（BtoBが間に合わなかったらここで提出）、進路の仮決め、3ヶ月の振り返り", ratio: "", stopGoals: [] },
      ],
      events: [
        { id: LL.uid(), type: "説明会", title: "JR東海エージェンシー説明会", date: "2026-10-14", goalId: g.job, note: "" },
        { id: LL.uid(), type: "本番", title: "TOEIC", date: "2026-10-25", goalId: g.exam, note: "" },
        { id: LL.uid(), type: "提出", title: "JR東海エージェンシー 課題ドキュメント4と6", date: "2026-10-29", goalId: g.job, note: "" },
        { id: LL.uid(), type: "説明会", title: "JR東海エージェンシー説明会 16:00", date: "2026-10-30", goalId: g.job, note: "" },
        { id: LL.uid(), type: "提出", title: "サークル冬作品 脚本提出", date: "2026-11-04", goalId: g.script, note: "" },
        { id: LL.uid(), type: "本番", title: "基本情報技術者試験", date: "2026-11-25", goalId: g.exam, note: "" },
        { id: LL.uid(), type: "提出", title: "日本学生BtoB新聞広告大賞 提出", date: "2026-12-16", official: "2027-02-28", goalId: g.contest, note: "遅くとも12/31。公式は2027/2/28必着" },
        { id: LL.uid(), type: "本番", title: "日商簿記2級", date: "2026-12-23", goalId: g.exam, note: "" },
        { id: LL.uid(), type: "ゴール", title: "ポートフォリオ第1版（PDF）完成", date: "2026-12-31", goalId: g.pf, note: "" },
        { id: LL.uid(), type: "ゴール", title: "進路を仮決め", date: "2026-12-31", goalId: g.job, note: "就職・大学院・両方準備" },
        { id: LL.uid(), type: "結果発表", title: "BtoB新聞広告大賞 結果発表（ごろ）", date: "2027-04-25", goalId: g.contest, note: "日本BtoB広告協会のHPと日刊工業新聞で発表" },
      ],
      tasks: [
        // 目標1 資格試験
        task(g.exam, "TOEIC を受ける", "2026-10-25"),
        task(g.exam, "基本情報技術者試験を受ける", "2026-11-25"),
        task(g.exam, "日商簿記2級を受ける", "2026-12-23"),
        task(g.exam, "集中期間の前に締切のあるものを片付ける（11/18の区切り）", "2026-11-18"),
        task(g.exam, "集中期間の前に締切のあるものを片付ける（12/16の区切り）", "2026-12-16"),
        // 目標2 サークル脚本
        task(g.script, "構成（3部・23シーン）とタイトルを決める", "2026-10-17", { done: true }),
        task(g.script, "冬作品の小説の書き出し", "2026-10-24", ext("2026-10-18")),
        task(g.script, "小説 → 劇伴・主題歌3曲 → 脚本を一通り仕上げる（完璧でなくてよい）", "2026-10-31"),
        task(g.script, "脚本を見直して手直し", "2026-11-03"),
        task(g.script, "脚本を提出", "2026-11-04"),
        task(g.script, "絵コンテ → 撮影 → 編集（サークルの予定に合わせる）", null),
        // 目標3 コンテスト
        task(g.contest, "課題提供企業の一覧を見て、素材のパスワードを取る", "2026-10-24", ext("2026-10-18")),
        task(g.contest, "課題を1つ選び、案出し・ラフ", "2026-11-18"),
        task(g.contest, "制作して提出", "2026-12-16"),
        // 目標4 ポートフォリオ
        task(g.pf, "過去のグラフィック作品を1つのフォルダに集め、載せたいものに印をつける", "2026-10-24", ext("2026-10-18")),
        task(g.pf, "個人の映像制作を始める", "2026-10-26"),
        task(g.pf, "ゼミの広報係として発信したものを作品として記録する", null),
        task(g.pf, "ポートフォリオの構成（表紙・自己紹介・ジャンル別・連絡先）を決める", "2026-12-16"),
        task(g.pf, "ZINEを組む", "2026-12-31"),
        task(g.pf, "YouTube10本を編集して1月の投稿を準備", "2026-12-31"),
        task(g.pf, "ポートフォリオ PDF 第1版を完成", "2026-12-31"),
        task(g.pf, "深めたい分野を1つ決める", "2026-12-31"),
        // 目標5 就活と進路
        task(g.job, "◎5社（ブラザー・カゴメ・ポッカサッポロ・興和・サンゲツ）の秋冬インターンの締切を確認し、1〜2社に応募", "2026-10-24", ext("2026-10-18")),
        task(g.job, "JR東海エージェンシーの課題ドキュメント 4と6", "2026-10-29"),
        task(g.job, "冬インターンに1〜2社応募", "2026-11-11"),
        task(g.job, "ガクチカ・自己PRを400字で下書き", "2026-11-11"),
        task(g.job, "キャリアセンターで志望企業の学内実績と先輩を聞く", "2026-11-11"),
        task(g.job, "ESを完成", "2026-12-16"),
        task(g.job, "本命を5社前後に絞る", "2026-12-16"),
        task(g.job, "大学院候補（名市大 芸術工学研究科・IAMAS・愛知県立芸大）の入試内容を調べる", "2026-12-16"),
        task(g.job, "冬インターンに参加", "2026-12-31"),
        task(g.job, "進路を仮決め（就職・大学院・両方準備）", "2026-12-31"),
      ],
      sequences: [
        {
          id: "seq-winter",
          goalId: g.script,
          title: "冬作品『漸 -at last-』の制作手順",
          deadline: "2026-11-03",
          steps: [
            { id: "s1", name: "小説（短めの下書き）", days: 2, start: "2026-10-26", end: "2026-10-27", done: false },
            { id: "s2", name: "劇伴・主題歌3曲（デモ）", days: 2, start: "2026-10-28", end: "2026-10-29", done: false },
            { id: "s3", name: "脚本（20分・一通り）", days: 2, start: "2026-10-30", end: "2026-10-31", done: false },
            { id: "s4", name: "脚本の手直し", days: 3, start: "2026-11-01", end: "2026-11-03", done: false },
            { id: "s5", name: "絵コンテ", days: 0, start: null, end: null, done: false },
            { id: "s6", name: "撮影", days: 0, start: null, end: null, done: false },
            { id: "s7", name: "編集", days: 0, start: null, end: null, done: false },
          ],
        },
      ],
      paces: [
        { id: "p1", goalId: g.pf, title: "YouTube 個人の映像を撮影", perWeek: 1, target: 10, start: "2026-10-26", end: "2026-12-16", skipFocus: true, log: [] },
      ],
      counters: [
        { id: "c1", goalId: g.job, title: "インターン応募", target: 3, count: 0, unit: "社", breakdown: [] },
        { id: "c2", goalId: g.job, title: "インターン参加", target: 1, count: 0, unit: "社", breakdown: [] },
        { id: "c3", goalId: g.job, title: "説明会", target: 5, count: 0, unit: "回", breakdown: [{ label: "オンライン", count: 0 }, { label: "対面", count: 0 }] },
        { id: "c4", goalId: g.job, title: "本命企業", target: 5, count: 0, unit: "社", breakdown: [] },
      ],
      candidates: [
        {
          id: "cg1",
          goalId: g.contest,
          title: "応募するコンテスト",
          criteria: ["優勝賞金", "学生限定", "作るもの"],
          items: [
            { id: LL.uid(), name: "日本学生BtoB新聞広告大賞", values: { 優勝賞金: "金賞30万円", 学生限定: "○", 作るもの: "BtoB企業の課題で新聞1ページ広告" }, status: "採用", reason: "1つに絞るならこれ。作品をそのままポートフォリオに", date: "2026-10-13" },
            { id: LL.uid(), name: "OAC", values: {}, status: "やめた", reason: "BtoB新聞広告の1つに絞ったため", date: "2026-10-13" },
            { id: LL.uid(), name: "毎日広告デザイン賞", values: {}, status: "やめた", reason: "BtoB新聞広告の1つに絞ったため", date: "2026-10-13" },
            { id: LL.uid(), name: "大垣まつり", values: {}, status: "やめた", reason: "BtoB新聞広告の1つに絞ったため", date: "2026-10-13" },
            { id: LL.uid(), name: "Metro Ad", values: {}, status: "やめた", reason: "BtoB新聞広告の1つに絞ったため", date: "2026-10-13" },
          ],
        },
        {
          id: "cg2",
          goalId: g.pf,
          title: "深める分野の候補",
          criteria: ["つながる仕事", "大学院で深めるなら"],
          items: [
            { id: LL.uid(), name: "グラフィック・エディトリアル（雑誌）", values: { つながる仕事: "広告・販促物、パッケージ", 大学院で深めるなら: "デザイン系の研究科" }, status: "予備", reason: "", date: "" },
            { id: LL.uid(), name: "映像・モーショングラフィックス", values: { つながる仕事: "企業の宣伝部、Web・SNS動画", 大学院で深めるなら: "映像メディア表現" }, status: "予備", reason: "", date: "" },
            { id: LL.uid(), name: "サウンド・楽曲", values: { つながる仕事: "広告・展示・映像の音", 大学院で深めるなら: "サウンドアート、メディアアート" }, status: "予備", reason: "", date: "" },
            { id: LL.uid(), name: "脚本・物語", values: { つながる仕事: "広告の企画、ブランドのストーリーづくり", 大学院で深めるなら: "メディア表現" }, status: "予備", reason: "", date: "" },
            { id: LL.uid(), name: "VR/AR・空間展示、メディアアート", values: { つながる仕事: "印刷大手の展示・XR、イベント企画", 大学院で深めるなら: "IAMAS、芸術大学の大学院" }, status: "予備", reason: "", date: "" },
            { id: LL.uid(), name: "UI/UX、プロダクト・パッケージ", values: { つながる仕事: "メーカーのデザイン職・商品企画", 大学院で深めるなら: "情報デザイン・芸術工学" }, status: "予備", reason: "", date: "" },
          ],
        },
      ],
      reviews: [],
      reviewDay: 0,
      reviewQuestions: ["今週やったこと（試験勉強、脚本・制作、コンテスト、就活）", "新しく知ったこと・気持ちが動いたこと", "来週やる3つ"],
      remind: { on: false, time: T("9:00"), daysAhead: 7, amount: "full", stoppedAt: "2026-10-21" },
      history: [
        { date: "2026-09-30", text: "計画を作成" },
        { date: "2026-10-11", text: "計画を全面改訂。YouTubeは年内に10本撮影、1月に3日に1本投稿と決定" },
        { date: "2026-10-13", text: "コンテストを日本学生BtoB新聞広告大賞の1つに絞った（OAC・毎日広告デザイン賞・大垣まつり・Metro Adをやめた）" },
        { date: "2026-10-17", text: "冬作品の制作手順を決定：小説→劇伴・主題歌→脚本→絵コンテ→撮影→編集" },
        { date: "2026-10-18", text: "集中期間の配分を「その試験8割・ほか2割」に変更" },
        { date: "2026-10-18", text: "10/18分のタスク4件を10/24（土）まで延長" },
        { date: "2026-10-21", text: "毎朝のリマインドを中止" },
      ],
    };
  }

  // ---------- 初期データ：大学生活の所属期間（年表の画像より） ----------
  function seedJourney() {
    return {
      title: "大学生活の所属期間（2024年4月〜2028年3月）",
      categories: [
        { id: "study", name: "学業", color: "#3a6db5" },
        { id: "club", name: "部活・サークル", color: "#e07b39" },
        { id: "work", name: "アルバイト", color: "#3a9a6a" },
        { id: "life", name: "私生活", color: "#c9407e" },
        { id: "other", name: "その他", color: "#8a8390" },
      ],
      lanes: [
        { id: LL.uid(), name: "大学（在学）", cat: "study", start: "2024-04-01", end: "2028-03-31", note: "2028年3月 卒業" },
        { id: LL.uid(), name: "ゼミ（村上ゼミ）", cat: "study", start: "2026-04-01", end: "2027-12-31", note: "" },
        { id: LL.uid(), name: "軽音楽部", cat: "club", start: "2024-04-01", end: "2025-01-31", note: "" },
        { id: LL.uid(), name: "映画制作サークル", cat: "club", start: "2025-04-15", end: "2028-03-31", note: "2028年3月まで" },
        { id: LL.uid(), name: "個別指導塾", cat: "work", start: "2024-04-01", end: "2024-04-20", note: "" },
        { id: LL.uid(), name: "本屋", cat: "work", start: "2024-05-01", end: "2026-01-31", note: "" },
        { id: LL.uid(), name: "喫茶店", cat: "work", start: "2025-02-01", end: "2027-02-28", note: "" },
        { id: LL.uid(), name: "迎賓館", cat: "work", start: "2026-05-01", end: "2027-01-31", note: "" },
        { id: LL.uid(), name: "名古屋でアルバイト", cat: "work", start: "2027-04-01", end: "2028-02-29", note: "" },
        { id: LL.uid(), name: "同棲（名古屋）", cat: "life", start: "2027-04-01", end: null, note: "2027年4月〜 卒業後も継続予定" },
      ],
      milestones: [
        { id: LL.uid(), date: "2024-04-01", label: "入学" },
        { id: LL.uid(), date: "2026-08-01", label: "初めての彼女" },
        { id: LL.uid(), date: "2028-03-31", label: "卒業" },
      ],
      zoom: null,
    };
  }

  function seed() {
    return {
      version: 1,
      settings: { ...LL.DEFAULT_SETTINGS },
      // 1日のスケジュール（log.md の記録）
      days: {
        "2026-10-22": { title: "デート", out: T("10:30"), home: T("22:45"), wake: null, sleep: null },
        "2026-10-23": { title: "大学", out: T("11:15"), home: T("22:30"), wake: null, sleep: null },
      },
      plans: [seedPlan()],
      activePlanId: "plan-2026-q4",
      journey: seedJourney(),
      meta: { lastDayRemind: null, lastMorningRemind: null },
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        s.settings = { ...LL.DEFAULT_SETTINGS, ...s.settings };
        s.meta = s.meta || {};
        return s;
      }
    } catch (_) {
      /* 壊れていたら初期データで作り直す */
    }
    return seed();
  }

  LL.state = load();
  LL.save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(LL.state));
    } catch (_) {
      LL.toast("保存できませんでした（ブラウザの保存領域を確認してください）");
    }
  };
  LL.resetAll = () => {
    LL.state = seed();
    LL.save();
  };
  LL.save();

  // 変更 → 保存 → 今の画面を描き直す
  LL.commit = () => {
    LL.save();
    if (LL.rerender) LL.rerender();
  };

  LL.activePlan = () => LL.state.plans.find((p) => p.id === LL.state.activePlanId) || LL.state.plans[0];
})(window.LL);
