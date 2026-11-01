"""
SQLite Local Cache Engine for MarketPulse.
Prevents redundant Yahoo Finance API calls on the same trading day and avoids rate-limiting.
"""

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional


class MarketCache:
    """SQLite-backed local cache for US equity & index daily snapshots."""

    def __init__(self, db_path: Optional[Path] = None) -> None:
        base_dir = Path(__file__).resolve().parent.parent
        self.data_dir = base_dir / "data"
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = db_path or (self.data_dir / "market_cache.db")
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=15.0)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._get_conn() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS equity_snapshots (
                    trading_date TEXT NOT NULL,
                    ticker TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (trading_date, ticker)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS index_snapshots (
                    trading_date TEXT NOT NULL,
                    ticker TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (trading_date, ticker)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS app_meta (
                    meta_key TEXT PRIMARY KEY,
                    meta_value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.commit()

    def get_equities(self, trading_date: str, tickers: List[str]) -> Dict[str, Dict[str, Any]]:
        """Retrieve cached equity records for a given trading_date and list of tickers."""
        if not tickers:
            return {}
        placeholders = ",".join(["?"] * len(tickers))
        query = f"""
            SELECT ticker, payload_json, updated_at
            FROM equity_snapshots
            WHERE trading_date = ? AND ticker IN ({placeholders})
        """
        results: Dict[str, Dict[str, Any]] = {}
        with self._get_conn() as conn:
            rows = conn.execute(query, [trading_date, *tickers]).fetchall()
            for row in rows:
                try:
                    data = json.loads(row["payload_json"])
                    data["_cached_at"] = row["updated_at"]
                    results[row["ticker"]] = data
                except json.JSONDecodeError:
                    continue
        return results

    def get_latest_cached_trading_date(self) -> Optional[str]:
        """Return the most recent trading_date available in equity_snapshots."""
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT MAX(trading_date) AS max_date FROM equity_snapshots"
            ).fetchone()
            if row and row["max_date"]:
                return str(row["max_date"])
        return None

    def save_equities(self, trading_date: str, records: List[Dict[str, Any]]) -> None:
        """Upsert equity snapshot records for a given trading_date."""
        if not records:
            return
        now_iso = datetime.now().isoformat(timespec="seconds")
        rows_to_insert = [
            (
                trading_date,
                str(rec["ticker"]).upper(),
                json.dumps(rec, ensure_ascii=False),
                now_iso,
            )
            for rec in records
            if "ticker" in rec
        ]
        with self._get_conn() as conn:
            conn.executemany(
                """
                INSERT INTO equity_snapshots (trading_date, ticker, payload_json, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(trading_date, ticker) DO UPDATE SET
                    payload_json = excluded.payload_json,
                    updated_at = excluded.updated_at
                """,
                rows_to_insert,
            )
            conn.commit()

    def get_indices(self, trading_date: str, tickers: List[str]) -> Dict[str, Dict[str, Any]]:
        """Retrieve cached market index records for a given trading_date."""
        if not tickers:
            return {}
        placeholders = ",".join(["?"] * len(tickers))
        query = f"""
            SELECT ticker, payload_json, updated_at
            FROM index_snapshots
            WHERE trading_date = ? AND ticker IN ({placeholders})
        """
        results: Dict[str, Dict[str, Any]] = {}
        with self._get_conn() as conn:
            rows = conn.execute(query, [trading_date, *tickers]).fetchall()
            for row in rows:
                try:
                    data = json.loads(row["payload_json"])
                    data["_cached_at"] = row["updated_at"]
                    results[row["ticker"]] = data
                except json.JSONDecodeError:
                    continue
        return results

    def save_indices(self, trading_date: str, records: List[Dict[str, Any]]) -> None:
        """Upsert market index records for a given trading_date."""
        if not records:
            return
        now_iso = datetime.now().isoformat(timespec="seconds")
        rows_to_insert = [
            (
                trading_date,
                str(rec["ticker"]),
                json.dumps(rec, ensure_ascii=False),
                now_iso,
            )
            for rec in records
            if "ticker" in rec
        ]
        with self._get_conn() as conn:
            conn.executemany(
                """
                INSERT INTO index_snapshots (trading_date, ticker, payload_json, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(trading_date, ticker) DO UPDATE SET
                    payload_json = excluded.payload_json,
                    updated_at = excluded.updated_at
                """,
                rows_to_insert,
            )
            conn.commit()

    def set_meta(self, key: str, value: Any) -> None:
        """Persist arbitrary JSON-serializable metadata."""
        now_iso = datetime.now().isoformat(timespec="seconds")
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT INTO app_meta (meta_key, meta_value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(meta_key) DO UPDATE SET
                    meta_value = excluded.meta_value,
                    updated_at = excluded.updated_at
                """,
                (key, json.dumps(value, ensure_ascii=False), now_iso),
            )
            conn.commit()

    def get_meta(self, key: str, default: Any = None) -> Any:
        """Read metadata value by key."""
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT meta_value FROM app_meta WHERE meta_key = ?", (key,)
            ).fetchone()
            if row:
                try:
                    return json.loads(row["meta_value"])
                except json.JSONDecodeError:
                    return default
        return default

    def clear_trading_date(self, trading_date: Optional[str] = None) -> None:
        """Clear cache for a specific trading_date or all dates."""
        with self._get_conn() as conn:
            if trading_date:
                conn.execute(
                    "DELETE FROM equity_snapshots WHERE trading_date = ?",
                    (trading_date,),
                )
                conn.execute(
                    "DELETE FROM index_snapshots WHERE trading_date = ?",
                    (trading_date,),
                )
            else:
                conn.execute("DELETE FROM equity_snapshots")
                conn.execute("DELETE FROM index_snapshots")
            conn.commit()
