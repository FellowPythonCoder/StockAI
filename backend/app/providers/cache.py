"""Thread-safe TTL response cache and provider rate-limit token bucket."""

from __future__ import annotations

import threading
import time
from typing import Any, Optional


class TTLCache:
    def __init__(self) -> None:
        self._store: dict[str, tuple[float, float, Any]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[tuple[Any, float]]:
        now = time.time()
        with self._lock:
            entry = self._store.get(key)
            if not entry:
                return None
            expires_at, created_at, value = entry
            if now > expires_at:
                del self._store[key]
                return None
            return value, created_at

    def set(self, key: str, value: Any, ttl_seconds: int) -> None:
        now = time.time()
        with self._lock:
            self._store[key] = (now + ttl_seconds, now, value)

    def invalidate_prefix(self, prefix: str) -> int:
        with self._lock:
            keys = [k for k in self._store if k.startswith(prefix)]
            for k in keys:
                del self._store[k]
            return len(keys)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()


class RateLimiter:
    """Token-bucket rate limiter protecting external market data providers."""

    def __init__(self, max_calls_per_minute: int = 30) -> None:
        self.capacity = float(max_calls_per_minute)
        self.tokens = float(max_calls_per_minute)
        self.refill_per_sec = max_calls_per_minute / 60.0
        self.last_refill = time.monotonic()
        self._lock = threading.Lock()

    def allow_request(self) -> bool:
        with self._lock:
            now = time.monotonic()
            elapsed = now - self.last_refill
            self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_per_sec)
            self.last_refill = now
            if self.tokens >= 1.0:
                self.tokens -= 1.0
                return True
            return False


market_cache = TTLCache()
provider_limiters: dict[str, RateLimiter] = {
    "finnhub": RateLimiter(max_calls_per_minute=50),
    "alphavantage": RateLimiter(max_calls_per_minute=5),
    "twelvedata": RateLimiter(max_calls_per_minute=8),
    "yahoo": RateLimiter(max_calls_per_minute=30),
}
