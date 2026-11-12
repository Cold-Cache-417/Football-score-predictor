#!/usr/bin/env node
/**
 * Pattern report over settled forecasts. Insights only — it changes nothing.
 *
 *   node scripts/learning_report.mjs [--season 2026/27]
 *
 * Answers the questions the ledger exists for: is the model biased towards the
 * home side, does it break down in high-scoring games, does it drift within a
 * season, which clubs does it over- or under-rate? Writes:
 *   reports/live_learning.json   (machine readable)
 *   reports/live_learning.md     (short human summary)
 */
import fs from "node:fs";
import path from "node:path";

import { buildEvaluations, openLedger, summarise } from "../server/lib/db.mjs";
import { ROOT } from "../server/lib/data.mjs";

const args = process.argv.slice(2);
const seasonIndex = args.indexOf("--season");
const season = seasonIndex > -1 ? args[seasonIndex + 1] : "2026/27";

const db = openLedger(path.join(ROOT, "data/calibra.db"));
const evaluations = buildEvaluations(db, { season });
const record = summarise(evaluations);

const mean = (values) => {
  const usable = values.filter((value) => Number.isFinite(value));
  return usable.length ? usable.reduce((a, b) => a + b, 0) / usable.length : null;
};

function buckets(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (key == null) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      matches: group.length,
      rps: mean(group.map((row) => row.rps)),
      accuracy: (group.filter((row) => row.correct).length / group.length) * 100,
      meanProbabilityOnActual: mean(group.map((row) => row.probabilities[row.outcome]))
    }))
    .sort((a, b) => String(a.key).localeCompare(String(b.key), "en", { numeric: true }));
}

const settled = evaluations.filter((row) => !row.late);

const report = {
  season,
  generatedAt: new Date().toISOString(),
  sample: settled.length,
  record,
  calibration: {
    meanProbabilityOnActual: mean(settled.map((row) => row.probabilities[row.outcome])),
    meanProbabilityOnHome: mean(settled.map((row) => row.probabilities[0])),
    actualHomeRate: settled.length ? (settled.filter((row) => row.outcome === 0).length / settled.length) * 100 : null,
    actualDrawRate: settled.length ? (settled.filter((row) => row.outcome === 1).length / settled.length) * 100 : null,
    actualAwayRate: settled.length ? (settled.filter((row) => row.outcome === 2).length / settled.length) * 100 : null
  },
  goals: buckets(settled, (row) => {
    const total = row.score[0] + row.score[1];
    if (total <= 1) return "0-1 goals";
    if (total <= 3) return "2-3 goals";
    return "4+ goals";
  }),
  confidence: buckets(settled, (row) => {
    const max = Math.max(...row.probabilities);
    if (max < 0.4) return "no favourite (<40%)";
    if (max < 0.55) return "lean (40-55%)";
    return "clear favourite (55%+)";
  }),
  matchweeks: buckets(settled, (row) => row.matchweek),
  teams: Object.entries(
    settled.reduce((acc, row) => {
      for (const [index, team] of [row.home, row.away].entries()) {
        const target = index === 0 ? 0 : 2;
        acc[team] = acc[team] || { matches: 0, predicted: [], hits: 0, results: [] };
        acc[team].matches += 1;
        acc[team].predicted.push(row.probabilities[target]);
        acc[team].results.push(row.outcome === target ? 1 : 0);
      }
      return acc;
    }, {})
  )
    .map(([team, data]) => ({
      team,
      matches: data.matches,
      meanPredictedWinRate: mean(data.predicted) * 100,
      actualWinRate: (data.results.reduce((a, b) => a + b, 0) / data.results.length) * 100
    }))
    .map((row) => ({ ...row, bias: row.actualWinRate - row.meanPredictedWinRate }))
    .sort((a, b) => Math.abs(b.bias) - Math.abs(a.bias))
    .slice(0, 6),
  insights: []
};

// Plain-language findings, only when the sample supports them.
if (settled.length >= 20) {
  if (report.calibration.actualHomeRate - report.calibration.meanProbabilityOnHome > 4) {
    report.insights.push("The model is under-rating home advantage on this sample.");
  }
  if (report.calibration.meanProbabilityOnHome - report.calibration.actualHomeRate > 4) {
    report.insights.push("The model is over-rating home advantage on this sample.");
  }
  const worst = report.confidence.find((bucket) => bucket.matches >= 8 && bucket.key.startsWith("clear"));
  if (worst && worst.meanProbabilityOnActual < 55) {
    report.insights.push("Clear favourites are not winning as often as their price implies.");
  }
  const highScoring = report.goals.find((bucket) => bucket.key === "4+ goals");
  if (highScoring && highScoring.matches >= 8 && highScoring.rps > (record.rps || 0) * 1.15) {
    report.insights.push("High-scoring matches are materially harder for the model than the average.");
  }
}

fs.mkdirSync(path.join(ROOT, "reports"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "reports/live_learning.json"), JSON.stringify(report, null, 2));

const fmt = (value, digits = 3) => (value == null ? "—" : Number(value).toFixed(digits));
const lines = [
  `# Live learning report — ${season}`,
  "",
  `Generated ${report.generatedAt}. Sample: ${report.sample} settled forecasts (late forecasts excluded).`,
  "",
  record.matches
    ? `RPS ${fmt(record.rps)} · accuracy ${fmt(record.accuracy, 1)}% · log loss ${fmt(record.logLoss)} · calibration ${fmt(record.calibration, 1)}%`
    : "No settled forecasts yet. The ledger starts with the next recorded matchweek; this report is the scaffolding that fills as results are verified.",
  "",
  "## Calibration",
  "",
  `- Mean probability on the actual outcome: ${fmt(report.calibration.meanProbabilityOnActual)}`,
  `- Mean home probability: ${fmt(report.calibration.meanProbabilityOnHome)} · actual home rate: ${fmt(report.calibration.actualHomeRate, 1)}%`,
  `- Actual draw rate: ${fmt(report.calibration.actualDrawRate, 1)}% · actual away rate: ${fmt(report.calibration.actualAwayRate, 1)}%`,
  "",
  "## By total goals",
  "",
  "| bucket | matches | RPS | accuracy |",
  "| --- | --- | --- | --- |",
  ...report.goals.map((row) => `| ${row.key} | ${row.matches} | ${fmt(row.rps)} | ${fmt(row.accuracy, 1)}% |`),
  "",
  "## By confidence",
  "",
  "| bucket | matches | RPS | accuracy |",
  "| --- | --- | --- | --- |",
  ...report.confidence.map((row) => `| ${row.key} | ${row.matches} | ${fmt(row.rps)} | ${fmt(row.accuracy, 1)}% |`),
  "",
  "## Findings",
  "",
  ...(report.insights.length ? report.insights.map((line) => `- ${line}`) : ["- Nothing to report yet at this sample size."]),
  "",
  "Insights only. Nothing here retrains, re-tunes or re-prices the model; any change goes through the approval cycle."
];
fs.writeFileSync(path.join(ROOT, "reports/live_learning.md"), `${lines.join("\n")}\n`);

console.log(`live learning report: ${report.sample} settled forecasts → reports/live_learning.md`);
db.close();
