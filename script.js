// 就活情報はすべて1つのオブジェクトにまとめ、ブラウザの localStorage に保存する
const STORAGE_KEY = "jobSearchProfile";

const defaultData = {
  profile: {
    name: "", furigana: "", email: "", phone: "", address: "",
    birthdate: "", school: "", faculty: "", graduation: "",
  },
  preferences: {
    industries: "", jobtypes: "", locations: "", workstyle: "",
    salaryMin: "", salaryMax: "", companySize: "", axis: "", notes: "",
  },
  history: [], // { id, type: 'edu'|'work', title, detail, start, end, note }
  skills: { skills: [], certifications: [], languages: [] },
  selfpr: { strengths: "", weaknesses: "", gakuchika: "", motivation: "", selfpr: "" },
  companies: [], // { id, name, industry, status, nextDate, note }
};

let data = loadData();

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(defaultData);
  const parsed = JSON.parse(raw);
  // 将来フィールドが増えてもデフォルト値で補完する
  return {
    profile: { ...defaultData.profile, ...parsed.profile },
    preferences: { ...defaultData.preferences, ...parsed.preferences },
    history: parsed.history || [],
    skills: { ...defaultData.skills, ...parsed.skills },
    selfpr: { ...defaultData.selfpr, ...parsed.selfpr },
    companies: parsed.companies || [],
  };
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function showSavedIndicator(name) {
  const el = document.querySelector(`[data-indicator="${name}"]`);
  if (!el) return;
  el.textContent = "保存しました";
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 1500);
}

// ---------- タブ切り替え ----------
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.dataset.tab;
    tabPanels.forEach((panel) => {
      panel.hidden = panel.id !== `tab-${target}`;
    });
  });
});

// ---------- 基本情報 ----------
const profileFields = {
  name: "p-name", furigana: "p-furigana", email: "p-email", phone: "p-phone",
  address: "p-address", birthdate: "p-birthdate", school: "p-school",
  faculty: "p-faculty", graduation: "p-graduation",
};

function loadProfileForm() {
  for (const [key, id] of Object.entries(profileFields)) {
    document.getElementById(id).value = data.profile[key] || "";
  }
}

document.querySelector('[data-save="profile"]').addEventListener("click", () => {
  for (const [key, id] of Object.entries(profileFields)) {
    data.profile[key] = document.getElementById(id).value.trim();
  }
  saveData();
  showSavedIndicator("profile");
});

// ---------- 希望条件 ----------
const preferenceFields = {
  industries: "pr-industries", jobtypes: "pr-jobtypes", locations: "pr-locations",
  workstyle: "pr-workstyle", salaryMin: "pr-salary-min", salaryMax: "pr-salary-max",
  companySize: "pr-company-size", axis: "pr-axis", notes: "pr-notes",
};

function loadPreferencesForm() {
  for (const [key, id] of Object.entries(preferenceFields)) {
    document.getElementById(id).value = data.preferences[key] || "";
  }
}

document.querySelector('[data-save="preferences"]').addEventListener("click", () => {
  for (const [key, id] of Object.entries(preferenceFields)) {
    data.preferences[key] = document.getElementById(id).value.trim();
  }
  saveData();
  showSavedIndicator("preferences");
});

// ---------- 経歴 ----------
const historyForm = document.getElementById("history-form");
const historyList = document.getElementById("history-list");
const historyEmpty = document.getElementById("history-empty");

function formatMonth(str) {
  if (!str) return "現在";
  const [y, m] = str.split("-");
  return `${y}年${Number(m)}月`;
}

function renderHistory() {
  historyList.innerHTML = "";
  const sorted = [...data.history].sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  historyEmpty.hidden = sorted.length > 0;

  sorted.forEach((entry) => {
    const li = document.createElement("li");
    li.className = "entry-item";
    li.innerHTML = `
      <div class="entry-main">
        <span class="entry-badge ${entry.type === "edu" ? "badge-edu" : "badge-work"}">${entry.type === "edu" ? "学歴" : "職歴"}</span>
        <strong>${escapeHtml(entry.title)}</strong>
        ${entry.detail ? `<span class="entry-sub">${escapeHtml(entry.detail)}</span>` : ""}
        <span class="entry-period">${formatMonth(entry.start)} 〜 ${formatMonth(entry.end)}</span>
        ${entry.note ? `<p class="entry-note">${escapeHtml(entry.note)}</p>` : ""}
      </div>
      <button class="delete-btn" data-id="${entry.id}" title="削除">✕</button>
    `;
    historyList.appendChild(li);
  });
}

