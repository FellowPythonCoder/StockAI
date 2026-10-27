"""Server-side configuration and environment management.

All provider API keys stay strictly on the server and are never serialized to clients.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
ARCHIVE_DIR = DATA_DIR / "archive"
DB_PATH = Path(os.environ.get("MARKET_SIGNAL_DB_PATH", str(DATA_DIR / "market_signal.db")))


@dataclass
class Settings:
    finnhub_api_key: str = ""
    alphavantage_api_key: str = ""
    twelvedata_api_key: str = ""
    enable_yahoo_live: bool = True
    quote_cache_ttl_seconds: int = 60
    candle_cache_ttl_seconds: int = 300
    request_timeout_seconds: float = 6.0

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            finnhub_api_key=os.environ.get("FINNHUB_API_KEY", "").strip(),
            alphavantage_api_key=os.environ.get("ALPHAVANTAGE_API_KEY", "").strip(),
            twelvedata_api_key=os.environ.get("TWELVEDATA_API_KEY", "").strip(),
            enable_yahoo_live=os.environ.get("ENABLE_YAHOO_LIVE", "true").lower() not in ("0", "false", "no"),
            quote_cache_ttl_seconds=int(os.environ.get("QUOTE_CACHE_TTL", "60")),
            candle_cache_ttl_seconds=int(os.environ.get("CANDLE_CACHE_TTL", "300")),
        )

    def configured_providers(self) -> list[str]:
        providers: list[str] = []
        if self.finnhub_api_key:
            providers.append("finnhub")
        if self.alphavantage_api_key:
            providers.append("alphavantage")
        if self.twelvedata_api_key:
            providers.append("twelvedata")
        return providers


settings = Settings.from_env()
