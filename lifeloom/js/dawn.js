// Dawn ― あしたの設計図（1日のスケジュール画面）
// 外出前と帰宅後の空き時間をどう使うかを、横向きのタイムラインで見せる
(function (LL) {
  const COLORS = {
    free: "#f0a93b",
    night: "#b5835a",
    out: "#a9a4a6",
    prepOut: "#8db4d9",
    prepSleep: "#9a88c8",
    breakfast: "#7fb069",
  };
  const NAMES = {
    free: "筋トレ・娯楽",
    night: "読書",
    out: "外出",
    prepOut: "外出準備",
    prepSleep: "睡眠準備",
    breakfast: "朝食",
  };
  const SHORT = { free: "娯楽", night: "読書", out: "外出", prepOut: "準備", prepSleep: "風呂", breakfast: "朝食" };
  const RULES = ["朝の空き時間は 筋トレ・娯楽", "夜の空き時間は 読書", "移動中は 勉強"];

  let selected = LL.addDays(LL.today(), 1); // 既定は「明日」
  let draft = null; // 入力中（未保存）の値

  // ---------- 1日の組み立て（make_day.py のルールを移植） ----------
  LL.buildDay = function (date, entry, s) {
    entry = entry || {};
    const wake = entry.wake ?? s.wake;
    let sleep = entry.sleep ?? s.sleep;
    if (sleep <= wake) sleep += 1440;
    let out = entry.out ?? s.defaultOut;
    let home = entry.home ?? s.defaultHome;
    if (out < wake - 120) out += 1440; // 0:30 出発のような日
    if (home <= out) home += 1440; // 0:30 帰宅などは翌日扱い
    out = Math.min(Math.max(out, wake), sleep);
    home = Math.min(Math.max(home, out), sleep);

    const lunch = out >= s.lunchThreshold;
    const prepStart = Math.max(wake, out - s.prepOut);
    const blocks = [];
    const push = (type, a, b, label) => {
      if (b > a) blocks.push({ type, start: a, end: b, label: label || NAMES[type] });
    };

    if (lunch) {
      const bS = wake + s.breakfastOffset;
      const bE = Math.min(bS + s.breakfastLen, prepStart);
      if (bS < prepStart) {
        push("free", wake, bS);
        push("breakfast", bS, bE, "朝食");
        push("free", bE, prepStart);
      } else push("free", wake, prepStart);
    } else push("free", wake, prepStart);
    push("prepOut", prepStart, out, lunch ? "外出準備（昼食込み）" : "外出準備（朝食込み）");
    push("out", out, home, "外出");
    const sp = Math.min(sleep, home + s.prepSleep);
    push("prepSleep", home, sp, "睡眠準備（風呂込み）");
    push("night", sp, sleep, "読書");

    const sum = (t) => blocks.filter((b) => b.type === t).reduce((a, b) => a + b.end - b.start, 0);
    const next = LL.state.days[LL.addDays(date, 1)];
    const nextWake = (next && next.wake != null ? next.wake : s.wake) + 1440;
    return {
      date,
      title: entry.title || "",
      wake,
      sleep,
      out,
      home,
      lunch,
      blocks,
      awake: sleep - wake,
      free: sum("free"),
      night: sum("night"),
      outTotal: sum("out"),
      totals: Object.keys(NAMES).map((t) => ({ type: t, min: sum(t) })),
      sleepLen: nextWake - sleep,
      nextWake,
    };
  };

  const isDefault = (date) => !LL.state.days[date];

  function currentEntry() {
    if (draft && draft.date === selected) return draft;
    const saved = LL.state.days[selected];
    return { date: selected, ...(saved || { title: "", out: null, home: null, wake: null, sleep: null }) };
  }

  // ---------- 描画 ----------
  LL.renderDawn = function (root) {
    const s = LL.state.settings;
    const e = currentEntry();
    const day = LL.buildDay(selected, e, s);
    const tomorrow = LL.addDays(LL.today(), 1);
    const dirty = draft && draft.date === selected;

    root.innerHTML = `
      <section class="view-intro">
        <div>
          <p class="eyebrow">DAWN ・ あしたの設計図</p>
          <h2>出かける前と、帰ってからの時間を決める。</h2>
          <p class="lead">前の夜に「出る時間・帰る時間」を入れるだけで、1日の流れが組み上がります。</p>
        </div>
        <div class="intro-actions">
          <button class="btn ghost" data-act="settings">時間のルール</button>
        </div>
      </section>

      ${renderReminderBanner(tomorrow)}

      <form class="dawn-form card" autocomplete="off">
        <div class="date-nav">
          <button type="button" class="icon-btn" data-act="prev" aria-label="前の日">‹</button>
          <label class="date-pick">
            <input type="date" name="date" value="${selected}">
            <span>${LL.fmtMD(selected)}</span>
          </label>
          <button type="button" class="icon-btn" data-act="next" aria-label="次の日">›</button>
          ${selected !== tomorrow ? `<button type="button" class="chip-btn" data-act="tomorrow">明日へ</button>` : `<span class="chip-on">明日</span>`}
        </div>
        <div class="dawn-inputs">
          <label class="fi"><span>予定名</span><input name="title" value="${LL.esc(e.title || "")}" placeholder="大学、デート…"></label>
          <label class="fi em"><span>家を出る</span><input type="time" name="out" value="${LL.toInputTime(e.out ?? s.defaultOut)}"></label>
          <label class="fi em"><span>帰宅予定</span><input type="time" name="home" value="${LL.toInputTime(e.home ?? s.defaultHome)}"></label>
          <label class="fi sm"><span>起床 <i>この日だけ</i></span><input type="time" name="wake" value="${e.wake != null ? LL.toInputTime(e.wake) : ""}" placeholder="${LL.fmtTime(s.wake)}"></label>
          <label class="fi sm"><span>就寝 <i>この日だけ</i></span><input type="time" name="sleep" value="${e.sleep != null ? LL.toInputTime(e.sleep) : ""}"></label>
          <button type="submit" class="btn primary">${isDefault(selected) ? "この日を保存" : dirty ? "変更を保存" : "保存済み"}</button>
        </div>
        ${isDefault(selected) && !dirty ? `<p class="form-note">まだ入力がない日です。既定値（外出 ${LL.fmtTime(s.defaultOut)} ／ 帰宅 ${LL.fmtTime(s.defaultHome)}）で表示しています。</p>` : ""}
      </form>

      <div class="poster-scroll">${renderPoster(day)}</div>

      <section class="card history">
        <header class="card-head">
          <h3>記録</h3>
          <p>行を選ぶと、その日のタイムラインが開きます。同じ日付は上書きされます。</p>
        </header>
        ${renderHistory()}
      </section>
    `;
    bind(root);
    layoutPoster(root);
  };

  // 描いたあとで実際の幅を見て、文字のはみ出しと重なりを直す
  function layoutPoster(root) {
    LL.fitLabels([...root.querySelectorAll(".tl-block")]);
    LL.unstack([...root.querySelectorAll(".pin-label")]);
    const inner = root.querySelector(".tl-inner");
    const ticks = root.querySelectorAll(".tick:not(.half)");
    if (inner && ticks.length > 1) {
      const per = inner.clientWidth / ticks.length;
      const box = root.querySelector(".ticks");
      box.classList.toggle("sparse", per < 30);
      box.classList.toggle("show-half", per >= 90);
    }
  }

  function renderReminderBanner(tomorrow) {
    const s = LL.state.settings;
    if (LL.state.days[tomorrow]) return "";
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (!s.remindOn || nowMin < s.remindTime) return "";
    return `<div class="banner warn"><b>${LL.fmtMD(tomorrow)}の予定がまだです。</b> 出る時間と帰る時間を入れておきましょう。
      ${selected !== tomorrow ? `<button class="chip-btn" data-act="tomorrow">入力する</button>` : ""}</div>`;
  }

  function renderPoster(d) {
    const pct = (m) => ((m - d.wake) / d.awake) * 100;
    const year = selected.slice(0, 4);
    const zoom = LL.ui().dawnZoom || 1;
    const wakeStr = LL.fmtTime(d.wake);
    const sleepStr = LL.fmtTime(d.sleep);

    const blocks = d.blocks
      .map((b) => {
        const w = pct(b.end) - pct(b.start);
        const len = b.end - b.start;
        return `<div class="tl-block t-${b.type}" style="left:${pct(b.start)}%;width:${w}%;--c:${COLORS[b.type]}" title="${LL.esc(b.label)} ${LL.fmtTime(b.start)}–${LL.fmtTime(b.end)}（${LL.fmtDur(len)}）">
          <b data-short="${SHORT[b.type]}">${LL.esc(b.label.replace(/（.*）/, ""))}</b><small>${LL.fmtTime(b.start)}–${LL.fmtTime(b.end)}</small>
        </div>`;
      })
      .join("");

    const pins = [
      { m: d.wake, label: "起床" },
      { m: d.out, label: "家を出る" },
      { m: d.home, label: "帰宅" },
      { m: d.sleep, label: "就寝" },
    ]
      .map((p, i) => `<div class="pin ${i === 0 ? "first" : i === 3 ? "last" : ""}" style="left:${pct(p.m)}%"><div class="pin-label"><span>${p.label}</span><b>${LL.fmtTime(p.m)}</b></div></div>`)
      .join("");

    let ticks = "";
    for (let h = Math.ceil(d.wake / 60); h * 60 <= d.sleep; h++) {
      ticks += `<div class="tick" style="left:${pct(h * 60)}%"><span>${h > 24 ? h - 24 : h}</span></div>`;
      // 拡大したときは30分ごとの目盛りも出す
      if (zoom >= 2 && h * 60 + 30 < d.sleep) ticks += `<div class="tick half" style="left:${pct(h * 60 + 30)}%"><span>${h > 24 ? h - 24 : h}:30</span></div>`;
    }

    const ranges = (type) =>
      d.blocks
        .filter((b) => b.type === type)
        .map((b) => `${LL.fmtTime(b.start)}–${LL.fmtTime(b.end)}`)
        .join(" ／ ");
    const shown = d.totals.filter((t) => t.min > 0);
    const bar = shown.map((t) => `<i style="width:${(t.min / d.awake) * 100}%;background:${COLORS[t.type]}" class="${t.type === "out" ? "striped" : ""}"></i>`).join("");
    const legend = shown
      .map((t) => `<li><i style="background:${COLORS[t.type]}"></i>${NAMES[t.type]}<b>${Math.round((t.min / d.awake) * 100)}%</b></li>`)
      .join("");
    const prepOut = d.blocks.find((b) => b.type === "prepOut");
    const prepSleep = d.blocks.find((b) => b.type === "prepSleep");
    const titles = (d.title || "").split(/[、,，]/).map((t) => t.trim()).filter(Boolean);

    return `
      <article class="poster" id="dawn-poster">
        <header class="poster-head">
          <div>
            <p class="poster-kicker"><b>DAY PLAN</b> ／ ${year}
              ${titles.map((t) => `<span class="tag">${LL.esc(t)}</span>`).join("")}
              ${isDefault(selected) ? `<span class="tag ghost">既定値</span>` : ""}</p>
            <h1 class="poster-date">${LL.fmtMD(selected).replace("（", "<small>（").replace("）", "）</small>")}</h1>
            <p class="poster-sub">${wakeStr} 起床 → ${sleepStr} 就寝 ｜ 起きている時間 ${LL.fmtDur(d.awake)}</p>
          </div>
          <aside class="rule-box">
            <p>RULE</p>
            <ul>${RULES.map((r) => `<li>${r}</li>`).join("")}</ul>
          </aside>
        </header>

        <div class="timeline">
          <div class="tl-bar">${LL.zoomCtl("dawn", zoom, "タイムラインの拡大")}</div>
          <div class="tl-scroll">
            <div class="tl-inner" style="width:calc(max(100%, ${Math.round((d.awake / 60) * 40)}px) * ${zoom})">
              <div class="pins">${pins}</div>
              <div class="tl-track">${blocks}</div>
              <div class="ticks">${ticks}</div>
            </div>
          </div>
        </div>

        <div class="poster-cards">
          <div class="pcard" style="--c:${COLORS.free}">
            <p class="pc-label">筋トレ・娯楽</p>
            <p class="pc-num">${d.free ? fmtBig(d.free) : "朝の空きなし"}</p>
            <p class="pc-sub">${ranges("free") || "—"}</p>
          </div>
          <div class="pcard" style="--c:${COLORS.night}">
            <p class="pc-label">読書</p>
            <p class="pc-num">${d.night ? fmtBig(d.night) : "夜の空きなし"}</p>
            <p class="pc-sub">${ranges("night") || "—"}</p>
          </div>
          <div class="pcard" style="--c:${COLORS.out}">
            <p class="pc-label">外出 <i>移動中は勉強</i></p>
            <p class="pc-num">${fmtBig(d.outTotal)}</p>
            <p class="pc-sub">${ranges("out") || "—"}</p>
          </div>
          <div class="pcard wide">
            <p class="pc-label">${LL.fmtDur(d.awake)}の内訳</p>
            <div class="stack">${bar}</div>
            <ul class="legend">${legend}</ul>
          </div>
        </div>

        <footer class="poster-foot">
          <span>睡眠 ${sleepStr} → 翌 ${LL.fmtTime(d.nextWake - 1440)}（${LL.fmtDur(d.sleepLen)}）</span>
          ${prepOut ? `<span>外出準備 ${LL.fmtTime(prepOut.start)}–${LL.fmtTime(prepOut.end)}（${d.lunch ? "昼食込み" : "朝食込み"}）</span>` : ""}
          ${prepSleep ? `<span>睡眠準備 ${LL.fmtTime(prepSleep.start)}–${LL.fmtTime(prepSleep.end)}（風呂込み）</span>` : ""}
        </footer>
      </article>`;
  }

  // 「3時間30分」を大きな数字と小さな単位に分ける
  function fmtBig(min) {
    return LL.fmtDur(min).replace(/(\d+)/g, "<em>$1</em>");
  }

  function renderHistory() {
    const s = LL.state.settings;
    const dates = Object.keys(LL.state.days).sort().reverse();
    if (!dates.length) return `<p class="empty">まだ記録がありません。</p>`;
    const rows = dates
      .map((date) => {
        const e = LL.state.days[date];
        const d = LL.buildDay(date, e, s);
        return `<tr data-date="${date}" class="${date === selected ? "on" : ""}">
          <td><b>${LL.fmtMD(date)}</b></td>
          <td>${LL.esc(e.title || "—")}</td>
          <td>${LL.fmtTime(d.wake)}</td>
          <td>${LL.fmtTime(d.out)}</td>
          <td>${LL.fmtTime(d.home)}</td>
          <td>${LL.fmtTime(d.sleep)}</td>
          <td><span class="dot" style="--c:${COLORS.free}"></span>${LL.fmtDur(d.free)}</td>
          <td><span class="dot" style="--c:${COLORS.night}"></span>${LL.fmtDur(d.night)}</td>
          <td><span class="dot" style="--c:${COLORS.out}"></span>${LL.fmtDur(d.outTotal)}</td>
          <td><button class="icon-btn sm" data-del="${date}" aria-label="削除">×</button></td>
        </tr>`;
      })
      .join("");
    return `<div class="table-scroll"><table class="htable">
      <thead><tr><th>日付</th><th>予定名</th><th>起床</th><th>外出</th><th>帰宅</th><th>就寝</th><th>筋トレ・娯楽</th><th>読書</th><th>外出時間</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  // ---------- 操作 ----------
  function readForm(form) {
    const f = new FormData(form);
    return {
      date: selected,
      title: (f.get("title") || "").trim(),
      out: LL.parseTime(f.get("out")),
      home: LL.parseTime(f.get("home")),
      wake: LL.parseTime(f.get("wake")),
      sleep: fixSleep(LL.parseTime(f.get("sleep"))),
    };
  }
  // 就寝 0:30 は 24:30 として扱う
  const fixSleep = (m) => (m != null && m < 12 * 60 ? m + 1440 : m);

  function go(date) {
    selected = date;
    draft = null;
    LL.rerender();
  }
  LL.openDawnDate = (date) => {
    selected = date;
    draft = null;
  };

  function bind(root) {
    const form = root.querySelector(".dawn-form");
    form.addEventListener("input", (ev) => {
      if (ev.target.name === "date") return;
      draft = readForm(form);
      const day = LL.buildDay(selected, draft, LL.state.settings);
      root.querySelector(".poster-scroll").innerHTML = renderPoster(day);
      layoutPoster(root);
      const btn = form.querySelector("button[type=submit]");
      btn.textContent = "変更を保存";
      const note = form.querySelector(".form-note");
      if (note) note.remove();
    });
    form.querySelector("input[name=date]").addEventListener("change", (ev) => ev.target.value && go(ev.target.value));
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const v = readForm(form);
      LL.state.days[selected] = { title: v.title, out: v.out, home: v.home, wake: v.wake, sleep: v.sleep };
      draft = null;
      LL.commit();
      LL.toast(`${LL.fmtMD(selected)}を保存しました`);
    });

    root.onclick = (ev) => {
      const act = ev.target.closest("[data-act]")?.dataset.act;
      if (act === "prev") go(LL.addDays(selected, -1));
      if (act === "next") go(LL.addDays(selected, 1));
      if (act === "tomorrow") go(LL.addDays(LL.today(), 1));
      const zb = ev.target.closest("[data-zoom]");
      if (zb) {
        LL.ui().dawnZoom = LL.stepZoom(LL.ui().dawnZoom || 1, Number(zb.dataset.d));
        LL.save();
        LL.rerender();
      }
      if (act === "settings") openSettings();
      const del = ev.target.closest("[data-del]");
      if (del) {
        LL.ask({ message: `${LL.fmtMD(del.dataset.del)}の記録を消しますか？`, okLabel: "消す", danger: true }).then((ok) => {
          if (!ok) return;
          delete LL.state.days[del.dataset.del];
          LL.commit();
        });
        return;
      }
      const row = ev.target.closest("tr[data-date]");
      if (row) {
        go(row.dataset.date);
        document.querySelector(".poster-scroll").scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };
  }

  function openSettings() {
    const s = LL.state.settings;
    LL.openForm({
      title: "時間のルール",
      subtitle: "ここで変えた値は既定値として保存されます。入力画面の起床・就寝はその日だけに使われます。",
      value: s,
      fields: [
        { key: "wake", label: "起床時間", type: "time" },
        { key: "sleep", label: "就寝時間", type: "time", help: "0:30 なら 24:30 として扱います" },
        { key: "prepOut", label: "外出準備の長さ（分）", type: "number" },
        { key: "prepSleep", label: "睡眠準備の長さ（分）", type: "number" },
        { key: "lunchThreshold", label: "昼食込みにする出発時刻", type: "time", help: "この時刻以降に出る日は「昼食込み」＋朝食を別に入れる" },
        { key: "breakfastLen", label: "朝食の長さ（分）", type: "number" },
        { key: "breakfastOffset", label: "朝食の時刻（起床から何分後）", type: "number" },
        { key: "defaultOut", label: "入力がない日の外出", type: "time" },
        { key: "defaultHome", label: "入力がない日の帰宅", type: "time" },
        { key: "remindTime", label: "翌日分のリマインド時刻", type: "time" },
        { key: "remindOn", label: "リマインド", type: "checkbox", text: "翌日分が未入力なら知らせる" },
      ],
      onSave: (v) => {
        v.sleep = fixSleep(v.sleep);
        Object.keys(LL.DEFAULT_SETTINGS).forEach((k) => {
          if (v[k] == null) v[k] = LL.DEFAULT_SETTINGS[k];
        });
        LL.state.settings = v;
        LL.commit();
        LL.toast("ルールを保存しました");
      },
      onDelete: () => {
        LL.state.settings = { ...LL.DEFAULT_SETTINGS };
        LL.commit();
      },
      deleteLabel: "初期値に戻す",
      confirmDelete: false,
    });
  }

  // ---------- 前日夜のリマインド ----------
  LL.checkDayReminder = () => {
    const s = LL.state.settings;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const today = LL.today();
    const tomorrow = LL.addDays(today, 1);
    if (!s.remindOn || nowMin < s.remindTime) return;
    if (LL.state.days[tomorrow] || LL.state.meta.lastDayRemind === today) return;
    LL.state.meta.lastDayRemind = today;
    LL.save();
    LL.notify("Lifeloom ・ Dawn", `${LL.fmtMD(tomorrow)}の予定がまだです。出る時間と帰る時間を入れましょう。`);
    LL.toast(`${LL.fmtMD(tomorrow)}の予定がまだです`);
  };

  LL.DAWN_COLORS = COLORS;
})(window.LL);
