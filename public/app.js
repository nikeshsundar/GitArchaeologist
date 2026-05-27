const form = document.querySelector("#query-form");
const statusEl = document.querySelector("#status");
const demoButton = document.querySelector("#load-demo");

const fields = {
  repo: document.querySelector("#repo-url"),
  symbol: document.querySelector("#symbol"),
  question: document.querySelector("#question"),
  summary: document.querySelector("#summary"),
  riskLevel: document.querySelector("#risk-level"),
  riskScore: document.querySelector("#risk-score"),
  created: document.querySelector("#created"),
  timeline: document.querySelector("#timeline"),
  contributors: document.querySelector("#contributors"),
  discussions: document.querySelector("#discussions"),
  riskReasons: document.querySelector("#risk-reasons"),
  map: document.querySelector("#map"),
  matches: document.querySelector("#matches"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(message, tone = "neutral") {
  statusEl.textContent = message;
  statusEl.dataset.tone = tone;
}

function renderCreated(created, selectedFile) {
  if (!created) {
    fields.created.className = "created empty";
    fields.created.textContent = "No creation commit found in available history.";
    return;
  }
  fields.created.className = "created";
  fields.created.innerHTML = `
    <strong>Created ${escapeHtml(created.date)} by ${escapeHtml(created.author)}</strong>
    ${escapeHtml(created.subject)}
    <div class="meta">${escapeHtml(created.short)}${selectedFile ? ` · ${escapeHtml(selectedFile)}` : ""}</div>
  `;
}

function renderTimeline(events) {
  if (!events?.length) {
    fields.timeline.innerHTML = "";
    return;
  }
  fields.timeline.innerHTML = events
    .map(
      (event) => `
        <div class="event">
          <strong>${escapeHtml(event.date)}</strong>
          <div>${escapeHtml(event.event)}</div>
          <div class="meta">${escapeHtml(event.author)} · ${escapeHtml(event.commit)}</div>
        </div>
      `,
    )
    .join("");
}

function renderContributors(contributors) {
  if (!contributors?.length) {
    fields.contributors.className = "contributors empty";
    fields.contributors.textContent = "No contributors loaded.";
    return;
  }
  fields.contributors.className = "contributors";
  fields.contributors.innerHTML = contributors
    .map(
      (person) => `
        <div class="bar-row">
          <strong>${escapeHtml(person.name)}</strong>
          <div class="bar"><span style="width:${Number(person.share) || 0}%"></span></div>
          <span>${Number(person.share) || 0}%</span>
        </div>
      `,
    )
    .join("");
}

function renderDiscussions(discussions) {
  if (!discussions?.length) {
    fields.discussions.className = "discussion-list empty";
    fields.discussions.textContent = "No issue or PR references found in commit messages.";
    return;
  }
  fields.discussions.className = "discussion-list";
  fields.discussions.innerHTML = discussions
    .map(
      (item) => `
        <div class="discussion">
          <strong>${escapeHtml(item.id)} · ${escapeHtml(item.source)}</strong>
          <div>${escapeHtml(item.evidence)}</div>
          <div class="meta">Seen near commit ${escapeHtml(item.commit)}</div>
        </div>
      `,
    )
    .join("");
}

function renderRisk(risk) {
  fields.riskLevel.textContent = `${risk?.level ?? "Risk"} risk`;
  fields.riskScore.textContent = risk?.score ?? "--";
  const reasons = risk?.reasons ?? [];
  fields.riskReasons.className = reasons.length ? "risk-list" : "risk-list empty";
  fields.riskReasons.innerHTML = reasons.length
    ? reasons.map((reason) => `<div>${escapeHtml(reason)}</div>`).join("")
    : "Risk signals will appear here.";
}

function renderMap(map) {
  if (!map?.groups?.length) {
    fields.map.innerHTML = `<div class="node root">${escapeHtml(map?.root ?? "Repository")}</div>`;
    return;
  }
  const groups = map.groups
    .map(
      (group) => `
        <div class="node">
          <strong>${escapeHtml(group.name)}</strong>
          <ul>${group.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </div>
      `,
    )
    .join("");
  fields.map.innerHTML = `<div class="node root">${escapeHtml(map.root)}</div>${groups}`;
}

function renderMatches(matches) {
  if (!matches?.length) {
    fields.matches.className = "matches empty";
    fields.matches.textContent = "No source matches found for that symbol.";
    return;
  }
  fields.matches.className = "matches";
  fields.matches.innerHTML = matches
    .map(
      (match) => `
        <div class="match">
          <strong>${escapeHtml(match.path)}:${escapeHtml(match.line)}</strong>
          <div class="meta">${escapeHtml(match.text)}</div>
        </div>
      `,
    )
    .join("");
}

function render(payload) {
  fields.summary.textContent = payload.summary;
  renderCreated(payload.history?.created, payload.selectedFile);
  renderTimeline(payload.history?.evolution);
  renderContributors(payload.contributors);
  renderDiscussions(payload.discussions);
  renderRisk(payload.risk);
  renderMap(payload.knowledgeMap);
  renderMatches(payload.matches);
}

async function analyze(payload) {
  setStatus("Cloning and reading Git history. Large repositories can take a minute...");
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || data.error || "Analysis failed.");
  }
  render(data);
  setStatus(`Analyzed ${data.selectedFile || data.repo}.`, "success");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    repoUrl: fields.repo.value.trim(),
    symbol: fields.symbol.value.trim(),
    question: fields.question.value.trim(),
  };
  try {
    await analyze(payload);
  } catch (error) {
    setStatus(error.message, "error");
  }
});

demoButton.addEventListener("click", async () => {
  setStatus("Loading the sample archaeology report...");
  const response = await fetch("/api/demo");
  const data = await response.json();
  fields.repo.value = data.repo;
  fields.symbol.value = data.symbol;
  fields.question.value = data.question;
  render(data);
  setStatus("Demo loaded. Replace it with a public GitHub repository when ready.", "success");
});
