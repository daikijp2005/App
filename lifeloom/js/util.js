// 共通の小さな道具（日付・時刻・文字列・モーダル）
// ビルド不要で動かすため、ES モジュールではなく window.LL にまとめる
window.LL = window.LL || {};

(function (LL) {
  const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

  LL.esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  LL.uid = () => Math.random().toString(36).slice(2, 9);

  // ---------- 時刻（分で持つ。24:30 = 1470 のように 24 時を超えてよい） ----------
  LL.parseTime = (str) => {
    if (str === "" || str == null) return null;
    const m = String(str).trim().match(/^(\d{1,2}):?(\d{2})$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  LL.fmtTime = (min) => {
    if (min == null) return "";
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}:${String(m).padStart(2, "0")}`;
  };
  // <input type="time"> 用（24 時以降は 0 時台に戻す）
  LL.toInputTime = (min) => {
    if (min == null) return "";
    const v = ((min % 1440) + 1440) % 1440;
    return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
  };
  LL.fmtDur = (min) => {
    if (min <= 0) return "0分";
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (!h) return `${m}分`;
    return m ? `${h}時間${m}分` : `${h}時間`;
  };

  // ---------- 日付（"YYYY-MM-DD" 文字列で持つ） ----------
  LL.parseYmd = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  LL.ymd = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  LL.today = () => LL.ymd(new Date());
  LL.addDays = (s, n) => {
    const d = LL.parseYmd(s);
    d.setDate(d.getDate() + n);
    return LL.ymd(d);
  };
  LL.diffDays = (a, b) => Math.round((LL.parseYmd(b) - LL.parseYmd(a)) / 86400000);
  LL.weekday = (s) => WEEK[LL.parseYmd(s).getDay()];
  LL.WEEK = WEEK;
  LL.fmtMD = (s) => {
    if (!s) return "未定";
    const d = LL.parseYmd(s);
    return `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）`;
  };
  LL.fmtYMD = (s) => {
    const d = LL.parseYmd(s);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  };
  LL.inRange = (s, a, b) => s >= a && s <= b;
  // 残り日数の表示
  LL.countdown = (s) => {
    const n = LL.diffDays(LL.today(), s);
    if (n === 0) return { n, label: "今日", level: "now" };
    if (n === 1) return { n, label: "明日", level: "urgent" };
    if (n < 0) return { n, label: `${-n}日前`, level: "past" };
    return { n, label: `あと${n}日`, level: n <= 3 ? "urgent" : n <= 7 ? "soon" : "safe" };
  };
  // 月数の差（start〜end を含む期間を「x年yか月」で）
  LL.monthsBetween = (a, b) => {
    const A = LL.parseYmd(a);
    const B = LL.parseYmd(LL.addDays(b, 1));
    let m = (B.getFullYear() - A.getFullYear()) * 12 + (B.getMonth() - A.getMonth());
    if (B.getDate() < A.getDate()) m -= 1;
    return m;
  };
  LL.fmtMonths = (m) => {
    if (m < 1) return "1か月未満";
    const y = Math.floor(m / 12);
    const r = m % 12;
    if (!y) return `${r}か月`;
    return r ? `${y}年${r}か月` : `${y}年`;
  };

  // ---------- 小さなトースト ----------
  LL.toast = (msg) => {
    const box = document.getElementById("toast");
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.classList.add("out"), 2400);
    setTimeout(() => el.remove(), 2900);
  };

  // ---------- 汎用フォームモーダル ----------
  // fields: [{ key, label, type, options, placeholder, help, full }]
  // type: text / textarea / date / time / number / color / select / checks / checkbox / list
  LL.openForm = ({ title, subtitle, fields, value = {}, onSave, onDelete, deleteLabel = "削除", saveLabel = "保存", confirmDelete = true }) => {
    const modal = document.getElementById("modal");
    const v = { ...value };
    const fieldHtml = fields
      .map((f) => {
        const id = `f-${f.key}`;
        const cur = v[f.key];
        const full = f.full || f.type === "textarea" || f.type === "checks" || f.type === "list" ? " full" : "";
        let input = "";
        switch (f.type) {
          case "textarea":
            input = `<textarea id="${id}" rows="${f.rows || 3}" placeholder="${LL.esc(f.placeholder || "")}">${LL.esc(cur ?? "")}</textarea>`;
            break;
          case "list":
            input = `<textarea id="${id}" rows="${f.rows || 4}" placeholder="1行に1つ">${LL.esc((cur || []).join("\n"))}</textarea>`;
            break;
          case "select":
            input = `<select id="${id}">${f.options
              .map((o) => `<option value="${LL.esc(o.value)}" ${String(o.value) === String(cur ?? "") ? "selected" : ""}>${LL.esc(o.label)}</option>`)
              .join("")}</select>`;
            break;
          case "checks":
            input = `<div class="checks" id="${id}">${f.options
              .map(
                (o) =>
                  `<label class="check-pill"><input type="checkbox" value="${LL.esc(o.value)}" ${(cur || []).includes(o.value) ? "checked" : ""}><span>${LL.esc(o.label)}</span></label>`
              )
              .join("")}</div>`;
            break;
          case "checkbox":
            input = `<label class="switch-line"><input type="checkbox" id="${id}" ${cur ? "checked" : ""}><span>${LL.esc(f.text || "")}</span></label>`;
            break;
          case "time":
            input = `<input type="time" id="${id}" value="${cur == null ? "" : LL.toInputTime(cur)}">`;
            break;
          case "color":
            input = `<div class="color-row"><input type="color" id="${id}" value="${LL.esc(cur || "#888888")}">${(f.swatches || LL.SWATCHES)
              .map((c) => `<button type="button" class="swatch" data-color="${c}" style="background:${c}"></button>`)
              .join("")}</div>`;
            break;
          default:
            input = `<input type="${f.type || "text"}" id="${id}" value="${LL.esc(cur ?? "")}" placeholder="${LL.esc(f.placeholder || "")}" ${f.step ? `step="${f.step}"` : ""}>`;
        }
        return `<div class="field${full}"><label for="${id}">${LL.esc(f.label)}</label>${input}${f.help ? `<p class="help">${LL.esc(f.help)}</p>` : ""}</div>`;
      })
      .join("");

    modal.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true">
        <header class="modal-head">
          <div><h3>${LL.esc(title)}</h3>${subtitle ? `<p>${LL.esc(subtitle)}</p>` : ""}</div>
          <button class="icon-btn" data-close aria-label="閉じる">✕</button>
        </header>
        <form class="modal-body form-grid">${fieldHtml}</form>
        <footer class="modal-foot">
          ${onDelete ? `<button type="button" class="btn ghost danger" data-delete>${LL.esc(deleteLabel)}</button>` : ""}
          <span class="spacer"></span>
          <button type="button" class="btn ghost" data-close>キャンセル</button>
          <button type="button" class="btn primary" data-save>${LL.esc(saveLabel)}</button>
        </footer>
      </div>`;
    modal.hidden = false;
    const first = modal.querySelector("input, textarea, select");
    if (first) first.focus();

    const collect = () => {
      const out = { ...value };
      fields.forEach((f) => {
        const el = modal.querySelector(`#f-${f.key}`);
        switch (f.type) {
          case "checks":
            out[f.key] = [...el.querySelectorAll("input:checked")].map((i) => i.value);
            break;
          case "checkbox":
            out[f.key] = el.checked;
            break;
          case "number":
            out[f.key] = el.value === "" ? null : Number(el.value);
            break;
          case "time":
            out[f.key] = LL.parseTime(el.value);
            break;
          case "list":
            out[f.key] = el.value.split("\n").map((s) => s.trim()).filter(Boolean);
            break;
          default:
            out[f.key] = el.value.trim() === "" && f.type !== "color" ? (f.emptyAsNull === false ? "" : null) : el.value.trim();
        }
      });
      return out;
    };

    modal.onclick = (e) => {
      if (e.target === modal || e.target.closest("[data-close]")) return LL.closeModal();
      const sw = e.target.closest(".swatch");
      if (sw) sw.parentElement.querySelector("input[type=color]").value = sw.dataset.color;
      if (e.target.closest("[data-save]")) {
        const res = onSave(collect());
        if (res !== false) LL.closeModal();
      }
      if (e.target.closest("[data-delete]")) {
        const run = () => {
          onDelete();
          LL.closeModal();
        };
        if (!confirmDelete) run();
        else LL.ask({ message: "本当に削除しますか？", okLabel: "削除する", danger: true }).then((ok) => ok && run());
      }
    };
    modal.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      modal.querySelector("[data-save]").click();
    };
  };

  // 中身を自由に組むモーダル（日付の詳細など）
  LL.openPanel = (title, html, onClick) => {
    const modal = document.getElementById("modal");
    modal.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true">
        <header class="modal-head"><div><h3>${LL.esc(title)}</h3></div><button class="icon-btn" data-close aria-label="閉じる">✕</button></header>
        <div class="modal-body">${html}</div>
      </div>`;
    modal.hidden = false;
    modal.onclick = (e) => {
      if (e.target === modal || e.target.closest("[data-close]")) return LL.closeModal();
      if (onClick) onClick(e);
    };
  };

  // confirm() / prompt() の代わり（アーティファクトの中では標準のダイアログが出ないため）
  // input を渡すと入力欄つき。キャンセルは null、OK は true（入力欄があれば文字列）
  LL.ask = ({ message, input, value = "", okLabel = "OK", danger = false }) =>
    new Promise((resolve) => {
      const box = document.createElement("div");
      box.className = "ask";
      box.innerHTML = `<div class="ask-card" role="alertdialog" aria-modal="true">
          <p>${LL.esc(message)}</p>
          ${input ? `<input id="ask-input" value="${LL.esc(value)}" placeholder="${LL.esc(input)}">` : ""}
          <div class="ask-btns">
            <button type="button" class="btn ghost" data-ask="no">キャンセル</button>
            <button type="button" class="btn ${danger ? "danger-fill" : "primary"}" data-ask="yes">${LL.esc(okLabel)}</button>
          </div>
        </div>`;
      document.body.appendChild(box);
      const field = box.querySelector("#ask-input");
      (field || box.querySelector("[data-ask=yes]")).focus();
      const done = (ok) => {
        box.remove();
        resolve(ok ? (field ? field.value.trim() : true) : null);
      };
      box.addEventListener("click", (e) => {
        const b = e.target.closest("[data-ask]");
        if (b) done(b.dataset.ask === "yes");
        else if (e.target === box) done(false);
      });
      box.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") done(true);
        if (e.key === "Escape") done(false);
      });
    });

  LL.closeModal = () => {
    const modal = document.getElementById("modal");
    modal.hidden = true;
    modal.innerHTML = "";
  };
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") LL.closeModal();
  });

  LL.SWATCHES = ["#3a6db5", "#e07b39", "#3a9a6a", "#c9407e", "#8a6bc4", "#d9a520", "#4aa3b5", "#a9a4a6"];

  // ---------- 画像として保存（html2canvas を CDN から読む） ----------
  LL.saveImage = async (el, filename) => {
    if (!window.html2canvas) {
      LL.toast("画像保存の部品を読み込めませんでした（オフライン？）");
      return;
    }
    LL.toast("画像を作っています…");
    el.classList.add("capturing");
    try {
      const canvas = await window.html2canvas(el, { scale: 2, backgroundColor: null, useCORS: true });
      const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
      await LL.saveFile(filename, blob);
    } finally {
      el.classList.remove("capturing");
    }
  };

  // ファイルを保存する。アーティファクトの中では downloads 機能で確認を出し、
  // ふつうのブラウザではリンクから保存する
  LL.saveFile = async (filename, data) => {
    const dl = window.claude && window.claude.use ? await window.claude.use("downloads").catch(() => null) : null;
    if (dl) {
      try {
        await dl.save({ filename, data });
        LL.toast("保存しました");
      } catch (err) {
        if (err && err.code !== "declined") LL.toast("この画面では保存できませんでした");
      }
      return;
    }
    if (window.claude) return LL.toast("この画面では保存できませんでした");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
    a.download = filename;
    a.click();
  };

  // ---------- 通知 ----------
  LL.notify = (title, body) => {
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(title, { body });
      } catch (_) {
        /* 一部ブラウザは new Notification を許さない */
      }
    }
  };
})(window.LL);
