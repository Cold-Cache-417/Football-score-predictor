/* Calibra concept prototype — local illustrative data only.
   No network calls, no project imports, no live model output. */
(function () {
  "use strict";

  const teams = {
    rma: { name: "Real Madrid", code: "RMA", city: "Madrid", stadium: "Santiago Bernabéu", form: "WWWDWW", elo: 1988, pi: 0.82 },
    bar: { name: "Barcelona", code: "BAR", city: "Barcelona", stadium: "Estadi Olímpic", form: "WWDWWW", elo: 1972, pi: 0.80 },
    atm: { name: "Atlético Madrid", code: "ATM", city: "Madrid", stadium: "Metropolitano", form: "WDWWLW", elo: 1915, pi: 0.71 },
    ath: { name: "Athletic Club", code: "ATH", city: "Bilbao", stadium: "San Mamés", form: "WWDLDW", elo: 1862, pi: 0.64 },
    vil: { name: "Villarreal", code: "VIL", city: "Villarreal", stadium: "Estadio de la Cerámica", form: "WDWLWW", elo: 1836, pi: 0.61 },
    bet: { name: "Real Betis", code: "BET", city: "Seville", stadium: "Benito Villamarín", form: "DWWDLW", elo: 1818, pi: 0.57 },
    rso: { name: "Real Sociedad", code: "RSO", city: "San Sebastián", stadium: "Reale Arena", form: "WLDWWW", elo: 1811, pi: 0.56 },
    sev: { name: "Sevilla", code: "SEV", city: "Seville", stadium: "Ramón Sánchez-Pizjuán", form: "LLWDLL", elo: 1748, pi: 0.48 },
    val: { name: "Valencia", code: "VAL", city: "Valencia", stadium: "Mestalla", form: "DWLLWL", elo: 1756, pi: 0.49 },
    gir: { name: "Girona", code: "GIR", city: "Girona", stadium: "Montilivi", form: "LDWLDL", elo: 1779, pi: 0.53 },
    cel: { name: "Celta Vigo", code: "CEL", city: "Vigo", stadium: "Balaídos", form: "WLWDWW", elo: 1770, pi: 0.52 },
    osa: { name: "Osasuna", code: "OSA", city: "Pamplona", stadium: "El Sadar", form: "DLLWDL", elo: 1732, pi: 0.46 },
    mll: { name: "Mallorca", code: "MLL", city: "Palma", stadium: "Son Moix", form: "DDWLWW", elo: 1745, pi: 0.47 },
    ray: { name: "Rayo Vallecano", code: "RAY", city: "Madrid", stadium: "Vallecas", form: "WDLDWW", elo: 1759, pi: 0.50 },
    get: { name: "Getafe", code: "GET", city: "Getafe", stadium: "Coliseum", form: "LDWLDL", elo: 1721, pi: 0.45 },
    ala: { name: "Alavés", code: "ALA", city: "Vitoria-Gasteiz", stadium: "Mendizorroza", form: "WLLDWL", elo: 1710, pi: 0.44 },
    esp: { name: "Espanyol", code: "ESP", city: "Barcelona", stadium: "Stage Front Stadium", form: "DLDWLL", elo: 1708, pi: 0.43 },
    elc: { name: "Elche", code: "ELC", city: "Elche", stadium: "Martínez Valero", form: "WLDLDL", elo: 1694, pi: 0.42 },
    lev: { name: "Levante", code: "LEV", city: "Valencia", stadium: "Ciutat de València", form: "LLDWLL", elo: 1678, pi: 0.40 },
    ovi: { name: "Real Oviedo", code: "OVI", city: "Oviedo", stadium: "Carlos Tartiere", form: "LDLWLL", elo: 1660, pi: 0.38 }
  };

  const fixtures = [
    // Matchweek 13 — upcoming
    { id: "bar-val-20261121", mw: 13, date: "2026-11-21T18:30:00+01:00", home: "bar", away: "val", venue: "Estadi Olímpic", xg: [2.1, 0.9], status: "upcoming" },
    { id: "rma-rso-20261121", mw: 13, date: "2026-11-21T21:00:00+01:00", home: "rma", away: "rso", venue: "Santiago Bernabéu", xg: [1.8, 1.0], status: "upcoming" },
    { id: "ath-sev-20261122", mw: 13, date: "2026-11-22T16:15:00+01:00", home: "ath", away: "sev", venue: "San Mamés", xg: [1.5, 1.0], status: "upcoming" },
    { id: "bet-gir-20261122", mw: 13, date: "2026-11-22T14:00:00+01:00", home: "bet", away: "gir", venue: "Benito Villamarín", xg: [1.4, 1.2], status: "upcoming" },
    { id: "cel-osa-20261122", mw: 13, date: "2026-11-22T18:30:00+01:00", home: "cel", away: "osa", venue: "Balaídos", xg: [1.4, 1.1], status: "upcoming" },
    { id: "atm-vil-20261122", mw: 13, date: "2026-11-22T21:00:00+01:00", home: "atm", away: "vil", venue: "Metropolitano", xg: [1.3, 1.2], status: "upcoming" },
    { id: "mll-ray-20261123", mw: 13, date: "2026-11-23T16:15:00+01:00", home: "mll", away: "ray", venue: "Son Moix", xg: [1.1, 1.1], status: "upcoming" },
    { id: "get-esp-20261123", mw: 13, date: "2026-11-23T14:00:00+01:00", home: "get", away: "esp", venue: "Coliseum", xg: [1.1, 1.0], status: "upcoming" },
    { id: "ala-elc-20261123", mw: 13, date: "2026-11-23T18:30:00+01:00", home: "ala", away: "elc", venue: "Mendizorroza", xg: [1.2, 1.1], status: "upcoming" },
    { id: "lev-ovi-20261123", mw: 13, date: "2026-11-23T21:00:00+01:00", home: "lev", away: "ovi", venue: "Ciutat de València", xg: [1.1, 1.2], status: "upcoming" },

    // Matchweek 14 — upcoming
    { id: "rso-atm-20261128", mw: 14, date: "2026-11-28T18:30:00+01:00", home: "rso", away: "atm", venue: "Reale Arena", xg: [1.0, 1.3], status: "upcoming" },
    { id: "vil-bar-20261128", mw: 14, date: "2026-11-28T21:00:00+01:00", home: "vil", away: "bar", venue: "Estadio de la Cerámica", xg: [1.1, 1.8], status: "upcoming" },
    { id: "sev-rma-20261129", mw: 14, date: "2026-11-29T20:00:00+01:00", home: "sev", away: "rma", venue: "Ramón Sánchez-Pizjuán", xg: [0.9, 1.9], status: "upcoming" },
    { id: "val-ath-20261129", mw: 14, date: "2026-11-29T16:15:00+01:00", home: "val", away: "ath", venue: "Mestalla", xg: [1.1, 1.2], status: "upcoming" },
    { id: "gir-bet-20261130", mw: 14, date: "2026-11-30T14:00:00+01:00", home: "gir", away: "bet", venue: "Montilivi", xg: [1.4, 1.2], status: "upcoming" },

    // Matchweek 12 — sample results
    { id: "rma-gir-20261107", mw: 12, date: "2026-11-07T20:00:00+01:00", home: "rma", away: "gir", venue: "Santiago Bernabéu", xg: [2.0, 1.0], status: "result", score: [3, 1] },
    { id: "bar-sev-20261107", mw: 12, date: "2026-11-07T22:00:00+01:00", home: "bar", away: "sev", venue: "Estadi Olímpic", xg: [2.0, 1.2], status: "result", score: [2, 2] },
    { id: "atm-bet-20261108", mw: 12, date: "2026-11-08T18:30:00+01:00", home: "atm", away: "bet", venue: "Metropolitano", xg: [1.4, 0.9], status: "result", score: [1, 0] },
    { id: "ath-cel-20261108", mw: 12, date: "2026-11-08T16:15:00+01:00", home: "ath", away: "cel", venue: "San Mamés", xg: [1.6, 1.1], status: "result", score: [2, 1] },
    { id: "vil-mll-20261108", mw: 12, date: "2026-11-08T14:00:00+01:00", home: "vil", away: "mll", venue: "Estadio de la Cerámica", xg: [1.5, 1.0], status: "result", score: [1, 1] },
    { id: "val-ray-20261108", mw: 12, date: "2026-11-08T20:30:00+01:00", home: "val", away: "ray", venue: "Mestalla", xg: [1.2, 1.1], status: "result", score: [0, 1] },
    { id: "get-esp-20261109", mw: 12, date: "2026-11-09T20:00:00+01:00", home: "get", away: "esp", venue: "Coliseum", xg: [1.1, 1.0], status: "result", score: [1, 1] },
    { id: "osa-ala-20261109", mw: 12, date: "2026-11-09T18:30:00+01:00", home: "osa", away: "ala", venue: "El Sadar", xg: [1.4, 0.8], status: "result", score: [2, 0] },
    { id: "elc-lev-20261109", mw: 12, date: "2026-11-09T21:00:00+01:00", home: "elc", away: "lev", venue: "Martínez Valero", xg: [1.2, 1.2], status: "result", score: [1, 1] }
  ];

  const metrics = {
    rps: 0.193,
    marketRps: 0.190,
    logLoss: 0.968,
    accuracy: 53.6,
    calibration: 1.8,
    matches: 1140,
    seasons: 17
  };

  const performance = {
    seasons: ["19/20", "20/21", "21/22", "22/23", "23/24", "24/25", "25/26"],
    sampleSize: 1140,
    rps: {
      blend: [0.201, 0.198, 0.196, 0.194, 0.193, 0.192, 0.194],
      market: [0.197, 0.194, 0.192, 0.190, 0.189, 0.188, 0.190]
    },
    logloss: {
      blend: [0.991, 0.982, 0.978, 0.974, 0.968, 0.965, 0.971],
      market: [0.972, 0.963, 0.960, 0.957, 0.954, 0.951, 0.958]
    },
    accuracy: {
      blend: [52.4, 52.9, 53.3, 53.8, 54.1, 54.4, 53.7],
      market: [54.0, 54.4, 54.7, 55.1, 55.4, 55.7, 55.2]
    },
    calibration: [
      { predicted: 0.1, observed: 0.11 },
      { predicted: 0.2, observed: 0.19 },
      { predicted: 0.3, observed: 0.31 },
      { predicted: 0.4, observed: 0.38 },
      { predicted: 0.5, observed: 0.52 },
      { predicted: 0.6, observed: 0.59 },
      { predicted: 0.7, observed: 0.72 },
      { predicted: 0.8, observed: 0.78 },
      { predicted: 0.9, observed: 0.91 }
    ],
    weakSpots: [
      { title: "Early-season draws", body: "With little current-season form, the draw is systematically shaded low by around 2 points in the first four matchweeks." },
      { title: "Promoted sides", body: "Teams without a top-flight baseline carry the widest uncertainty. The model is cautious, but not cautious enough in the first month." },
      { title: "Late lineup news", body: "A pre-match forecast cannot see a late injury. This prototype is honest about that boundary — it is not a live betting tool." }
    ]
  };

  const models = [
    {
      id: "blend",
      name: "Calibra blend",
      tag: "Headline forecast",
      type: "Ensemble",
      inputs: "Dixon–Coles goals + CatBoost features, fixed 60/40 weight",
      rps: 0.193,
      logLoss: 0.968,
      accuracy: 53.6,
      calibration: 1.8,
      summary: "A deliberately simple blend. The goals model supplies the scoreline shape; the boosted model adds form, rest and rating context.",
      strengths: ["Keeps the scoreline distribution coherent", "Smooths the boosted model's sharper edges", "Easy to explain and to challenge"],
      limits: ["Still behind the closing market", "Fixed blend weight is a design choice, not an optimisation", "Cannot react to late team news"]
    },
    {
      id: "dc",
      name: "Dixon–Coles",
      tag: "The baseline",
      type: "Statistical model",
      inputs: "Goals scored and conceded, venue, time decay",
      rps: 0.196,
      logLoss: 0.974,
      accuracy: 52.8,
      calibration: 2.3,
      summary: "The quiet foundation. A low-parameter goals model that produces a full scoreline distribution and rarely overreacts to a short run of form.",
      strengths: ["Transparent, stable and hard to fool", "Produces every scoreline, not just a winner", "A useful floor for model comparison"],
      limits: ["Slow to recognise a changed team", "Ignores injuries, rest and squad depth", "Underconfident on strong favourites"]
    },
    {
      id: "cat",
      name: "CatBoost",
      tag: "The context model",
      type: "Gradient-boosted trees",
      inputs: "Elo, pi-ratings, last-six form, rest days, venue splits",
      rps: 0.195,
      logLoss: 0.971,
      accuracy: 54.1,
      calibration: 2.0,
      summary: "A feature-hungry model that can see the context around a fixture. It is sharper on form and venue effects, and more willing to be wrong.",
      strengths: ["Picks up form and rest asymmetries", "Handles promoted teams natively", "Complements the goals model's blind spots"],
      limits: ["More confident than the evidence warrants", "Harder to interrogate feature by feature", "Sensitive to how form windows are defined"]
    },
    {
      id: "market",
      name: "Closing market",
      tag: "The benchmark",
      type: "De-vigged bookmaker",
      inputs: "Closing home, draw and away prices, margin removed",
      rps: 0.190,
      logLoss: 0.958,
      accuracy: 55.2,
      calibration: 1.3,
      summary: "The number to beat. The market aggregates far more information than any of these models, and it remains the standard this prototype measures against.",
      strengths: ["The strongest calibration in the comparison", "Absorbs team news and market information", "A useful reality check, not an opponent"],
      limits: ["Not a public explanation of its reasoning", "Prices include a margin before de-vigging", "Unavailable for every fixture at the same quality"]
    }
  ];

  const selectedSeasonMetrics = [
    { season: "2023/24", blend: 0.193, market: 0.189, delta: 0.004 },
    { season: "2024/25", blend: 0.192, market: 0.188, delta: 0.004 },
    { season: "2025/26", blend: 0.194, market: 0.190, delta: 0.004 }
  ];

  const dateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short", day: "numeric", month: "short" });
  const longDateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hour12: false });

  function poisson(k, lambda) {
    let fact = 1;
    for (let i = 2; i <= k; i += 1) fact *= i;
    return Math.exp(-lambda) * Math.pow(lambda, k) / fact;
  }

  function scoreGrid(xgHome, xgAway, max = 6) {
    const rows = [];
    let total = 0;
    for (let away = 0; away <= max; away += 1) {
      const row = [];
      for (let home = 0; home <= max; home += 1) {
        const p = poisson(home, xgHome) * poisson(away, xgAway);
        row.push(p);
        total += p;
      }
      rows.push(row);
    }
    return rows.map((row) => row.map((p) => p / total));
  }

  function outcomeFromGrid(grid) {
    let home = 0;
    let draw = 0;
    let away = 0;
    grid.forEach((row, awayGoals) => {
      row.forEach((p, homeGoals) => {
        if (homeGoals > awayGoals) home += p;
        else if (homeGoals === awayGoals) draw += p;
        else away += p;
      });
    });
    const total = home + draw + away;
    return { h: home / total, d: draw / total, a: away / total };
  }

  function topScorelines(grid, count = 6) {
    const items = [];
    grid.forEach((row, away) => {
      row.forEach((p, home) => {
        items.push({ home, away, p });
      });
    });
    items.sort((a, b) => b.p - a.p);
    return items.slice(0, count);
  }

  function getFixture(id) {
    return fixtures.find((fixture) => fixture.id === id) || null;
  }

  function getTeam(slug) {
    return teams[slug] || null;
  }

  function kickoff(date) {
    return timeFmt.format(new Date(date));
  }

  function dateShort(date) {
    return dateFmt.format(new Date(date));
  }

  function dateLong(date) {
    return longDateFmt.format(new Date(date));
  }

  function scoreLabel(fixture) {
    return fixture.status === "result" && fixture.score ? `${fixture.score[0]}–${fixture.score[1]}` : "v";
  }

  function favourite(fixture) {
    const p = fixture.p;
    if (p.h >= p.d && p.h >= p.a) return { key: "H", label: teams[fixture.home].name, value: p.h };
    if (p.a >= p.h && p.a >= p.d) return { key: "A", label: teams[fixture.away].name, value: p.a };
    return { key: "D", label: "Draw", value: p.d };
  }

  function matchRead(fixture) {
    const p = fixture.p;
    const home = teams[fixture.home].name;
    const away = teams[fixture.away].name;
    const favour = p.h >= p.a ? home : away;
    const favP = Math.max(p.h, p.a);
    if (p.d >= 0.285) {
      return `The draw holds ${Math.round(p.d * 100)}% of the mass — unusually high for a fixture with a clear favourite. ${favour} still leads, but the market's middle is doing real work.`;
    }
    if (favP >= 0.55) {
      return `${favour} carries ${Math.round(favP * 100)}% of the forecast. The interesting question is not who leads, but how often the underdog keeps the scoreline close.`;
    }
    return `${favour} has the edge at ${Math.round(favP * 100)}%, but this is a genuinely balanced fixture. The draw and the underdog together account for more than half the distribution.`;
  }

  // Fill in the derived probabilities from the same mock goal expectation
  // that powers the scoreline field, so every screen tells one coherent story.
  fixtures.forEach((fixture) => {
    fixture.grid = scoreGrid(fixture.xg[0], fixture.xg[1]);
    fixture.p = outcomeFromGrid(fixture.grid);
    fixture.top = topScorelines(fixture.grid, 6);
  });

  window.CALIBRA = {
    teams,
    fixtures,
    metrics,
    performance,
    models,
    selectedSeasonMetrics,
    getFixture,
    getTeam,
    scoreGrid,
    outcomeFromGrid,
    topScorelines,
    kickoff,
    dateShort,
    dateLong,
    scoreLabel,
    favourite,
    matchRead
  };
})();
