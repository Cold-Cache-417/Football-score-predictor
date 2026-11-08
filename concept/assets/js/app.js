/* Calibra concept — local UI only. No network, no project imports. */
(function () {
  "use strict";

  const C = window.CALIBRA;
  if (!C) return;

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.prototype.slice.call((root || document).querySelectorAll(selector));
  const esc = (value) =>
    String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  const pct = (value, digits) => `${(value * 100).toFixed(digits == null ? 0 : digits)}%`;
  const number = (value, digits) => Number(value).toFixed(digits == null ? 2 : digits);
  const maxOutcome = (fixture) => Math.max(fixture.p.h, fixture.p.d, fixture.p.a);
  const byDate = (a, b) => new Date(a.date) - new Date(b.date);
  const arrowIcon =
    '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function setHTML(id, value) {
    const node = document.getElementById(id);
    if (node) node.innerHTML = value;
  }

  function formChips(form) {
    const letters = form.split("");
    return (
      '<span class="form" aria-label="Last six: ' +
      letters.join(", ") +
      '">' +
      letters.map((letter) => `<span class="${letter.toLowerCase()}">${letter}</span>`).join("") +
      "</span>"
    );
  }

  function linePath(points) {
    if (!points.length) return "";
    if (points.length === 1) return `M${points[0].x} ${points[0].y}`;
    return points.slice(1).reduce((path, point, index) => {
      const previous = points[index];
      const midX = (previous.x + point.x) / 2;
      return `${path} C${midX.toFixed(2)} ${previous.y.toFixed(2)}, ${midX.toFixed(2)} ${point.y.toFixed(2)}, ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    }, `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`);
  }

  function lineChart(options) {
    const width = options.width || 760;
    const height = options.height || 320;
    const margin = options.margin || { top: 24, right: 20, bottom: 42, left: 56 };
    const labels = options.labels;
    const series = options.series;
    const formatY = options.formatY || ((value) => value.toFixed(3));
    const all = series.reduce((values, item) => values.concat(item.values), []);
    const rawMin = Math.min.apply(null, all);
    const rawMax = Math.max.apply(null, all);
    const span = rawMax - rawMin || 1;
    const min = options.min != null ? options.min : rawMin - span * 0.18;
    const max = options.max != null ? options.max : rawMax + span * 0.18;
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const x = (index) => margin.left + (labels.length === 1 ? plotW / 2 : (index / (labels.length - 1)) * plotW);
    const y = (value) => margin.top + (1 - (value - min) / (max - min)) * plotH;
    const gridCount = options.gridCount || 4;

    let svg = `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">`;
    for (let index = 0; index <= gridCount; index += 1) {
      const value = min + ((max - min) * index) / gridCount;
      const yPos = y(value);
      svg += `<line class="chart-grid" x1="${margin.left}" x2="${width - margin.right}" y1="${yPos.toFixed(2)}" y2="${yPos.toFixed(2)}"></line>`;
      svg += `<text class="chart-axis" x="${margin.left - 10}" y="${(yPos + 3).toFixed(2)}" text-anchor="end">${formatY(value)}</text>`;
    }
    labels.forEach((label, index) => {
      const xPos = x(index);
      svg += `<text class="chart-axis" x="${xPos.toFixed(2)}" y="${height - 14}" text-anchor="middle">${esc(label)}</text>`;
    });

    series.forEach((item, seriesIndex) => {
      const points = item.values.map((value, index) => ({ x: x(index), y: y(value), value, label: labels[index] }));
      const path = linePath(points);
      if (options.area && seriesIndex === 0) {
        svg += `<path class="chart-area" fill="${item.color}" d="${path} L${points[points.length - 1].x.toFixed(2)} ${margin.top + plotH} L${points[0].x.toFixed(2)} ${margin.top + plotH} Z"></path>`;
      }
      svg += `<path class="chart-line" stroke="${item.color}" d="${path}"></path>`;
      points.forEach((point) => {
        svg += `<circle class="chart-point" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="3.4" fill="${item.color}"><title>${esc(item.label)} · ${esc(point.label)} · ${formatY(point.value)}</title></circle>`;
      });
      if (options.annotateLast) {
        const last = points[points.length - 1];
        svg += `<text class="chart-annotation" x="${(last.x - 6).toFixed(2)}" y="${(last.y - 12).toFixed(2)}" text-anchor="end">${formatY(last.value)}</text>`;
      }
    });
    svg += "</svg>";
    return svg;
  }

  function observeWidth(node, callback) {
    if (!node || typeof ResizeObserver !== "function") return;
    let last = Math.round(node.clientWidth);
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const width = Math.round(node.clientWidth);
        if (Math.abs(width - last) < 16) return;
        last = width;
        callback();
      });
    });
    observer.observe(node);
  }

  function initNavigation() {
    const page = document.body.dataset.page;
    $$("[data-nav]").forEach((link) => {
      if (link.dataset.nav === page) link.setAttribute("aria-current", "page");
    });

    const nav = $(".nav");
    if (nav) {
      const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 12);
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }

    const year = $("[data-year]");
    if (year) year.textContent = new Date().getFullYear();
  }

  function initHeroField() {
    const field = $(".hero-field");
    if (!field) return;
    for (let index = 0; index < 81; index += 1) {
      const wave = Math.sin(index * 0.82) * 0.5 + 0.5;
      const node = document.createElement("span");
      node.style.setProperty("--s", `${2 + Math.round(wave * 4)}px`);
      node.style.setProperty("--o", (0.14 + wave * 0.46).toFixed(2));
      field.appendChild(node);
    }
  }

  function initHome() {
    const chart = document.getElementById("home-spark");
    if (!chart) return;

    function paint() {
      const width = Math.max(300, Math.round(chart.clientWidth || 560));
      const compact = width < 480;
      chart.innerHTML = lineChart({
        width,
        height: compact ? 196 : 232,
        margin: compact ? { top: 16, right: 10, bottom: 30, left: 42 } : { top: 18, right: 10, bottom: 30, left: 46 },
        labels: C.performance.seasons,
        series: [
          { label: "Calibra blend", values: C.performance.rps.blend, color: "var(--brand)" },
          { label: "Closing market", values: C.performance.rps.market, color: "var(--saffron)" }
        ],
        formatY: (value) => value.toFixed(3),
        area: true
      });
    }

    paint();
    observeWidth(chart, paint);
  }

  function fixtureRow(fixture) {
    const home = C.teams[fixture.home];
    const away = C.teams[fixture.away];
    const result = fixture.status === "result";
    const pick = C.favourite(fixture);
    const homeWidth = (fixture.p.h * 100).toFixed(2);
    const drawWidth = (fixture.p.d * 100).toFixed(2);
    const awayWidth = (fixture.p.a * 100).toFixed(2);
    const pickLabel = result
      ? fixture.score[0] > fixture.score[1]
        ? "Home win"
        : fixture.score[0] === fixture.score[1]
          ? "Draw"
          : "Away win"
      : pick.label;
    const pickNote = result ? "Full time" : `${pct(pick.value)} ${pick.key === "D" ? "draw" : "win"}`;

    return `<a class="match-row${result ? " match-row--result" : ""}" href="match.html?id=${encodeURIComponent(fixture.id)}">
      <div class="match-date"><strong>${esc(C.dateShort(fixture.date))}</strong><span>${esc(C.kickoff(fixture.date))} · MW ${fixture.mw}</span></div>
      <div class="match-teams">
        <div class="match-team-line"><span class="code">${home.code}</span><span class="team-name">${esc(home.name)}</span>${result ? `<span class="result-score">${fixture.score[0]}</span>` : ""}</div>
        <div class="match-team-line"><span class="code">${away.code}</span><span class="team-name">${esc(away.name)}</span>${result ? `<span class="result-score">${fixture.score[1]}</span>` : ""}</div>
        <div class="match-meta">${esc(fixture.venue)}</div>
      </div>
      <div class="match-prob">
        <div class="tri" aria-hidden="true"><span class="tri-home" style="flex:0 0 ${homeWidth}%"></span><span class="tri-draw" style="flex:0 0 ${drawWidth}%"></span><span class="tri-away" style="flex:0 0 ${awayWidth}%"></span></div>
        <div class="tri-labels"><span>H ${pct(fixture.p.h)}</span><span>D ${pct(fixture.p.d)}</span><span>A ${pct(fixture.p.a)}</span></div>
      </div>
      <div class="match-pick"><strong>${esc(pickLabel)}</strong><span>${esc(pickNote)}</span></div>
      <span class="row-arrow">${arrowIcon}</span>
    </a>`;
  }

  function initFixtures() {
    const list = document.getElementById("fixture-list");
    if (!list) return;

    const search = document.getElementById("fixture-search");
    const teamFilter = document.getElementById("team-filter");
    const weekFilter = document.getElementById("mw-filter");
    const sortFilter = document.getElementById("sort-filter");
    const count = document.getElementById("fixture-count");
    const empty = document.getElementById("fixture-empty");
    const reset = document.getElementById("reset-filters");
    const resetButtons = $$("[data-reset]");
    const statusButtons = $$("[data-status]");
    const params = new URLSearchParams(window.location.search);
    const state = {
      q: params.get("q") || "",
      status: ["all", "upcoming", "result"].indexOf(params.get("status")) > -1 ? params.get("status") : "all",
      team: params.get("team") || "all",
      mw: params.get("mw") || "all",
      sort: params.get("sort") || "date"
    };

    search.value = state.q;
    teamFilter.insertAdjacentHTML(
      "beforeend",
      Object.entries(C.teams)
        .sort((a, b) => a[1].name.localeCompare(b[1].name))
        .map(([slug, team]) => `<option value="${slug}">${esc(team.name)}</option>`)
        .join("")
    );
    weekFilter.insertAdjacentHTML(
      "beforeend",
      Array.from(new Set(C.fixtures.map((fixture) => fixture.mw)))
        .sort((a, b) => a - b)
        .map((week) => `<option value="${week}">Matchweek ${week}</option>`)
        .join("")
    );
    teamFilter.value = state.team;
    weekFilter.value = state.mw;
    sortFilter.value = state.sort;

    if (teamFilter.value !== state.team) state.team = "all";
    if (weekFilter.value !== state.mw) state.mw = "all";
    if (!["date", "mw", "home", "away", "close"].includes(state.sort)) state.sort = "date";

    function syncURL() {
      const next = new URLSearchParams();
      if (state.q) next.set("q", state.q);
      if (state.status !== "all") next.set("status", state.status);
      if (state.team !== "all") next.set("team", state.team);
      if (state.mw !== "all") next.set("mw", state.mw);
      if (state.sort !== "date") next.set("sort", state.sort);
      const query = next.toString();
      try {
        window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
      } catch (error) {
        /* file:// previews can refuse history updates; filters still work. */
      }
    }

    function matchesSearch(fixture) {
      const home = C.teams[fixture.home];
      const away = C.teams[fixture.away];
      const haystack = [
        home.name,
        away.name,
        home.code,
        away.code,
        home.city,
        away.city,
        fixture.venue,
        `matchweek ${fixture.mw}`,
        C.dateShort(fixture.date),
        C.dateLong(fixture.date),
        fixture.status
      ]
        .join(" ")
        .toLowerCase();
      return haystack.indexOf(state.q.trim().toLowerCase()) > -1;
    }

    function sortRows(a, b) {
      switch (state.sort) {
        case "mw":
          return a.mw - b.mw || byDate(a, b);
        case "home":
          return C.teams[a.home].name.localeCompare(C.teams[b.home].name) || byDate(a, b);
        case "away":
          return C.teams[a.away].name.localeCompare(C.teams[b.away].name) || byDate(a, b);
        case "close":
          return maxOutcome(a) - maxOutcome(b) || byDate(a, b);
        default:
          return byDate(a, b);
      }
    }

    function render() {
      const rows = C.fixtures
        .filter((fixture) => {
          if (state.status !== "all" && fixture.status !== state.status) return false;
          if (state.team !== "all" && fixture.home !== state.team && fixture.away !== state.team) return false;
          if (state.mw !== "all" && String(fixture.mw) !== state.mw) return false;
          return matchesSearch(fixture);
        })
        .sort(sortRows);

      list.innerHTML = rows.map(fixtureRow).join("");
      list.hidden = rows.length === 0;
      empty.hidden = rows.length !== 0;
      count.innerHTML = `<strong>${rows.length}</strong> of ${C.fixtures.length} fixtures`;
      statusButtons.forEach((button) => {
        const active = button.dataset.status === state.status;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
      const filtered = state.q || state.status !== "all" || state.team !== "all" || state.mw !== "all" || state.sort !== "date";
      reset.hidden = !filtered;
      syncURL();
    }

    search.addEventListener("input", () => {
      state.q = search.value;
      render();
    });
    search.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        search.value = "";
        state.q = "";
        render();
      }
    });
    statusButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.status = button.dataset.status;
        render();
      });
    });
    teamFilter.addEventListener("change", () => {
      state.team = teamFilter.value;
      render();
    });
    weekFilter.addEventListener("change", () => {
      state.mw = weekFilter.value;
      render();
    });
    sortFilter.addEventListener("change", () => {
      state.sort = sortFilter.value;
      render();
    });
    function resetFilters() {
      state.q = "";
      state.status = "all";
      state.team = "all";
      state.mw = "all";
      state.sort = "date";
      search.value = "";
      teamFilter.value = "all";
      weekFilter.value = "all";
      sortFilter.value = "date";
      render();
      search.focus();
    }
    resetButtons.forEach((button) => button.addEventListener("click", resetFilters));
    document.addEventListener("keydown", (event) => {
      const tag = event.target.tagName;
      if (event.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT" && !event.target.isContentEditable) {
        event.preventDefault();
        search.focus();
      }
    });

    render();
  }

  function renderScoreGrid(fixture) {
    const grid = document.getElementById("score-grid");
    if (!grid) return;
    const home = C.teams[fixture.home];
    const away = C.teams[fixture.away];
    let maximum = 0;
    fixture.grid.forEach((row) => row.forEach((probability) => { maximum = Math.max(maximum, probability); }));
    const topKeys = new Set(fixture.top.map((score) => `${score.home}-${score.away}`));
    const best = fixture.top[0];
    const cells = ['<span class="axis axis--corner" aria-hidden="true"></span>'];

    for (let goals = 0; goals <= 6; goals += 1) {
      cells.push(`<span class="axis axis--title" aria-hidden="true">${goals}</span>`);
    }
    for (let awayGoals = 0; awayGoals <= 6; awayGoals += 1) {
      cells.push(`<span class="axis" aria-hidden="true">${awayGoals}</span>`);
      for (let homeGoals = 0; homeGoals <= 6; homeGoals += 1) {
        const probability = fixture.grid[awayGoals][homeGoals];
        const ratio = Math.sqrt(probability / maximum);
        const size = (4 + ratio * 20).toFixed(1);
        const opacity = (0.28 + ratio * 0.72).toFixed(2);
        const top = topKeys.has(`${homeGoals}-${awayGoals}`);
        const defaultTab = homeGoals === best.home && awayGoals === best.away;
        cells.push(`<button type="button" class="cell${top ? " is-top" : ""}" data-home="${homeGoals}" data-away="${awayGoals}" data-p="${probability}" tabindex="${defaultTab ? "0" : "-1"}" aria-label="${esc(home.name)} ${homeGoals}–${awayGoals} ${esc(away.name)}, ${pct(probability, 1)}"><span class="dot" style="--s:${size}px;--o:${opacity};--i:${homeGoals + awayGoals * 7}" aria-hidden="true"></span></button>`);
      }
    }
    grid.innerHTML = cells.join("");

    function showCell(cell, label) {
      const homeGoals = Number(cell.dataset.home);
      const awayGoals = Number(cell.dataset.away);
      const probability = Number(cell.dataset.p);
      setText("readout-score", `${homeGoals}–${awayGoals}`);
      setText("readout-pct", pct(probability, 1));
      setText("readout-label", label || `${home.name} ${homeGoals}–${awayGoals} ${away.name}`);
    }

    showCell(grid.querySelector(".cell[tabindex='0']"), "Most likely scoreline");

    grid.addEventListener("mouseover", (event) => {
      const cell = event.target.closest(".cell");
      if (cell) showCell(cell);
    });
    grid.addEventListener("focusin", (event) => {
      const cell = event.target.closest(".cell");
      if (!cell) return;
      $$(".cell", grid).forEach((item) => { item.tabIndex = -1; });
      cell.tabIndex = 0;
      showCell(cell);
    });
    grid.addEventListener("keydown", (event) => {
      const cell = event.target.closest(".cell");
      if (!cell) return;
      let homeGoals = Number(cell.dataset.home);
      let awayGoals = Number(cell.dataset.away);
      if (event.key === "ArrowLeft") homeGoals = Math.max(0, homeGoals - 1);
      else if (event.key === "ArrowRight") homeGoals = Math.min(6, homeGoals + 1);
      else if (event.key === "ArrowUp") awayGoals = Math.max(0, awayGoals - 1);
      else if (event.key === "ArrowDown") awayGoals = Math.min(6, awayGoals + 1);
      else return;
      event.preventDefault();
      const next = grid.querySelector(`.cell[data-home="${homeGoals}"][data-away="${awayGoals}"]`);
      if (next) next.focus();
    });
  }

  function renderTopScorelines(fixture) {
    const list = document.getElementById("score-list");
    if (!list) return;
    const home = C.teams[fixture.home];
    const top = fixture.top;
    list.innerHTML = top
      .map((score, index) => `<div class="score-item">
        <span class="rank">${String(index + 1).padStart(2, "0")}</span>
        <span class="score">${score.home}–${score.away} <small>${home.code}</small></span>
        <span class="score-bar" aria-hidden="true"><span style="width:${((score.p / top[0].p) * 100).toFixed(1)}%"></span></span>
        <span class="pct">${pct(score.p, 1)}</span>
      </div>`)
      .join("");
  }

  function goalDistribution(fixture) {
    const totals = [0, 0, 0, 0, 0, 0, 0];
    fixture.grid.forEach((row, awayGoals) => {
      row.forEach((probability, homeGoals) => {
        const total = homeGoals + awayGoals;
        totals[Math.min(total, 6)] += probability;
      });
    });
    return totals;
  }

  function renderGoalsChart(fixture) {
    const holder = document.getElementById("goals-chart");
    const readout = document.getElementById("goals-readout");
    if (!holder) return;
    const totals = goalDistribution(fixture);
    const expected = fixture.xg[0] + fixture.xg[1];
    const over = totals[3] + totals[4] + totals[5] + totals[6];
    const mode = totals.indexOf(Math.max.apply(null, totals));
    if (readout) {
      readout.innerHTML = `<div><span>Expected goals</span><strong>${expected.toFixed(2)}</strong></div>
        <div><span>Over 2.5 goals</span><strong>${pct(over, 0)}</strong></div>
        <div><span>Most likely total</span><strong>${mode === 6 ? "6+" : mode}</strong></div>
        <div><span>Home / away xG</span><strong>${fixture.xg[0].toFixed(1)} / ${fixture.xg[1].toFixed(1)}</strong></div>`;
    }

    const width = Math.max(300, Math.round(holder.clientWidth || 700));
    const height = width < 520 ? 214 : 230;
    const margin = { top: 24, right: 16, bottom: 32, left: 38 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const maximum = Math.max.apply(null, totals);
    const ceiling = Math.ceil(maximum * 10) / 10;
    const xStep = plotW / totals.length;
    const barW = Math.min(42, xStep * 0.52);
    const y = (value) => margin.top + (1 - value / ceiling) * plotH;
    let svg = `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">`;
    for (let index = 0; index <= 3; index += 1) {
      const value = (ceiling * index) / 3;
      const yPos = y(value);
      svg += `<line class="chart-grid" x1="${margin.left}" x2="${width - margin.right}" y1="${yPos.toFixed(2)}" y2="${yPos.toFixed(2)}"></line>`;
      svg += `<text class="chart-axis" x="${margin.left - 9}" y="${(yPos + 3).toFixed(2)}" text-anchor="end">${pct(value, 0)}</text>`;
    }
    totals.forEach((probability, index) => {
      const x = margin.left + index * xStep + (xStep - barW) / 2;
      const barH = Math.max(2, (probability / ceiling) * plotH);
      const yPos = margin.top + plotH - barH;
      const strongest = index === mode;
      svg += `<rect x="${x.toFixed(2)}" y="${yPos.toFixed(2)}" width="${barW.toFixed(2)}" height="${barH.toFixed(2)}" rx="3" fill="${strongest ? "var(--brand)" : "var(--brand)"}" opacity="${strongest ? "1" : "0.55"}"></rect>`;
      svg += `<text class="chart-annotation" x="${(x + barW / 2).toFixed(2)}" y="${(yPos - 7).toFixed(2)}" text-anchor="middle">${pct(probability, 1)}</text>`;
      svg += `<text class="chart-axis" x="${(x + barW / 2).toFixed(2)}" y="${height - 12}" text-anchor="middle">${index === 6 ? "6+" : index}</text>`;
    });
    svg += "</svg>";
    holder.innerHTML = svg;
  }

  function renderNextPrev(fixture) {
    const holder = document.getElementById("next-prev");
    if (!holder) return;
    const ordered = C.fixtures.slice().sort(byDate);
    const index = ordered.findIndex((item) => item.id === fixture.id);
    const previous = ordered[(index - 1 + ordered.length) % ordered.length];
    const next = ordered[(index + 1) % ordered.length];
    const label = (item) => `${C.teams[item.home].name} v ${C.teams[item.away].name}`;
    holder.innerHTML = `<a href="match.html?id=${encodeURIComponent(previous.id)}"><span>Previous fixture</span><strong>${esc(label(previous))}</strong></a>
      <a href="match.html?id=${encodeURIComponent(next.id)}"><span>Next fixture</span><strong>${esc(label(next))}</strong></a>`;
  }

  function initMatch() {
    const content = document.getElementById("match-content");
    if (!content) return;
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("id");
    const fixture = requested ? C.getFixture(requested) : C.fixtures.filter((item) => item.status === "upcoming").sort(byDate)[0];

    if (!fixture) {
      content.hidden = true;
      const missing = document.getElementById("match-missing");
      if (missing) missing.hidden = false;
      return;
    }
    if (!requested) {
      try {
        window.history.replaceState(null, "", `?id=${encodeURIComponent(fixture.id)}`);
      } catch (error) {
        /* file:// previews can refuse history updates. */
      }
    }

    const home = C.teams[fixture.home];
    const away = C.teams[fixture.away];
    const result = fixture.status === "result";
    const read = result
      ? `The forecast above was made before kickoff. The match finished ${fixture.score[0]}–${fixture.score[1]} — ${fixture.score[0] > fixture.score[1] ? `${home.name} win` : fixture.score[0] === fixture.score[1] ? "a draw" : `${away.name} win`}. It is shown here as a worked example, not a live prediction.`
      : C.matchRead(fixture);

    document.title = `${home.name} v ${away.name} — Calibra concept`;
    setHTML("match-meta", `<span class="tag ${result ? "tag--result" : "tag--brand"}">${result ? "Played · illustrative" : "Illustrative forecast"}</span><span>Matchweek ${fixture.mw}</span><span>La Liga</span><span>${esc(fixture.venue)}</span>`);
    setText("match-date", `${C.dateLong(fixture.date)} · ${C.kickoff(fixture.date)}`);
    setText("home-name", home.name);
    setText("away-name", away.name);
    setHTML("match-score", result ? `<span class="match-score">${fixture.score[0]}–${fixture.score[1]}</span>` : '<span class="match-v">v</span>');
    setText("out-home", pct(fixture.p.h));
    setText("out-draw", pct(fixture.p.d));
    setText("out-away", pct(fixture.p.a));
    setHTML("out-tri", `<span class="tri-home" style="flex:0 0 ${(fixture.p.h * 100).toFixed(2)}%"></span><span class="tri-draw" style="flex:0 0 ${(fixture.p.d * 100).toFixed(2)}%"></span><span class="tri-away" style="flex:0 0 ${(fixture.p.a * 100).toFixed(2)}%"></span>`);
    setText("out-note", `${pct(fixture.p.h)} home · ${pct(fixture.p.d)} draw · ${pct(fixture.p.a)} away`);
    setText("match-read", read);

    setHTML("cmp-home-name", `${esc(home.name)}<small>${home.code}</small>`);
    setHTML("cmp-away-name", `${esc(away.name)}<small>${away.code}</small>`);
    setText("cmp-elo-h", String(home.elo));
    setText("cmp-elo-a", String(away.elo));
    setText("cmp-pi-h", home.pi.toFixed(2));
    setText("cmp-pi-a", away.pi.toFixed(2));
    setHTML("cmp-form-h", formChips(home.form));
    setHTML("cmp-form-a", formChips(away.form));
    setText("cmp-xg-h", fixture.xg[0].toFixed(2));
    setText("cmp-xg-a", fixture.xg[1].toFixed(2));
    setText("cmp-win-h", pct(fixture.p.h));
    setText("cmp-win-a", pct(fixture.p.a));

    renderScoreGrid(fixture);
    renderTopScorelines(fixture);
    renderGoalsChart(fixture);
    observeWidth(document.getElementById("goals-chart"), () => renderGoalsChart(fixture));
    renderNextPrev(fixture);
  }

  function initModels() {
    const tabs = $$("#model-tabs [data-model]");
    if (!tabs.length) return;
    const notes = {
      blend: "The headline forecast on this concept site. The 60/40 weight is a design choice, not an optimisation exercise.",
      dc: "The baseline every other model has to beat on transparency, if not always on score.",
      cat: "The context model. Useful precisely because it disagrees with the goals model.",
      market: "Not a model we trained. A benchmark that shows how much information the closing line contains."
    };

    function render(id) {
      const model = C.models.filter((item) => item.id === id)[0] || C.models[0];
      setText("model-name", model.name);
      setText("model-tag", model.tag);
      setText("model-type", model.type);
      setText("model-rps", model.rps.toFixed(3));
      setText("model-summary", model.summary);
      setText("model-logloss", model.logLoss.toFixed(3));
      setText("model-accuracy", `${model.accuracy.toFixed(1)}%`);
      setText("model-calibration", `${model.calibration.toFixed(1)}%`);
      setText("model-inputs", model.inputs);
      setText("model-note", notes[model.id] || notes.blend);
      setHTML("model-strengths", model.strengths.map((item) => `<li>${esc(item)}</li>`).join(""));
      setHTML("model-limits", model.limits.map((item) => `<li>${esc(item)}</li>`).join(""));
      tabs.forEach((tab) => {
        const active = tab.dataset.model === model.id;
        tab.setAttribute("aria-selected", active ? "true" : "false");
        tab.tabIndex = active ? 0 : -1;
        if (active) {
          const panel = document.getElementById("model-panel");
          if (panel) panel.setAttribute("aria-labelledby", tab.id);
        }
      });
      $$("#model-bars [data-model]").forEach((bar) => {
        const active = bar.dataset.model === model.id;
        bar.classList.toggle("is-selected", active);
        bar.setAttribute("aria-pressed", active ? "true" : "false");
      });
      const panel = document.getElementById("model-panel");
      if (panel) {
        panel.classList.remove("is-swapping");
        void panel.offsetWidth;
        panel.classList.add("is-swapping");
      }
      try {
        window.history.replaceState(null, "", `#${model.id}`);
      } catch (error) {
        /* file:// previews can refuse history updates. */
      }
    }

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => render(tab.dataset.model));
      tab.addEventListener("keydown", (event) => {
        let target = index;
        if (event.key === "ArrowRight") target = (index + 1) % tabs.length;
        else if (event.key === "ArrowLeft") target = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === "Home") target = 0;
        else if (event.key === "End") target = tabs.length - 1;
        else return;
        event.preventDefault();
        tabs[target].focus();
        render(tabs[target].dataset.model);
      });
    });
    $$("#model-bars [data-model]").forEach((bar) => {
      bar.addEventListener("click", () => render(bar.dataset.model));
    });
    const initial = window.location.hash.replace("#", "");
    render(C.models.some((model) => model.id === initial) ? initial : "blend");
  }

  function initPerformance() {
    const holder = document.getElementById("metric-chart");
    if (!holder) return;
    const copy = {
      rps: {
        title: "Ranked probability score",
        sub: "Season by season · lower is better",
        note: "Lower is better · 1,140 held-out matches",
        format: (value) => value.toFixed(3)
      },
      logloss: {
        title: "Log loss",
        sub: "Season by season · lower is better",
        note: "Lower is better · 1,140 held-out matches",
        format: (value) => value.toFixed(3)
      },
      accuracy: {
        title: "Outcome accuracy",
        sub: "Season by season · higher is better",
        note: "Higher is better · 1,140 held-out matches",
        format: (value) => `${value.toFixed(1)}%`
      }
    };
    const tabs = $$("[data-metric]");
    let current = "rps";

    function paint() {
      const config = copy[current] || copy.rps;
      const values = C.performance[current];
      const width = Math.max(300, Math.round(holder.clientWidth || 760));
      const compact = width < 520;
      holder.innerHTML = lineChart({
        width,
        height: compact ? 250 : 330,
        margin: compact ? { top: 20, right: 12, bottom: 38, left: 44 } : { top: 24, right: 20, bottom: 42, left: 56 },
        labels: C.performance.seasons,
        series: [
          { label: "Calibra blend", values: values.blend, color: "var(--brand)" },
          { label: "Closing market", values: values.market, color: "var(--saffron)" }
        ],
        formatY: config.format,
        area: current === "rps",
        annotateLast: true
      });
      holder.setAttribute(
        "aria-label",
        `${config.title} by season. Calibra blend ends at ${config.format(values.blend[values.blend.length - 1])}; closing market ends at ${config.format(values.market[values.market.length - 1])}.`
      );
    }

    function render(metric) {
      current = metric;
      const config = copy[metric] || copy.rps;
      const values = C.performance[metric];
      setText("chart-title", config.title);
      setText("chart-sub", config.sub);
      setText("metric-note", config.note);
      tabs.forEach((tab) => {
        const active = tab.dataset.metric === metric;
        tab.setAttribute("aria-selected", active ? "true" : "false");
        tab.tabIndex = active ? 0 : -1;
      });
      paint();
      setHTML(
        "chart-table",
        `<table><caption>${esc(config.title)} by season</caption><thead><tr><th scope="col">Season</th><th scope="col">Calibra blend</th><th scope="col">Closing market</th></tr></thead><tbody>${C.performance.seasons
          .map((season, index) => `<tr><th scope="row">${esc(season)}</th><td>${config.format(values.blend[index])}</td><td>${config.format(values.market[index])}</td></tr>`)
          .join("")}</tbody></table>`
      );
    }

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => render(tab.dataset.metric));
      tab.addEventListener("keydown", (event) => {
        let target = index;
        if (event.key === "ArrowRight") target = (index + 1) % tabs.length;
        else if (event.key === "ArrowLeft") target = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === "Home") target = 0;
        else if (event.key === "End") target = tabs.length - 1;
        else return;
        event.preventDefault();
        tabs[target].focus();
        render(tabs[target].dataset.metric);
      });
    });

    render("rps");
    observeWidth(holder, paint);
    renderCalibration();
    observeWidth(document.getElementById("calibration-chart"), renderCalibration);
    renderWeakSpots();
    renderSeasonTable();
  }

  function renderCalibration() {
    const holder = document.getElementById("calibration-chart");
    if (!holder) return;
    const width = Math.max(280, Math.round(holder.clientWidth || 430));
    const height = Math.round(width * 0.88);
    const margin = { top: 20, right: 18, bottom: 48, left: 50 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const x = (value) => margin.left + value * plotW;
    const y = (value) => margin.top + (1 - value) * plotH;
    let svg = `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">`;
    for (let index = 0; index <= 4; index += 1) {
      const value = index / 4;
      const xPos = x(value);
      const yPos = y(value);
      svg += `<line class="chart-grid" x1="${xPos.toFixed(2)}" x2="${xPos.toFixed(2)}" y1="${margin.top}" y2="${margin.top + plotH}"></line>`;
      svg += `<line class="chart-grid" x1="${margin.left}" x2="${margin.left + plotW}" y1="${yPos.toFixed(2)}" y2="${yPos.toFixed(2)}"></line>`;
      svg += `<text class="chart-axis" x="${xPos.toFixed(2)}" y="${height - 24}" text-anchor="middle">${Math.round(value * 100)}%</text>`;
      svg += `<text class="chart-axis" x="${margin.left - 9}" y="${(yPos + 3).toFixed(2)}" text-anchor="end">${Math.round(value * 100)}%</text>`;
    }
    svg += `<line x1="${margin.left}" y1="${margin.top + plotH}" x2="${margin.left + plotW}" y2="${margin.top}" stroke="var(--line-strong)" stroke-width="1" stroke-dasharray="4 5" vector-effect="non-scaling-stroke"></line>`;
    const points = C.performance.calibration.map((item) => ({ x: x(item.predicted), y: y(item.observed), predicted: item.predicted, observed: item.observed }));
    svg += `<path d="${linePath(points)}" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"></path>`;
    points.forEach((point) => {
      svg += `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="4" fill="var(--brand)" stroke="var(--surface)" stroke-width="2" vector-effect="non-scaling-stroke"><title>Predicted ${Math.round(point.predicted * 100)}% · observed ${Math.round(point.observed * 100)}%</title></circle>`;
    });
    svg += `<text class="chart-axis" x="${margin.left + plotW / 2}" y="${height - 6}" text-anchor="middle">Predicted probability</text>`;
    svg += `<text class="chart-axis" x="14" y="${margin.top + plotH / 2}" text-anchor="middle" transform="rotate(-90 14 ${margin.top + plotH / 2})">Observed frequency</text>`;
    svg += "</svg>";
    holder.innerHTML = svg;
    holder.setAttribute("aria-label", "Calibration chart: predicted probability against observed frequency. Points sit close to the diagonal, with slight overconfidence in the middle bands.");
  }

  function renderWeakSpots() {
    const holder = document.getElementById("weak-spots");
    if (!holder) return;
    holder.innerHTML = C.performance.weakSpots
      .map((spot) => `<div class="weak-spot"><h3>${esc(spot.title)}</h3><p>${esc(spot.body)}</p></div>`)
      .join("");
  }

  function renderSeasonTable() {
    const holder = document.getElementById("season-body");
    if (!holder) return;
    holder.innerHTML = C.selectedSeasonMetrics
      .map((row) => `<tr><td>${esc(row.season)}</td><td>${row.blend.toFixed(3)}</td><td>${row.market.toFixed(3)}</td><td class="delta">+${row.delta.toFixed(3)}</td></tr>`)
      .join("");
  }

  initNavigation();
  initHeroField();

  const page = document.body.dataset.page;
  if (page === "home") initHome();
  else if (page === "fixtures") {
    if (document.getElementById("fixture-list")) initFixtures();
    else initMatch();
  } else if (page === "models") initModels();
  else if (page === "performance") initPerformance();
})();
