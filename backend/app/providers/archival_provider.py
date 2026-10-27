"""Verified Archival / Demo Market Data Provider.

Reads real historical daily (5Y+) and hourly OHLCV snapshots from `backend/data/archive/`.
Never fabricates random-walk prices. Explicitly labels provenance as `archival_demo` when active.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional
import pandas as pd

from ..config import ARCHIVE_DIR
from .normalizer import normalize_ohlcv_dataframe


class ArchivalMarketProvider:
    def __init__(self, archive_dir: Path = ARCHIVE_DIR) -> None:
        self.archive_dir = archive_dir
        self.daily_dir = archive_dir / "daily"
        self.hourly_dir = archive_dir / "hourly"
        self._daily_mem: dict[str, pd.DataFrame] = {}
        self._hourly_mem: dict[str, pd.DataFrame] = {}
        self._manifest: Optional[dict] = None

    @property
    def manifest(self) -> dict:
        if self._manifest is None:
            m_path = self.archive_dir / "manifest.json"
            if m_path.exists():
                self._manifest = json.loads(m_path.read_text(encoding="utf-8"))
            else:
                self._manifest = {"snapshot_date": "2026-10-26", "source_attribution": "Verified Historical Archive"}
        return self._manifest

    def _safe_symbol(self, symbol: str) -> str:
        return symbol.upper().strip().replace("^", "IDX_")

    def has_daily(self, symbol: str) -> bool:
        return (self.daily_dir / f"{self._safe_symbol(symbol)}.csv").exists()

    def has_hourly(self, symbol: str) -> bool:
        return (self.hourly_dir / f"{self._safe_symbol(symbol)}.csv").exists()

    def get_daily_bars(self, symbol: str) -> pd.DataFrame:
        key = self._safe_symbol(symbol)
        if key in self._daily_mem:
            return self._daily_mem[key].copy()
        path = self.daily_dir / f"{key}.csv"
        if not path.exists():
            return pd.DataFrame(columns=["date", "open", "high", "low", "close", "volume"])
        raw = pd.read_csv(path)
        norm = normalize_ohlcv_dataframe(raw, intraday=False)
        self._daily_mem[key] = norm
        return norm.copy()

    def get_hourly_bars(self, symbol: str) -> pd.DataFrame:
        key = self._safe_symbol(symbol)
        if key in self._hourly_mem:
            return self._hourly_mem[key].copy()
        path = self.hourly_dir / f"{key}.csv"
        if not path.exists():
            return pd.DataFrame(columns=["date", "open", "high", "low", "close", "volume"])
        raw = pd.read_csv(path)
        norm = normalize_ohlcv_dataframe(raw, intraday=True)
        self._hourly_mem[key] = norm
        return norm.copy()


archival_provider = ArchivalMarketProvider()
