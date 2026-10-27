"""SQLite persistence for Watchlist management and Forecast Tracking Ledger."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import sqlite3
from typing import Optional
import pandas as pd

from ..config import DB_PATH
from ..evaluation.backtest import HORIZON_SPECS
from ..providers.catalog import INSTRUMENTS
from ..schemas import HorizonCode, HorizonForecast, TrackedForecastRecord


class TrackingStore:
    def __init__(self, db_path: Path = DB_PATH) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS watchlist (
                    ticker TEXT PRIMARY KEY,
                    position INTEGER NOT NULL,
                    preferred_horizon TEXT NOT NULL DEFAULT '5d',
                    added_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS forecast_ledger (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    ticker TEXT NOT NULL,
                    source_price REAL NOT NULL,
                    source_date TEXT NOT NULL,
                    horizon_code TEXT NOT NULL,
                    horizon_days INTEGER NOT NULL,
                    target_date TEXT NOT NULL,
                    predicted_direction TEXT NOT NULL,
                    expected_return_pct REAL NOT NULL,
                    range_68_low REAL NOT NULL,
                    range_68_high REAL NOT NULL,
                    prob_higher REAL,
                    model_version TEXT NOT NULL,
                    record_origin TEXT NOT NULL DEFAULT 'live_user',
                    realized_price REAL,
                    realized_date TEXT,
                    realized_return_pct REAL,
                    UNIQUE(ticker, source_date, horizon_code, record_origin)
                );
                """
            )
            cur = conn.execute("SELECT COUNT(*) AS cnt FROM watchlist")
            if cur.fetchone()["cnt"] == 0:
                now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                defaults = [
                    ("NVDA", 0, "5d", now_iso),
                    ("AAPL", 1, "5d", now_iso),
                    ("MSFT", 2, "5d", now_iso),
                    ("GOOGL", 3, "21d", now_iso),
                    ("AMZN", 4, "5d", now_iso),
                    ("TSLA", 5, "5d", now_iso),
                ]
                conn.executemany(
                    "INSERT INTO watchlist(ticker, position, preferred_horizon, added_at) VALUES (?, ?, ?, ?)",
                    defaults,
                )
            conn.commit()

    # --- Watchlist Operations ---
    def list_watchlist_entries(self) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT ticker, position, preferred_horizon, added_at FROM watchlist ORDER BY position ASC, ticker ASC"
            ).fetchall()
            return [dict(r) for r in rows]

    def add_or_update_watchlist(self, ticker: str, preferred_horizon: HorizonCode = "5d") -> None:
        sym = ticker.upper().strip()
        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        with self._connect() as conn:
            existing = conn.execute("SELECT position FROM watchlist WHERE ticker = ?", (sym,)).fetchone()
            if existing:
                conn.execute(
                    "UPDATE watchlist SET preferred_horizon = ? WHERE ticker = ?",
                    (preferred_horizon, sym),
                )
            else:
                max_pos_row = conn.execute("SELECT COALESCE(MAX(position), -1) AS mp FROM watchlist").fetchone()
                next_pos = int(max_pos_row["mp"]) + 1
                conn.execute(
                    "INSERT INTO watchlist(ticker, position, preferred_horizon, added_at) VALUES (?, ?, ?, ?)",
                    (sym, next_pos, preferred_horizon, now_iso),
                )
            conn.commit()

    def remove_watchlist(self, ticker: str) -> bool:
        sym = ticker.upper().strip()
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM watchlist WHERE ticker = ?", (sym,))
            conn.commit()
            return cur.rowcount > 0

    def reorder_watchlist(self, ordered_tickers: list[str]) -> None:
        cleaned = [t.upper().strip() for t in ordered_tickers]
        with self._connect() as conn:
            for idx, sym in enumerate(cleaned):
                conn.execute("UPDATE watchlist SET position = ? WHERE ticker = ?", (idx, sym))
            conn.commit()

    # --- Forecast Ledger Operations ---
    def record_live_forecast(self, forecast: HorizonForecast) -> int:
        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO forecast_ledger (
                    created_at, ticker, source_price, source_date, horizon_code, horizon_days,
                    target_date, predicted_direction, expected_return_pct, range_68_low,
                    range_68_high, prob_higher, model_version, record_origin
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'live_user')
                ON CONFLICT(ticker, source_date, horizon_code, record_origin) DO UPDATE SET
                    created_at = excluded.created_at,
                    expected_return_pct = excluded.expected_return_pct,
                    predicted_direction = excluded.predicted_direction,
                    range_68_low = excluded.range_68_low,
                    range_68_high = excluded.range_68_high,
                    prob_higher = excluded.prob_higher,
                    model_version = excluded.model_version
                """,
                (
                    now_iso,
                    forecast.ticker,
                    forecast.starting_price,
                    forecast.starting_date,
                    forecast.horizon_code,
                    forecast.horizon_trading_days,
                    forecast.target_date,
                    forecast.direction,
                    forecast.expected_return_pct,
                    forecast.range_68_low,
                    forecast.range_68_high,
                    forecast.prob_higher,
                    forecast.model_version,
                ),
            )
            conn.commit()
            row = conn.execute(
                "SELECT id FROM forecast_ledger WHERE ticker = ? AND source_date = ? AND horizon_code = ? AND record_origin = 'live_user'",
                (forecast.ticker, forecast.starting_date, forecast.horizon_code),
            ).fetchone()
            return int(row["id"]) if row else 0

    def sync_walk_forward_audit_points(
        self,
        ticker: str,
        horizon_code: HorizonCode,
        model_version: str,
        audit_points: list[dict],
    ) -> None:
        """Persists recent chronological walk-forward predictions alongside realized prices for auditability."""
        _, h = HORIZON_SPECS[horizon_code]
        with self._connect() as conn:
            for pt in audit_points[-8:]:
                src_p = float(pt["source_price"])
                pred_ret = float(pt["predicted_return_pct"])
                real_p = float(pt["realized_price"])
                real_ret = float(pt["realized_return_pct"])
                lo_p = round(src_p * (1.0 + float(pt["range_68_low_pct"]) / 100.0), 2)
                hi_p = round(src_p * (1.0 + float(pt["range_68_high_pct"]) / 100.0), 2)
                direction = "upside" if pred_ret >= 0.2 else ("downside" if pred_ret <= -0.2 else "mixed")
                conn.execute(
                    """
                    INSERT INTO forecast_ledger (
                        created_at, ticker, source_price, source_date, horizon_code, horizon_days,
                        target_date, predicted_direction, expected_return_pct, range_68_low,
                        range_68_high, prob_higher, model_version, record_origin,
                        realized_price, realized_date, realized_return_pct
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'walk_forward_audit', ?, ?, ?)
                    ON CONFLICT(ticker, source_date, horizon_code, record_origin) DO NOTHING
                    """,
                    (
                        f"{pt['origin_date']}T20:00:00Z",
                        ticker,
                        src_p,
                        pt["origin_date"],
                        horizon_code,
                        h,
                        pt["target_date"],
                        direction,
                        pred_ret,
                        lo_p,
                        hi_p,
                        None,
                        model_version,
                        real_p,
                        pt["target_date"],
                        real_ret,
                    ),
                )
            conn.commit()

    def resolve_pending_outcomes(self, ticker: str, daily_df: pd.DataFrame) -> int:
        """Resolves pending forecasts once market candles reach or pass `target_date`."""
        if daily_df.empty:
            return 0
        sym = ticker.upper().strip()
        latest_bar_dt = str(daily_df["date"].iloc[-1])[:10]
        updated = 0
        with self._connect() as conn:
            pending = conn.execute(
                """
                SELECT id, source_price, target_date
                FROM forecast_ledger
                WHERE ticker = ? AND realized_price IS NULL AND target_date <= ?
                """,
                (sym, latest_bar_dt),
            ).fetchall()
            for row in pending:
                eligible = daily_df[daily_df["date"].str.slice(0, 10) >= row["target_date"]]
                if eligible.empty:
                    continue
                first_hit = eligible.iloc[0]
                r_price = round(float(first_hit["close"]), 2)
                r_date = str(first_hit["date"])[:10]
                src_p = float(row["source_price"])
                r_ret = round((r_price / src_p - 1.0) * 100.0, 2)
                conn.execute(
                    """
                    UPDATE forecast_ledger
                    SET realized_price = ?, realized_date = ?, realized_return_pct = ?
                    WHERE id = ?
                    """,
                    (r_price, r_date, r_ret, int(row["id"])),
                )
                updated += 1
            if updated:
                conn.commit()
        return updated

    def list_tracked_forecasts(
        self,
        ticker: Optional[str] = None,
        record_origin: Optional[str] = None,
        limit: int = 80,
    ) -> list[TrackedForecastRecord]:
        clauses: list[str] = []
        params: list[object] = []
        if ticker:
            clauses.append("ticker = ?")
            params.append(ticker.upper().strip())
        if record_origin in ("live_user", "walk_forward_audit"):
            clauses.append("record_origin = ?")
            params.append(record_origin)

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        sql = f"""
            SELECT * FROM forecast_ledger
            {where_sql}
            ORDER BY CASE WHEN record_origin = 'live_user' THEN 0 ELSE 1 END, source_date DESC, id DESC
            LIMIT ?
        """
        params.append(limit)

        out: list[TrackedForecastRecord] = []
        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
            for r in rows:
                h_code: HorizonCode = r["horizon_code"]
                h_label = HORIZON_SPECS.get(h_code, (h_code, int(r["horizon_days"])))[0]
                comp_name = INSTRUMENTS.get(r["ticker"], {}).get("name", r["ticker"])
                real_p = r["realized_price"]
                real_ret = r["realized_return_pct"]
                exp_ret = float(r["expected_return_pct"])

                if real_p is not None and real_ret is not None:
                    status = "realized"
                    dir_hit = (exp_ret >= 0 and float(real_ret) >= 0) or (exp_ret < 0 and float(real_ret) < 0)
                    in_68 = float(r["range_68_low"]) <= float(real_p) <= float(r["range_68_high"])
                    abs_err = round(abs(float(real_ret) - exp_ret), 2)
                else:
                    status = "pending"
                    dir_hit = None
                    in_68 = None
                    abs_err = None

                out.append(
                    TrackedForecastRecord(
                        id=int(r["id"]),
                        created_at=r["created_at"],
                        ticker=r["ticker"],
                        company_name=comp_name,
                        source_price=round(float(r["source_price"]), 2),
                        source_date=r["source_date"],
                        horizon_code=h_code,
                        horizon_label=h_label,
                        horizon_days=int(r["horizon_days"]),
                        target_date=r["target_date"],
                        predicted_direction=r["predicted_direction"],
                        expected_return_pct=round(exp_ret, 2),
                        range_68_low=round(float(r["range_68_low"]), 2),
                        range_68_high=round(float(r["range_68_high"]), 2),
                        prob_higher=round(float(r["prob_higher"]), 1) if r["prob_higher"] is not None else None,
                        model_version=r["model_version"],
                        record_origin=r["record_origin"],
                        outcome_status=status,  # type: ignore[arg-type]
                        realized_price=round(float(real_p), 2) if real_p is not None else None,
                        realized_date=r["realized_date"],
                        realized_return_pct=round(float(real_ret), 2) if real_ret is not None else None,
                        directional_hit=dir_hit,
                        within_68_range=in_68,
                        abs_error_pct=abs_err,
                    )
                )
        return out


tracking_store = TrackingStore()
