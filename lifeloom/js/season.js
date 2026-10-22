// Season ― 数ヶ月の航路（中期目標の画面）
// 1つの計画データを「今日・今週」「計画カレンダー」「目標ボード」の3つの見せ方で表示する
(function (LL) {
  const EVENT_TYPES = {
    本番: "#d64545",
    提出: "#e07b39",
    説明会: "#3a9a6a",
    ゴール: "#6b5a78",
    結果発表: "#8a6bc4",
    その他: "#8a8390",
  };
  // 集中期間に入っていても警告しない種類（本番は集中期間の最終日にあって当然）
  const NO_WARN = ["本番", "結果発表"];
  const CAND_STATUS = { 採用: "adopt", 予備: "keep" };

  let sub = "today";
  let selectMode = false;
  const selected = new Set();
  const calSize = () => LL.ui().calSize || "m";

  // ---------- 計算 ----------
  const P = () => LL.activePlan();
  const goalOf = (plan, id) => plan.goals.find((g) => g.id === id);
  const blocksOn = (plan, date) => plan.blocks.filter((b) => LL.inRange(date, b.start, b.end));
  const focusOn = (plan, date) => blocksOn(plan, date).find((b) => b.kind === "focus");
  const phaseOn = (plan, date) => blocksOn(plan, date).find((b) => b.kind !== "focus");
  const isFocusDay = (plan, date) => !!focusOn(plan, date);
  const stoppedOn = (plan, date) => new Set(blocksOn(plan, date).flatMap((b) => b.stopGoals || []));
  const liveTasks = (plan) => plan.tasks;
  const goalColor = (plan, id) => goalOf(plan, id)?.color || "#8a8390";

  function warnings(plan) {
    const out = [];
    const today = LL.today();
    plan.events.forEach((ev) => {
      if (NO_WARN.includes(ev.type)) return;
      const f = focusOn(plan, ev.date);
      if (f) out.push({ level: "warn", text: `「${ev.title}」(${LL.fmtMD(ev.date)}) が集中期間「${f.name}」に入っています` });
    });
    liveTasks(plan).forEach((t) => {
      if (t.done || !t.due) return;
      if (t.due < today) out.push({ level: "late", text: `期限切れ：「${t.text}」(${LL.fmtMD(t.due)})`, taskId: t.id });
      else {
        const f = focusOn(plan, t.due);
        if (f && (f.stopGoals || []).includes(t.goalId))
          out.push({ level: "warn", text: `「${t.text}」の期限が、止めている期間「${f.name}」に入っています` });
      }
    });
    (plan.sequences || []).forEach((seq) =>
      seq.steps.forEach((st) => {
        if (!st.start) return;
        if (st.end && seq.deadline && st.end > seq.deadline) out.push({ level: "warn", text: `手順「${st.name}」が締切 ${LL.fmtMD(seq.deadline)} を超えています` });
      })
    );
    return out;
  }

  function paceStats(plan, p) {
    const today = LL.today();
    const weekStart = LL.addDays(today, -LL.parseYmd(today).getDay());
    const thisWeek = p.log.filter((d) => d >= weekStart && d <= today).length;
    let active = 0;
    for (let d = p.start; d <= p.end && d <= today; d = LL.addDays(d, 1)) if (!(p.skipFocus && isFocusDay(plan, d))) active++;
    const expected = today < p.start ? 0 : Math.min(p.target, Math.floor((active / 7) * p.perWeek));
    const paused = p.skipFocus && isFocusDay(plan, today);
    return { thisWeek, total: p.log.length, expected, paused };
  }

  function counterTotal(c) {
    return c.breakdown && c.breakdown.length ? c.breakdown.reduce((a, b) => a + b.count, 0) : c.count;
  }

  // 締切からさかのぼって手順に日付を割り当てる（集中期間は飛ばす）
  function backcalc(plan, seq) {
    let cursor = seq.deadline;
    const dated = seq.steps.filter((s) => s.days > 0);
    for (let i = dated.length - 1; i >= 0; i--) {
      const st = dated[i];
      while (isFocusDay(plan, cursor)) cursor = LL.addDays(cursor, -1);
      st.end = cursor;
      let d = cursor;
      for (let n = 1; n < st.days; ) {
        d = LL.addDays(d, -1);
        if (!isFocusDay(plan, d)) n++;
      }
      st.start = d;
      cursor = LL.addDays(d, -1);
    }
  }
  // 最初の手順の開始日から前詰めで並べ直す（前の工程がずれたら後ろもずれる）
  function forward(plan, seq) {
    const dated = seq.steps.filter((s) => s.days > 0);
    if (!dated.length || !dated[0].start) return;
    let cursor = dated[0].start;
    dated.forEach((st) => {
      while (isFocusDay(plan, cursor)) cursor = LL.addDays(cursor, 1);
      st.start = cursor;
      let d = cursor;
      for (let n = 1; n < st.days; ) {
        d = LL.addDays(d, 1);
        if (!isFocusDay(plan, d)) n++;
      }
      st.end = d;
      cursor = LL.addDays(d, 1);
    });
  }

  // 毎朝のリマインド文（「今日・今週」と同じ中身）
  function reminderText(plan) {
    const today = LL.today();
    const r = plan.remind;
    const f = focusOn(plan, today);
    const ph = phaseOn(plan, today);
    const lines = [];
    if (f) lines.push(`【今日の期間】${f.name}${f.ratio ? `（${f.ratio}）` : ""}`);
    else if (ph) lines.push(`【今日の期間】${ph.name}：${ph.focus}`);
    const ups = plan.events
      .filter((e) => LL.inRange(LL.diffDays(today, e.date), 0, r.daysAhead))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => `${LL.fmtMD(e.date)} ${e.title}（${LL.countdown(e.date).label}）`);
    if (r.amount === "full") {
      const stopped = stoppedOn(plan, today);
      const month = today.slice(0, 7);
      const mt = liveTasks(plan).filter((t) => !t.done && t.due && t.due.startsWith(month) && !stopped.has(t.goalId));
      if (mt.length) lines.push(`【今月やること】${mt.slice(0, 5).map((t) => t.text).join(" ／ ")}${mt.length > 5 ? ` ほか${mt.length - 5}件` : ""}`);
    }
    lines.push(`【${r.daysAhead}日以内の締切】${ups.length ? ups.join(" ／ ") : "なし"}`);
    if (r.amount === "full" && plan.rules.length) lines.push(`【ひとこと】${hitokoto(plan)}`);
    return lines;
  }
  function hitokoto(plan) {
    if (!plan.rules.length) return "";
    const n = LL.diffDays("2026-01-01", LL.today());
    return plan.rules[((n % plan.rules.length) + plan.rules.length) % plan.rules.length];
  }

  // ---------- 描画 ----------
  LL.renderSeason = function (root) {
    const plan = P();
    if (!plan) {
      root.innerHTML = `<div class="empty-big"><p>まだ計画がありません。</p><button class="btn primary" data-act="new-plan">計画を作る</button></div>`;
      bind(root);
      return;
    }
    const today = LL.today();
    const total = LL.diffDays(plan.start, plan.end) + 1;
    const elapsed = Math.min(total, Math.max(0, LL.diffDays(plan.start, today) + 1));
    const ws = warnings(plan);

    root.innerHTML = `
      <section class="view-intro">
        <div>
          <p class="eyebrow">SEASON ・ 数ヶ月の航路</p>
          <div class="plan-switch">
            <select data-act="pick-plan" aria-label="計画を選ぶ">
              ${LL.state.plans.map((p) => `<option value="${p.id}" ${p.id === plan.id ? "selected" : ""}>${LL.esc(p.name)}</option>`).join("")}
            </select>
            <button class="icon-btn sm" data-act="edit-plan" title="計画を編集">編集</button>
            <button class="chip-btn" data-act="new-plan">＋ 新しい計画</button>
          </div>
          <h2>${LL.esc(plan.name)}</h2>
          <p class="lead">${LL.fmtYMD(plan.start)} 〜 ${LL.fmtYMD(plan.end)} ・ ${total}日間 ${plan.revised ? `・ 最終改訂 ${LL.fmtMD(plan.revised)}` : ""}</p>
        </div>
        <div class="plan-progress">
          <div class="ring" style="--p:${(elapsed / total) * 100}"><b>${Math.round((elapsed / total) * 100)}<small>%</small></b></div>
          <div><p>${elapsed}日目 ／ ${total}日</p><p class="muted">${today > plan.end ? "期間終了" : `のこり ${LL.diffDays(today, plan.end)}日`}</p></div>
        </div>
      </section>

      ${renderSeasonStrip(plan)}

      <nav class="subtabs" role="tablist">
        ${[
          ["today", "今日・今週"],
          ["calendar", "計画カレンダー"],
          ["board", "目標ボード"],
        ]
          .map(([k, l]) => `<button role="tab" class="${sub === k ? "on" : ""}" data-sub="${k}">${l}</button>`)
          .join("")}
      </nav>

      ${ws.length ? `<details class="warnings" ${ws.some((w) => w.level === "warn") ? "open" : ""}><summary><i class="warn-mark">!</i>気をつけること ${ws.length}件</summary><ul>${ws.map((w) => `<li class="${w.level}">${LL.esc(w.text)}</li>`).join("")}</ul></details>` : ""}

      <div class="season-body">${sub === "today" ? renderToday(plan) : sub === "calendar" ? renderCalendar(plan) : renderBoard(plan)}</div>
    `;
    bind(root);
    layoutSeason(root);
  };

  // 描いたあとで、帯の名前がはみ出すものは短くし、拡大したときは今日の位置まで送る
  function layoutSeason(root) {
    LL.fitLabels([...root.querySelectorAll(".strip-block")]);
    const sc = root.querySelector(".strip-scroll");
    const now = root.querySelector(".strip-now");
    if (sc && now && sc.scrollWidth > sc.clientWidth + 1) sc.scrollLeft = Math.max(0, now.offsetLeft - sc.clientWidth / 3);
  }

  // 期間ブロックを1本の帯で（どの画面でも上に出す）
  function renderSeasonStrip(plan) {
    const total = LL.diffDays(plan.start, plan.end) + 1;
    const pos = (d) => (LL.diffDays(plan.start, d) / total) * 100;
    const today = LL.today();
    const blocks = plan.blocks
      .filter((b) => b.end >= plan.start && b.start <= plan.end)
      .map((b) => {
        const s = b.start < plan.start ? plan.start : b.start;
        const e = b.end > plan.end ? plan.end : b.end;
        return `<button class="strip-block ${b.kind}" data-block="${b.id}" style="left:${pos(s)}%;width:${pos(LL.addDays(e, 1)) - pos(s)}%;--c:${b.color}" title="${LL.esc(b.name)} ${LL.fmtMD(b.start)}〜${LL.fmtMD(b.end)}">
          <b>${LL.esc(b.name)}</b></button>`;
      })
      .join("");
    const evs = plan.events
      .filter((e) => LL.inRange(e.date, plan.start, plan.end))
      .map((e) => `<i class="strip-ev" style="left:${pos(e.date) + 50 / total}%;--c:${EVENT_TYPES[e.type] || "#888"}" title="${LL.fmtMD(e.date)} ${LL.esc(e.title)}"></i>`)
      .join("");
    let months = "";
    for (let m = plan.start.slice(0, 7) + "-01"; m <= plan.end; ) {
      if (m >= plan.start) months += `<span style="left:${pos(m)}%">${Number(m.slice(5, 7))}月</span>`;
      const d = LL.parseYmd(m);
      d.setMonth(d.getMonth() + 1);
      m = LL.ymd(d);
    }
    const nowMark = LL.inRange(today, plan.start, plan.end) ? `<i class="strip-now" style="left:${pos(today) + 50 / total}%"><b>今日</b></i>` : "";
    const z = LL.ui().stripZoom || 1;
    return `<div class="season-strip card">
      <div class="strip-scroll"><div class="strip-inner" style="width:calc(max(100%, 640px) * ${z})">
        <div class="strip-months">${months}</div>
        <div class="strip-track">${blocks}${evs}${nowMark}</div>
      </div></div>
      <div class="strip-legend">
        <span><i class="sw focus"></i>集中期間（ルールつき）</span><span><i class="sw phase"></i>中心にやること</span>
        ${Object.entries(EVENT_TYPES).map(([k, c]) => `<span><i class="ev-dot" style="--c:${c}"></i>${k}</span>`).join("")}
        <span class="strip-tools">${LL.zoomCtl("strip", z, "帯の拡大")}<button class="chip-btn" data-act="add-block">＋ 期間ブロック</button></span>
      </div>
    </div>`;
  }

  // ----- 今日・今週 -----
  function renderToday(plan) {
    const today = LL.today();
    const f = focusOn(plan, today);
    const ph = phaseOn(plan, today);
    const stopped = stoppedOn(plan, today);
    const r = plan.remind;
    const tasks = liveTasks(plan).filter((t) => !t.done && t.due);
    const todayTasks = tasks.filter((t) => t.due <= today).sort((a, b) => a.due.localeCompare(b.due));
    const weekTasks = tasks.filter((t) => t.due > today && t.due <= LL.addDays(today, 7)).sort((a, b) => a.due.localeCompare(b.due));
    const ups = plan.events
      .filter((e) => LL.inRange(LL.diffDays(today, e.date), 0, r.daysAhead))
      .sort((a, b) => a.date.localeCompare(b.date));
    const nextFocus = plan.blocks.filter((b) => b.kind === "focus" && b.start > today).sort((a, b) => a.start.localeCompare(b.start))[0];
    const reviewDue = LL.parseYmd(today).getDay() === plan.reviewDay && !plan.reviews.some((v) => v.date === today);

    const period = f
      ? `<div class="period focus" style="--c:${f.color}">
          <p class="tag-line"><span class="pill solid" style="--c:${f.color}">集中期間</span> ${LL.fmtMD(f.start)}〜${LL.fmtMD(f.end)}（のこり${LL.diffDays(today, f.end) + 1}日）</p>
          <h3>${LL.esc(f.name)}</h3>
          ${f.ratio ? `<p class="ratio">${renderRatio(f.ratio, f.color)}</p>` : ""}
          ${f.stopGoals?.length ? `<p class="stopped">止めている目標：${f.stopGoals.map((id) => `<span class="pill" style="--c:${goalColor(plan, id)}">${LL.esc(goalOf(plan, id)?.title || "")}</span>`).join("")}</p>` : ""}
        </div>`
      : ph
        ? `<div class="period" style="--c:${ph.color}">
            <p class="tag-line"><span class="pill" style="--c:${ph.color}">いまの期間</span> ${LL.fmtMD(ph.start)}〜${LL.fmtMD(ph.end)}</p>
            <h3>${LL.esc(ph.name)}</h3><p>${LL.esc(ph.focus)}</p>
          </div>`
        : `<div class="period"><h3>期間ブロックの外の日です</h3><p class="muted">「＋ 期間ブロック」から名前と色をつけられます。</p></div>`;

    return `
      <div class="today-grid">
        <section class="card hero-today">
          <p class="eyebrow">TODAY ・ ${LL.fmtMD(today)}</p>
          ${period}
          ${nextFocus ? `<p class="next-focus">次の集中期間「${LL.esc(nextFocus.name)}」まで <b>${LL.diffDays(today, nextFocus.start)}</b> 日</p>` : ""}
          ${plan.rules.length ? `<blockquote class="hitokoto">${LL.esc(hitokoto(plan))}</blockquote>` : ""}
          <button class="btn ghost" data-act="to-dawn">明日の設計図（Dawn）を開く</button>
        </section>

        <section class="card deadlines">
          <header class="card-head"><h3>${r.daysAhead}日以内の締切・予定</h3></header>
          ${ups.length ? `<div class="countdowns">${ups.map((e) => countTile(plan, e)).join("")}</div>` : `<p class="empty">${r.daysAhead}日以内の締切はありません。</p>`}
        </section>

        <section class="card">
          <header class="card-head"><h3>今日やること</h3><button class="chip-btn" data-act="add-task" data-due="${today}">＋</button></header>
          ${todayTasks.length ? `<ul class="tasks">${todayTasks.map((t) => taskRow(plan, t, stopped)).join("")}</ul>` : `<p class="empty">今日が期限のタスクはありません。</p>`}
        </section>

        <section class="card">
          <header class="card-head"><h3>今週やること</h3></header>
          ${weekTasks.length ? `<ul class="tasks">${weekTasks.map((t) => taskRow(plan, t, stopped)).join("")}</ul>` : `<p class="empty">この先7日の期限はありません。</p>`}
        </section>

        <section class="card">
          <header class="card-head"><h3>ペースとカウンター</h3></header>
          ${plan.paces.map((p) => paceRow(plan, p)).join("")}
          ${plan.counters.map((c) => counterRow(plan, c)).join("")}
          ${!plan.paces.length && !plan.counters.length ? `<p class="empty">まだありません。目標ボードから追加できます。</p>` : ""}
        </section>

        <section class="card remind ${r.on ? "on" : ""}">
          <header class="card-head">
            <h3>毎朝のリマインド</h3>
            <button class="toggle ${r.on ? "on" : ""}" data-act="toggle-remind" aria-pressed="${r.on}"><i></i>${r.on ? "ON" : "OFF"}</button>
          </header>
          <p class="muted">${r.on ? `毎朝 ${LL.fmtTime(r.time)} に通知（${r.daysAhead}日先まで・${r.amount === "full" ? "くわしく" : "かんたん"}）` : "オフです。右上のボタンでオンにできます。"}</p>
          <div class="remind-preview">${reminderText(plan).map((l) => `<p>${LL.esc(l)}</p>`).join("")}</div>
          <button class="chip-btn" data-act="remind-settings">時刻・内容を変える</button>
        </section>

        ${
          reviewDue
            ? `<section class="card review-cta"><h3>今日は週の振り返りの日です</h3><p>10分だけ、3つの質問に答えましょう。</p><button class="btn primary" data-act="add-review">振り返る</button></section>`
            : ""
        }
      </div>`;
  }

  function renderRatio(ratio, color) {
    // 「TOEIC 8割 ／ ほか 2割」→ 帯グラフ
    const parts = ratio.split(/[／\/]/).map((s) => s.trim());
    const nums = parts.map((p) => Number((p.match(/(\d+)\s*割/) || [])[1] || 0));
    if (!nums.some(Boolean)) return LL.esc(ratio);
    return `<span class="ratio-bar">${parts
      .map((p, i) => `<span style="flex:${nums[i] || 1};--c:${color};--o:${i === 0 ? 1 : 0.35}">${LL.esc(p)}</span>`)
      .join("")}</span>`;
  }

  function countTile(plan, e) {
    const cd = LL.countdown(e.date);
    return `<button class="count-tile ${cd.level}" data-event="${e.id}" style="--c:${EVENT_TYPES[e.type] || "#888"}">
      <span class="ct-type">${e.type}</span>
      <span class="ct-num">${cd.n <= 0 ? cd.label : `<small>あと</small>${cd.n}<small>日</small>`}</span>
      <span class="ct-title">${LL.esc(e.title)}</span>
      <span class="ct-date">${LL.fmtMD(e.date)}${e.official ? ` ・ 公式 ${LL.fmtMD(e.official)}` : ""}</span>
    </button>`;
  }

  function taskRow(plan, t, stopped) {
    const g = goalOf(plan, t.goalId);
    const cd = t.due ? LL.countdown(t.due) : null;
    const dim = stopped && stopped.has(t.goalId);
    return `<li class="task ${t.done ? "done" : ""} ${dim ? "dim" : ""}" style="--c:${g ? g.color : "#999"}">
      ${
        selectMode && !t.done
          ? `<label class="sel"><input type="checkbox" data-sel="${t.id}" ${selected.has(t.id) ? "checked" : ""}><span></span></label>`
          : `<button class="tick-box" data-toggle="${t.id}" aria-label="完了"></button>`
      }
      <button class="task-text" data-edit-task="${t.id}">
        ${LL.esc(t.text)}
        ${dim ? `<em class="mini">集中期間中は休止</em>` : ""}
      </button>
      <span class="task-meta">
        ${t.due ? `<span class="due ${t.done ? "" : cd.level}">${LL.fmtMD(t.due)}${t.done ? "" : ` ・ ${cd.label}`}</span>` : `<span class="due none">日付なし</span>`}
      </span>
    </li>`;
  }

  function paceRow(plan, p) {
    const st = paceStats(plan, p);
    const g = goalOf(plan, p.goalId);
    const dots = Array.from({ length: p.target }, (_, i) => `<i class="${i < st.total ? "on" : i < st.expected ? "exp" : ""}"></i>`).join("");
    return `<div class="pace" style="--c:${g ? g.color : "#888"}">
      <div class="pace-head">
        <button class="link" data-edit-pace="${p.id}">${LL.esc(p.title)}</button>
        <span class="muted">週${p.perWeek}回 ・ ${LL.fmtMD(p.start)}〜${LL.fmtMD(p.end)}</span>
      </div>
      <div class="pace-dots">${dots}</div>
      <div class="pace-foot">
        <span>今週 <b>${st.thisWeek}</b>/${p.perWeek}</span>
        <span>全体 <b>${st.total}</b>/${p.target}</span>
        <span class="muted">目安 ${st.expected}</span>
        ${st.paused ? `<span class="mini">集中期間はお休み</span>` : ""}
        <button class="chip-btn" data-pace-log="${p.id}">＋ 今日やった</button>
        ${st.total ? `<button class="chip-btn ghost" data-pace-undo="${p.id}">取り消し</button>` : ""}
      </div>
    </div>`;
  }

  function counterRow(plan, c) {
    const g = goalOf(plan, c.goalId);
    const tot = counterTotal(c);
    const pct = c.target ? Math.min(100, (tot / c.target) * 100) : 0;
    const parts = c.breakdown && c.breakdown.length;
    return `<div class="counter" style="--c:${g ? g.color : "#888"}">
      <div class="counter-head">
        <button class="link" data-edit-counter="${c.id}">${LL.esc(c.title)}</button>
        <b class="counter-num">${tot}<small>/${c.target}${LL.esc(c.unit || "")}</small></b>
      </div>
      <div class="meter"><i style="width:${pct}%"></i></div>
      <div class="counter-btns">
        ${
          parts
            ? c.breakdown
                .map(
                  (b, i) =>
                    `<span class="cb">${LL.esc(b.label)} <b>${b.count}</b><button class="mini-btn" data-count="${c.id}" data-part="${i}" data-d="-1">−</button><button class="mini-btn" data-count="${c.id}" data-part="${i}" data-d="1">＋</button></span>`
                )
                .join("")
            : `<button class="mini-btn" data-count="${c.id}" data-d="-1">−</button><button class="mini-btn" data-count="${c.id}" data-d="1">＋</button>`
        }
      </div>
    </div>`;
  }

  // ----- 計画カレンダー -----
  function renderCalendar(plan) {
    const today = LL.today();
    const months = [];
    for (let m = plan.start.slice(0, 7) + "-01"; m <= plan.end; ) {
      months.push(m);
      const d = LL.parseYmd(m);
      d.setMonth(d.getMonth() + 1);
      m = LL.ymd(d);
    }
    const html = months
      .map((m) => {
        const d0 = LL.parseYmd(m);
        const last = LL.ymd(new Date(d0.getFullYear(), d0.getMonth() + 1, 0));
        const offset = d0.getDay();
        const inMonth = plan.blocks.filter((b) => b.end >= m && b.start <= last).sort((a, b) => a.start.localeCompare(b.start));
        const paces = plan.paces.filter((p) => p.end >= m && p.start <= last);
        const nDays = Number(last.slice(8));
        let cells = "";
        for (let i = 0; i < offset; i++) cells += `<div class="cell blank"></div>`;
        for (let day = 1; day <= nDays; day++) {
          const date = `${m.slice(0, 8)}${String(day).padStart(2, "0")}`;
          const f = focusOn(plan, date);
          const ph = phaseOn(plan, date);
          const evs = plan.events.filter((e) => e.date === date);
          const ts = liveTasks(plan).filter((t) => t.due === date);
          const stopped = stoppedOn(plan, date);
          const out = !LL.inRange(date, plan.start, plan.end);
          const blockStart = [f, ph].find((b) => b && (b.start === date || (day === 1 && b.start < date)));
          const paceLogged = plan.paces.some((p) => p.log.includes(date));
          const wd = LL.parseYmd(date).getDay();
          cells += `<button class="cell ${out ? "off" : ""} ${f ? "focus" : ""} ${date === today ? "today" : ""} ${wd === 0 ? "sun" : wd === 6 ? "sat" : ""}"
              data-day="${date}" style="${f ? `--fc:${f.color};` : ""}${ph ? `--pc:${ph.color};` : ""}">
            <span class="dnum">${day}</span>
            ${blockStart ? `<span class="blabel" style="--c:${blockStart.color}">${LL.esc(blockStart.name)}</span>` : ""}
            ${evs.map((e) => `<span class="ev" style="--c:${EVENT_TYPES[e.type] || "#888"}">${LL.esc(e.title)}</span>`).join("")}
            ${ts
              .slice(0, calSize() === "l" ? 99 : 2)
              .map((t) => `<span class="tdue ${t.done ? "done" : ""} ${stopped.has(t.goalId) ? "dim" : ""}" style="--c:${goalColor(plan, t.goalId)}">${LL.esc(t.text)}</span>`)
              .join("")}
            ${ts.length > 2 && calSize() !== "l" ? `<span class="more">ほか${ts.length - 2}件</span>` : ""}
            ${paceLogged ? `<i class="pace-mark" title="ペース記録あり">●</i>` : ""}
            ${ph ? `<i class="phase-line"></i>` : ""}
          </button>`;
        }
        const paceBands = paces
          .map((p) => {
            const s = p.start < m ? m : p.start;
            const e = p.end > last ? last : p.end;
            const st = paceStats(plan, p);
            return `<div class="pace-band" style="--c:${goalColor(plan, p.goalId)}">
              <span class="pb-label">${LL.esc(p.title)} 週${p.perWeek} ・ ${st.total}/${p.target}</span>
              <span class="pb-track"><i style="left:${((Number(s.slice(8)) - 1) / nDays) * 100}%;width:${((Number(e.slice(8)) - Number(s.slice(8)) + 1) / nDays) * 100}%"></i></span>
            </div>`;
          })
          .join("");
        return `<section class="month">
          <header class="month-head">
            <h3>${d0.getFullYear()}<small>年</small>${d0.getMonth() + 1}<small>月</small></h3>
            <ul class="month-blocks">${inMonth
              .map((b) => `<li style="--c:${b.color}" class="${b.kind}"><i></i><b>${LL.esc(b.name)}</b> ${LL.fmtMD(b.start)}〜${LL.fmtMD(b.end)}${b.kind !== "focus" && b.focus ? `<span>${LL.esc(b.focus)}</span>` : b.ratio ? `<span>${LL.esc(b.ratio)}</span>` : ""}</li>`)
              .join("")}</ul>
          </header>
          ${paceBands}
          <div class="cal-grid-wrap"><div class="cal-grid">
            ${LL.WEEK.map((w, i) => `<div class="wd ${i === 0 ? "sun" : i === 6 ? "sat" : ""}">${w}</div>`).join("")}
            ${cells}
          </div></div>
        </section>`;
      })
      .join("");
    return `<div class="cal-toolbar">
        <p class="muted">日付をタップすると、その日の予定・タスクを見たり追加したりできます。「大」にすると予定名とタスクを全部表示します。</p>
        <div class="seg size-seg" role="group" aria-label="表示サイズ"><span>表示サイズ</span>${[
          ["s", "小"],
          ["m", "中"],
          ["l", "大"],
        ]
          .map(([k, l]) => `<button class="${calSize() === k ? "on" : ""}" data-cal-size="${k}">${l}</button>`)
          .join("")}</div>
      </div>
      <div class="calendar size-${calSize()}" id="season-cal"><p class="cal-title">${LL.esc(plan.name)}</p>${html}</div>`;
  }

  function openDay(plan, date) {
    const f = focusOn(plan, date);
    const ph = phaseOn(plan, date);
    const evs = plan.events.filter((e) => e.date === date);
    const ts = liveTasks(plan).filter((t) => t.due === date);
    const stopped = stoppedOn(plan, date);
    const html = `
      ${f ? `<div class="period focus mini" style="--c:${f.color}"><b>${LL.esc(f.name)}</b>${f.ratio ? ` ・ ${LL.esc(f.ratio)}` : ""}</div>` : ""}
      ${ph ? `<div class="period mini" style="--c:${ph.color}"><b>${LL.esc(ph.name)}</b> ・ ${LL.esc(ph.focus)}</div>` : ""}
      <h4>締切・予定</h4>
      ${evs.length ? `<div class="countdowns">${evs.map((e) => countTile(plan, e)).join("")}</div>` : `<p class="empty">なし</p>`}
      <h4>この日が期限のタスク</h4>
      ${ts.length ? `<ul class="tasks">${ts.map((t) => taskRow(plan, t, stopped)).join("")}</ul>` : `<p class="empty">なし</p>`}
      <div class="panel-actions">
        <button class="btn ghost" data-act="add-event" data-date="${date}">＋ 締切・予定</button>
        <button class="btn ghost" data-act="add-task" data-due="${date}">＋ タスク</button>
        <button class="btn primary" data-act="open-dawn" data-date="${date}">この日を Dawn で開く</button>
      </div>`;
    LL.openPanel(LL.fmtMD(date), html, (e) => {
      handleClick(e);
      if (e.target.closest("[data-toggle]")) openDay(P(), date);
    });
  }

  // ----- 目標ボード -----
  function renderBoard(plan) {
    const today = LL.today();
    const stopped = stoppedOn(plan, today);
    const goals = plan.goals;
    const cols = goals
      .map((g) => {
        const ts = plan.tasks
          .filter((t) => t.goalId === g.id)
          .sort((a, b) => (a.done - b.done) || (a.due || "9999").localeCompare(b.due || "9999"));
        const live = ts;
        const done = live.filter((t) => t.done).length;
        const evs = plan.events.filter((e) => e.goalId === g.id).sort((a, b) => a.date.localeCompare(b.date));
        const seqs = (plan.sequences || []).filter((s) => s.goalId === g.id);
        const cands = (plan.candidates || []).filter((c) => c.goalId === g.id);
        const isStopped = stopped.has(g.id);
        return `<article class="goal-col ${isStopped ? "stopped" : ""} ${g.status}" style="--c:${g.color}">
          <header class="goal-head">
            <div class="goal-title">
              <button class="link h" data-edit-goal="${g.id}">${LL.esc(g.title)}</button>
              ${isStopped ? `<span class="mini">いまは休止中</span>` : g.status === "done" ? `<span class="mini ok">達成</span>` : ""}
            </div>
            <p class="vision">${LL.esc(g.vision || "")}</p>
            <div class="goal-meter"><i style="width:${live.length ? (done / live.length) * 100 : 0}%"></i></div>
            <p class="muted small">${done}/${live.length} 完了</p>
          </header>
          ${evs.length ? `<div class="goal-evs">${evs.map((e) => `<button class="ev-chip ${e.date < today ? "past" : ""}" data-event="${e.id}" style="--c:${EVENT_TYPES[e.type] || "#888"}"><b>${e.type}</b> ${LL.fmtMD(e.date)} ${LL.esc(e.title)}${e.date >= today ? ` <i>${LL.countdown(e.date).label}</i>` : ""}${e.official ? `<i>公式 ${LL.fmtMD(e.official)}</i>` : ""}</button>`).join("")}</div>` : ""}
          <ul class="tasks">${ts.map((t) => taskRow(plan, t, stopped)).join("")}</ul>
          ${seqs.map((s) => seqView(plan, s)).join("")}
          ${plan.paces.filter((p) => p.goalId === g.id).map((p) => paceRow(plan, p)).join("")}
          ${plan.counters.filter((c) => c.goalId === g.id).map((c) => counterRow(plan, c)).join("")}
          ${cands.map((c) => `<button class="cand-link" data-cand="${c.id}">比較：${LL.esc(c.title)}（採用 ${c.items.filter((i) => i.status === "採用").length} ／ 候補 ${c.items.length}）</button>`).join("")}
          <footer class="goal-add">
            <button class="chip-btn" data-act="add-task" data-goal="${g.id}">＋ タスク</button>
            <button class="chip-btn" data-act="add-event" data-goal="${g.id}">＋ 締切</button>
            <details class="more-add"><summary class="chip-btn">…</summary>
              <div>
                <button class="chip-btn" data-act="add-seq" data-goal="${g.id}">＋ 手順</button>
                <button class="chip-btn" data-act="add-pace" data-goal="${g.id}">＋ ペース</button>
                <button class="chip-btn" data-act="add-counter" data-goal="${g.id}">＋ カウンター</button>
                <button class="chip-btn" data-act="add-cand" data-goal="${g.id}">＋ 候補の比較</button>
              </div>
            </details>
          </footer>
        </article>`;
      })
      .join("");

    return `
      <div class="board-toolbar">
        <button class="btn ghost" data-act="add-goal" ${plan.goals.length >= 5 ? 'title="大目標は3〜5個がおすすめ"' : ""}>＋ 大目標</button>
        <button class="btn ${selectMode ? "primary" : "ghost"}" data-act="select-mode">${selectMode ? `${selected.size}件を選択中 ― 延長先を決める` : "まとめて延長"}</button>
        ${selectMode ? `<button class="btn ghost" data-act="select-cancel">やめる</button>` : ""}
      </div>
      <div class="board">${cols}</div>

      <div class="board-lower">
        <section class="card">
          <header class="card-head"><h3>ルール</h3><button class="chip-btn" data-act="edit-rules">編集</button></header>
          <ol class="rules">${plan.rules.map((r) => `<li>${LL.esc(r)}</li>`).join("")}</ol>
        </section>
        <section class="card">
          <header class="card-head"><h3>期間ブロック</h3><button class="chip-btn" data-act="add-block">＋</button></header>
          <ul class="block-list">${plan.blocks
            .slice()
            .sort((a, b) => a.start.localeCompare(b.start))
            .map(
              (b) => `<li><button class="block-row ${b.kind}" data-block="${b.id}" style="--c:${b.color}"><i></i><span><b>${LL.esc(b.name)}</b> ${LL.fmtMD(b.start)}〜${LL.fmtMD(b.end)}<small>${LL.esc(b.kind === "focus" ? b.ratio || "" : b.focus || "")}${b.stopGoals?.length ? ` ・ 止める: ${b.stopGoals.map((id) => goalOf(plan, id)?.title).join("、")}` : ""}</small></span></button></li>`
            )
            .join("")}</ul>
        </section>
        <section class="card">
          <header class="card-head"><h3>週の振り返り <small class="muted">毎週${LL.WEEK[plan.reviewDay]}曜</small></h3><button class="chip-btn" data-act="add-review">＋ 振り返る</button></header>
          ${plan.reviews.length ? `<div class="reviews">${plan.reviews
            .slice()
            .reverse()
            .map((v, i) => `<button class="review" data-review="${plan.reviews.length - 1 - i}"><b>${LL.fmtMD(v.date)}</b>${v.answers.map((a, j) => `<p><span>${j + 1}</span>${LL.esc(a || "—")}</p>`).join("")}</button>`)
            .join("")}</div>` : `<p class="empty">まだ振り返りはありません。${LL.esc(plan.reviewQuestions.join(" ／ "))}</p>`}
        </section>
      </div>`;
  }

  function seqView(plan, s) {
    const today = LL.today();
    return `<div class="seq">
      <div class="seq-head"><button class="link" data-edit-seq="${s.id}">${LL.esc(s.title)}</button><span class="muted small">締切 ${LL.fmtMD(s.deadline)}</span></div>
      <ol class="seq-steps">${s.steps
        .map(
          (st) => `<li class="${st.done ? "done" : ""} ${st.start && st.start <= today && today <= st.end ? "now" : ""}">
          <button class="seq-dot" data-step="${s.id}:${st.id}" aria-label="完了"></button>
          <span>${LL.esc(st.name)}</span>
          <small>${st.start ? `${LL.fmtMD(st.start).replace(/（.）/, "")}${st.end !== st.start ? `–${LL.fmtMD(st.end).replace(/（.）/, "")}` : ""}` : "未定"}</small>
        </li>`
        )
        .join("")}</ol>
      <div class="seq-actions">
        <button class="chip-btn" data-seq-back="${s.id}">締切から逆算</button>
        <button class="chip-btn ghost" data-seq-fwd="${s.id}">前から詰める</button>
      </div>
    </div>`;
  }

  // ---------- 編集フォーム ----------
  const goalOptions = (plan, none = true) => [...(none ? [{ value: "", label: "（目標なし）" }] : []), ...plan.goals.map((g) => ({ value: g.id, label: g.title }))];

  function editPlan(plan) {
    const isNew = !plan;
    const t = LL.today();
    const end = LL.addDays(LL.ymd(new Date(LL.parseYmd(t).getFullYear(), LL.parseYmd(t).getMonth() + 3, 1)), -1);
    LL.openForm({
      title: isNew ? "新しい計画" : "計画を編集",
      subtitle: "期間は1〜6ヶ月くらいがおすすめ（初期値は3ヶ月）",
      value: plan || { name: "", start: t, end },
      fields: [
        { key: "name", label: "計画名", full: true, placeholder: "例: 2027年 春の計画" },
        { key: "start", label: "開始日", type: "date" },
        { key: "end", label: "終了日", type: "date" },
      ],
      onSave: (v) => {
        if (!v.name || !v.start || !v.end) return LL.toast("計画名と期間を入れてください"), false;
        if (isNew) {
          const p = {
            id: "plan-" + LL.uid(),
            name: v.name,
            start: v.start,
            end: v.end,
            created: LL.today(),
            goals: [],
            rules: [],
            blocks: [],
            events: [],
            tasks: [],
            sequences: [],
            paces: [],
            counters: [],
            candidates: [],
            reviews: [],
            reviewDay: 0,
            reviewQuestions: ["今週やったこと", "新しく知ったこと・気持ちが動いたこと", "来週やる3つ"],
            remind: { on: false, time: LL.parseTime("9:00"), daysAhead: 7, amount: "full" },
          };
          LL.state.plans.push(p);
          LL.state.activePlanId = p.id;
          sub = "board";
        } else {
          Object.assign(plan, { name: v.name, start: v.start, end: v.end, revised: LL.today() });
        }
        LL.commit();
      },
      onDelete: isNew
        ? null
        : () => {
            LL.state.plans = LL.state.plans.filter((p) => p !== plan);
            LL.state.activePlanId = LL.state.plans[0]?.id || null;
            LL.commit();
          },
      deleteLabel: "計画を削除",
    });
  }

  function editGoal(plan, g) {
    const isNew = !g;
    LL.openForm({
      title: isNew ? "大目標を追加" : "大目標を編集",
      value: g || { title: "", vision: "", color: LL.SWATCHES[plan.goals.length % LL.SWATCHES.length], status: "active" },
      fields: [
        { key: "title", label: "大目標", full: true },
        { key: "vision", label: "期間の終わりにどうなっていたいか（1行）", type: "textarea", rows: 2 },
        { key: "color", label: "色", type: "color", full: true },
        {
          key: "status",
          label: "状態",
          type: "select",
          options: [
            { value: "active", label: "進行中" },
            { value: "done", label: "達成" },
          ],
        },
      ],
      onSave: (v) => {
        if (!v.title) return false;
        if (isNew) plan.goals.push({ id: "g-" + LL.uid(), ...v });
        else Object.assign(g, v);
        LL.commit();
      },
      onDelete: isNew
        ? null
        : () => {
            // 目標を消すときは、その目標のタスク・締切・手順なども一緒に消す
            const keep = (x) => x.goalId !== g.id;
            plan.goals = plan.goals.filter((x) => x !== g);
            ["tasks", "events", "sequences", "paces", "counters", "candidates"].forEach((k) => (plan[k] = plan[k].filter(keep)));
            plan.blocks.forEach((b) => (b.stopGoals = (b.stopGoals || []).filter((id) => id !== g.id)));
            LL.commit();
          },
    });
  }

  function editTask(plan, t, defaults = {}) {
    const isNew = !t;
    LL.openForm({
      title: isNew ? "タスクを追加" : "タスクを編集",
      value: t || { text: "", goalId: defaults.goalId || plan.goals[0]?.id || "", due: defaults.due || null },
      fields: [
        { key: "text", label: "やること", full: true },
        { key: "goalId", label: "大目標", type: "select", options: goalOptions(plan) },
        { key: "due", label: "期限（なしでもOK）", type: "date" },
      ],
      onSave: (v) => {
        if (!v.text) return false;
        if (isNew) plan.tasks.push({ id: LL.uid(), done: false, ...v });
        else Object.assign(t, v);
        LL.commit();
      },
      onDelete: isNew
        ? null
        : () => {
            plan.tasks = plan.tasks.filter((x) => x !== t);
            LL.commit();
          },
    });
  }

  function editEvent(plan, ev, defaults = {}) {
    const isNew = !ev;
    LL.openForm({
      title: isNew ? "締切・予定を追加" : "締切・予定を編集",
      value: ev || { type: "提出", title: "", date: defaults.date || LL.today(), official: null, goalId: defaults.goalId || "", note: "" },
      fields: [
        { key: "title", label: "名前", full: true },
        { key: "type", label: "種類", type: "select", options: Object.keys(EVENT_TYPES).map((k) => ({ value: k, label: k })) },
        { key: "goalId", label: "大目標", type: "select", options: goalOptions(plan) },
        { key: "date", label: "自分の締切（日付）", type: "date" },
        { key: "official", label: "公式の締切（任意）", type: "date" },
        { key: "note", label: "メモ", type: "textarea", rows: 2 },
      ],
      onSave: (v) => {
        if (!v.title || !v.date) return LL.toast("名前と日付を入れてください"), false;
        const f = focusOn(plan, v.date);
        if (f && !NO_WARN.includes(v.type)) LL.toast(`注意：集中期間「${f.name}」に入っています`);
        if (isNew) plan.events.push({ id: LL.uid(), ...v });
        else Object.assign(ev, v);
        LL.commit();
      },
      onDelete: isNew
        ? null
        : () => {
            plan.events = plan.events.filter((e) => e !== ev);
            LL.commit();
          },
    });
  }

  function editBlock(plan, b) {
    const isNew = !b;
    LL.openForm({
      title: isNew ? "期間ブロックを追加" : "期間ブロックを編集",
      subtitle: "「本番の日」と「何日前から」を入れると、期間を自動で作ります（試験当日を含む）。",
      value: b
        ? { ...b, daysBefore: b.examDate ? LL.diffDays(b.start, b.examDate) + 1 : null }
        : { kind: "focus", name: "", start: LL.today(), end: LL.addDays(LL.today(), 6), color: "#3a6db5", focus: "", ratio: "8割 ／ ほか 2割", stopGoals: [], examDate: null, daysBefore: 7 },
      fields: [
        { key: "name", label: "名前", placeholder: "例: TOEIC集中" },
        {
          key: "kind",
          label: "種類",
          type: "select",
          options: [
            { value: "focus", label: "集中期間（ルールつき）" },
            { value: "phase", label: "中心にやること（ふつうの期間）" },
          ],
        },
        { key: "examDate", label: "本番の日（自動で作るとき）", type: "date" },
        { key: "daysBefore", label: "本番の何日前から（当日を含む）", type: "number" },
        { key: "start", label: "開始日", type: "date" },
        { key: "end", label: "終了日", type: "date" },
        { key: "color", label: "色", type: "color", full: true },
        { key: "focus", label: "中心にやること", type: "textarea", rows: 2 },
        { key: "ratio", label: "時間配分", placeholder: "例: TOEIC 8割 ／ ほか 2割", full: true, help: "「○割」と書くと帯グラフになります" },
        { key: "stopGoals", label: "この期間は止める大目標", type: "checks", options: goalOptions(plan, false) },
      ],
      onSave: (v) => {
        if (v.examDate && v.daysBefore) {
          v.end = v.examDate;
          v.start = LL.addDays(v.examDate, -(v.daysBefore - 1));
        }
        delete v.daysBefore;
        if (!v.name || !v.start || !v.end) return LL.toast("名前と期間を入れてください"), false;
        if (isNew) plan.blocks.push({ id: "b-" + LL.uid(), ...v });
        else Object.assign(b, v);
        LL.commit();
      },
      onDelete: isNew
        ? null
        : () => {
            plan.blocks = plan.blocks.filter((x) => x !== b);
            LL.commit();
          },
    });
  }

  function editPace(plan, p, goalId) {
    const isNew = !p;
    LL.openForm({
      title: isNew ? "ペース目標を追加" : "ペース目標を編集",
      subtitle: "日付を決めず「週に◯回」で持つ目標です。",
      value: p || { title: "", goalId: goalId || "", perWeek: 1, target: 10, start: LL.today(), end: P().end, skipFocus: true },
      fields: [
        { key: "title", label: "名前", full: true },
        { key: "goalId", label: "大目標", type: "select", options: goalOptions(plan) },
        { key: "perWeek", label: "週に何回", type: "number" },
        { key: "target", label: "全体の目標回数", type: "number" },
        { key: "start", label: "開始", type: "date" },
        { key: "end", label: "終了", type: "date" },
        { key: "skipFocus", label: "集中期間", type: "checkbox", text: "集中期間はお休みにする" },
      ],
      onSave: (v) => {
        if (!v.title) return false;
        if (isNew) plan.paces.push({ id: LL.uid(), log: [], ...v });
        else Object.assign(p, v);
        LL.commit();
      },
      onDelete: isNew
        ? null
        : () => {
            plan.paces = plan.paces.filter((x) => x !== p);
            LL.commit();
          },
    });
  }

  function editCounter(plan, c, goalId) {
    const isNew = !c;
    LL.openForm({
      title: isNew ? "カウンターを追加" : "カウンターを編集",
      value: c ? { ...c, parts: c.breakdown.map((b) => b.label) } : { title: "", goalId: goalId || "", target: 5, count: 0, unit: "回", parts: [] },
      fields: [
        { key: "title", label: "名前", placeholder: "例: 説明会" },
        { key: "goalId", label: "大目標", type: "select", options: goalOptions(plan) },
        { key: "target", label: "目標の数", type: "number" },
        { key: "count", label: "いまの数（内訳がないとき）", type: "number" },
        { key: "unit", label: "単位", placeholder: "社・回など" },
        { key: "parts", label: "内訳（任意・1行に1つ）", type: "list", rows: 2, help: "例: オンライン / 対面" },
      ],
      onSave: (v) => {
        if (!v.title) return false;
        const old = c ? c.breakdown : [];
        v.breakdown = v.parts.map((label) => ({ label, count: old.find((o) => o.label === label)?.count || 0 }));
        delete v.parts;
        if (isNew) plan.counters.push({ id: LL.uid(), ...v });
        else Object.assign(c, v);
        LL.commit();
      },
      onDelete: isNew
        ? null
        : () => {
            plan.counters = plan.counters.filter((x) => x !== c);
            LL.commit();
          },
    });
  }

  function editSeq(plan, s, goalId) {
    const isNew = !s;
    LL.openForm({
      title: isNew ? "手順を追加" : "手順を編集",
      subtitle: "1行に「工程名, 日数」。日数0の工程は日付未定として並べます。",
      value: s
        ? { ...s, lines: s.steps.map((st) => `${st.name}, ${st.days}`) }
        : { title: "", goalId: goalId || "", deadline: P().end, lines: [] },
      fields: [
        { key: "title", label: "名前", full: true },
        { key: "goalId", label: "大目標", type: "select", options: goalOptions(plan) },
        { key: "deadline", label: "締切", type: "date" },
        { key: "lines", label: "工程（A→B→Cの順）", type: "list", rows: 6 },
      ],
      onSave: (v) => {
        if (!v.title || !v.deadline) return false;
        const old = s ? s.steps : [];
        v.steps = v.lines.map((line) => {
          const [name, days] = line.split(/[,，、]\s*(?=\d+\s*$)/);
          const prev = old.find((o) => o.name === name.trim());
          return { id: prev?.id || LL.uid(), name: name.trim(), days: Number(days) || 0, start: null, end: null, done: prev?.done || false };
        });
        delete v.lines;
        const seq = isNew ? { id: LL.uid(), ...v } : Object.assign(s, v);
        backcalc(plan, seq);
        if (isNew) plan.sequences.push(seq);
        LL.commit();
      },
      onDelete: isNew
        ? null
        : () => {
            plan.sequences = plan.sequences.filter((x) => x !== s);
            LL.commit();
          },
    });
  }

  function editRules(plan) {
    LL.openForm({
      title: "ルールを編集",
      value: { rules: plan.rules },
      fields: [{ key: "rules", label: "ルール（1行に1つ）", type: "list", rows: 8 }],
      onSave: (v) => {
        plan.rules = v.rules;
        LL.commit();
      },
    });
  }

  function editReview(plan, idx) {
    const v0 = idx != null ? plan.reviews[idx] : null;
    LL.openForm({
      title: "週の振り返り",
      subtitle: "10分だけ。3つの質問に答えます。",
      value: v0 ? { date: v0.date, a0: v0.answers[0], a1: v0.answers[1], a2: v0.answers[2] } : { date: LL.today() },
      fields: [
        { key: "date", label: "日付", type: "date" },
        ...plan.reviewQuestions.map((q, i) => ({ key: `a${i}`, label: `${i + 1}. ${q}`, type: "textarea", rows: 2 })),
      ],
      onSave: (v) => {
        const rec = { date: v.date || LL.today(), answers: [v.a0, v.a1, v.a2] };
        if (v0) Object.assign(v0, rec);
        else plan.reviews.push(rec);
        plan.reviews.sort((a, b) => a.date.localeCompare(b.date));
        LL.commit();
        LL.toast("振り返りを保存しました");
      },
      onDelete: v0
        ? () => {
            plan.reviews.splice(idx, 1);
            LL.commit();
          }
        : null,
    });
  }

  function editRemind(plan) {
    LL.openForm({
      title: "毎朝のリマインド",
      value: { ...plan.remind, reviewDay: String(plan.reviewDay) },
      fields: [
        { key: "on", label: "通知", type: "checkbox", text: "毎朝知らせる" },
        { key: "time", label: "時刻", type: "time" },
        { key: "daysAhead", label: "何日先の締切まで出すか", type: "number" },
        {
          key: "amount",
          label: "内容の量",
          type: "select",
          options: [
            { value: "full", label: "くわしく（期間・今月・締切・ひとこと）" },
            { value: "short", label: "かんたん（期間と締切だけ）" },
          ],
        },
        { key: "reviewDay", label: "振り返りの曜日", type: "select", options: LL.WEEK.map((w, i) => ({ value: String(i), label: `${w}曜日` })) },
      ],
      onSave: (v) => {
        plan.reviewDay = Number(v.reviewDay);
        delete v.reviewDay;
        const was = plan.remind.on;
        plan.remind = { ...plan.remind, ...v, daysAhead: v.daysAhead || 7 };
        if (was !== v.on) toggleLog(plan);
        LL.commit();
      },
    });
  }

  function toggleLog(plan) {
    if (plan.remind.on) {
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    } else {
    }
  }

  function openCandidates(plan, cg) {
    const statuses = Object.keys(CAND_STATUS);
    const html = `
      <p class="muted">基準で比べて「採用」か「予備」を選びます。いらなくなった候補は、名前を押して削除できます。</p>
      <div class="ctable-wrap"><table class="ctable">
        <thead><tr><th>候補</th>${cg.criteria.map((c) => `<th>${LL.esc(c)}</th>`).join("")}<th>判断</th><th>メモ</th></tr></thead>
        <tbody>${cg.items
          .slice()
          .sort((a, b) => statuses.indexOf(a.status) - statuses.indexOf(b.status))
          .map(
            (it) => `<tr class="${CAND_STATUS[it.status] || "keep"}">
            <td class="c-name"><button class="link" data-cand-item="${it.id}">${LL.esc(it.name)}</button></td>
            ${cg.criteria.map((c) => `<td data-label="${LL.esc(c)}">${LL.esc(it.values[c] || "—")}</td>`).join("")}
            <td data-label="判断"><div class="seg">${statuses.map((s) => `<button class="${it.status === s ? "on " + CAND_STATUS[s] : ""}" data-cand-status="${it.id}" data-s="${s}">${s}</button>`).join("")}</div></td>
            <td data-label="メモ" class="small ${it.reason ? "" : "c-empty"}">${LL.esc(it.reason || "")}</td>
          </tr>`
          )
          .join("")}</tbody>
      </table></div>
      <div class="panel-actions">
        <button class="btn ghost" data-cand-edit="${cg.id}">比較の名前・基準を編集</button>
        <button class="btn primary" data-cand-add="${cg.id}">＋ 候補を追加</button>
      </div>`;
    LL.openPanel(`比較：${cg.title}`, html, (e) => {
      const st = e.target.closest("[data-cand-status]");
      if (st) {
        const it = cg.items.find((i) => i.id === st.dataset.candStatus);
        if (it.status !== st.dataset.s) {
          it.status = st.dataset.s;
          LL.save();
          LL.rerender();
          openCandidates(plan, cg);
        }
      }
      const ed = e.target.closest("[data-cand-item]");
      if (ed) editCandItem(plan, cg, cg.items.find((i) => i.id === ed.dataset.candItem));
      if (e.target.closest("[data-cand-add]")) editCandItem(plan, cg, null);
      if (e.target.closest("[data-cand-edit]")) editCandGroup(plan, cg);
    });
  }

  function editCandItem(plan, cg, it) {
    const isNew = !it;
    const val = it ? { name: it.name, status: it.status, reason: it.reason } : { name: "", status: "予備", reason: "" };
    cg.criteria.forEach((c, i) => (val[`c${i}`] = it ? it.values[c] || "" : ""));
    LL.openForm({
      title: isNew ? "候補を追加" : "候補を編集",
      value: val,
      fields: [
        { key: "name", label: "候補", full: true },
        ...cg.criteria.map((c, i) => ({ key: `c${i}`, label: c })),
        { key: "status", label: "判断", type: "select", options: Object.keys(CAND_STATUS).map((s) => ({ value: s, label: s })) },
        { key: "reason", label: "メモ", full: true },
      ],
      onSave: (v) => {
        if (!v.name) return false;
        const values = {};
        cg.criteria.forEach((c, i) => (values[c] = v[`c${i}`] || ""));
        const rec = { name: v.name, status: v.status, reason: v.reason || "", values };
        if (isNew) cg.items.push({ id: LL.uid(), ...rec });
        else Object.assign(it, rec);
        LL.save();
        LL.rerender();
        setTimeout(() => openCandidates(plan, cg));
      },
      onDelete: isNew
        ? null
        : () => {
            cg.items = cg.items.filter((x) => x !== it);
            LL.save();
            LL.rerender();
          },
    });
  }

  function editCandGroup(plan, cg, goalId) {
    const isNew = !cg;
    LL.openForm({
      title: isNew ? "候補の比較を追加" : "候補の比較を編集",
      value: cg || { title: "", goalId: goalId || "", criteria: ["賞金", "締切"] },
      fields: [
        { key: "title", label: "何を選ぶか", full: true, placeholder: "例: 応募するコンテスト" },
        { key: "goalId", label: "大目標", type: "select", options: goalOptions(plan) },
        { key: "criteria", label: "比べる基準（1行に1つ）", type: "list", rows: 3 },
      ],
      onSave: (v) => {
        if (!v.title) return false;
        if (isNew) plan.candidates.push({ id: LL.uid(), items: [], ...v });
        else Object.assign(cg, v);
        LL.commit();
      },
      onDelete: isNew
        ? null
        : () => {
            plan.candidates = plan.candidates.filter((x) => x !== cg);
            LL.commit();
          },
    });
  }

  function batchExtend(plan) {
    if (!selected.size) return LL.toast("延長するタスクを選んでください");
    LL.openForm({
      title: `${selected.size}件をまとめて延長`,
      value: { to: LL.addDays(LL.today(), 7) },
      fields: [{ key: "to", label: "新しい期限", type: "date" }],
      saveLabel: "延長する",
      onSave: (v) => {
        if (!v.to) return false;
        const ts = plan.tasks.filter((t) => selected.has(t.id));
        ts.forEach((t) => (t.due = v.to));
        const f = focusOn(plan, v.to);
        if (f) LL.toast(`注意：新しい期限が集中期間「${f.name}」に入っています`);
        selected.clear();
        selectMode = false;
        LL.commit();
      },
    });
  }

  // ---------- 操作 ----------
  function handleClick(e) {
    const plan = P();
    const el = (sel) => e.target.closest(sel);
    let x;
    if ((x = el("[data-sub]"))) {
      sub = x.dataset.sub;
      return LL.rerender();
    }
    if ((x = el("[data-toggle]"))) {
      const t = plan.tasks.find((t) => t.id === x.dataset.toggle);
      t.done = !t.done;
      t.doneAt = t.done ? LL.today() : null;
      return LL.commit();
    }
    if ((x = el("[data-sel]"))) {
      x.checked ? selected.add(x.dataset.sel) : selected.delete(x.dataset.sel);
      const btn = document.querySelector("[data-act=select-mode]");
      if (btn) btn.textContent = `${selected.size}件を選択中 ― 延長先を決める`;
      return;
    }
    if ((x = el("[data-edit-task]"))) return editTask(plan, plan.tasks.find((t) => t.id === x.dataset.editTask));
    if ((x = el("[data-edit-goal]"))) return editGoal(plan, goalOf(plan, x.dataset.editGoal));
    if ((x = el("[data-event]"))) return editEvent(plan, plan.events.find((v) => v.id === x.dataset.event));
    if ((x = el("[data-block]"))) return editBlock(plan, plan.blocks.find((b) => b.id === x.dataset.block));
    if ((x = el("[data-edit-pace]"))) return editPace(plan, plan.paces.find((p) => p.id === x.dataset.editPace));
    if ((x = el("[data-edit-counter]"))) return editCounter(plan, plan.counters.find((c) => c.id === x.dataset.editCounter));
    if ((x = el("[data-edit-seq]"))) return editSeq(plan, plan.sequences.find((s) => s.id === x.dataset.editSeq));
    if ((x = el("[data-cand]"))) return openCandidates(plan, plan.candidates.find((c) => c.id === x.dataset.cand));
    if ((x = el("[data-review]"))) return editReview(plan, Number(x.dataset.review));
    if ((x = el("[data-day]"))) return openDay(plan, x.dataset.day);
    if ((x = el("[data-zoom]"))) {
      LL.ui().stripZoom = LL.stepZoom(LL.ui().stripZoom || 1, Number(x.dataset.d));
      LL.save();
      return LL.rerender();
    }
    if ((x = el("[data-cal-size]"))) {
      LL.ui().calSize = x.dataset.calSize;
      LL.save();
      return LL.rerender();
    }
    if ((x = el("[data-pace-log]"))) {
      const p = plan.paces.find((p) => p.id === x.dataset.paceLog);
      p.log.push(LL.today());
      LL.toast(`${p.title}：${p.log.length}/${p.target}`);
      return LL.commit();
    }
    if ((x = el("[data-pace-undo]"))) {
      plan.paces.find((p) => p.id === x.dataset.paceUndo).log.pop();
      return LL.commit();
    }
    if ((x = el("[data-count]"))) {
      const c = plan.counters.find((c) => c.id === x.dataset.count);
      const d = Number(x.dataset.d);
      if (x.dataset.part != null) {
        const b = c.breakdown[Number(x.dataset.part)];
        b.count = Math.max(0, b.count + d);
      } else c.count = Math.max(0, c.count + d);
      return LL.commit();
    }
    if ((x = el("[data-step]"))) {
      const [sid, stid] = x.dataset.step.split(":");
      const st = plan.sequences.find((s) => s.id === sid).steps.find((s) => s.id === stid);
      st.done = !st.done;
      return LL.commit();
    }
    if ((x = el("[data-seq-back]"))) {
      backcalc(plan, plan.sequences.find((s) => s.id === x.dataset.seqBack));
      LL.toast("締切から逆算しました（集中期間は飛ばしています）");
      return LL.commit();
    }
    if ((x = el("[data-seq-fwd]"))) {
      forward(plan, plan.sequences.find((s) => s.id === x.dataset.seqFwd));
      LL.toast("最初の工程から前詰めにしました");
      return LL.commit();
    }

    const actEl = el("[data-act]");
    if (!actEl || actEl.tagName === "SELECT" || actEl.tagName === "INPUT") return;
    const d = actEl.dataset;
    switch (d.act) {
      case "new-plan":
        return editPlan(null);
      case "edit-plan":
        return editPlan(plan);
      case "add-goal":
        return editGoal(plan, null);
      case "add-task":
        return editTask(plan, null, { goalId: d.goal, due: d.due });
      case "add-event":
        return editEvent(plan, null, { goalId: d.goal, date: d.date });
      case "add-block":
        return editBlock(plan, null);
      case "add-pace":
        return editPace(plan, null, d.goal);
      case "add-counter":
        return editCounter(plan, null, d.goal);
      case "add-seq":
        return editSeq(plan, null, d.goal);
      case "add-cand":
        return editCandGroup(plan, null, d.goal);
      case "add-review":
        return editReview(plan, null);
      case "edit-rules":
        return editRules(plan);
      case "remind-settings":
        return editRemind(plan);
      case "toggle-remind":
        plan.remind.on = !plan.remind.on;
        toggleLog(plan);
        LL.toast(plan.remind.on ? "毎朝のリマインドをオンにしました" : "毎朝のリマインドを止めました");
        return LL.commit();
      case "select-mode":
        if (selectMode && selected.size) return batchExtend(plan);
        selectMode = true;
        return LL.rerender();
      case "select-cancel":
        selectMode = false;
        selected.clear();
        return LL.rerender();
      case "to-dawn":
        LL.closeModal();
        return LL.go("dawn");
      case "open-dawn":
        LL.closeModal();
        LL.openDawnDate(d.date);
        return LL.go("dawn");
    }
  }

  function bind(root) {
    root.onclick = handleClick;
    root.onchange = (e) => {
      if (e.target.matches("[data-act=pick-plan]")) {
        LL.state.activePlanId = e.target.value;
        LL.commit();
      }
    };
  }

  // ---------- 毎朝のリマインド ----------
  LL.checkMorningReminder = () => {
    const today = LL.today();
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    LL.state.plans.forEach((plan) => {
      const r = plan.remind;
      if (!r || !r.on || nowMin < r.time || !LL.inRange(today, plan.start, plan.end)) return;
      const key = `${plan.id}:${today}`;
      if (LL.state.meta.lastMorningRemind === key) return;
      LL.state.meta.lastMorningRemind = key;
      LL.save();
      LL.notify(`Lifeloom ・ ${plan.name}`, reminderText(plan).join("\n"));
    });
  };

  LL.EVENT_TYPES = EVENT_TYPES;
  LL.setSeasonSub = (s) => (sub = s);
})(window.LL);
