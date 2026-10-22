// Journey ― 歳月の年表（長期の画面）
// 数年以上を、過去から未来まで横に長い帯グラフで見渡す。今より先は斜線（予定・未確定）
(function (LL) {
  const LABEL_W = 190;
  const hidden = new Set();

  const J = () => LL.state.journey;
  const catOf = (id) => J().categories.find((c) => c.id === id) || J().categories[J().categories.length - 1];

  // 表示する範囲（月の頭〜月の頭）
  function range() {
    const j = J();
    const dates = [...j.lanes.flatMap((l) => [l.start, l.end].filter(Boolean)), ...j.milestones.map((m) => m.date), LL.today()];
    const min = dates.reduce((a, b) => (a < b ? a : b));
    const max = dates.reduce((a, b) => (a > b ? a : b));
    const s = LL.parseYmd(min);
    const e = LL.parseYmd(max);
    const start = new Date(s.getFullYear(), s.getMonth() - 1, 1);
    const end = new Date(e.getFullYear(), e.getMonth() + 3, 1);
    const months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
    return { start, end, months };
  }

  function makeX(r, zoom) {
    return (dateStr) => {
      const d = LL.parseYmd(dateStr);
      const mi = (d.getFullYear() - r.start.getFullYear()) * 12 + d.getMonth() - r.start.getMonth();
      const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return (mi + (d.getDate() - 1) / dim) * zoom;
    };
  }

  function laneLabel(l) {
    const today = LL.today();
    if (!l.end) return l.note || "継続中";
    const dur = LL.fmtMonths(LL.monthsBetween(l.start, l.end));
    if (l.note) return `${dur}（${l.note}）`;
    return l.end > today ? `${dur}（予定）` : dur;
  }

  LL.renderJourney = function (root) {
    const j = J();
    const r = range();
    const avail = (root.clientWidth || 1200) - LABEL_W - 220;
    const zoom = j.zoom || Math.max(14, Math.min(110, Math.floor(avail / r.months)));
    const x = makeX(r, zoom);
    const W = r.months * zoom;
    const today = LL.today();
    const xEnd = W;
    const lanes = j.lanes.filter((l) => !hidden.has(l.cat));

    // 目盛り
    const interval = zoom >= 70 ? 1 : zoom >= 40 ? 3 : 6;
    let grid = "";
    let axis = "";
    let years = "";
    for (let i = 0; i <= r.months; i++) {
      const d = new Date(r.start.getFullYear(), r.start.getMonth() + i, 1);
      const m = d.getMonth() + 1;
      const left = i * zoom;
      grid += `<i class="g ${m === 1 ? "year" : (m - 4) % interval === 0 ? "major" : ""}" style="left:${left}px"></i>`;
      if (((m - 4) % interval + interval) % interval === 0) axis += `<span style="left:${left}px">${d.getFullYear()}年${m}月</span>`;
      if (m === 1 || i === 0) years += `<span style="left:${left}px">${d.getFullYear()}</span>`;
    }

    const rows = lanes
      .map((l, idx) => {
        const c = catOf(l.cat);
        const s = x(l.start);
        const e = l.end ? x(LL.addDays(l.end, 1)) : xEnd;
        const t = x(today);
        const pastW = Math.max(0, Math.min(e, t) - s);
        const futW = Math.max(0, e - Math.max(s, t));
        const futL = Math.max(s, t) - s;
        const open = !l.end;
        const text = laneLabel(l);
        return `<div class="jr-row" data-lane="${l.id}">
          <div class="jr-label" style="--c:${c.color}">
            <button class="link" data-edit-lane="${l.id}">${LL.esc(l.name)}</button>
            <span class="jr-move">
              <button class="mini-btn" data-move="${l.id}" data-d="-1" ${idx === 0 ? "disabled" : ""} aria-label="上へ">↑</button>
              <button class="mini-btn" data-move="${l.id}" data-d="1" ${idx === lanes.length - 1 ? "disabled" : ""} aria-label="下へ">↓</button>
            </span>
          </div>
          <div class="jr-track" style="width:${W}px">
            <button class="jr-bar ${open ? "open" : ""}" data-edit-lane="${l.id}" style="left:${s}px;width:${Math.max(e - s, 4)}px;--c:${c.color}"
              title="${LL.esc(l.name)}：${LL.fmtYMD(l.start)} 〜 ${l.end ? LL.fmtYMD(l.end) : "継続"}（${LL.esc(text)}）">
              ${pastW ? `<i class="past" style="width:${pastW}px"></i>` : ""}
              ${futW ? `<i class="future" style="left:${futL}px;width:${futW}px"></i>` : ""}
              ${open ? `<span class="inbar">${LL.esc(text)} →</span>` : ""}
            </button>
            ${open ? "" : `<span class="jr-note" style="left:${e + 8}px">${LL.esc(text)}</span>`}
          </div>
        </div>`;
      })
      .join("");

    const miles = j.milestones
      .map((m) => `<button class="jr-mile" data-mile="${m.id}" style="left:${x(m.date)}px" title="${LL.fmtYMD(m.date)}"><b>▼</b>${LL.esc(m.label)}</button>`)
      .join("");

    const plans = LL.state.plans
      .map((p) => `<button class="jr-plan" data-plan="${p.id}" style="left:${x(p.start)}px;width:${Math.max(x(LL.addDays(p.end, 1)) - x(p.start), 6)}px" title="${LL.esc(p.name)}"><span>${LL.esc(p.name)}</span></button>`)
      .join("");

    const tx = x(today);
    const td = LL.parseYmd(today);
    const stats = renderStats();

    root.innerHTML = `
      <section class="view-intro">
        <div>
          <p class="eyebrow">JOURNEY ・ 歳月の年表</p>
          <h2>過去から未来まで、所属してきた場所を一本の帯に。</h2>
          <p class="lead">実線はこれまで、斜線はこれから（予定・未確定）。今日を境に自動で切り替わります。</p>
        </div>
        <div class="intro-actions">
          <button class="btn ghost" data-act="add-lane">＋ 所属を追加</button>
          <button class="btn ghost" data-act="add-mile">＋ 出来事</button>
          <button class="btn ghost" data-act="image">↓ 画像で保存</button>
        </div>
      </section>

      <div class="jr-stats">${stats}</div>

      <div class="jr-toolbar card">
        <label class="zoom"><span>表示の細かさ</span><input type="range" min="14" max="110" value="${zoom}" data-act="zoom"><span class="muted">${zoom >= 70 ? "1か月ごと" : zoom >= 40 ? "3か月ごと" : "半年ごと"}</span></label>
        <button class="chip-btn" data-act="fit">全体を表示</button>
        <button class="chip-btn" data-act="now">今へ移動</button>
        <div class="jr-filters">${j.categories
          .filter((c) => j.lanes.some((l) => l.cat === c.id))
          .map((c) => `<button class="filter ${hidden.has(c.id) ? "off" : ""}" data-cat="${c.id}" style="--c:${c.color}"><i></i>${LL.esc(c.name)}</button>`)
          .join("")}</div>
      </div>

      <div class="jr-wrap card" id="journey-chart">
        <button class="jr-title link" data-act="title">${LL.esc(j.title || "所属期間")}</button>
        <div class="jr-scroll">
          <div class="jr-canvas" style="width:${W + LABEL_W + 260}px">
            <div class="jr-row jr-years"><div class="jr-label"></div><div class="jr-track" style="width:${W}px">${years}<b class="jr-now-label" style="left:${tx}px">今（${td.getFullYear()}年${td.getMonth() + 1}月）</b></div></div>
            <div class="jr-row jr-plans"><div class="jr-label"><span class="muted small">Season の計画</span></div><div class="jr-track" style="width:${W}px">${plans}</div></div>
            <div class="jr-body">
              <div class="jr-grid" style="width:${W}px">${grid}
                <i class="jr-now" style="left:${tx}px"></i>
              </div>
              ${rows || `<p class="empty">表示する所属がありません。</p>`}
              <div class="jr-row jr-miles"><div class="jr-label"></div><div class="jr-track" style="width:${W}px">${miles}</div></div>
            </div>
            <div class="jr-row jr-axis"><div class="jr-label"></div><div class="jr-track" style="width:${W}px">${axis}</div></div>
          </div>
        </div>
        <ul class="jr-legend">
          ${j.categories.filter((c) => j.lanes.some((l) => l.cat === c.id)).map((c) => `<li><i style="background:${c.color}"></i>${LL.esc(c.name)}</li>`).join("")}
          <li><i class="hatch"></i>今後（予定・未確定）</li>
        </ul>
      </div>
    `;
    bind(root);
    // 初回は「今」が見える位置へ
    const sc = root.querySelector(".jr-scroll");
    if (sc && !j.zoom) sc.scrollLeft = 0;
    else if (sc && !LL._journeyScrolled) {
      sc.scrollLeft = Math.max(0, tx - sc.clientWidth * 0.55 + LABEL_W);
      LL._journeyScrolled = true;
    } else if (sc && LL._journeyScrollLeft != null) sc.scrollLeft = LL._journeyScrollLeft;
    sc.addEventListener("scroll", () => (LL._journeyScrollLeft = sc.scrollLeft));
  };

  function renderStats() {
    const j = J();
    const today = LL.today();
    const now = j.lanes.filter((l) => l.start <= today && (!l.end || l.end >= today));
    const soon = j.lanes.filter((l) => l.start > today).sort((a, b) => a.start.localeCompare(b.start));
    const past = j.milestones.filter((m) => m.date <= today).sort((a, b) => a.date.localeCompare(b.date));
    const next = j.milestones.filter((m) => m.date > today).sort((a, b) => a.date.localeCompare(b.date))[0];
    const first = past[0];
    const tile = (k, v, s) => `<div class="stat"><p class="stat-k">${k}</p><p class="stat-v">${v}</p><p class="stat-s">${s}</p></div>`;
    return [
      first ? tile(`${LL.esc(first.label)}から`, LL.fmtMonths(LL.monthsBetween(first.date, today)), LL.fmtYMD(first.date)) : "",
      next ? tile(`${LL.esc(next.label)}まで`, LL.fmtMonths(LL.monthsBetween(today, next.date)), LL.fmtYMD(next.date)) : "",
      tile("いま所属しているもの", `${now.length}<small>件</small>`, now.map((l) => LL.esc(l.name)).join("・") || "—"),
      tile("これから始まる", `${soon.length}<small>件</small>`, soon.map((l) => `${LL.esc(l.name)}（${LL.fmtMD(l.start).replace(/（.）/, "")}）`).join("・") || "—"),
    ].join("");
  }

  // ---------- 編集 ----------
  function editLane(l) {
    const isNew = !l;
    LL.openForm({
      title: isNew ? "所属を追加" : "所属を編集",
      subtitle: "終了日を空にすると「継続中」として右端まで伸びます。今日より先は自動で斜線になります。",
      value: l || { name: "", cat: "study", start: LL.today(), end: null, note: "" },
      fields: [
        { key: "name", label: "名前", full: true, placeholder: "例: 喫茶店" },
        { key: "cat", label: "カテゴリ", type: "select", options: J().categories.map((c) => ({ value: c.id, label: c.name })) },
        { key: "note", label: "メモ（期間の横に表示）", placeholder: "例: 2028年3月 卒業" },
        { key: "start", label: "開始日", type: "date" },
        { key: "end", label: "終了日（空＝継続中）", type: "date" },
      ],
      onSave: (v) => {
        if (!v.name || !v.start) return LL.toast("名前と開始日を入れてください"), false;
        if (v.end && v.end < v.start) return LL.toast("終了日が開始日より前です"), false;
        if (isNew) J().lanes.push({ id: LL.uid(), ...v });
        else Object.assign(l, v);
        LL.commit();
      },
      onDelete: isNew
        ? null
        : () => {
            J().lanes = J().lanes.filter((x) => x !== l);
            LL.commit();
          },
    });
  }

  function editMile(m) {
    const isNew = !m;
    LL.openForm({
      title: isNew ? "出来事を追加" : "出来事を編集",
      value: m || { date: LL.today(), label: "" },
      fields: [
        { key: "label", label: "出来事", placeholder: "例: 入学" },
        { key: "date", label: "日付", type: "date" },
      ],
      onSave: (v) => {
        if (!v.label || !v.date) return false;
        if (isNew) J().milestones.push({ id: LL.uid(), ...v });
        else Object.assign(m, v);
        LL.commit();
      },
      onDelete: isNew
        ? null
        : () => {
            J().milestones = J().milestones.filter((x) => x !== m);
            LL.commit();
          },
    });
  }

  function bind(root) {
    root.onclick = (e) => {
      const el = (s) => e.target.closest(s);
      let x;
      if ((x = el("[data-move]"))) {
        const lanes = J().lanes;
        const i = lanes.findIndex((l) => l.id === x.dataset.move);
        const vis = lanes.filter((l) => !hidden.has(l.cat));
        const vi = vis.findIndex((l) => l.id === x.dataset.move);
        const other = vis[vi + Number(x.dataset.d)];
        if (!other) return;
        const k = lanes.indexOf(other);
        [lanes[i], lanes[k]] = [lanes[k], lanes[i]];
        return LL.commit();
      }
      if ((x = el("[data-edit-lane]"))) return editLane(J().lanes.find((l) => l.id === x.dataset.editLane));
      if ((x = el("[data-mile]"))) return editMile(J().milestones.find((m) => m.id === x.dataset.mile));
      if ((x = el("[data-cat]"))) {
        hidden.has(x.dataset.cat) ? hidden.delete(x.dataset.cat) : hidden.add(x.dataset.cat);
        return LL.rerender();
      }
      if ((x = el("[data-plan]"))) {
        LL.state.activePlanId = x.dataset.plan;
        LL.setSeasonSub("calendar");
        LL.save();
        return LL.go("season");
      }
      const act = el("[data-act]")?.dataset.act;
      if (act === "fit") {
        J().zoom = null;
        LL._journeyScrollLeft = 0;
        LL.save();
        return LL.rerender();
      }
      if (act === "add-lane") editLane(null);
      if (act === "add-mile") editMile(null);
      if (act === "now") {
        const sc = root.querySelector(".jr-scroll");
        const now = root.querySelector(".jr-now");
        sc.scrollTo({ left: now.offsetLeft - sc.clientWidth * 0.55 + LABEL_W, behavior: "smooth" });
      }
      if (act === "title") {
        LL.openForm({
          title: "年表のタイトル",
          value: { title: J().title },
          fields: [{ key: "title", label: "タイトル", full: true }],
          onSave: (v) => {
            J().title = v.title || "";
            LL.commit();
          },
        });
      }
      if (act === "image") LL.saveImage(document.getElementById("journey-chart"), "journey.png");
    };
    root.oninput = (e) => {
      if (e.target.matches("[data-act=zoom]")) {
        const sc = root.querySelector(".jr-scroll");
        const ratio = (sc.scrollLeft + sc.clientWidth / 2) / sc.scrollWidth;
        J().zoom = Number(e.target.value);
        LL.save();
        LL.rerender();
        const sc2 = root.querySelector(".jr-scroll");
        sc2.scrollLeft = ratio * sc2.scrollWidth - sc2.clientWidth / 2;
        LL._journeyScrollLeft = sc2.scrollLeft;
        root.querySelector("[data-act=zoom]").focus();
      }
    };
  }
})(window.LL);
