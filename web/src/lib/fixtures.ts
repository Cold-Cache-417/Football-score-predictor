import { readFileSync } from "fs";

const DATA_WEBSITE = "/Users/luqmankhan/Projects/Football-score-predictor/data/website";
const UPCOMING_PREDICTIONS = `${DATA_WEBSITE}/upcoming_predictions.csv`;

export type UpcomingFixture = {
  season: string;
  date: string;
  home: string;
  away: string;
  p_dc_h: number;
  p_dc_d: number;
  p_dc_a: number;
  p_cat_h: number;
  p_cat_d: number;
  p_cat_a: number;
  p_blend_h: number;
  p_blend_d: number;
  p_blend_a: number;
  top_home_goals: number;
  top_away_goals: number;
  top_prob: number;
  prediction_type: string;
  grid?: any[];
};

function toNum(value: string | undefined, fallback = 0): number {
  const n = typeof value === "string" ? parseFloat(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export function readUpcomingPredictions(): UpcomingFixture[] {
  try {
    const raw = readFileSync(UPCOMING_PREDICTIONS, "utf8");
    const lines = raw.trim().split("\n");
    const header = lines[0].split(",");
    const rows: UpcomingFixture[] = [];
    for (const line of lines.slice(1)) {
      const cells = line.split(",");
      const row: Record<string, string> = {};
      header.forEach((h, i) => {
        row[h] = cells[i] ?? "";
      });
      rows.push({
        season: row.season ?? "",
        date: row.date ?? "",
        home: row.home ?? "",
        away: row.away ?? "",
        p_dc_h: toNum(row.p_dc_h),
        p_dc_d: toNum(row.p_dc_d),
        p_dc_a: toNum(row.p_dc_a),
        p_cat_h: toNum(row.p_cat_h),
        p_cat_d: toNum(row.p_cat_d),
        p_cat_a: toNum(row.p_cat_a),
        p_blend_h: toNum(row.p_blend_h),
        p_blend_d: toNum(row.p_blend_d),
        p_blend_a: toNum(row.p_blend_a),
        top_home_goals: toNum(row.top_home_goals),
        top_away_goals: toNum(row.top_away_goals),
        top_prob: toNum(row.top_prob),
        prediction_type: row.prediction_type ?? "",
      });
    }
    return rows;
  } catch (e) {
    console.error("Error reading upcoming_predictions.csv:", e);
    return [];
  }
}

export function nextUpcomingFixture(): UpcomingFixture | null {
  const rows = readUpcomingPredictions()
    .filter((r) => (r.prediction_type || "") === "live_forward")
    .filter((r) => r.p_blend_h > 0 && r.p_blend_d > 0 && r.p_blend_a > 0);

  if (rows.length === 0) return null;

  return rows.reduce((best, r) => {
    const bestDate = (() => {
      const d = new Date(best.date);
      if (isNaN(d.getTime())) return new Date("9999-12-31");
      return d;
    })();
    const rDate = (() => {
      const d = new Date(r.date);
      if (isNaN(d.getTime())) return new Date("9999-12-31");
      return d;
    })();
    return rDate < bestDate ? r : best;
  });
}