historyForm.addEventListener("submit", (e) => {
  e.preventDefault();
  data.history.push({
    id: Date.now().toString(),
    type: document.getElementById("h-type").value,
    title: document.getElementById("h-title").value.trim(),
    detail: document.getElementById("h-detail").value.trim(),
    start: document.getElementById("h-start").value,
    end: document.getElementById("h-end").value,
    note: document.getElementById("h-note").value.trim(),
  });
  saveData();
  renderHistory();
  historyForm.reset();
});

historyList.addEventListener("click", (e) => {
  const id = e.target.dataset.id;
  if (!id || !e.target.classList.contains("delete-btn")) return;
  data.history = data.history.filter((h) => h.id !== id);
  saveData();
  renderHistory();
});

// ---------- スキル・資格・語学（タグ形式） ----------
const tagForms = document.querySelectorAll(".tag-form");

function renderTags(type) {
  const list = document.getElementById(`skills-${type}`);
  list.innerHTML = "";
  data.skills[type].forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "tag-chip";
    li.innerHTML = `<span>${escapeHtml(item)}</span><button class="tag-remove" data-type="${type}" data-index="${index}" title="削除">✕</button>`;
    list.appendChild(li);
  });
}

tagForms.forEach((form) => {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const type = form.dataset.tagType;
    const input = form.querySelector("input");
    const value = input.value.trim();
    if (!value) return;
    data.skills[type].push(value);
    saveData();
    renderTags(type);
    form.reset();
    input.focus();
  });
});

document.querySelectorAll(".tag-list").forEach((list) => {
  list.addEventListener("click", (e) => {
    if (!e.target.classList.contains("tag-remove")) return;
    const { type, index } = e.target.dataset;
    data.skills[type].splice(Number(index), 1);
    saveData();
    renderTags(type);
  });
});

// ---------- 自己PR ----------
const selfprFields = {
  strengths: "sp-strengths", weaknesses: "sp-weaknesses", gakuchika: "sp-gakuchika",
  motivation: "sp-motivation", selfpr: "sp-selfpr",
};

function loadSelfprForm() {
  for (const [key, id] of Object.entries(selfprFields)) {
    document.getElementById(id).value = data.selfpr[key] || "";
  }
}

document.querySelector('[data-save="selfpr"]').addEventListener("click", () => {
  for (const [key, id] of Object.entries(selfprFields)) {
    data.selfpr[key] = document.getElementById(id).value.trim();
  }
  saveData();
  showSavedIndicator("selfpr");
});

// ---------- 応募企業管理 ----------
const companyForm = document.getElementById("company-form");
const companyList = document.getElementById("company-list");
const companyEmpty = document.getElementById("company-empty");
const companyStats = document.getElementById("company-stats");

const statusClassMap = {
  "検討中": "status-neutral",
  "ES提出": "status-progress",
  "Webテスト": "status-progress",
  "一次面接": "status-progress",
  "二次面接": "status-progress",
  "最終面接": "status-progress",
  "内定": "status-success",
  "内定辞退": "status-neutral",
  "不採用": "status-danger",
};

function renderCompanyStats() {
  const total = data.companies.length;
  const inProgress = data.companies.filter((c) =>
    ["ES提出", "Webテスト", "一次面接", "二次面接", "最終面接"].includes(c.status)
  ).length;
  const offers = data.companies.filter((c) => c.status === "内定").length;

  companyStats.innerHTML = `
    <div class="stat">
      <span class="stat-num">${total}</span>
      <span class="stat-label">応募企業数</span>
    </div>
    <div class="stat stat--warning">
      <span class="stat-num">${inProgress}</span>
      <span class="stat-label">選考中</span>
    </div>
    <div class="stat stat--success">
      <span class="stat-num">${offers}</span>
      <span class="stat-label">内定</span>
    </div>
  `;
}

function renderCompanies() {
  renderCompanyStats();
  companyList.innerHTML = "";
  const sorted = [...data.companies].sort((a, b) => (a.nextDate || "9999").localeCompare(b.nextDate || "9999"));
  companyEmpty.hidden = sorted.length > 0;

  sorted.forEach((c) => {
    const li = document.createElement("li");
    li.className = "entry-item";
    li.innerHTML = `
      <div class="entry-main">
        <span class="entry-badge ${statusClassMap[c.status] || "status-neutral"}">${escapeHtml(c.status)}</span>
        <strong>${escapeHtml(c.name)}</strong>
        ${c.industry ? `<span class="entry-sub">${escapeHtml(c.industry)}</span>` : ""}
        ${c.nextDate ? `<span class="entry-period">次の予定: ${escapeHtml(c.nextDate)}</span>` : ""}
        ${c.note ? `<p class="entry-note">${escapeHtml(c.note)}</p>` : ""}
      </div>
      <button class="delete-btn" data-id="${c.id}" title="削除">✕</button>
    `;
    companyList.appendChild(li);
  });
}

