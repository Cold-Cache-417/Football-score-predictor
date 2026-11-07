"""Pre-match feature construction.

Everything is produced in ONE chronological pass: for every match row we
emit features from the current system state (ratings, form, rest) and
only AFTER emitting do we feed that match's result into the state. So a
row's features can never depend on the row's own outcome or anything
later — verified by unit tests.

Feature list (outcome order H, D, A maintained throughout):
    elo_home/away, elo_exp_home, elo_diff    (penaltyblog Elo)
    pi_home/away, pi_diff                    (Constantinou pi-ratings)
    form_h/a_pts6, form_h/a_gf6, form_h/a_ga6   (last-6 overall form)
    form_h_home6, form_a_away6               (last-6 venue-specific pts rate)
    rest_h, rest_a                           (days since last match, capped)
    matches_h, matches_a                     (career matches; 0 => brand new)
    home_promoted, away_promoted             (not in the previous season's
                                              first division; NaN for the
                                              first data season)

Promoted/unknown teams: form and rest are NaN (both boosted frameworks
accept NaN), ratings start at the system's neutral value, and the flags
make the situation explicit to the tree models.

Optional xG: if an xG-joined matches table is provided (see
src/understat.py, currently unusable while understat.com is offline),
rolling xG columns are appended and this is the only place they exist.
"""

from __future__ import annotations

from collections import deque

import numpy as np
import pandas as pd
import penaltyblog as pb

FORM_WINDOW = 6
REST_CAP = 30

FEATURE_COLS = [
    "elo_home", "elo_away", "elo_exp_home", "elo_diff",
    "pi_home", "pi_away", "pi_diff",
    "form_h_pts6", "form_h_gf6", "form_h_ga6",
    "form_a_pts6", "form_a_gf6", "form_a_ga6",
    "form_h_home6", "form_a_away6",
    "rest_h", "rest_a", "matches_h", "matches_a",
    "home_promoted", "away_promoted",
]
CAT_COLS = ["home", "away"]
XG_COLS = ["xg_form_h", "xg_form_a", "xga_form_h", "xga_form_a"]  # optional


def _season_start_year(season: str) -> int:
    return int(season.split("/")[0])


def build_features(matches: pd.DataFrame) -> pd.DataFrame:
    """matches (any order; sorted internally by date) -> rows en provenance
    of the input with FEATURE_COLS (and optional xG cols) added."""
    matches = matches.sort_values("date", kind="stable").reset_index(drop=True)
    has_xg = "xgf_home" in matches.columns

    elo = pb.ratings.Elo(k=20.0, home_field_advantage=100.0)
    pi = pb.ratings.PiRatingSystem()

    season_teams: dict[str, set[str]] = {}   # season label -> teams that played
    season_team_sets: dict[str, set[str]] = {}  # season -> teams that played
    n_games: dict[str, int] = {}
    last_date: dict[str, pd.Timestamp] = {}
    history: dict[str, deque] = {}           # (date, pts, gf, ga, venue)
    xg_history: dict[str, deque] = {}        # (date, xgf, xga)

    def form_stats(team: str, venue: str | None = None):
        games = history.get(team, deque())
        if venue is not None:
            games = deque(g for g in games if g[4] == venue)
        recent = list(games)[-FORM_WINDOW:]
        if len(recent) < FORM_WINDOW:
            return np.nan, np.nan, np.nan
        return (
            np.mean([g[1] for g in recent]),
            np.mean([g[2] for g in recent]),
            np.mean([g[3] for g in recent]),
        )

    def rolling_xg(team: str):
        recent = list(xg_history.get(team, deque()))[-FORM_WINDOW:]
        if len(recent) < FORM_WINDOW:
            return np.nan, np.nan
        return (np.mean([g[1] for g in recent]),
                np.mean([g[2] for g in recent]))

    rows = []
    current_season = None
    for row in matches.itertuples(index=False):
        home, away = row.home, row.away
        played = not pd.isna(getattr(row, "result", np.nan))

        # promoted flags: not in the previous season's team set; NaN for
        # the very first data season where there is no previous season.
        if current_season is None or row.season != current_season:
            current_season = row.season
            season_team_sets.setdefault(current_season, set()).update((home, away))

        prev_season = f"{_season_start_year(current_season) - 1}/" \
                      f"{_season_start_year(current_season) % 100:02d}"
        prev_teams = season_team_sets.get(prev_season)
        if prev_teams is None:
            home_prom = away_prom = np.nan
        else:
            home_prom = float(home not in prev_teams)
            away_prom = float(away not in prev_teams)

        elo_home = elo.get_team_rating(home)
        elo_away = elo.get_team_rating(away)
        pi_home = pi.team_ratings.get(home, {"home": 0.0, "away": 0.0})["home"]
        pi_away = pi.team_ratings.get(away, {"home": 0.0, "away": 0.0})["away"]

        pts_h, gf_h, ga_h = form_stats(home)
        pts_a, gf_a, ga_a = form_stats(away)
        home_pts_venue = form_stats(home, venue="home")[0]
        away_pts_venue = form_stats(away, venue="away")[0]

        rest_h = min((row.date - last_date[home]).days, REST_CAP) \
            if home in last_date else np.nan
        rest_a = min((row.date - last_date[away]).days, REST_CAP) \
            if away in last_date else np.nan

        feats = {
            "elo_home": elo_home, "elo_away": elo_away,
            "elo_exp_home": elo.home_win_probability(home, away),
            "elo_diff": elo_home - elo_away,
            "pi_home": pi_home, "pi_away": pi_away, "pi_diff": pi_home - pi_away,
            "form_h_pts6": pts_h, "form_h_gf6": gf_h, "form_h_ga6": ga_h,
            "form_a_pts6": pts_a, "form_a_gf6": gf_a, "form_a_ga6": ga_a,
            "form_h_home6": home_pts_venue, "form_a_away6": away_pts_venue,
            "rest_h": rest_h, "rest_a": rest_a,
            "matches_h": n_games.get(home, 0), "matches_a": n_games.get(away, 0),
            "home_promoted": home_prom, "away_promoted": away_prom,
        }
        if has_xg:
            # xG of home team = xG it produced and conceded; same for away
            xf_h, xa_h = rolling_xg(home)
            xf_a, xa_a = rolling_xg(away)
            feats.update({
                "xg_form_h": xf_h, "xg_form_a": xf_a,
                "xga_form_h": xa_h, "xga_form_a": xa_a,
            })
        rows.append(feats)

        if not played:
            continue  # unplayed fixture: features emitted, state untouched

        # ---- update state with THIS match (after emitting) --------------
        points_h = 3.0 if row.result == 0 else (1.0 if row.result == 1 else 0.0)
        history.setdefault(home, deque()).append(
            (row.date, points_h, row.fthg, row.ftag, "home"))
        history.setdefault(away, deque()).append(
            (row.date, 3.0 - points_h, row.ftag, row.fthg, "away"))
        elo.update_ratings(home, away, int(row.result))
        pi.update_ratings(home, away, row.fthg - row.ftag)
        n_games[home] = n_games.get(home, 0) + 1
        n_games[away] = n_games.get(away, 0) + 1
        last_date[home] = row.date
        last_date[away] = row.date
        season_team_sets[current_season].update((home, away))
        if has_xg:
            xg_history.setdefault(home, deque()).append(
                (row.date, row.xgf_home, row.xga_home))
            xg_history.setdefault(away, deque()).append(
                (row.date, row.xgf_away, row.xga_away))

    feature_df = pd.DataFrame(rows, index=matches.index)
    return pd.concat([matches, feature_df], axis=1)
