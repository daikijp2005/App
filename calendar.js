// 共通の月カレンダー描画。entries: [{ date: "YYYY-MM-DD", label, color? }]
// 呼び出し側はデータが変わるたびに同じ container に対して再度呼び出せば良い。
function renderCalendar(container, entries) {
  const DOW = ["日", "月", "火", "水", "木", "金", "土"];

  function pad(n) {
    return n.toString().padStart(2, "0");
  }

  function formatKey(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // 同じ container に対する2回目以降の呼び出しでは表示中の月を維持する
  const cursor = container._calCursor || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  container._calCursor = cursor;

  const byDate = {};
  entries.forEach((e) => {
    (byDate[e.date] = byDate[e.date] || []).push(e);
  });

  function draw() {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayKey = formatKey(new Date());

    const dayCells = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const key = `${year}-${pad(month + 1)}-${pad(day)}`;
      const dayEntries = byDate[key] || [];
      const dots = dayEntries
        .slice(0, 4)
        .map((e) => `<span class="cal-dot" style="background:${e.color || "var(--accent)"}"></span>`)
        .join("");

      return `<button type="button" class="cal-cell ${key === todayKey ? "cal-cell--today" : ""} ${dayEntries.length ? "has-entry" : ""}" data-date="${key}">
        <span class="cal-day-num">${day}</span>
        <span class="cal-dots">${dots}</span>
      </button>`;
    }).join("");

    const blanks = Array(firstDow).fill('<span class="cal-cell cal-cell--empty"></span>').join("");

    container.innerHTML = `
      <div class="cal-header">
        <button type="button" class="cal-nav" data-dir="-1" aria-label="前の月">‹</button>
        <span class="cal-title">${year}年${month + 1}月</span>
        <button type="button" class="cal-nav" data-dir="1" aria-label="次の月">›</button>
      </div>
      <div class="cal-grid">
        ${DOW.map((d) => `<span class="cal-dow">${d}</span>`).join("")}
        ${blanks}${dayCells}
      </div>
      <div class="cal-detail"></div>
    `;

    container.querySelectorAll(".cal-nav").forEach((btn) => {
      btn.addEventListener("click", () => {
        cursor.setMonth(cursor.getMonth() + Number(btn.dataset.dir));
        draw();
      });
    });

    container.querySelectorAll(".cal-cell.has-entry").forEach((cell) => {
      cell.addEventListener("click", () => {
        const items = byDate[cell.dataset.date] || [];
        container.querySelector(".cal-detail").innerHTML = items
          .map(
            (e) =>
              `<div class="cal-detail-item"><span class="cal-dot" style="background:${e.color || "var(--accent)"}"></span>${escapeHtml(e.label)}</div>`
          )
          .join("");
      });
    });
  }

  draw();
}