companyForm.addEventListener("submit", (e) => {
  e.preventDefault();
  data.companies.push({
    id: Date.now().toString(),
    name: document.getElementById("c-name").value.trim(),
    industry: document.getElementById("c-industry").value.trim(),
    status: document.getElementById("c-status").value,
    nextDate: document.getElementById("c-next-date").value,
    note: document.getElementById("c-note").value.trim(),
  });
  saveData();
  renderCompanies();
  companyForm.reset();
});

companyList.addEventListener("click", (e) => {
  const id = e.target.dataset.id;
  if (!id || !e.target.classList.contains("delete-btn")) return;
  data.companies = data.companies.filter((c) => c.id !== id);
  saveData();
  renderCompanies();
});

// ---------- サマリー出力 ----------
const summaryOutput = document.getElementById("summary-output");

function buildSummary() {
  const p = data.profile;
  const pr = data.preferences;
  const sp = data.selfpr;
  const lines = [];

  lines.push("■ 基本情報");
  lines.push(`氏名: ${p.name || "-"}（${p.furigana || "-"}）`);
  lines.push(`連絡先: ${p.email || "-"} / ${p.phone || "-"}`);
  lines.push(`住所: ${p.address || "-"}`);
  lines.push(`学校: ${p.school || "-"} ${p.faculty || ""}`.trim());
  lines.push(`卒業予定: ${p.graduation || "-"}`);
  lines.push("");

  lines.push("■ 希望条件");
  lines.push(`業界: ${pr.industries || "-"}`);
  lines.push(`職種: ${pr.jobtypes || "-"}`);
  lines.push(`勤務地: ${pr.locations || "-"}`);
  lines.push(`働き方: ${pr.workstyle || "-"}`);
  lines.push(`希望年収: ${pr.salaryMin || "-"}万円 〜 ${pr.salaryMax || "-"}万円`);
  lines.push(`企業規模: ${pr.companySize || "-"}`);
  lines.push(`企業選びの軸: ${pr.axis || "-"}`);
  lines.push("");

  lines.push("■ 経歴");
  if (data.history.length === 0) {
    lines.push("（未登録）");
  } else {
    [...data.history]
      .sort((a, b) => (b.start || "").localeCompare(a.start || ""))
      .forEach((h) => {
        lines.push(`・[${h.type === "edu" ? "学歴" : "職歴"}] ${h.title} ${h.detail ? "(" + h.detail + ")" : ""} ${formatMonth(h.start)}〜${formatMonth(h.end)}`);
        if (h.note) lines.push(`  ${h.note}`);
      });
  }
  lines.push("");

  lines.push("■ スキル・資格・語学");
  lines.push(`スキル: ${data.skills.skills.join("、") || "-"}`);
  lines.push(`資格: ${data.skills.certifications.join("、") || "-"}`);
  lines.push(`語学: ${data.skills.languages.join("、") || "-"}`);
  lines.push("");

  lines.push("■ 自己PR等");
  lines.push(`強み: ${sp.strengths || "-"}`);
  lines.push(`弱み: ${sp.weaknesses || "-"}`);
  lines.push(`ガクチカ: ${sp.gakuchika || "-"}`);
  lines.push(`志望動機: ${sp.motivation || "-"}`);
  lines.push(`自己PR文: ${sp.selfpr || "-"}`);
  lines.push("");

  lines.push("■ 応募企業");
  if (data.companies.length === 0) {
    lines.push("（未登録）");
  } else {
    data.companies.forEach((c) => {
      lines.push(`・${c.name}（${c.industry || "-"}）- ${c.status}${c.nextDate ? " / 次の予定: " + c.nextDate : ""}`);
    });
  }

  return lines.join("\n");
}

document.getElementById("generate-summary").addEventListener("click", () => {
  summaryOutput.value = buildSummary();
});

document.getElementById("copy-summary").addEventListener("click", async () => {
  if (!summaryOutput.value) {
    summaryOutput.value = buildSummary();
  }
  try {
    await navigator.clipboard.writeText(summaryOutput.value);
    showSavedIndicator("summary");
  } catch {
    summaryOutput.select();
  }
});

// ---------- 初期描画 ----------
loadProfileForm();
loadPreferencesForm();
loadSelfprForm();
renderHistory();
renderTags("skills");
renderTags("certifications");
renderTags("languages");
renderCompanies();
