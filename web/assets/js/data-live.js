/* Calibra data bridge.
   The server injects `window.CALIBRA_BOOTSTRAP` synchronously in <head>
   (same data the JSON API serves), so the first paint has real values.
   After that this file refreshes /api/fixtures on a timer sized to the
   live-feed cache, and keeps the chrome (source badge, live chip, round
   label, freshness note) honest. If the backend is unreachable the page
   says so instead of falling back to invented data. */
(function () {
  "use strict";

  const C = window.CALIBRA;
  if (!C) return;

  const dayFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "short",
    day: "numeric",
    month: "short"
  });
  const shortFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    day: "numeric",
    month: "short"
  });
  const stampFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  function when(value) {
    if (!value) return "not yet";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "not yet" : stampFmt.format(date);
  }

  function merge(payload) {
    if (!payload || !Array.isArray(payload.fixtures)) return false;

    C.fixtures = payload.fixtures;
    if (Array.isArray(payload.standings)) C.standings = payload.standings;
    if (payload.teamForm) {
      Object.keys(payload.teamForm).forEach((slug) => {
        if (C.teams[slug]) C.teams[slug].form = payload.teamForm[slug];
      });
    }
    if (payload.meta) {
      C.meta = payload.meta;
      if (payload.meta.resultsThroughMw != null) C.league.currentMatchweek = payload.meta.resultsThroughMw;
      if (payload.meta.nextMw != null) C.league.nextMatchweek = payload.meta.nextMw;
    }
    if (payload.metrics) C.metrics = Object.assign({}, C.metrics || {}, payload.metrics);
    if (payload.performance) C.performance = Object.assign({}, C.performance || {}, payload.performance);
    if (payload.models) {
      (C.models || []).forEach((model) => {
        const live = payload.models[model.id];
        if (!live) return;
        model.rps = live.rps;
        model.logLoss = live.logLoss;
        model.accuracy = live.accuracy == null ? null : live.accuracy * 100;
        if (model.id === "blend") model.calibration = C.metrics ? C.metrics.calibration : null;
        else if (model.id === "market") model.calibration = C.metrics ? C.metrics.marketCalibration : null;
        else model.calibration = null;
      });
    }
    C._ready = true;
    return true;
  }

  function roundLabel() {
    const next = C.meta && C.meta.nextMw != null ? C.meta.nextMw : C.league.nextMatchweek;
    const upcoming = (C.fixtures || []).filter((fixture) => fixture.mw === next && fixture.day);
    if (!upcoming.length) return next ? `MW ${next}` : "Schedule";
    const days = upcoming.map((fixture) => fixture.day).sort();
    const first = shortFmt.format(new Date(`${days[0]}T12:00:00Z`));
    const last = shortFmt.format(new Date(`${days[days.length - 1]}T12:00:00Z`));
    return `MW ${next} · ${first === last ? first : `${first}–${last}`}`;
  }

  function updateChrome() {
    const meta = C.meta || {};
    const badge = document.getElementById("data-source-badge");
    if (badge) {
      badge.textContent = "Live pipeline data";
      badge.classList.add("is-live");
      const liveLabel = meta.live && meta.live.state === "ok" ? "API-Football live feed" : "live feed unavailable";
      badge.title = `Results: football-data.co.uk (updated ${when(meta.resultsUpdatedAt)}). Forecast export: ${when(meta.predictionsUpdatedAt)}. ${liveLabel}.`;
    }

    const live = (C.fixtures || []).filter((fixture) => fixture.status === "live");
    document.querySelectorAll(".nav-chip").forEach((chip) => {
      const dot = chip.querySelector(".live-dot");
      if (live.length) {
        const minute = live[0].minute ? `${live[0].minute}'` : "live";
        chip.lastChild && chip.lastChild.nodeType === 3
          ? (chip.lastChild.textContent = `${live.length} live · ${minute}`)
          : (chip.textContent = `${live.length} live · ${minute}`);
        if (dot) dot.style.display = "";
      } else {
        chip.textContent = "No live matches";
        if (dot) dot.style.display = "none";
      }
    });

    document.querySelectorAll(".topbar-round").forEach((node) => {
      node.textContent = roundLabel();
    });

    const heroRound = document.getElementById("hero-round-number");
    if (heroRound) heroRound.textContent = String(C.league.nextMatchweek || C.league.currentMatchweek || "—");

    const metrics = C.metrics || {};
    const stats = {
      rps: metrics.rps == null ? "—" : metrics.rps.toFixed(3),
      "market-rps": metrics.marketRps == null ? "—" : metrics.marketRps.toFixed(3),
      logloss: metrics.logLoss == null ? "—" : metrics.logLoss.toFixed(3),
      accuracy: metrics.accuracy == null ? "—" : `${metrics.accuracy.toFixed(1)}%`,
      "market-accuracy": metrics.marketAccuracy == null ? "—" : `${metrics.marketAccuracy.toFixed(1)}%`,
      calibration: metrics.calibration == null ? "—" : `${metrics.calibration.toFixed(1)}%`,
      matches: metrics.matches == null ? "—" : Number(metrics.matches).toLocaleString("en-GB"),
      seasons: metrics.seasons == null ? "—" : String(metrics.seasons)
    };
    document.querySelectorAll("[data-stat]").forEach((node) => {
      const value = stats[node.dataset.stat];
      if (value != null) node.textContent = value;
    });

    const note = document.getElementById("data-note");
    if (note) {
      const warnings = (meta.warnings || []).slice();
      if (meta.live && meta.live.state === "error") {
        warnings.unshift(`Live feed unavailable${meta.live.message ? ` (${meta.live.message})` : ""} — scores may lag.`);
      }
      if (warnings.length) {
        note.textContent = warnings.join(" · ");
        note.hidden = false;
      } else {
        note.hidden = true;
      }
    }
  }

  function dataUnavailable() {
    C._ready = false;
    const note = document.getElementById("data-note");
    if (note) {
      note.textContent =
        "The data service is unreachable, so this page has no verified numbers to show. Start the local server (node server/index.mjs) or check the deployment.";
      note.hidden = false;
    }
    const badge = document.getElementById("data-source-badge");
    if (badge) {
      badge.textContent = "Data unavailable";
      badge.classList.remove("is-live");
    }
  }

  let failures = 0;

  /* Keeping the last payload is right; pretending it is current is not. After
     two failures the chrome says so and shows when the numbers were produced. */
  function markStale() {
    const badge = document.getElementById("data-source-badge");
    if (badge) {
      badge.textContent = "Data unavailable";
      badge.classList.remove("is-live");
      badge.title = "The data service is unreachable; these numbers are from the last successful update.";
    }
    const note = document.getElementById("data-note");
    if (note) {
      const stamp = C.meta && C.meta.generatedAt ? when(C.meta.generatedAt) : "the last update";
      note.textContent = `Can't reach the data service — showing ${stamp}. Retrying automatically.`;
      note.hidden = false;
    }
  }

  async function refresh() {
    try {
      const response = await fetch("/api/fixtures", { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      failures = 0;
      if (merge(payload)) {
        updateChrome();
        if (typeof C._liveReRender === "function") C._liveReRender();
      }
    } catch (error) {
      failures += 1;
      console.warn("[calibra] live refresh failed:", error.message);
      if (failures >= 2) markStale();
    }
  }

  function schedule() {
    const live = (C.fixtures || []).some((fixture) => fixture.status === "live");
    window.setTimeout(async () => {
      await refresh();
      schedule();
    }, live ? 60000 : 180000);
  }

  if (merge(window.CALIBRA_BOOTSTRAP)) {
    updateChrome();
  } else {
    dataUnavailable();
  }

  window.CALIBRA_REFRESH = refresh;
  schedule();
})();
