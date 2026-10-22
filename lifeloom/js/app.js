// 画面の切り替え（#dawn / #season / #journey）と全体の設定
(function (LL) {
  const VIEWS = {
    dawn: { render: LL.renderDawn, accent: "#f0a93b" },
    season: { render: LL.renderSeason, accent: "#4a8fb8" },
    journey: { render: LL.renderJourney, accent: "#c9407e" },
  };
  let current = "dawn";
  const view = document.getElementById("view");

  LL.go = (name) => {
    if (location.hash !== `#${name}`) location.hash = name;
    else show(name);
  };

  function show(name) {
    current = VIEWS[name] ? name : "dawn";
    document.body.dataset.view = current;
    document.documentElement.style.setProperty("--accent", VIEWS[current].accent);
    document.querySelectorAll(".scale-tab").forEach((t) => t.classList.toggle("on", t.dataset.view === current));
    LL.rerender();
    window.scrollTo({ top: 0 });
  }

  LL.rerender = () => {
    const y = window.scrollY;
    VIEWS[current].render(view);
    window.scrollTo({ top: y });
  };

  window.addEventListener("hashchange", () => show(location.hash.slice(1)));

  // 今日の日付
  const t = LL.today();
  document.getElementById("today-chip").innerHTML = `<b>${LL.fmtMD(t)}</b><span>${t.slice(0, 4)}</span>`;

  // 表示テーマ（ダーク → ライト → 端末に合わせる の順に切り替え）
  const THEMES = [
    ["dark", "☾", "ダーク"],
    ["light", "☀", "ライト"],
    ["auto", "◐", "端末の設定に合わせる"],
  ];
  const themeBtn = document.getElementById("theme-btn");
  const paintTheme = () => {
    const cur = THEMES.find((t) => t[0] === document.documentElement.dataset.llTheme) || THEMES[0];
    themeBtn.textContent = cur[1];
    themeBtn.title = `表示テーマ：${cur[2]}`;
  };
  themeBtn.addEventListener("click", () => {
    const i = THEMES.findIndex((t) => t[0] === document.documentElement.dataset.llTheme);
    const next = THEMES[(i + 1) % THEMES.length];
    document.documentElement.dataset.llTheme = next[0];
    try {
      localStorage.setItem("lifeloom:theme", next[0]);
    } catch (_) {
      /* 保存できなくても今回の表示は切り替わる */
    }
    paintTheme();
    LL.toast(`表示テーマ：${next[2]}`);
  });
  paintTheme();

  // データの書き出し・読み込み・初期化
  document.getElementById("data-btn").addEventListener("click", () => {
    const perm = "Notification" in window ? Notification.permission : "unsupported";
    LL.openPanel(
      "データと通知",
      `<p class="muted">${
        LL.cloudStatus === "cloud"
          ? "データはあなたのアカウントの自分専用の場所に保存されています（ほかの人には見えません）。別の端末でこのページを開いても同じデータが出ます。"
          : "データはこのブラウザの中にだけ保存されています。別の端末へ移すときは書き出し→読み込みを使ってください。"
      }</p>
       <div class="panel-actions left">
         <button class="btn ghost" data-x="export">↓ 書き出す（JSON）</button>
         <label class="btn ghost">↑ 読み込む<input type="file" accept="application/json" data-x="import" hidden></label>
         <button class="btn ghost danger" data-x="reset">初期データに戻す</button>
       </div>
       <h4>通知</h4>
       <p class="muted">${perm === "granted" ? "通知は許可されています。" : perm === "denied" ? "通知はブラウザでブロックされています。ブラウザの設定から許可してください。" : perm === "unsupported" ? "このブラウザは通知に対応していません。" : "リマインドを通知で受け取るには許可が必要です。"}
       （通知はこのページを開いているあいだに届きます）</p>
       ${perm === "default" ? `<button class="btn primary" data-x="perm">通知を許可する</button>` : ""}`,
      (e) => {
        const x = e.target.closest("[data-x]")?.dataset.x;
        if (x === "export") {
          LL.saveFile(`lifeloom-${LL.today()}.json`, JSON.stringify(LL.state, null, 2));
        }
        if (x === "reset")
          LL.ask({ message: "いまのデータを消して、初期データに戻しますか？", okLabel: "初期データに戻す", danger: true }).then((ok) => {
            if (!ok) return;
            LL.resetAll();
            LL.closeModal();
            LL.rerender();
            LL.toast("初期データに戻しました");
          });
        if (x === "perm") Notification.requestPermission().then(() => LL.closeModal());
      }
    );
    document.querySelector("[data-x=import]").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!data.plans || !data.journey) throw new Error("形式が違います");
        LL.state = data;
        LL.save();
        LL.closeModal();
        LL.rerender();
        LL.toast("読み込みました");
      } catch (err) {
        LL.toast(`読み込めませんでした：${err.message}`);
      }
    });
  });

  // リマインドの確認（ページを開いているあいだ1分ごと）
  const tick = () => {
    LL.checkDayReminder();
    LL.checkMorningReminder();
  };
  setInterval(tick, 60 * 1000);

  show(location.hash.slice(1) || "dawn");
  tick();
  LL.connectCloud();
})(window.LL);
