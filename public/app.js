const form = document.querySelector("#query-form");
const statusEl = document.querySelector("#status");
const demoButton = document.querySelector("#load-demo");
const tabButtons = Array.from(document.querySelectorAll(".tab"));
const tabViews = Array.from(document.querySelectorAll(".tab-view"));

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

  onboardingTopic: document.querySelector("#onboarding-topic"),
  onboardingRun: document.querySelector("#run-onboarding"),
  onboardingFiles: document.querySelector("#onboarding-files"),
  onboardingPeople: document.querySelector("#onboarding-people"),
  onboardingDecisions: document.querySelector("#onboarding-decisions"),
  onboardingEvidence: document.querySelector("#onboarding-evidence"),

  healthSummary: document.querySelector("#health-summary"),
  healthScore: document.querySelector("#health-score"),
  healthHotspots: document.querySelector("#health-hotspots"),
  healthBus: document.querySelector("#health-bus"),
  healthAbandoned: document.querySelector("#health-abandoned"),

  snapshotRef: document.querySelector("#snapshot-ref"),
  snapshotRun: document.querySelector("#run-snapshot"),
  snapshotDirs: document.querySelector("#snapshot-dirs"),
  snapshotFiles: document.querySelector("#snapshot-files"),

  storyStart: document.querySelector("#story-start"),
  storyPeople: document.querySelector("#story-people"),
  storyYears: document.querySelector("#story-years"),
  storyRewrites: document.querySelector("#story-rewrites"),

  graphNodes: document.querySelector("#graph-nodes"),
  graphEdges: document.querySelector("#graph-edges"),

  externalType: document.querySelector("#external-type"),
  externalTitle: document.querySelector("#external-title"),
  externalText: document.querySelector("#external-text"),
  externalAdd: document.querySelector("#add-external"),
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
    <div class="meta">${escapeHtml(created.short)}${selectedFile ? ` - ${escapeHtml(selectedFile)}` : ""}</div>
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
          <div class="meta">${escapeHtml(event.author)} - ${escapeHtml(event.commit)}</div>
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
          <strong>${escapeHtml(item.id)} - ${escapeHtml(item.source)}</strong>
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

function setActiveTab(name) {
  tabButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.tab === name));
  tabViews.forEach((view) => view.classList.toggle("is-active", view.dataset.view === name));
}

function requireRepoUrl() {
  const repoUrl = fields.repo.value.trim();
  if (!repoUrl) throw new Error("Paste a GitHub repository URL first.");
  return repoUrl;
}

function toList(container, items, formatter) {
  if (!items?.length) {
    container.className = "list empty";
    container.textContent = "Nothing to show yet.";
    return;
  }
  container.className = "list";
  container.innerHTML = items.map((item) => `<div class="list-item">${formatter(item)}</div>`).join("");
}

function renderCreatedGeneric(container, created) {
  if (!created) {
    container.className = "created empty";
    container.textContent = "No data loaded.";
    return;
  }
  container.className = "created";
  container.innerHTML = `<strong>${escapeHtml(created.date)} - ${escapeHtml(created.author)}</strong>${escapeHtml(created.subject)}<div class="meta">${escapeHtml(created.short || "")}</div>`;
}

async function apiGet(path) {
  const response = await fetch(path);
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || data.error || "Request failed.");
  return data;
}

async function apiPost(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || data.error || "Request failed.");
  return data;
}

async function analyze(payload) {
  setStatus("Cloning and reading Git history. Large repositories can take a minute...");
  const data = await apiPost("/api/analyze", payload);
  render(data);
  setStatus(`Analyzed ${data.selectedFile || data.repo}.`, "success");

  try {
    const repoUrl = payload.repoUrl;
    const healthData = await apiGet(`/api/repo/health?repoUrl=${encodeURIComponent(repoUrl)}`);
    renderHealth(healthData);
    const storyData = await apiGet(`/api/repo/story?repoUrl=${encodeURIComponent(repoUrl)}`);
    renderStory(storyData);
    const graphData = await apiGet(`/api/repo/graph?repoUrl=${encodeURIComponent(repoUrl)}&symbol=${encodeURIComponent(payload.symbol || "")}`);
    renderGraph(graphData);
  } catch {
    // Optional: repo-level endpoints might be blocked by network policy.
  }
}

