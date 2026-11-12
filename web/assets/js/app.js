/* Calibra UI. Renders the payload set by /api/bootstrap.js and kept fresh by data-live.js. */
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
  const num = (value, digits) => Number(value).toFixed(digits == null ? 2 : digits);
  const byDate = (a, b) => new Date(a.date) - new Date(b.date);
  const arrowIcon =
    '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const crestPx = { xs: 22, sm: 30, md: 44, lg: 64, xl: 88 };

  function crest(slug, size) {
    const team = C.teams[slug];
    if (!team) return "";
    const variant = size || "xs";
    const px = crestPx[variant] || 30;
    return `<span class="crest crest--${variant}"><img src="${esc(team.crest)}" alt="" width="${px}" height="${px}"></span>`;
  }

  function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function setHTML(id, value) {
    const node = document.getElementById(id);
    if (node) node.innerHTML = value;
  }

  function formChips(form, label) {
    const letters = String(form || "").split("");
    return (
      `<span class="form" role="img" aria-label="${esc(label || "Last six")}: ${letters.join(", ")}">` +
      letters.map((letter) => `<span class="${letter.toLowerCase()}">${letter}</span>`).join("") +
      "</span>"
    );
  }

  function statusPill(fixture, id) {
    const attr = id ? ` id="${id}"` : "";
    if (fixture.status === "live") {
      return `<span${attr} class="status status--live"><span class="status-dot"></span>Live · ${fixture.minute}'</span>`;
    }
    if (fixture.status === "result") return `<span${attr} class="status status--ft">Full time</span>`;
    if (fixture.awaitingResult) return `<span${attr} class="status status--upcoming">Awaiting result</span>`;
    return `<span${attr} class="status status--upcoming">Upcoming</span>`;
  }

  function probBar(probabilities, inverse) {
    const h = (probabilities.h * 100).toFixed(2);
    const d = (probabilities.d * 100).toFixed(2);
    const a = (probabilities.a * 100).toFixed(2);
    return `<div class="prob-bar${inverse ? " prob-bar--inverse" : ""}" role="img" aria-label="Home ${pct(probabilities.h)}, draw ${pct(probabilities.d)}, away ${pct(probabilities.a)}">
      <span class="prob-home" style="width:${h}%"></span><span class="prob-draw" style="width:${d}%"></span><span class="prob-away" style="width:${a}%"></span>
    </div>`;
  }

  function outcomeKey(fixture) {
    if (!fixture.score) return null;
    if (fixture.score[0] > fixture.score[1]) return "H";
    if (fixture.score[0] < fixture.score[1]) return "A";
    return "D";
  }

  function pickLabel(fixture, pick) {
    if (pick.key === "D") return "Draw";
    return `${C.teams[pick.key === "H" ? fixture.home : fixture.away].code} win`;
  }

  /* Team name -> slug resolution --------------------------------------------
     Names come from two real sources (football-data.co.uk season files and the
     pipeline's upcoming_predictions.csv), so every accepted spelling is listed
     once here and resolved exactly. */
  const TEAM_ALIASES = {
    "alaves": "ala", "alavés": "ala",
    "ath bilbao": "ath", "athletic bilbao": "ath", "athletic club": "ath",
    "ath madrid": "atm", "atletico madrid": "atm", "atlético madrid": "atm",
    "barcelona": "bar",
    "betis": "bet", "real betis": "bet",
    "celta": "cel", "celta vigo": "cel",
    "elche": "elc",
    "espanol": "esp", "espanyol": "esp",
    "getafe": "get",
    "la coruna": "dep", "deportivo la coruna": "dep", "deportivo": "dep",
    "levante": "lev",
    "malaga": "mal", "málaga": "mal",
    "osasuna": "osa",
    "real madrid": "rma",
    "santander": "rac", "racing santander": "rac",
    "sevilla": "sev",
    "sociedad": "rso", "real sociedad": "rso",
    "valencia": "val",
    "vallecano": "ray", "rayo vallecano": "ray",
    "villarreal": "vil"
  };

  function slugFor(name) {
    const key = String(name || "").trim().toLowerCase();
    if (TEAM_ALIASES[key]) return TEAM_ALIASES[key];
    // Diacritic-insensitive fallback.
    const plain = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (TEAM_ALIASES[plain]) return TEAM_ALIASES[plain];
    const hit = Object.keys(C.teams).find((slug) => {
      const team = C.teams[slug];
      const teamPlain = team.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return teamPlain === plain || teamPlain.startsWith(plain) || plain.startsWith(teamPlain) || team.code.toLowerCase() === plain;
    });
    return hit || null;
  }

  /* Theme ------------------------------------------------------------------ */
  function initTheme() {
    const toggle = $("[data-theme-toggle]");
    if (!toggle) return;
    const root = document.documentElement;
    const meta = $('meta[name="theme-color"]');
    const label = $("[data-theme-label]", toggle);

    function apply(theme, persist) {
      const next = theme === "dark" ? "dark" : "light";
      root.setAttribute("data-theme", next);
      toggle.setAttribute("aria-label", `Switch to ${next === "dark" ? "light" : "dark"} theme`);
      if (label) label.textContent = next === "dark" ? "Light" : "Dark";
      if (meta) meta.setAttribute("content", next === "dark" ? "#0b0e10" : "#f3f1eb");
      if (persist) {
        try {
          localStorage.setItem("calibra-theme", next);
        } catch (error) {
          /* Storage can be blocked; the visual toggle still works. */
        }
      }
    }

    apply(root.getAttribute("data-theme") === "dark" ? "dark" : "light", false);
    toggle.addEventListener("click", () => {
      apply(root.getAttribute("data-theme") === "dark" ? "light" : "dark", true);
    });

    if (typeof window.matchMedia === "function") {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const onChange = (event) => {
        let stored = null;
        try {
          stored = localStorage.getItem("calibra-theme");
        } catch (error) {
          stored = null;
        }
        if (stored !== "light" && stored !== "dark") apply(event.matches ? "dark" : "light", false);
      };
      if (typeof media.addEventListener === "function") media.addEventListener("change", onChange);
      else if (typeof media.addListener === "function") media.addListener(onChange);
    }
  }

  /* Navigation ------------------------------------------------------------- */
  function initNavigation() {
    const page = document.body.dataset.page;
    const active = page === "match" ? "fixtures" : page;
    $$("[data-nav]").forEach((link) => {
      if (link.dataset.nav === active) link.setAttribute("aria-current", "page");
    });

    const nav = $(".nav");
    if (nav) {
      const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 12);
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }

    const year = $("[data-year]");
    if (year) year.textContent = new Date().getFullYear();

    const search = document.getElementById("fixture-search");
    if (search) {
      document.addEventListener("keydown", (event) => {
        if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
        const activeElement = document.activeElement;
        const tag = activeElement ? activeElement.tagName : "";
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (activeElement && activeElement.isContentEditable)) return;
        event.preventDefault();
        search.focus();
        search.select();
      });
      search.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          search.value = "";
          search.dispatchEvent(new Event("input", { bubbles: true }));
          search.blur();
        }
      });
    }
  }

  /* Charts ----------------------------------------------------------------- */
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
    // Thin the x-axis labels on narrow screens so they stay legible; the last
    // season is always labelled because it is the one people read.
    const maxLabels = Math.max(3, Math.floor(plotW / 52));
    const labelStep = Math.max(1, Math.ceil(labels.length / maxLabels));
    labels.forEach((label, index) => {
      const isLast = index === labels.length - 1;
      if (!isLast && index % labelStep !== 0) return;
      const xPos = x(index);
      // Keep the last label inside the plot instead of letting it run off the edge.
      const endAnchored = xPos > width - margin.right - 24;
      const anchorX = endAnchored ? width - margin.right : xPos;
      const anchor = endAnchored ? "end" : "middle";
      svg += `<text class="chart-axis" x="${anchorX.toFixed(2)}" y="${height - 14}" text-anchor="${anchor}">${esc(label)}</text>`;
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

  /* Home ------------------------------------------------------------------- */
  function renderHeroRail() {
    const rail = document.getElementById("hero-rail");
    if (!rail) return;
    const fixtures = C.fixtures
      .filter((fixture) => fixture.mw === C.league.nextMatchweek)
      .sort(byDate);
    rail.innerHTML = fixtures
      .map((fixture) => {
        const home = C.teams[fixture.home];
        const away = C.teams[fixture.away];
        return `<a class="rail-match" href="match.html?id=${encodeURIComponent(fixture.id)}">
          ${crest(fixture.home, "xs")}
          <span>${esc(home.code)}</span>
          <strong>v</strong>
          <span>${esc(away.code)}</span>
          ${crest(fixture.away, "xs")}
          <span class="rail-status">${esc(fixture.timeTBC ? "TBC" : C.kickoff(fixture.date))}</span>
        </a>`;
      })
      .join("");
  }

  function renderHomeResults() {
    const grid = document.getElementById("results-grid");
    if (!grid) return;
    const results = C.fixtures
      .filter((fixture) => fixture.status === "result")
      .sort((a, b) => byDate(b, a))
      .slice(0, 4);
    if (!results.length) {
      grid.innerHTML = '<p class="page-note">No settled matches in the export yet.</p>';
      return;
    }
    grid.innerHTML = results
      .map((fixture) => {
        const home = C.teams[fixture.home];
        const away = C.teams[fixture.away];
        const pick = C.favourite(fixture);
        const actual = outcomeKey(fixture);
        const hit = pick ? pick.key === actual : null;
        const forecast = !pick
          ? "No forecast archived"
          : pick.key === "D"
            ? `Draw ${pct(pick.value)}`
            : `${pickLabel(fixture, pick)} ${pct(pick.value)}`;
        const archived = fixture.archived && fixture.archived.settled ? fixture.archived : null;
        const shownHit = archived ? archived.correct : hit;
        const label = archived ? (shownHit ? "Model called it" : "Model missed") : shownHit ? "Market hit" : "Upset";
        const tag = shownHit == null ? "" : `<span class="tag-call ${shownHit ? "tag-call--hit" : "tag-call--miss"}">${label}</span>`;
        const source = archived ? "Model call" : "Market favourite";
        return `<a class="result-card" href="match.html?id=${encodeURIComponent(fixture.id)}">
          <div class="result-top"><span class="result-date">${esc(C.dateShort(fixture.date))}</span><span class="status status--ft">FT</span></div>
          <div class="result-team${fixture.score[0] > fixture.score[1] ? " result-team--winner" : ""}">${crest(fixture.home, "xs")}<span>${esc(home.name)}</span><strong>${fixture.score[0]}</strong></div>
          <div class="result-team${fixture.score[1] > fixture.score[0] ? " result-team--winner" : ""}">${crest(fixture.away, "xs")}<span>${esc(away.name)}</span><strong>${fixture.score[1]}</strong></div>
          <div class="result-foot"><span>${source}: ${esc(forecast)}</span>${tag}</div>
        </a>`;
      })
      .join("");
  }

  function renderStandings() {
    const body = document.getElementById("standings-body");
    if (!body) return;
    body.innerHTML = C.standings
      .map((row) => {
        const team = C.teams[row.team];
        const gd = row.gd > 0 ? `+${row.gd}` : String(row.gd);
        return `<tr>
          <td class="pos${row.pos <= 4 ? " pos--top" : ""}">${row.pos}</td>
          <td><span class="table-team">${crest(row.team, "xs")}<span class="table-team-name">${esc(team.name)}</span><small>${esc(team.code)}</small></span></td>
          <td>${row.played}</td>
          <td>${gd}</td>
          <td class="form-cell">${formChips(team.form, `${team.name} form`)}</td>
          <td class="pts">${row.points}</td>
        </tr>`;
      })
      .join("");
  }

  function renderFormWatch() {
    const holder = document.getElementById("form-watch");
    if (!holder) return;
    const points = (form) => form.split("").reduce((total, letter) => total + (letter === "W" ? 3 : letter === "D" ? 1 : 0), 0);
    const rows = C.standings
      .slice()
      .sort((a, b) => points(C.teams[b.team].form) - points(C.teams[a.team].form))
      .slice(0, 5);
    holder.innerHTML = rows
      .map((row) => {
        const team = C.teams[row.team];
        return `<div class="form-watch-row">${crest(row.team, "xs")}<span class="table-team-name">${esc(team.name)}</span><span class="form-watch-points mono">${points(team.form)} pts</span>${formChips(team.form, `${team.name} form`)}</div>`;
      })
      .join("");
  }

  function initHomeChart() {
    const holder = document.getElementById("home-spark");
    if (!holder) return;
    if (!C.performance || !C.performance.seasons || !C.performance.seasons.length) {
      holder.innerHTML = '<p class="page-note">Season metrics not loaded.</p>';
      return;
    }

    function paint() {
      const width = Math.max(280, Math.round(holder.clientWidth || 520));
      const compact = width < 440;
      holder.innerHTML = lineChart({
        width,
        height: compact ? 180 : 214,
        margin: compact ? { top: 16, right: 10, bottom: 28, left: 40 } : { top: 18, right: 12, bottom: 30, left: 44 },
        labels: C.performance.seasons,
        series: [
          { label: "Calibra blend", values: C.performance.rps.blend, color: "var(--coral-bright)" },
          { label: "Closing market", values: C.performance.rps.market, color: "var(--market-bright)" }
        ],
        formatY: (value) => value.toFixed(3)
      });
      holder.setAttribute("aria-label", "RPS by season. The Calibra blend stays close to the closing market but does not overtake it.");
    }

    paint();
    observeWidth(holder, paint);
  }

  function renderHeroCard() {
    const holder = document.getElementById("hero-live-card");
    if (!holder) return;
    const live = C.fixtures.filter((fixture) => fixture.status === "live").sort(byDate);
    if (!live.length) {
      holder.innerHTML = "";
      holder.hidden = true;
      return;
    }
    holder.hidden = false;
    const fixture = live[0];
    const home = C.teams[fixture.home];
    const away = C.teams[fixture.away];
    const pick = C.favourite(fixture);
    const call = pick ? `${esc(pickLabel(fixture, pick))} ${pct(pick.value)}` : "No archived forecast";
    holder.innerHTML = `<article class="live-card on-inverse">
      <div class="card-top">
        <span class="section-label">Live now</span>
        <span class="card-top-meta">${fixture.minute ? `${fixture.minute}'` : "In play"}</span>
      </div>
      <div class="next-teams">
        <div class="next-team">
          ${crest(fixture.home, "md")}
          <span class="next-team-name">${esc(home.name)}</span>
          <span class="next-team-code">${esc(home.code)}</span>
        </div>
        <span class="next-v">${fixture.score[0]}–${fixture.score[1]}</span>
        <div class="next-team">
          ${crest(fixture.away, "md")}
          <span class="next-team-name">${esc(away.name)}</span>
          <span class="next-team-code">${esc(away.code)}</span>
        </div>
      </div>
      <div class="prediction-box">
        <span class="prediction-label">Pre-match<br>call</span>
        <span class="prediction-score">${call}</span>
        <span class="prediction-prob">Scores update live; the forecast does not re-price</span>
      </div>
      <a class="btn btn--primary btn--block" href="match.html?id=${encodeURIComponent(fixture.id)}">Open live match</a>
      <span class="card-top-meta">Live score: API-Football</span>
    </article>`;
  }

  function renderNextCard() {
    const link = document.getElementById("next-link");
    const card = document.querySelector(".next-card");
    if (!link || !card) return;
    const upcoming = C.fixtures.filter((fixture) => fixture.status === "upcoming" && !fixture.awaitingResult).sort(byDate);
    const next = upcoming[0];
    if (!next) {
      setText("next-date", "No upcoming fixture");
      setHTML("next-home-crest", "");
      setHTML("next-away-crest", "");
      setText("next-home-name", "—");
      setText("next-away-name", "—");
      setText("next-home-code", "");
      setText("next-away-code", "");
      setText("next-pred-score", "—");
      setText("next-pred-prob", "No forecast exported for an unplayed fixture");
      setText("next-venue", "");
      setText("next-mw", "");
      link.hidden = true;
      return;
    }
    const home = C.teams[next.home];
    const away = C.teams[next.away];
    const top = next.top && next.top[0];
    const pick = C.favourite(next);
    link.hidden = false;
    link.href = `match.html?id=${encodeURIComponent(next.id)}`;
    setText("next-date", `${C.dateShort(next.date)} · ${next.timeTBC ? "TBC" : C.kickoff(next.date)}`);
    setHTML("next-home-crest", crestImage(next.home, 44));
    setHTML("next-away-crest", crestImage(next.away, 44));
    setText("next-home-name", home.name);
    setText("next-away-name", away.name);
    setText("next-home-code", home.code);
    setText("next-away-code", away.code);
    setText("next-pred-score", top ? `${top.home}–${top.away}` : "—");
    setText(
      "next-pred-prob",
      top && pick
        ? `${pct(top.p, 1)} · ${pick.key === "D" ? "draw" : pickLabel(next, pick)} ${pct(pick.value)}`
        : "No forecast available"
    );
    setText("next-venue", home.stadium || "");
    setText("next-mw", next.mw ? `Matchweek ${next.mw}` : "");
  }

  function initHome() {
    function renderNextPred() {
      renderNextCard();
      renderHeroCard();
    }
    renderNextPred();
    renderHeroRail();
    renderHomeResults();
    renderStandings();
    renderFormWatch();
    initHomeChart();
    C._homeRender = { rail: renderHeroRail, results: renderHomeResults, standings: renderStandings, form: renderFormWatch, chart: initHomeChart, next: renderNextPred };
  }

  /* Fixtures --------------------------------------------------------------- */
  function fixtureRow(fixture) {
    const home = C.teams[fixture.home];
    const away = C.teams[fixture.away];
    const pick = C.favourite(fixture);
    const isResult = fixture.status === "result";
    const isLive = fixture.status === "live";
    const actual = outcomeKey(fixture);
    const hit = isResult && pick ? pick.key === actual : null;

    let scoreBlock;
    if (isLive || isResult) {
      scoreBlock = `<strong>${fixture.score[0]}–${fixture.score[1]}</strong><span>${isLive ? `Live ${fixture.minute}'` : "Full time"}</span>`;
    } else if (fixture.awaitingResult) {
      scoreBlock = '<strong>–</strong><span>Awaiting result</span>';
    } else {
      scoreBlock = '<strong>v</strong><span>Preview</span>';
    }

    let callBlock;
    if (!pick) {
      callBlock = '<span class="tag-call tag-call--neutral">No forecast archived</span><span class="fixture-confidence">Result only</span>';
    } else if (isResult && fixture.archived && fixture.archived.settled) {
      const archivedHit = fixture.archived.correct;
      callBlock = `<span class="tag-call ${archivedHit ? "tag-call--hit" : "tag-call--miss"}">${archivedHit ? "Model called it" : "Model missed"}</span><span class="fixture-confidence">Call: ${esc(pickLabel(fixture, pick))} ${pct(pick.value)}</span>`;
    } else if (isResult && !fixture.archived) {
      callBlock = '<span class="tag-call tag-call--neutral">Not forecast</span><span class="fixture-confidence">No archived prediction</span>';
    } else if (isResult) {
      callBlock = `<span class="tag-call ${hit ? "tag-call--hit" : "tag-call--miss"}">${hit ? "Market hit" : "Upset"}</span><span class="fixture-confidence">Market favourite: ${esc(pickLabel(fixture, pick))} ${pct(pick.value)}</span>`;
    } else if (isLive) {
      callBlock = `<span class="tag-call tag-call--neutral">Live call</span><span class="fixture-confidence">${esc(pickLabel(fixture, pick))} ${pct(pick.value)}</span>`;
    } else {
      callBlock = `<span class="tag-call tag-call--neutral">${esc(pickLabel(fixture, pick))}</span><span class="fixture-confidence">${pct(pick.value)} probability</span>`;
    }

    const probabilityBlock = fixture.p
      ? `${probBar(fixture.p)}
        <div class="prob-labels"><span>H ${pct(fixture.p.h)}</span><span>D ${pct(fixture.p.d)}</span><span>A ${pct(fixture.p.a)}</span></div>`
      : '<div class="prob-labels"><span>No pre-match probabilities</span></div>';

    return `<a class="fixture-row${isLive ? " fixture-row--live" : ""}${isResult ? " fixture-row--result" : ""}" href="match.html?id=${encodeURIComponent(fixture.id)}">
      <div class="fixture-when">
        <span class="fixture-day">${esc(C.dateShort(fixture.date))}</span>
        <span class="fixture-time">${esc(fixture.timeTBC ? "TBC" : C.kickoff(fixture.date))}</span>
        <span class="fixture-mw">${fixture.mw ? `MW ${fixture.mw}` : "MW —"}</span>
      </div>
      <div class="fixture-teams">
        <div class="fixture-team">${crest(fixture.home, "xs")}<span class="team-name">${esc(home.name)}</span><span class="team-code">${esc(home.code)}</span></div>
        <div class="fixture-team">${crest(fixture.away, "xs")}<span class="team-name">${esc(away.name)}</span><span class="team-code">${esc(away.code)}</span></div>
      </div>
      <div class="fixture-score">${scoreBlock}</div>
      <div class="fixture-prob">${probabilityBlock}</div>
      <div class="fixture-call">${callBlock}</div>
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
    const statusButtons = $$("#status-filter [data-status]");
    const params = new URLSearchParams(window.location.search);
    const validStatus = ["all", "live", "upcoming", "result"];
    const state = {
      q: params.get("q") || "",
      status: validStatus.indexOf(params.get("status")) > -1
        ? params.get("status")
        : (document.body.dataset.page === "history" ? "result" : "all"),
      team: params.get("team") || "all",
      // Open on the next matchweek unless URL specifies mw OR status is 'result'/'all'
      mw: params.get("mw") || (document.body.dataset.page === "history" || params.get("status") === "result"
        ? "all"
        : (C.meta && C.meta.nextMw != null ? String(C.meta.nextMw) : "all")),
      sort: params.get("sort") || "date"
    };

    search.value = state.q;
    teamFilter.insertAdjacentHTML(
      "beforeend",
      Object.keys(C.teams)
        .sort((a, b) => C.teams[a].name.localeCompare(C.teams[b].name))
        .map((slug) => `<option value="${slug}">${esc(C.teams[slug].name)}</option>`)
        .join("")
    );
    teamFilter.value = C.teams[state.team] ? state.team : "all";
    state.team = teamFilter.value;
    state.mw = state.mw || "all";
    weekFilter.value = "all";
    sortFilter.value = ["date", "date-desc", "club", "status"].indexOf(state.sort) > -1 ? state.sort : "date";
    state.sort = sortFilter.value;

    function refreshMeta() {
      const counts = { all: C.fixtures.length, live: 0, upcoming: 0, result: 0 };
      C.fixtures.forEach((fixture) => {
        counts[fixture.status] = (counts[fixture.status] || 0) + 1;
      });
      $$("[data-count]").forEach((node) => {
        if (counts[node.dataset.count] != null) node.textContent = counts[node.dataset.count];
      });
      const statMap = { total: counts.all, live: counts.live, results: counts.result, upcoming: counts.upcoming };
      Object.keys(statMap).forEach((key) => {
        const node = document.querySelector(`[data-stat-${key}]`);
        if (node) node.textContent = statMap[key];
      });
      // Rebuild matchweek options from the matchweeks actually present.
      const weeks = Array.from(new Set(C.fixtures.map((fixture) => String(fixture.mw))))
        .sort((a, b) => Number(a) - Number(b));
      const wanted = state.mw;
      weekFilter.innerHTML =
        '<option value="all">All matchweeks</option>' +
        weeks.map((week) => `<option value="${week}">Matchweek ${week}</option>`).join("");
      weekFilter.value = weeks.indexOf(wanted) > -1 ? wanted : "all";
      state.mw = weekFilter.value;
      const note = document.querySelector("[data-fixtures-note]");
      if (note) {
        const through = C.league.currentMatchweek == null ? "—" : C.league.currentMatchweek;
        const ahead = C.league.nextMatchweek == null ? "—" : C.league.nextMatchweek;
        note.textContent = `2026/27 season · Results through Matchweek ${through} · Forecasts from Matchweek ${ahead} · Times CET`;
      }
    }

    function syncUrl() {
      const next = new URLSearchParams();
      if (state.q) next.set("q", state.q);
      if (state.status !== "all") next.set("status", state.status);
      if (state.team !== "all") next.set("team", state.team);
      if (state.mw !== "all") next.set("mw", state.mw);
      if (state.sort !== "date") next.set("sort", state.sort);
      const query = next.toString();
      try {
        window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
      } catch (error) {
        /* file:// previews can refuse history updates. */
      }
    }

    function matches(fixture) {
      if (state.status !== "all" && fixture.status !== state.status) return false;
      if (state.team !== "all" && fixture.home !== state.team && fixture.away !== state.team) return false;
      if (state.mw !== "all" && String(fixture.mw) !== state.mw) return false;
      if (!state.q) return true;
      const query = state.q.trim().toLowerCase();
      if (!query) return true;
      const home = C.teams[fixture.home];
      const away = C.teams[fixture.away];
      return [home.name, home.code, home.city, away.name, away.code, away.city, fixture.venue]
        .join(" ")
        .toLowerCase()
        .indexOf(query) > -1;
    }

    function sortWithinGroup(items) {
      const copy = items.slice();
      if (state.sort === "club") {
        copy.sort((a, b) => C.teams[a.home].name.localeCompare(C.teams[b.home].name));
      } else if (state.sort === "status") {
        const rank = { live: 0, upcoming: 1, result: 2 };
        copy.sort((a, b) => (rank[a.status] - rank[b.status]) || byDate(a, b));
      } else if (state.sort === "date-desc") {
        copy.sort((a, b) => byDate(b, a));
      } else {
        copy.sort(byDate);
      }
      return copy;
    }

    function groupLabel(items) {
      const allTBC = items.every((fixture) => fixture.timeTBC);
      const times = items.map((fixture) => C.kickoff(fixture.date)).sort();
      const range = allTBC
        ? "Kick-off times TBC"
        : times[0] === times[times.length - 1]
          ? times[0]
          : `${times[0]}–${times[times.length - 1]}`;
      return `${items.length} fixture${items.length === 1 ? "" : "s"} · ${range}`;
    }

    function render() {
      const filtered = C.fixtures.filter(matches);
      const groups = {};
      filtered.forEach((fixture) => {
        const key = fixture.day || fixture.date.slice(0, 10);
        if (!groups[key]) groups[key] = [];
        groups[key].push(fixture);
      });
      let keys = Object.keys(groups).sort();
      if (state.sort === "date-desc") keys = keys.reverse();
      else if (state.sort === "status") {
        const rank = { live: 0, upcoming: 1, result: 2 };
        const rankOf = (key) => Math.min.apply(null, groups[key].map((fixture) => rank[fixture.status]));
        keys.sort((a, b) => (rankOf(a) - rankOf(b)) || (a < b ? -1 : a > b ? 1 : 0));
      }

      list.innerHTML = keys
        .map((key) => {
          const items = sortWithinGroup(groups[key]);
          const weekNumbers = Array.from(new Set(items.map((fixture) => fixture.mw)));
          const weekLabel = weekNumbers.length === 1 ? `Matchweek ${weekNumbers[0]}` : "Matchweek";
          const statusLabel = state.sort === "status"
            ? (items[0].status === "live" ? " · Live" : items[0].status === "result" ? " · Settled" : " · Upcoming")
            : "";
          return `<section class="fixture-group" aria-label="${esc(C.dateShort(items[0].date))}">
            <div class="fixture-group-head">
              <div class="fixture-group-date"><span class="eyebrow">${esc(weekLabel + statusLabel)}</span><strong>${esc(C.dateShort(items[0].date))}</strong></div>
              <span class="fixture-group-meta">${esc(groupLabel(items))}</span>
            </div>
            <div class="fixture-group-list">${items.map(fixtureRow).join("")}</div>
          </section>`;
        })
        .join("");

      const live = filtered.filter((fixture) => fixture.status === "live").length;
      const upcoming = filtered.filter((fixture) => fixture.status === "upcoming").length;
      const results = filtered.filter((fixture) => fixture.status === "result").length;
      const prefix = filtered.length === C.fixtures.length ? "" : `${filtered.length} of ${C.fixtures.length} · `;
      if (count) {
        count.textContent = `${prefix}${live} live · ${upcoming} upcoming · ${results} settled`;
      }
      empty.hidden = filtered.length > 0;
      list.hidden = filtered.length === 0;
      statusButtons.forEach((button) => {
        const active = button.dataset.status === state.status;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
    }

    search.addEventListener("input", () => {
      state.q = search.value;
      syncUrl();
      render();
    });
    teamFilter.addEventListener("change", () => {
      state.team = teamFilter.value;
      syncUrl();
      render();
    });
    weekFilter.addEventListener("change", () => {
      state.mw = weekFilter.value;
      syncUrl();
      render();
    });
    sortFilter.addEventListener("change", () => {
      state.sort = sortFilter.value;
      syncUrl();
      render();
    });
    statusButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.status = button.dataset.status;
        // If filtering by result or upcoming and current matchweek filter has 0 matches, reset matchweek filter to 'all'
        if (state.mw !== "all") {
          const hasMatches = C.fixtures.some((f) => 
            (state.status === "all" || f.status === state.status) &&
            String(f.mw) === state.mw
          );
          if (!hasMatches) {
            state.mw = "all";
            weekFilter.value = "all";
          }
        }
        syncUrl();
        render();
      });
    });

    function resetAll() {
      state.q = "";
      state.status = "all";
      state.team = "all";
      state.mw = "all";
      state.sort = "date";
      search.value = "";
      teamFilter.value = "all";
      weekFilter.value = "all";
      sortFilter.value = "date";
      syncUrl();
      render();
      search.focus();
    }

    reset.addEventListener("click", resetAll);
    $$("[data-reset]").forEach((button) => button.addEventListener("click", resetAll));

    refreshMeta();
    // When the URL didn't supply a status (history page defaults to results),
    // pick the right pressed button for the initial render.
    function syncStatusPressing() {
      statusButtons.forEach((button) => {
        const active = button.dataset.status === state.status;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
    }
    syncStatusPressing();
    render();
    C._fixturesRender = { render: () => { refreshMeta(); render(); } };
  }

  /* Match centre ----------------------------------------------------------- */
  function crestImage(slug, px) {
    const team = C.teams[slug];
    return team ? `<img src="${esc(team.crest)}" alt="" width="${px}" height="${px}">` : "";
  }

  function eventIcon(type) {
    if (type === "goal") {
      return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5.4" stroke="currentColor" stroke-width="1.4"/><path d="m8 5.3 2.5 1.8-.9 2.9H6.4l-.9-2.9L8 5.3Z" fill="currentColor"/></svg>';
    }
    if (type === "yellow") {
      return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="5.2" y="3.2" width="5.6" height="9.6" rx="1" fill="currentColor"/></svg>';
    }
    return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function formPoints(form) {
    return String(form || "").split("").reduce((total, letter) => total + (letter === "W" ? 3 : letter === "D" ? 1 : 0), 0);
  }

  function renderMatchTimeline(fixture) {
    const timeline = document.getElementById("match-timeline");
    if (!timeline) return;
    const labels = { goal: "Goal", yellow: "Yellow card", chance: "Chance" };
    if (fixture.events && fixture.events.length) {
      setText("timeline-meta", fixture.status === "live" ? `Live · ${fixture.minute}'` : "Full time");
      timeline.innerHTML = fixture.events
        .slice()
        .sort((a, b) => a.minute - b.minute)
        .map((event) => {
          const team = C.teams[event.team];
          return `<div class="timeline-event timeline-event--${event.type}">
            <span class="event-minute">${event.minute}'</span>
            <span class="event-icon">${eventIcon(event.type)}</span>
            <div class="event-body"><strong>${esc(labels[event.type] || "Event")} · ${esc(team.code)} No. ${esc(event.player)}</strong><span>${esc(event.detail)}</span></div>
          </div>`;
        })
        .join("");
      return;
    }
    if (fixture.status === "live") setText("timeline-meta", `Live · ${fixture.minute}'`);
    else if (fixture.status === "result") setText("timeline-meta", "Full time");
    else setText("timeline-meta", "Not started");
    const message = fixture.status === "upcoming"
      ? "Kick-off has not happened. The live timeline will appear here once the match starts."
      : `No event feed for this fixture. Final score: ${fixture.score[0]}–${fixture.score[1]}.`;
    timeline.innerHTML = `<div class="timeline-empty">${esc(message)}</div>`;
  }

  function renderScoreFields(fixture) {
    const section = document.getElementById("scoreline");
    let holder = document.getElementById("score-grid");
    if (!holder || !section) return;
    if (!fixture.grid || !fixture.top || !fixture.top.length) {
      // Real pipeline exports carry the top scoreline and 1X2 probabilities,
      // not a full scoreline grid — hide the fabricated-grid panel.
      section.hidden = true;
      return;
    }
    section.hidden = false;
    // Swap in a fresh holder so re-renders do not stack event listeners.
    const fresh = holder.cloneNode(false);
    holder.replaceWith(fresh);
    holder = fresh;
    const maxP = fixture.top[0].p;
    const topSet = {};
    fixture.top.forEach((item) => {
      topSet[`${item.home}-${item.away}`] = true;
    });
    let html = '<div class="axis axis--title" aria-hidden="true">A/H</div>';
    for (let home = 0; home <= 6; home += 1) html += `<div class="axis" aria-hidden="true">${home}</div>`;
    fixture.grid.forEach((row, away) => {
      html += `<div class="axis" aria-hidden="true">${away}</div>`;
      row.forEach((probability, home) => {
        const ratio = probability / maxP;
        const size = (4 + ratio * 12).toFixed(1);
        const opacity = (0.26 + ratio * 0.74).toFixed(2);
        const isTop = topSet[`${home}-${away}`] ? " is-top" : "";
        html += `<button type="button" class="cell${isTop}" data-home="${home}" data-away="${away}" data-p="${probability}" tabindex="-1" aria-label="${home}–${away}, ${(probability * 100).toFixed(1)} percent"><span class="dot" style="--s:${size}px;--o:${opacity}"></span></button>`;
      });
    });
    holder.innerHTML = html;

    function showCell(cell, manageFocus) {
      if (!cell) return;
      const home = Number(cell.dataset.home);
      const away = Number(cell.dataset.away);
      const probability = Number(cell.dataset.p);
      setText("readout-score", `${home}–${away}`);
      setText("readout-pct", pct(probability, 1));
      const rank = fixture.top.findIndex((item) => item.home === home && item.away === away);
      setText("readout-label", rank === 0 ? "Most likely scoreline" : rank > -1 ? `#${rank + 1} most likely scoreline` : "Scoreline probability");
      if (manageFocus) {
        $$(".cell", holder).forEach((item) => {
          item.tabIndex = -1;
        });
        cell.tabIndex = 0;
      }
    }

    const top = fixture.top[0];
    const first = holder.querySelector(`.cell[data-home="${top.home}"][data-away="${top.away}"]`);
    if (first) {
      first.tabIndex = 0;
      showCell(first, false);
    }

    holder.addEventListener("mouseover", (event) => {
      const cell = event.target.closest(".cell");
      if (cell) showCell(cell, false);
    });
    holder.addEventListener("focusin", (event) => {
      const cell = event.target.closest(".cell");
      if (cell) showCell(cell, true);
    });
    holder.addEventListener("click", (event) => {
      const cell = event.target.closest(".cell");
      if (cell) showCell(cell, true);
    });
    holder.addEventListener("keydown", (event) => {
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
      const next = holder.querySelector(`.cell[data-home="${homeGoals}"][data-away="${awayGoals}"]`);
      if (next) {
        next.focus();
        showCell(next, true);
      }
    });

    setHTML(
      "score-list",
      fixture.top
        .map((item, index) => `<div class="score-item">
          <span class="rank">${String(index + 1).padStart(2, "0")}</span>
          <span class="score">${item.home}–${item.away}</span>
          <span class="score-bar"><span style="width:${((item.p / maxP) * 100).toFixed(1)}%"></span></span>
          <span class="pct">${pct(item.p, 1)}</span>
        </div>`)
        .join("")
    );
  }

  function renderTeamCompare(fixture) {
    const holder = document.getElementById("team-compare");
    if (!holder) return;
    const home = C.teams[fixture.home];
    const away = C.teams[fixture.away];
    const rowFor = (slug) => C.standings.find((entry) => entry.team === slug) || { points: 0, gf: 0, ga: 0 };
    const rows = [
      { label: "Points", home: rowFor(fixture.home).points, away: rowFor(fixture.away).points, format: (value) => String(value) },
      { label: "Goals scored", home: rowFor(fixture.home).gf, away: rowFor(fixture.away).gf, format: (value) => String(value) }
    ];
    if (fixture.status === "result" && fixture.xg) {
      rows.push({ label: "Match xG", home: fixture.xg[0], away: fixture.xg[1], format: (value) => value.toFixed(2) });
    }
    const html = rows
      .map((row) => {
        const total = row.home + row.away || 1;
        return `<div class="cmp-item">
          <div class="cmp-head">
            <span class="cmp-value">${row.format(row.home)}</span>
            <span class="cmp-label">${esc(row.label)}</span>
            <span class="cmp-value cmp-value--away">${row.format(row.away)}</span>
          </div>
          <div class="cmp-track"><span class="left" style="flex:${row.home / total}"></span><span class="right" style="flex:${row.away / total}"></span></div>
        </div>`;
      })
      .join("");
    holder.innerHTML = `${html}
      <div class="cmp-item">
        <div class="cmp-head">
          <span class="cmp-value">${formPoints(home.form)}</span>
          <span class="cmp-label">Form · last six</span>
          <span class="cmp-value cmp-value--away">${formPoints(away.form)}</span>
        </div>
        <div class="cmp-form">${formChips(home.form, `${home.name} form`)}${formChips(away.form, `${away.name} form`)}</div>
      </div>`;
  }

  function renderNextPrev(fixture) {
    const holder = document.getElementById("next-prev");
    if (!holder) return;
    const ordered = C.fixtures.slice().sort(byDate);
    const index = ordered.findIndex((item) => item.id === fixture.id);
    const previous = index > 0 ? ordered[index - 1] : null;
    const next = index > -1 && index < ordered.length - 1 ? ordered[index + 1] : null;
    const link = (item, label) => {
      if (!item) return "";
      return `<a href="match.html?id=${encodeURIComponent(item.id)}"><span>${label}</span><strong>${esc(C.teams[item.home].code)} v ${esc(C.teams[item.away].code)}</strong><span>${esc(C.dateShort(item.date))}</span></a>`;
    };
    const html = `${link(previous, "Previous fixture")}${link(next, "Next fixture")}`;
    holder.innerHTML = html;
    holder.hidden = !html;
  }

  function initMatch() {
    const body = document.getElementById("match-body");
    const missing = document.getElementById("match-missing");
    if (!body) return;
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("id");

    function run() {
    const fallback = (C.fixtures || []).filter((fixture) => fixture.status === "upcoming").sort(byDate)[0];
    const fixture = requested ? C.getFixture(requested) : fallback;

    if (!fixture) {
      body.hidden = true;
      const note = document.getElementById("data-note");
      if (!C._ready && note) note.hidden = false;

      if (missing) missing.hidden = false;
      const hero = $(".match-hero");
      const subnav = $(".match-subnav");
      if (hero) hero.hidden = true;
      if (subnav) subnav.hidden = true;
      document.title = "Match not found — Calibra";
      return;
    }

    const home = C.teams[fixture.home];
    const away = C.teams[fixture.away];
    const pick = C.favourite(fixture);
    const archived = fixture.archived || null;
    const top = (fixture.top && fixture.top[0]) || (archived && archived.top) || null;

    document.title = `${home.name} v ${away.name} — Calibra match centre`;
    setText("match-title", `${home.name} v ${away.name} — Calibra match centre`);
    setText("match-crumb", `Matchweek ${fixture.mw} · ${C.league.season}`);
    const statusNode = document.getElementById("match-status");
    if (statusNode) statusNode.outerHTML = statusPill(fixture, "match-status");
    setText(
      "match-kickoff",
      fixture.status === "live"
        ? `Live · ${fixture.minute}'`
        : `${C.dateShort(fixture.date)} · ${fixture.timeTBC ? "TBC" : C.kickoff(fixture.date)}`
    );
    setText("match-venue", fixture.venue || home.stadium || "Venue TBC");

    const homeCrest = document.getElementById("home-crest");
    const awayCrest = document.getElementById("away-crest");
    if (homeCrest) homeCrest.innerHTML = crestImage(fixture.home, 88);
    if (awayCrest) awayCrest.innerHTML = crestImage(fixture.away, 88);
    setText("home-name", home.name);
    setText("away-name", away.name);
    setText("home-code", `${home.code} · Home`);
    setText("away-code", `${away.code} · Away`);
    setHTML("home-form", formChips(home.form, `${home.name} form`));
    setHTML("away-form", formChips(away.form, `${away.name} form`));

    const scoreNode = document.getElementById("match-score");
    if (scoreNode) {
      if (fixture.status === "result" || fixture.status === "live") scoreNode.textContent = `${fixture.score[0]}–${fixture.score[1]}`;
      else scoreNode.innerHTML = '<span class="match-v">v</span>';
    }
    setText("match-predicted", top ? `${top.home}–${top.away}` : "—");
    if (top) {
      setText("match-predicted-p", `${pct(top.p, 1)} of the field`);
      const callBox = document.querySelector(".match-predicted");
      if (callBox) callBox.hidden = false;
    } else {
      const callBox = document.querySelector(".match-predicted");
      if (callBox) callBox.hidden = true;
    }
    setText("match-kickoff-long", `${C.dateLong(fixture.date)} · ${fixture.timeTBC ? "Kick-off TBC" : C.kickoff(fixture.date)}`);

    const probabilities = (archived && archived.p) || fixture.p || null;
    const outcomes = probabilities
      ? [
          { key: "home", label: "Home", value: probabilities.h },
          { key: "draw", label: "Draw", value: probabilities.d },
          { key: "away", label: "Away", value: probabilities.a }
        ]
      : [];
    setHTML(
      "match-outcomes",
      outcomes.length
        ? outcomes
            .map((outcome) => `<div class="outcome outcome--${outcome.key}"><span class="outcome-label">${outcome.label}</span><strong>${pct(outcome.value)}</strong></div>`)
            .join("")
        : '<div class="outcome"><span class="outcome-label">Forecast</span><strong>—</strong></div>'
    );
    setText("outcome-note-left", pick ? `Most likely: ${pickLabel(fixture, pick)} · ${pct(pick.value)}` : "No pre-match forecast archived for this fixture");
    setText(
      "outcome-note-right",
      archived && archived.p
        ? "Archived forecast · recorded before kick-off, never rewritten"
        : fixture.source === "market"
          ? "Closing market · de-vigged odds (reference, not a model forecast)"
          : "Blend model output · Dixon-Coles × CatBoost"
    );

    setText("match-read", C.matchRead(fixture));
    setText(
      "read-meta",
      fixture.status === "live"
        ? "Pre-match read · live"
        : archived && archived.p
          ? "Pre-match read · archived forecast"
          : fixture.source === "market"
            ? "Final score · market reference"
            : "Pre-match read · model output"
    );
    if (fixture.status === "result") {
      const xgTile = fixture.xg
        ? `<div class="key-number"><span>Expected goals</span><strong>${fixture.xg[0].toFixed(2)}–${fixture.xg[1].toFixed(2)}</strong><small>actual match xG</small></div>`
        : "";
      const verdictTile = archived && archived.settled
        ? `<div class="key-number"><span>Model call</span><strong>${archived.correct ? "Correct" : "Missed"}</strong><small>${archived.correct ? "called the result" : "result went the other way"}${archived.rps != null ? ` · RPS ${archived.rps.toFixed(3)}` : ""}</small></div>`
        : `<div class="key-number"><span>Market favourite</span><strong>${pct(pick.value)}</strong><small>${esc(pickLabel(fixture, pick))} · de-vigged</small></div>`;
      const fourthTile = archived && archived.top
        ? `<div class="key-number"><span>Forecast scoreline</span><strong>${archived.top.home}–${archived.top.away}</strong><small>${archived.scorelineHit ? "exact" : "missed"}</small></div>`
        : `<div class="key-number"><span>Market draw</span><strong>${fixture.p ? pct(fixture.p.d) : "—"}</strong><small>de-vigged</small></div>`;
      setHTML(
        "match-key-numbers",
        `${xgTile}${verdictTile}
         <div class="key-number"><span>Goals</span><strong>${fixture.score[0] + fixture.score[1]}</strong><small>${fixture.score[0]}–${fixture.score[1]} final</small></div>
         ${fourthTile}`
      );
    } else {
      setHTML(
        "match-key-numbers",
        `<div class="key-number"><span>Favourite</span><strong>${pct(pick.value)}</strong><small>${esc(pickLabel(fixture, pick))}</small></div>
         <div class="key-number"><span>Top scoreline</span><strong>${top ? top.home + "–" + top.away : "—"}</strong><small>${top ? pct(top.p, 1) : "—"}</small></div>
         <div class="key-number"><span>DC · Cat home</span><strong>${fixture.dc ? pct(fixture.dc.h, 0) : "—"} / ${fixture.cat ? pct(fixture.cat.h, 0) : "—"}</strong><small>model disagreement</small></div>
         <div class="key-number"><span>Draw</span><strong>${pct(fixture.p.d)}</strong><small>central mass</small></div>`
      );
    }

    renderScoreFields(fixture);
    // The 15x15 grid ships as a per-fixture JSON file (converted from the
    // pipeline parquet). Fetch it only when this page is opened.
    if (!fixture.grid && fixture.status !== "result") {
      fetch(`data/website/scorelines/${encodeURIComponent(fixture.id)}.json`, {
        headers: { accept: "application/json" }
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (!data || !Array.isArray(data.grid) || data.grid.length !== 15) return;
          fixture.grid = data.grid;
          if (Array.isArray(data.top) && data.top.length) fixture.top = data.top;
          renderScoreFields(fixture);
        })
        .catch(() => {
          /* no grid for this fixture: the panel stays hidden */
        });
    }
    renderMatchTimeline(fixture);
    renderTeamCompare(fixture);
    renderNextPrev(fixture);

    setText("engine-favourite", `${pickLabel(fixture, pick)} ${pct(pick.value)}`);
    setText(
      "engine-note",
      fixture.status === "live"
        ? "Live scores do not re-price the model. The scoreline field is the pre-match forecast, kept for transparency."
        : fixture.status === "result"
          ? "The closing market line is shown for reference. The final score does not re-price it."
          : "The forecast is the pipeline's Dixon-Coles and CatBoost blend, exported before kick-off."
    );
    }

    run();
    C._matchRender = { run };
  }

  /* Models ----------------------------------------------------------------- */
  function renderModelMatrix() {
    const holder = document.getElementById("model-bars");
    if (!holder) return;
    const min = 0.188;
    const max = 0.198;
    holder.innerHTML = C.models
      .filter((model) => model.rps != null)
      .map((model) => {
        const width = Math.max(6, Math.min(100, ((max - model.rps) / (max - min)) * 100));
        const selected = model.id === "blend";
        return `<button type="button" class="bar-row${selected ? " is-selected" : ""}" data-model="${model.id}" aria-pressed="${selected ? "true" : "false"}">
          <span class="bar-top"><span class="bar-name">${esc(model.name)}</span><span class="bar-value">${model.rps.toFixed(3)}</span></span>
          <span class="bar-track"><span class="bar-fill" style="--w:${width.toFixed(1)}%"></span></span>
          <span class="bar-meta"><span>Log loss ${dash(model.logLoss, 3)}</span><span>Acc ${dashPct(model.accuracy, 1)}</span><span>Cal ${dashPct(model.calibration, 1)}</span></span>
        </button>`;
      })
      .join("");
  }

  function renderFeatureFamilies() {
    const holder = document.getElementById("feature-families");
    if (!holder) return;
    const tones = {
      home: "var(--home)",
      brand: "var(--coral)",
      away: "var(--away)",
      draw: "var(--draw)",
      market: "var(--market)"
    };
    holder.innerHTML = C.featureFamilies
      .map((feature) => {
        return `<div class="feature-row">
          <div><div class="feature-name">${esc(feature.name)}<span class="feature-note">${esc(feature.note)}</span></div></div>
          <div class="feature-track"><span class="feature-fill" style="--w:100%;--tone:${tones[feature.tone] || "var(--coral)"}"></span></div>
          <span class="feature-weight">input</span>
        </div>`;
      })
      .join("");
  }

  function initModels() {
    const tabs = $$("#model-tabs [data-model]");
    if (!tabs.length) return;
    renderModelMatrix();
    const bars = $$("#model-bars [data-model]");
    const notes = {
      blend: "The headline forecast, exported by the pipeline before each matchday. The 65/35 blend weight is fixed, not optimised per match.",
      dc: "The baseline every other model has to beat on transparency, if not always on score.",
      cat: "The context model. Useful precisely because it disagrees with the goals model.",
      market: "Not a model we trained. A benchmark that shows how much information the closing line contains."
    };

    function render(id, moveFocus) {
      const model = C.models.filter((item) => item.id === id)[0] || C.models[0];
      const index = C.models.indexOf(model);
      setText("model-name", model.name);
      setText("model-tag", model.tag);
      setText("model-type", model.type);
      setText("model-rps", dash(model.rps, 3));
      setText("model-summary", model.summary);
      setText("model-logloss", dash(model.logLoss, 3));
      setText("model-accuracy", dashPct(model.accuracy, 1));
      setText("model-calibration", dashPct(model.calibration, 1));
      setText("model-inputs", model.inputs);
      setText("model-note", notes[model.id] || notes.blend);
      setText("model-position", `${String(index + 1).padStart(2, "0")} / ${String(C.models.length).padStart(2, "0")}`);
      setHTML("model-strengths", model.strengths.map((item) => `<li>${esc(item)}</li>`).join(""));
      setHTML("model-limits", model.limits.map((item) => `<li>${esc(item)}</li>`).join(""));

      let activeTab = null;
      tabs.forEach((tab) => {
        const active = tab.dataset.model === model.id;
        tab.setAttribute("aria-selected", active ? "true" : "false");
        tab.tabIndex = active ? 0 : -1;
        if (active) activeTab = tab;
      });
      const panel = document.getElementById("model-spotlight");
      if (panel && activeTab) panel.setAttribute("aria-labelledby", activeTab.id);
      bars.forEach((bar) => {
        const active = bar.dataset.model === model.id;
        bar.classList.toggle("is-selected", active);
        bar.setAttribute("aria-pressed", active ? "true" : "false");
      });
      if (panel) {
        panel.classList.remove("is-swapping");
        void panel.offsetWidth;
        panel.classList.add("is-swapping");
      }
      if (moveFocus && activeTab) activeTab.focus();
      try {
        window.history.replaceState(null, "", `#${model.id}`);
      } catch (error) {
        /* file:// previews can refuse history updates. */
      }
    }

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => render(tab.dataset.model, false));
      tab.addEventListener("keydown", (event) => {
        let target = index;
        if (event.key === "ArrowRight") target = (index + 1) % tabs.length;
        else if (event.key === "ArrowLeft") target = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === "Home") target = 0;
        else if (event.key === "End") target = tabs.length - 1;
        else return;
        event.preventDefault();
        render(tabs[target].dataset.model, true);
      });
    });
    bars.forEach((bar) => {
      bar.addEventListener("click", () => render(bar.dataset.model, false));
    });

    renderFeatureFamilies();
    const initial = window.location.hash.replace("#", "");
    render(C.models.some((model) => model.id === initial) ? initial : "blend", false);
    C.modelsRender = { matrix: renderModelMatrix };
  }

  /* Performance ------------------------------------------------------------ */
  const dash = (value, digits) => (value == null || Number.isNaN(value) ? "—" : Number(value).toFixed(digits));
  const dashPct = (value, digits) => (value == null || Number.isNaN(value) ? "—" : `${Number(value).toFixed(digits)}%`);

  function renderMetricTiles() {
    const holder = document.getElementById("metric-tiles");
    if (!holder) return;
    const m = C.metrics;
    if (!m || m.rps == null || m.marketRps == null) {
      holder.innerHTML = '<p class="page-note">Held-out metrics are not loaded.</p>';
      return;
    }
    const signed = (value, digits) => (value == null ? "—" : `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}`);
    const gap = (value) => (value == null ? "—" : `${signed(value, 3)} vs market`);
    holder.innerHTML = `<div class="metric-tile">
        <span>Ranked probability score</span>
        <strong>${dash(m.rps, 3)}</strong>
        <small>Market ${dash(m.marketRps, 3)}</small>
        <span class="metric-delta">${gap(m.marketRps == null ? null : m.rps - m.marketRps)}</span>
      </div>
      <div class="metric-tile">
        <span>Log loss</span>
        <strong>${dash(m.logLoss, 3)}</strong>
        <small>Market ${dash(m.marketLogLoss, 3)}</small>
        <span class="metric-delta">${gap(m.logLoss == null || m.marketLogLoss == null ? null : m.logLoss - m.marketLogLoss)}</span>
      </div>
      <div class="metric-tile">
        <span>Outcome accuracy</span>
        <strong>${dashPct(m.accuracy, 1)}</strong>
        <small>Market ${dashPct(m.marketAccuracy, 1)}</small>
        <span class="metric-delta">${m.accuracy == null || m.marketAccuracy == null ? "—" : `${signed(m.accuracy - m.marketAccuracy, 1)} pts vs market`}</span>
      </div>
      <div class="metric-tile">
        <span>Calibration error</span>
        <strong>${dashPct(m.calibration, 1)}</strong>
        <small>Market ${dashPct(m.marketCalibration, 1)}</small>
        <span class="metric-delta">${m.calibration == null || m.marketCalibration == null ? "—" : `${signed(m.calibration - m.marketCalibration, 1)} pts vs market`}</span>
      </div>`;
  }

  function renderBenchmark() {
    const holder = document.getElementById("benchmark-rows");
    if (!holder || !C.metrics || C.metrics.rps == null) return;
    const m = C.metrics;
    const signed = (value, digits) => (value == null ? "—" : `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}`);
    holder.innerHTML = `<div class="benchmark-row"><span>Blend RPS</span><strong>${dash(m.rps, 3)}<em>${m.marketRps == null ? "—" : signed(m.rps - m.marketRps, 3)}</em></strong></div>
      <div class="benchmark-row"><span>Market RPS</span><strong>${dash(m.marketRps, 3)}<em>benchmark</em></strong></div>
      <div class="benchmark-row"><span>Accuracy gap</span><strong>${m.accuracy == null || m.marketAccuracy == null ? "—" : signed(m.accuracy - m.marketAccuracy, 1)}<em>pts</em></strong></div>
      <div class="benchmark-row"><span>Calibration gap</span><strong>${m.calibration == null || m.marketCalibration == null ? "—" : signed(m.calibration - m.marketCalibration, 1)}<em>pts</em></strong></div>`;
  }

  function renderCalibration() {
    const holder = document.getElementById("calibration-chart");
    if (!holder) return;
    if (!C.performance || !C.performance.calibration || !C.performance.calibration.length) {
      holder.innerHTML = '<p class="page-note">Calibration bins are not loaded.</p>';
      return;
    }
    const width = Math.max(280, Math.round(holder.clientWidth || 430));
    const height = Math.round(width * 0.82);
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
    svg += `<path d="${linePath(points)}" fill="none" stroke="var(--chart-blend)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"></path>`;
    points.forEach((point) => {
      svg += `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="4" fill="var(--chart-blend)" stroke="var(--surface)" stroke-width="2" vector-effect="non-scaling-stroke"><title>Predicted ${Math.round(point.predicted * 100)}% · observed ${Math.round(point.observed * 100)}%</title></circle>`;
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

  function renderSampleStrip() {
    const holder = document.querySelector(".sample-strip");
    if (!holder) return;
    const sizeNode = document.getElementById("sample-size");
    const seasonsNode = document.getElementById("sample-seasons");
    const statusNode = document.getElementById("sample-status");
    const seasons = C.performance.seasons;
    const first = seasons.length ? String(seasons[0]) : "—";
    const last = seasons.length ? String(seasons[seasons.length - 1]) : "—";
    const status = C.meta && C.meta.resultsUpdatedAt ? `Real output · results updated ${new Date(C.meta.resultsUpdatedAt).toLocaleDateString("en-GB")}` : "Awaiting pipeline output";
    const heldOut = C.metrics && C.metrics.matches ? C.metrics.matches : null;
    if (sizeNode) sizeNode.innerHTML = `<strong>Sample</strong> ${heldOut ? `${Number(heldOut).toLocaleString("en-GB")} locked-test matches` : "locked-test matches"}`;
    if (seasonsNode) seasonsNode.innerHTML = `<strong>Seasons</strong> ${first} – ${last} · validation + test`;
    if (statusNode) statusNode.innerHTML = `<strong>Status</strong> ${status}`;
  }

  function renderLiveRecord() {
    const holder = document.getElementById("live-tiles");
    if (!holder) return;
    const record = (C.meta && C.meta.liveRecord) || null;
    const tag = document.getElementById("live-tag");
    const note = document.getElementById("live-note");
    const next = C.meta && C.meta.nextMw != null ? C.meta.nextMw : null;

    if (!record || !record.matches) {
      holder.innerHTML = `<div class="metric-tile">
          <span>Settled forecasts</span>
          <strong>0</strong>
          <small>recorded before kick-off</small>
          <span class="metric-delta">starts at Matchweek ${next == null ? "—" : next}</span>
        </div>`;
      if (tag) tag.textContent = "0 matches";
      if (note) {
        note.textContent =
          "Every forecast from Matchweek " +
          (next == null ? "next" : next) +
          " onward is stored before kick-off and scored the moment the result is verified. Until then this section stays empty rather than borrowing the held-out numbers above.";
      }
      return;
    }

    const market = record.market;
    const delta = (value, digits) => (value == null ? "—" : `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}`);
    const tiles = [
      { label: "Ranked probability score", value: dash(record.rps, 3), small: market ? `Market ${dash(market.rps, 3)}` : "Market —", note: market ? `${delta(record.rps - market.rps, 3)} vs market` : "" },
      { label: "Outcome accuracy", value: dashPct(record.accuracy, 1), small: market ? `Market ${dashPct(market.accuracy, 1)}` : "Market —", note: market ? `${delta(record.accuracy - market.accuracy, 1)} pts vs market` : "" },
      { label: "Calibration error", value: dashPct(record.calibration, 1), small: "mean error", note: "" },
      { label: "Exact scoreline", value: record.scorelines ? dashPct(record.scorelines.exact, 1) : "—", small: "most likely scoreline", note: record.scorelines ? `${record.scorelines.matches} matches` : "" }
    ];
    holder.innerHTML = tiles
      .map(
        (tile) => `<div class="metric-tile">
          <span>${tile.label}</span>
          <strong>${tile.value}</strong>
          <small>${tile.small}</small>
          <span class="metric-delta">${tile.note}</span>
        </div>`
      )
      .join("");
    if (tag) tag.textContent = `${record.matches} match${record.matches === 1 ? "" : "es"}`;
    if (note) {
      note.textContent = `Computed from ${record.matches} genuine pre-kickoff forecast${record.matches === 1 ? "" : "s"} recorded in the ledger. The locked held-out record above is unchanged.`;
    }
  }

  function renderSeasonTable() {
    const holder = document.getElementById("season-body");
    if (!holder) return;
    if (!C.performance || !C.performance.seasons || !C.performance.seasons.length) {
      holder.innerHTML = '<tr><td colspan="4">Season detail not loaded.</td></tr>';
      return;
    }
    const blend = C.performance.rps.blend;
    const market = C.performance.rps.market;
    holder.innerHTML = C.performance.seasons
      .map((season, index) => {
        const delta = blend[index] - market[index];
        const label = String(season).startsWith("20") ? String(season) : `20${season}`;
        return `<tr><td>${esc(label)}</td><td>${blend[index].toFixed(3)}</td><td>${market[index].toFixed(3)}</td><td class="delta">${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(3)}</td></tr>`;
      })
      .join("");
  }

  function initPerformance() {
    const holder = document.getElementById("metric-chart");
    if (!holder) return;
    if (!C.performance || !C.performance.seasons || !C.performance.seasons.length) {
      holder.innerHTML = '<p class="page-note">Season metrics are not loaded.</p>';
    }
    const copy = {
      rps: {
        title: "Ranked probability score",
        sub: "Every evaluated season · lower is better",
        note: "Lower is better · validation and locked-test seasons",
        caption: "Source: season metrics export",
        format: (value) => value.toFixed(3),
        area: true
      },
      logloss: {
        title: "Log loss",
        sub: "Every evaluated season · lower is better",
        note: "Lower is better · validation and locked-test seasons",
        caption: "Source: season metrics export",
        format: (value) => value.toFixed(3),
        area: false
      },
      accuracy: {
        title: "Outcome accuracy",
        sub: "Season by season · higher is better",
        note: "Higher is better · validation and locked-test seasons",
        caption: "Source: season metrics export",
        format: (value) => `${value.toFixed(1)}%`,
        area: false
      }
    };
    const tabs = $$("[data-metric]");
    let current = "accuracy";

    function paint() {
      const config = copy[current] || copy.rps;
      const values = C.performance[current];
      const width = Math.max(300, Math.round(holder.clientWidth || 760));
      const compact = width < 520;
      holder.innerHTML = lineChart({
        width,
        height: compact ? 250 : 330,
        margin: compact ? { top: 20, right: 12, bottom: 38, left: 48 } : { top: 24, right: 20, bottom: 42, left: 56 },
        labels: C.performance.seasons,
        series: [
          { label: "Calibra blend", values: values.blend, color: "var(--chart-blend)" },
          { label: "Closing market", values: values.market, color: "var(--chart-market)" }
        ],
        formatY: config.format,
        area: config.area,
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
      setText("chart-caption", config.caption);
      tabs.forEach((tab) => {
        const active = tab.dataset.metric === metric;
        tab.setAttribute("aria-selected", active ? "true" : "false");
        tab.tabIndex = active ? 0 : -1;
      });
      const panel = document.getElementById("metric-chart-panel");
      const activeTab = tabs.filter((tab) => tab.dataset.metric === metric)[0];
      if (panel && activeTab) panel.setAttribute("aria-labelledby", activeTab.id);
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

    renderMetricTiles();
    renderBenchmark();
    render("accuracy");
    observeWidth(holder, paint);
    renderCalibration();
    observeWidth(document.getElementById("calibration-chart"), renderCalibration);
    renderWeakSpots();
    renderSampleStrip();
    renderSeasonTable();
    renderLiveRecord();
    C._perfRender = { tiles: renderMetricTiles, benchmark: renderBenchmark, chart: render, calibration: renderCalibration, weak: renderWeakSpots, season: renderSeasonTable, sample: renderSampleStrip, live: renderLiveRecord };
  }

  initTheme();
  initNavigation();

  const page = document.body.dataset.page;
  if (page === "home") initHome();
  else if (page === "fixtures" || page === "history") initFixtures();
  else if (page === "match") initMatch();
  else if (page === "models") initModels();
  else if (page === "performance") initPerformance();

  // Re-render hook so async live data can refresh painted surfaces.
  C._liveReRender = function () {
    if (page === "home" && C._homeRender) {
      C._homeRender.next();
      C._homeRender.rail();
      C._homeRender.results();
      C._homeRender.standings();
      C._homeRender.form();
      C._homeRender.chart();
    } else if ((page === "fixtures" || page === "history") && C._fixturesRender) {
      C._fixturesRender.render();
    } else if (page === "performance" && C._perfRender) {
      C._perfRender.tiles();
      C._perfRender.benchmark();
      C._perfRender.chart("rps");
      C._perfRender.calibration();
      C._perfRender.weak();
      C._perfRender.season();
      C._perfRender.sample();
    } else if (page === "models" && C.modelsRender) {
      C.modelsRender.matrix();
    } else if (page === "match" && C._matchRender) {
      C._matchRender.run();
    }
  };
})();
