/* Calibra static reference data: club registry, display helpers and copy.
   Every number shown on the site comes from the server payload
   (window.CALIBRA_BOOTSTRAP / /api/fixtures), never from this file. */
(function () {
  "use strict";

  const league = {
    name: "La Liga",
    shortName: "LALIGA",
    season: "2026/27",
    currentMatchweek: 12,
    nextMatchweek: 13
  };

  const teams = {
    rma: { name: "Real Madrid", code: "RMA", city: "Madrid", stadium: "Santiago Bernabéu", form: "WWWDWW", crest: "assets/crests/real-madrid.webp" },
    bar: { name: "Barcelona", code: "BAR", city: "Barcelona", stadium: "Estadi Olímpic", form: "WWDWWW", crest: "assets/crests/barcelona.webp" },
    atm: { name: "Atlético Madrid", code: "ATM", city: "Madrid", stadium: "Metropolitano", form: "WDWWLW", crest: "assets/crests/atletico-madrid.webp" },
    ath: { name: "Athletic Club", code: "ATH", city: "Bilbao", stadium: "San Mamés", form: "WWDLDW", crest: "assets/crests/athletic-bilbao.webp" },
    vil: { name: "Villarreal", code: "VIL", city: "Villarreal", stadium: "Estadio de la Cerámica", form: "WDWLWW", crest: "assets/crests/villarreal.webp" },
    bet: { name: "Real Betis", code: "BET", city: "Seville", stadium: "Benito Villamarín", form: "DWWDLW", crest: "assets/crests/real-betis.webp" },
    rso: { name: "Real Sociedad", code: "RSO", city: "San Sebastián", stadium: "Reale Arena", form: "WLDWWW", crest: "assets/crests/real-sociedad.webp" },
    sev: { name: "Sevilla", code: "SEV", city: "Seville", stadium: "Ramón Sánchez-Pizjuán", form: "LLWDLL", crest: "assets/crests/sevilla.webp" },
    val: { name: "Valencia", code: "VAL", city: "Valencia", stadium: "Mestalla", form: "DWLLWL", crest: "assets/crests/valencia.webp" },
    mal: { name: "Málaga", code: "MAL", city: "Málaga", stadium: "La Rosaleda", form: "", crest: "assets/crests/malaga.webp" },
    cel: { name: "Celta Vigo", code: "CEL", city: "Vigo", stadium: "Balaídos", form: "WLWDWW", crest: "assets/crests/celta-vigo.webp" },
    rac: { name: "Racing Santander", code: "RAC", city: "Santander", stadium: "El Sardinero", form: "", crest: "assets/crests/racing-santander.webp" },
    dep: { name: "Deportivo La Coruña", code: "DEP", city: "A Coruña", stadium: "Riazor", form: "", crest: "assets/crests/deportivo-la-coruna.webp" },
    osa: { name: "Osasuna", code: "OSA", city: "Pamplona", stadium: "El Sadar", form: "DLLWDL", crest: "assets/crests/osasuna.webp" },
    ray: { name: "Rayo Vallecano", code: "RAY", city: "Madrid", stadium: "Vallecas", form: "WDLDWW", crest: "assets/crests/rayo-vallecano.webp" },
    get: { name: "Getafe", code: "GET", city: "Getafe", stadium: "Coliseum", form: "LDWLDL", crest: "assets/crests/getafe.webp" },
    ala: { name: "Alavés", code: "ALA", city: "Vitoria-Gasteiz", stadium: "Mendizorroza", form: "WLLDWL", crest: "assets/crests/deportivo-alaves.webp" },
    esp: { name: "Espanyol", code: "ESP", city: "Barcelona", stadium: "Stage Front Stadium", form: "DLDWLL", crest: "assets/crests/espanyol.webp" },
    elc: { name: "Elche", code: "ELC", city: "Elche", stadium: "Martínez Valero", form: "WLDLDL", crest: "assets/crests/elche.webp" },
    lev: { name: "Levante", code: "LEV", city: "Valencia", stadium: "Ciutat de València", form: "LLDWLL", crest: "assets/crests/levante.webp" }
  };

  const standings = [];

  const fixtures = [];

  const metrics = {
    rps: null,
    marketRps: null,
    logLoss: null,
    marketLogLoss: null,
    accuracy: null,
    marketAccuracy: null,
    calibration: null,
    matches: null,
    seasons: null
  };

  const performance = {
    seasons: [],
    sampleSize: null,
    rps: { blend: [], market: [] },
    logloss: { blend: [], market: [] },
    accuracy: { blend: [], market: [] },
    calibration: [],
    weakSpots: [
      { title: "Draws in small samples", body: "The middle of the distribution is the hardest to move. A draw forecast is right more often than it feels, and the market holds that edge." },
      { title: "Promoted sides", body: "Teams without a top-flight baseline carry the widest uncertainty; the model leans on league averages until real form exists." },
      { title: "Late lineup news", body: "A pre-match forecast cannot see a late injury or a rotation. This is the boundary of the model, not a gap to paper over." }
    ]
  };

  const models = [
    {
      id: "blend",
      name: "Calibra blend",
      tag: "Headline forecast",
      type: "Ensemble",
      inputs: "Dixon–Coles goals + CatBoost features, fixed 65/35 weight",
      rps: null,
      logLoss: null,
      accuracy: null,
      calibration: null,
      summary: "A deliberately simple blend. The goals model supplies 65% of the scoreline shape; the boosted model adds 35% of context.",
      mix: [
        { label: "Dixon–Coles goals", value: 65, note: "Scoreline shape" },
        { label: "CatBoost context", value: 35, note: "Form, rest, ratings" }
      ],
      strengths: ["Keeps the scoreline distribution coherent", "Smooths the boosted model's sharper edges", "Easy to explain and to challenge"],
      limits: ["Still behind the closing market", "Fixed blend weight is a design choice, not an optimisation", "Cannot react to late team news"]
    },
    {
      id: "dc",
      name: "Dixon–Coles",
      tag: "The baseline",
      type: "Statistical model",
      inputs: "Goals scored and conceded, venue, time decay",
      rps: null,
      logLoss: null,
      accuracy: null,
      calibration: null,
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
      rps: null,
      logLoss: null,
      accuracy: null,
      calibration: null,
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
      rps: null,
      logLoss: null,
      accuracy: null,
      calibration: null,
      summary: "The number to beat. The market aggregates far more information than any of these models, and it remains the standard this prototype measures against.",
      strengths: ["The strongest calibration in the comparison", "Absorbs team news and market information", "A useful reality check, not an opponent"],
      limits: ["Not a public explanation of its reasoning", "Prices include a margin before de-vigging", "Unavailable for every fixture at the same quality"]
    }
  ];

  // Qualitative input map. The project does not export CatBoost feature
  // importances, so no percentage is shown rather than an invented one.
  const featureFamilies = [
    { id: "goals", name: "Scoring & conceding", tone: "home", note: "Goals for and against, home and away splits" },
    { id: "form", name: "Form & rest", tone: "brand", note: "Last six, days between matches, schedule load" },
    { id: "ratings", name: "Team ratings", tone: "away", note: "Elo, pi-ratings and opponent strength" },
    { id: "venue", name: "Venue & context", tone: "draw", note: "Home advantage and travel" },
    { id: "market", name: "Market prior", tone: "market", note: "De-vigged closing line, used as a benchmark only" }
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
    const store = window.CALIBRA && window.CALIBRA.fixtures ? window.CALIBRA.fixtures : fixtures;
    return store.find((fixture) => fixture.id === id) || null;
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
    return (fixture.status === "result" || fixture.status === "live") && fixture.score ? `${fixture.score[0]}–${fixture.score[1]}` : "v";
  }

  /** The archived pre-kickoff model call wins over any market reference. */
  function forecastProbabilities(fixture) {
    return (fixture.archived && fixture.archived.p) || fixture.p || null;
  }

  function favourite(fixture) {
    const p = forecastProbabilities(fixture);
    if (!p) return null;
    if (p.h >= p.d && p.h >= p.a) return { key: "H", label: teams[fixture.home].name, value: p.h };
    if (p.a >= p.h && p.a >= p.d) return { key: "A", label: teams[fixture.away].name, value: p.a };
    return { key: "D", label: "Draw", value: p.d };
  }

  function matchRead(fixture) {
    const p = forecastProbabilities(fixture);
    if (!p) return "No pre-match forecast is archived for this fixture. The final score is shown without a model call.";
    const home = teams[fixture.home].name;
    const away = teams[fixture.away].name;
    const favour = p.h >= p.a ? home : away;
    const favP = Math.max(p.h, p.a);
    if (p.d >= 0.285) {
      return `The draw holds ${Math.round(p.d * 100)}% of the mass — unusually high for a fixture with a clear favourite. ${favour} still leads, but the middle is doing real work.`;
    }
    if (favP >= 0.55) {
      return `${favour} carries ${Math.round(favP * 100)}% of the forecast. The interesting question is not who leads, but how often the underdog keeps the scoreline close.`;
    }
    return `${favour} has the edge at ${Math.round(favP * 100)}%, but this is a genuinely balanced fixture. The draw and the underdog together account for more than half the distribution.`;
  }

  window.CALIBRA = {
    league,
    teams,
    standings,
    fixtures,
    metrics,
    performance,
    models,
    featureFamilies,
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
    matchRead,
    forecastProbabilities
  };
})();