function renderOnboarding(data) {
  toList(fields.onboardingFiles, data.importantFiles || [], (path) => `<strong>${escapeHtml(path)}</strong>`);

  if (!data.keyContributors?.length) {
    fields.onboardingPeople.className = "contributors empty";
    fields.onboardingPeople.textContent = "No onboarding report yet.";
  } else {
    fields.onboardingPeople.className = "contributors";
    fields.onboardingPeople.innerHTML = data.keyContributors
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

  if (data.recentDecisions?.length) {
    fields.onboardingDecisions.className = "timeline";
    fields.onboardingDecisions.innerHTML = data.recentDecisions
      .map((c) => `<div class="event"><strong>${escapeHtml(c.date)}</strong><div>${escapeHtml(c.subject)}</div><div class="meta">${escapeHtml(c.author)} - ${escapeHtml(c.short)}</div></div>`)
      .join("");
  } else {
    fields.onboardingDecisions.className = "timeline empty";
    fields.onboardingDecisions.textContent = "No onboarding report yet.";
  }

  if (data.evidence?.length) {
    fields.onboardingEvidence.className = "matches";
    fields.onboardingEvidence.innerHTML = data.evidence
      .map((match) => `<div class="match"><strong>${escapeHtml(match.path)}:${escapeHtml(match.line)}</strong><div class="meta">${escapeHtml(match.text)}</div></div>`)
      .join("");
  } else {
    fields.onboardingEvidence.className = "matches empty";
    fields.onboardingEvidence.textContent = "No onboarding report yet.";
  }
}

function renderHealth(data) {
  fields.healthScore.textContent = data.score ?? "--";
  fields.healthSummary.textContent = `Commits: ${data.activity?.commits6m ?? 0} (6m), ${data.activity?.commits12m ?? 0} (12m).`;
  toList(fields.healthHotspots, data.highRiskFiles || [], (item) => `<strong>${escapeHtml(item.path)}</strong><div class="meta">${escapeHtml(item.commits6m)} commits in 6 months</div>`);

  const bus = data.knowledgeConcentration || {};
  fields.healthBus.className = "risk-list";
  fields.healthBus.innerHTML = [
    `<div>Top author share (6m): ${escapeHtml(bus.topAuthorShare6m ?? 0)}%</div>`,
    `<div>Bus factor (to reach 50%): ${escapeHtml(bus.busFactor ?? 0)}</div>`,
  ].join("");

  toList(fields.healthAbandoned, data.abandonedModules || [], (item) => `<strong>${escapeHtml(item.module)}</strong><div class="meta">${escapeHtml(item.files)} files</div>`);
}

function renderSnapshot(data) {
  toList(fields.snapshotDirs, data.topDirs || [], (d) => `<strong>${escapeHtml(d.path)}</strong><div class="meta">${escapeHtml(d.files)} files</div>`);
  toList(fields.snapshotFiles, data.sampleFiles || [], (f) => `<strong>${escapeHtml(f)}</strong>`);
}

function renderStory(data) {
  renderCreatedGeneric(fields.storyStart, data.started);
  toList(fields.storyPeople, data.topContributors || [], (p) => `<strong>${escapeHtml(p.name)}</strong><div class="meta">${escapeHtml(p.commits)} commits</div>`);
  toList(fields.storyYears, data.commitsByYear || [], (y) => `<strong>${escapeHtml(y.year)}</strong><div class="meta">${escapeHtml(y.commits)} commits</div>`);
  if (data.biggestRewrites?.length) {
    fields.storyRewrites.className = "timeline";
    fields.storyRewrites.innerHTML = data.biggestRewrites
      .map((r) => `<div class="event"><strong>${escapeHtml(r.date)}</strong><div>${escapeHtml(r.subject)}</div><div class="meta">${escapeHtml(r.author)} - ${escapeHtml(r.short)} - ${escapeHtml(r.magnitude)} lines</div></div>`)
      .join("");
  } else {
    fields.storyRewrites.className = "timeline empty";
    fields.storyRewrites.textContent = "No story loaded.";
  }
}

function renderGraph(data) {
  toList(fields.graphNodes, data.nodes || [], (n) => `<strong>${escapeHtml(n.type)}</strong><div class="meta">${escapeHtml(n.label)} (${escapeHtml(n.id)})</div>`);
  toList(fields.graphEdges, data.edges || [], (e) => `<strong>${escapeHtml(e.type)}</strong><div class="meta">${escapeHtml(e.from)} -> ${escapeHtml(e.to)}</div>`);
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

tabButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveTab(button.dataset.tab));
});

fields.onboardingRun?.addEventListener("click", async () => {
  try {
    const repoUrl = requireRepoUrl();
    const topic = fields.onboardingTopic.value.trim() || "authentication";
    setStatus("Generating onboarding report...");
    const data = await apiPost("/api/repo/onboarding", { repoUrl, topic });
    renderOnboarding(data);
    setStatus("Onboarding report ready.", "success");
    setActiveTab("onboarding");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

fields.snapshotRun?.addEventListener("click", async () => {
  try {
    const repoUrl = requireRepoUrl();
    const ref = fields.snapshotRef.value.trim() || "HEAD";
    setStatus("Building repository snapshot...");
    const data = await apiGet(`/api/repo/snapshot?repoUrl=${encodeURIComponent(repoUrl)}&ref=${encodeURIComponent(ref)}`);
    renderSnapshot(data);
    setStatus("Snapshot ready.", "success");
    setActiveTab("time");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

fields.externalAdd?.addEventListener("click", async () => {
  try {
    const repoUrl = requireRepoUrl();
    const item = {
      type: fields.externalType.value.trim() || "note",
      title: fields.externalTitle.value.trim() || "External context",
      text: fields.externalText.value.trim(),
    };
    if (!item.text) throw new Error("Paste some context text to attach.");
    setStatus("Attaching external context...");
    await apiPost("/api/repo/external", { repoUrl, item });
    const graphData = await apiGet(`/api/repo/graph?repoUrl=${encodeURIComponent(repoUrl)}&symbol=${encodeURIComponent(fields.symbol.value.trim() || "")}`);
    renderGraph(graphData);
    setStatus("Context attached and graph updated.", "success");
    setActiveTab("graph");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

setActiveTab("analyze");
