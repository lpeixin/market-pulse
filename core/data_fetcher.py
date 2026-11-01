"""
Intelligent US Market Trading Day Detector & Batch Data Fetcher.
Uses yfinance + pandas with SQLite local caching to avoid rate limits.
"""

from __future__ import annotations

import json
import logging
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, time, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

warnings.filterwarnings("ignore", message=".*OpenSSL.*", category=Warning)

import numpy as np
import pandas as pd
import yfinance as yf

from core.cache import MarketCache

logger = logging.getLogger("MarketPulse.DataFetcher")

ET_ZONE = ZoneInfo("America/New_York")

# Baseline approximate diluted shares outstanding (in billions of shares)
# Used to dynamically compute accurate Market Cap = price * shares if fast_info is rate-limited
APPROX_SHARES_BILLIONS: Dict[str, float] = {
    "AAPL": 15.12,
    "MSFT": 7.43,
    "NVDA": 24.48,
    "AVGO": 4.68,
    "ORCL": 2.77,
    "CRM": 0.96,
    "AMD": 1.62,
    "ADBE": 0.44,
    "CSCO": 3.98,
    "PLTR": 2.28,
    "MU": 1.11,
    "INTC": 4.31,
    "QCOM": 1.11,
    "PANW": 0.66,
    "GOOGL": 12.28,
    "META": 2.53,
    "NFLX": 0.43,
    "DIS": 1.81,
    "TMUS": 1.16,
    "AMZN": 10.52,
    "TSLA": 3.21,
    "HD": 0.99,
    "MCD": 0.72,
    "BKNG": 0.033,
    "NKE": 1.48,
    "BRK-B": 2.16,
    "JPM": 2.81,
    "V": 1.98,
    "MA": 0.92,
    "GS": 0.315,
    "BAC": 7.68,
    "BLK": 0.155,
    "LLY": 0.90,
    "UNH": 0.92,
    "JNJ": 2.41,
    "ABBV": 1.77,
    "MRK": 2.53,
    "ISRG": 0.356,
    "GE": 1.08,
    "CAT": 0.48,
    "RTX": 1.33,
    "UBER": 2.10,
    "UNP": 0.60,
    "WMT": 8.03,
    "COST": 0.443,
    "PG": 2.35,
    "KO": 4.31,
    "XOM": 4.39,
    "CVX": 1.81,
    "COP": 1.28,
    "NEE": 2.06,
    "CEG": 0.313,
    "PLD": 0.926,
    "AMT": 0.467,
    "LIN": 0.477,
    "FCX": 1.44,
}


class MarketDataFetcher:
    """Fetches, enriches, and caches US equity and index market data."""

    def __init__(
        self,
        config_path: Optional[Path] = None,
        cache: Optional[MarketCache] = None,
    ) -> None:
        self.base_dir = Path(__file__).resolve().parent.parent
        self.config_path = config_path or (self.base_dir / "config" / "universe.json")
        self.cache = cache or MarketCache()
        self.universe_config = self._load_universe_config()

    def _load_universe_config(self) -> Dict[str, Any]:
        with open(self.config_path, "r", encoding="utf-8") as f:
            config = json.load(f)
        # Merge any user-customized watchlist saved in SQLite app_meta
        saved_custom = self.cache.get_meta("custom_watchlist_tickers")
        if saved_custom and isinstance(saved_custom, list):
            if "custom_watchlist" in config.get("universes", {}):
                config["universes"]["custom_watchlist"]["tickers"] = saved_custom
        saved_stocks = self.cache.get_meta("custom_stocks_meta")
        if saved_stocks and isinstance(saved_stocks, dict):
            config.setdefault("stocks", {}).update(saved_stocks)
        return config

    def reload_config(self) -> Dict[str, Any]:
        self.universe_config = self._load_universe_config()
        return self.universe_config

    def get_universes_summary(self) -> List[Dict[str, Any]]:
        """Return list of available stock universes and their metadata."""
        self.reload_config()
        universes = self.universe_config.get("universes", {})
        result = []
        for uid, udata in universes.items():
            result.append(
                {
                    "id": uid,
                    "name": udata.get("name", uid),
                    "name_zh": udata.get("name_zh", udata.get("name", uid)),
                    "name_en": udata.get("name_en", udata.get("name", uid)),
                    "description": udata.get("description", ""),
                    "description_zh": udata.get("description_zh", udata.get("description", "")),
                    "description_en": udata.get("description_en", udata.get("description", "")),
                    "count": len(udata.get("tickers", [])),
                    "tickers": udata.get("tickers", []),
                }
            )
        return result

    def update_custom_watchlist(
        self, tickers: List[str], new_stock_meta: Optional[Dict[str, Any]] = None
    ) -> List[str]:
        """Update custom_watchlist tickers in SQLite metadata and reload config."""
        cleaned = []
        for t in tickers:
            sym = str(t).strip().upper().replace(".", "-")
            if sym and sym not in cleaned:
                cleaned.append(sym)
        self.cache.set_meta("custom_watchlist_tickers", cleaned)
        if new_stock_meta:
            existing_meta = self.cache.get_meta("custom_stocks_meta", {}) or {}
            existing_meta.update(new_stock_meta)
            self.cache.set_meta("custom_stocks_meta", existing_meta)
        self.reload_config()
        return cleaned

    @staticmethod
    def get_us_market_session_info(
        reference_trading_date: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Determine US Eastern Time market status (INTRADAY, PRE_MARKET, AFTER_HOURS, CLOSED)
        and candidate trading date string.
        """
        now_utc = datetime.now(timezone.utc)
        now_et = now_utc.astimezone(ET_ZONE)
        now_local = datetime.now()
        weekday = now_et.weekday()  # 0=Mon .. 6=Sun
        current_time = now_et.time()

        market_open = time(9, 30)
        market_close = time(16, 0)
        pre_open = time(4, 0)
        after_close = time(20, 0)

        if weekday >= 5:
            session_code = "WEEKEND_CLOSED"
            session_label = "周末休市 · 已回溯最近交易日收盘"
            session_label_en = "Weekend Closed · Rolled Back to Last Close"
            is_intraday = False
        elif market_open <= current_time < market_close:
            session_code = "INTRADAY"
            session_label = "美股盘中交易 · 实时行情快照"
            session_label_en = "US Market Open · Live Intraday Snapshot"
            is_intraday = True
        elif pre_open <= current_time < market_open:
            session_code = "PRE_MARKET"
            session_label = "美股盘前时段 · 已回溯最近交易日收盘"
            session_label_en = "Pre-Market · Rolled Back to Previous Close"
            is_intraday = False
        elif market_close <= current_time < after_close:
            session_code = "AFTER_HOURS"
            session_label = "美股盘后时段 · 当日收盘快照"
            session_label_en = "After-Hours · Today's Closing Snapshot"
            is_intraday = False
        else:
            session_code = "OVERNIGHT_CLOSED"
            session_label = "美股夜间休市 · 已回溯最近交易日收盘"
            session_label_en = "Overnight Closed · Rolled Back to Last Close"
            is_intraday = False

        # Candidate calendar date before holiday verification
        if weekday == 5:  # Saturday -> Friday
            candidate_dt = now_et.date() - pd.Timedelta(days=1)
        elif weekday == 6:  # Sunday -> Friday
            candidate_dt = now_et.date() - pd.Timedelta(days=2)
        elif weekday == 0 and current_time < market_open:  # Monday pre-open -> Friday
            candidate_dt = now_et.date() - pd.Timedelta(days=3)
        elif current_time < market_open:  # Tue-Fri pre-open -> yesterday
            candidate_dt = now_et.date() - pd.Timedelta(days=1)
        else:
            candidate_dt = now_et.date()

        effective_date = reference_trading_date or str(candidate_dt)
        # If today is a weekday intraday time on the clock, but the actual market bar date
        # is earlier than today's date, then today is a US Market Holiday!
        if (
            reference_trading_date
            and weekday < 5
            and current_time >= market_open
            and reference_trading_date < str(now_et.date())
        ):
            session_code = "HOLIDAY_CLOSED"
            session_label = "美股节假日休市 · 已回溯最近交易日收盘"
            session_label_en = "Market Holiday · Rolled Back to Last Close"
            is_intraday = False

        return {
            "trading_date": effective_date,
            "session_code": session_code,
            "session_label": session_label,
            "session_label_zh": session_label,
            "session_label_en": session_label_en,
            "is_intraday": is_intraday,
            "et_time": now_et.strftime("%Y-%m-%d %H:%M:%S ET"),
            "local_time": now_local.strftime("%Y-%m-%d %H:%M:%S"),
        }

    def _detect_latest_trading_date_from_spy(self) -> Optional[str]:
        """Quickly probe ^GSPC or SPY 10-day history to confirm exact latest US trading day."""
        try:
            df = yf.download(
                "^GSPC",
                period="10d",
                interval="1d",
                progress=False,
                auto_adjust=False,
                threads=False,
            )
            if df is not None and not df.empty:
                last_ts = pd.Timestamp(df.index[-1])
                return last_ts.strftime("%Y-%m-%d")
        except Exception as exc:
            logger.warning("Probe ^GSPC trading date failed: %s", exc)
        return None

    def _fetch_market_caps_concurrent(
        self, tickers: List[str], latest_prices: Dict[str, float]
    ) -> Dict[str, float]:
        """
        Fetch Market Cap concurrently via yfinance fast_info, falling back to
        cached shares outstanding or APPROX_SHARES_BILLIONS * price.
        """
        cached_shares: Dict[str, float] = (
            self.cache.get_meta("shares_outstanding_map", {}) or {}
        )
        market_caps: Dict[str, float] = {}

        def _fetch_one(sym: str) -> Tuple[str, Optional[float]]:
            try:
                fi = yf.Ticker(sym).fast_info
                mc = fi.get("market_cap") or fi.get("marketCap")
                if mc and float(mc) > 0:
                    return sym, float(mc)
            except Exception:
                pass
            return sym, None

        # Only query network for tickers that don't have fresh cached shares or when refreshing
        with ThreadPoolExecutor(max_workers=10) as pool:
            futures = {pool.submit(_fetch_one, t): t for t in tickers}
            for fut in as_completed(futures):
                sym, mc = fut.result()
                price = latest_prices.get(sym, 0.0)
                if mc and mc > 0:
                    market_caps[sym] = mc
                    if price > 0:
                        cached_shares[sym] = mc / price
                else:
                    # Fallback to cached shares or baseline shares
                    shares = cached_shares.get(sym)
                    if not shares and sym in APPROX_SHARES_BILLIONS:
                        shares = APPROX_SHARES_BILLIONS[sym] * 1e9
                    if shares and price > 0:
                        market_caps[sym] = float(shares * price)
                    else:
                        market_caps[sym] = 50e9  # safe default $50B

        self.cache.set_meta("shares_outstanding_map", cached_shares)
        return market_caps

    @staticmethod
    def _extract_ticker_df(
        raw_df: pd.DataFrame, ticker: str, single_ticker: bool
    ) -> Optional[pd.DataFrame]:
        """Extract clean single-ticker OHLCV DataFrame from yf.download output."""
        if raw_df is None or raw_df.empty:
            return None
        try:
            if single_ticker:
                if isinstance(raw_df.columns, pd.MultiIndex):
                    # In newer yfinance (1.x), single ticker may still have MultiIndex (Price, Ticker)
                    if ticker in raw_df.columns.get_level_values(-1):
                        sub = raw_df.xs(ticker, axis=1, level=-1).copy()
                    elif ticker in raw_df.columns.get_level_values(0):
                        sub = raw_df[ticker].copy()
                    else:
                        sub = raw_df.droplevel(-1, axis=1).copy()
                else:
                    sub = raw_df.copy()
            else:
                if isinstance(raw_df.columns, pd.MultiIndex):
                    if ticker in raw_df.columns.get_level_values(0):
                        sub = raw_df[ticker].copy()
                    elif ticker in raw_df.columns.get_level_values(-1):
                        sub = raw_df.xs(ticker, axis=1, level=-1).copy()
                    else:
                        return None
                else:
                    return None
            sub = sub.dropna(subset=["Close"])
            if sub.empty:
                return None
            return sub
        except Exception as exc:
            logger.debug("Failed to extract DataFrame for %s: %s", ticker, exc)
            return None

    def fetch_indices_snapshot(
        self, trading_date: str, force_refresh: bool = False
    ) -> List[Dict[str, Any]]:
        """Fetch major US market indices (^GSPC, ^IXIC, ^DJI, ^RUT, ^VIX)."""
        indices_cfg = self.universe_config.get("indices", [])
        idx_tickers = [item["ticker"] for item in indices_cfg]
        if not idx_tickers:
            return []

        if not force_refresh:
            cached = self.cache.get_indices(trading_date, idx_tickers)
            if len(cached) == len(idx_tickers):
                out = []
                for item in indices_cfg:
                    t = item["ticker"]
                    if t in cached:
                        rec = dict(cached[t])
                        rec["name_en"] = item.get("name_en", item.get("name", t))
                        rec["name_zh"] = item.get("name_zh", item.get("name", t))
                        out.append(rec)
                return out

        try:
            raw_df = yf.download(
                idx_tickers,
                period="1mo",
                interval="1d",
                group_by="ticker",
                auto_adjust=False,
                threads=True,
                progress=False,
            )
            results: List[Dict[str, Any]] = []
            for item in indices_cfg:
                sym = item["ticker"]
                tdf = self._extract_ticker_df(
                    raw_df, sym, single_ticker=(len(idx_tickers) == 1)
                )
                if tdf is None or len(tdf) < 1:
                    continue
                latest = tdf.iloc[-1]
                prev = tdf.iloc[-2] if len(tdf) >= 2 else latest
                price = float(latest["Close"])
                prev_close = float(prev["Close"])
                change = price - prev_close
                change_pct = (change / prev_close * 100.0) if prev_close else 0.0
                results.append(
                    {
                        "ticker": sym,
                        "name": item.get("name", sym),
                        "name_en": item.get("name_en", item.get("name", sym)),
                        "name_zh": item.get("name_zh", item.get("name", sym)),
                        "short_name": item.get("short_name", sym),
                        "price": round(price, 2),
                        "prev_close": round(prev_close, 2),
                        "change": round(change, 2),
                        "change_pct": round(change_pct, 2),
                        "trading_date": pd.Timestamp(tdf.index[-1]).strftime("%Y-%m-%d"),
                    }
                )
            if results:
                self.cache.save_indices(trading_date, results)
                return results
        except Exception as exc:
            logger.warning("Failed to fetch indices from yfinance: %s", exc)

        # Fallback to latest cached indices
        cached = self.cache.get_indices(trading_date, idx_tickers)
        return [cached[t] for t in idx_tickers if t in cached]

    def fetch_universe_data(
        self,
        universe_id: Optional[str] = None,
        force_refresh: bool = False,
    ) -> Dict[str, Any]:
        """
        Main entrypoint to fetch and compute all metrics for a selected universe.
        Returns a rich dictionary containing:
        - session_info (trading_date, session_label, cache_source, timestamps)
        - indices (SPX, IXIC, DJI, RUT, VIX)
        - records (list of enriched stock dicts)
        - dataframe (pandas DataFrame for analyzers)
        """
        self.reload_config()
        universes = self.universe_config.get("universes", {})
        default_uid = self.universe_config.get("default_universe", "sp500_core")
        uid = universe_id if universe_id in universes else default_uid
        universe_obj = universes[uid]
        tickers: List[str] = [
            str(t).upper() for t in universe_obj.get("tickers", [])
        ]
        stocks_meta = self.universe_config.get("stocks", {})
        sector_meta = self.universe_config.get("sector_meta", {})

        # Step 1: Determine expected trading date
        session_guess = self.get_us_market_session_info()
        cached_date = self.cache.get_latest_cached_trading_date()

        # If not forcing refresh and we already have a cached trading date matching the expected date
        # (or if we aren't intraday and have a recent cache), check if all tickers are cached!
        target_date = session_guess["trading_date"]
        if not force_refresh and cached_date:
            # If the calendar guess is a holiday or matches cached_date, check cache first
            cached_records = self.cache.get_equities(cached_date, tickers)
            if (
                len(cached_records) == len(tickers)
                and cached_date >= target_date
                and not session_guess["is_intraday"]
            ):
                session_info = self.get_us_market_session_info(cached_date)
                session_info["data_source"] = "SQLite Local Cache"
                session_info["cache_hit"] = True
                session_info["cached_at"] = next(
                    iter(cached_records.values())
                ).get("_cached_at", session_info["local_time"])
                indices_data = self.fetch_indices_snapshot(
                    cached_date, force_refresh=False
                )
                ordered_records = [cached_records[t] for t in tickers if t in cached_records]
                return {
                    "universe": {
                        "id": uid,
                        "name": universe_obj.get("name", uid),
                        "description": universe_obj.get("description", ""),
                        "count": len(ordered_records),
                    },
                    "session": session_info,
                    "indices": indices_data,
                    "records": ordered_records,
                }

        # Confirm actual trading date via quick probe if needed
        probed_date = self._detect_latest_trading_date_from_spy()
        if probed_date:
            target_date = probed_date

        # Check cache for target_date before downloading missing tickers
        cached_for_target: Dict[str, Dict[str, Any]] = {}
        if not force_refresh:
            cached_for_target = self.cache.get_equities(target_date, tickers)

        missing_tickers = (
            tickers
            if force_refresh
            else [t for t in tickers if t not in cached_for_target]
        )

        fetched_records: List[Dict[str, Any]] = []
        actual_trading_date = target_date
        used_network = False

        if missing_tickers:
            logger.info(
                "Fetching 1Y history from Yahoo Finance for %d tickers...",
                len(missing_tickers),
            )
            try:
                raw_df = yf.download(
                    missing_tickers,
                    period="1y",
                    interval="1d",
                    group_by="ticker",
                    auto_adjust=False,
                    threads=True,
                    progress=False,
                )
                used_network = True
                latest_prices: Dict[str, float] = {}
                extracted_dfs: Dict[str, pd.DataFrame] = {}

                for sym in missing_tickers:
                    tdf = self._extract_ticker_df(
                        raw_df, sym, single_ticker=(len(missing_tickers) == 1)
                    )
                    if tdf is not None and not tdf.empty:
                        extracted_dfs[sym] = tdf
                        latest_prices[sym] = float(tdf.iloc[-1]["Close"])

                if extracted_dfs:
                    # Determine canonical latest trading date from the majority of tickers
                    dates_found = [
                        pd.Timestamp(df.index[-1]).strftime("%Y-%m-%d")
                        for df in extracted_dfs.values()
                    ]
                    actual_trading_date = max(set(dates_found), key=dates_found.count)

                    # Fetch Market Caps concurrently
                    market_caps = self._fetch_market_caps_concurrent(
                        list(extracted_dfs.keys()), latest_prices
                    )

                    for sym, tdf in extracted_dfs.items():
                        rec = self._compute_ticker_metrics(
                            sym=sym,
                            tdf=tdf,
                            market_cap=market_caps.get(sym, 50e9),
                            meta=stocks_meta.get(sym, {}),
                            sector_meta=sector_meta,
                            trading_date=actual_trading_date,
                        )
                        fetched_records.append(rec)

                    # Save newly fetched records to SQLite cache
                    self.cache.save_equities(actual_trading_date, fetched_records)
            except Exception as exc:
                logger.error("Error fetching batch data from yfinance: %s", exc)

        # Combine cached + freshly fetched records
        all_records_map: Dict[str, Dict[str, Any]] = {}
        if actual_trading_date != target_date and not force_refresh:
            all_records_map.update(
                self.cache.get_equities(actual_trading_date, tickers)
            )
        else:
            all_records_map.update(cached_for_target)

        for r in fetched_records:
            all_records_map[r["ticker"]] = r

        # Fallback to most recent cached trading date if network failed completely
        if not all_records_map and cached_date:
            actual_trading_date = cached_date
            all_records_map = self.cache.get_equities(cached_date, tickers)

        ordered_records = [
            all_records_map[t] for t in tickers if t in all_records_map
        ]

        session_info = self.get_us_market_session_info(actual_trading_date)
        if used_network and len(fetched_records) == len(tickers):
            session_info["data_source"] = "Yahoo Finance Live -> SQLite"
            session_info["cache_hit"] = False
        elif used_network and fetched_records:
            session_info["data_source"] = "Hybrid (SQLite Cache + Live Delta)"
            session_info["cache_hit"] = True
        else:
            session_info["data_source"] = "SQLite Local Cache"
            session_info["cache_hit"] = True

        indices_data = self.fetch_indices_snapshot(
            actual_trading_date, force_refresh=force_refresh
        )

        return {
            "universe": {
                "id": uid,
                "name": universe_obj.get("name", uid),
                "description": universe_obj.get("description", ""),
                "count": len(ordered_records),
            },
            "session": session_info,
            "indices": indices_data,
            "records": ordered_records,
        }

    def _compute_ticker_metrics(
        self,
        sym: str,
        tdf: pd.DataFrame,
        market_cap: float,
        meta: Dict[str, Any],
        sector_meta: Dict[str, Any],
        trading_date: str,
    ) -> Dict[str, Any]:
        """Compute all required financial & technical metrics for a single ticker."""
        latest = tdf.iloc[-1]
        prev = tdf.iloc[-2] if len(tdf) >= 2 else latest

        price = float(latest["Close"])
        prev_close = float(prev["Close"])
        open_p = float(latest["Open"]) if not pd.isna(latest["Open"]) else price
        high_p = float(latest["High"]) if not pd.isna(latest["High"]) else max(price, open_p)
        low_p = float(latest["Low"]) if not pd.isna(latest["Low"]) else min(price, open_p)
        # Ensure high >= price >= low
        high_p = max(high_p, price, open_p)
        low_p = min(low_p, price, open_p)

        volume = int(float(latest["Volume"])) if not pd.isna(latest["Volume"]) else 0

        # 20-day Average Volume (prior 20 sessions or available sessions up to 20)
        vol_series = tdf["Volume"].dropna()
        if len(vol_series) > 1:
            # Use the trailing 20 sessions excluding current if len >= 21, or last 20
            hist_vols = vol_series.iloc[-21:-1] if len(vol_series) >= 21 else vol_series.iloc[:-1]
            avg_vol_20d = float(hist_vols.mean()) if len(hist_vols) > 0 else float(volume)
        else:
            avg_vol_20d = float(volume) if volume > 0 else 1.0

        rvol = (volume / avg_vol_20d) if avg_vol_20d > 0 else 1.0

        # 52-Week High and Low across the 1-year history (~252 trading days)
        high_series = tdf["High"].dropna()
        low_series = tdf["Low"].dropna()
        high_52w = float(high_series.max()) if not high_series.empty else high_p
        low_52w = float(low_series.min()) if not low_series.empty else low_p
        high_52w = max(high_52w, high_p)
        low_52w = min(low_52w, low_p)

        change = price - prev_close
        change_pct = (change / prev_close * 100.0) if prev_close > 0 else 0.0

        # Intraday Amplitude (%) and Intraday Position (0% = Low, 100% = High)
        intraday_range_pct = (
            (high_p - low_p) / prev_close * 100.0 if prev_close > 0 else 0.0
        )
        intraday_span = high_p - low_p
        intraday_pos_pct = (
            (price - low_p) / intraday_span * 100.0 if intraday_span > 1e-9 else 50.0
        )

        # Drawdown from 52W High (%) -> negative or 0.0 (e.g. -12.4%)
        drawdown_52w_pct = (
            (price - high_52w) / high_52w * 100.0 if high_52w > 0 else 0.0
        )
        # Position within 52W Range (0% = 52W Low, 100% = 52W High)
        span_52w = high_52w - low_52w
        pos_52w_pct = (
            (price - low_52w) / span_52w * 100.0 if span_52w > 1e-9 else 50.0
        )

        turnover = price * volume

        # Last 20 trading days close sparkline
        closes_20d = [
            round(float(x), 2) for x in tdf["Close"].dropna().iloc[-20:].tolist()
        ]

        sector_en = meta.get("sector", "Information Technology")
        sector_cn = sector_meta.get(sector_en, {}).get("cn_name", sector_en)
        name_en = meta.get("name", sym)
        name_cn = meta.get("cn_name", name_en)

        return {
            "ticker": sym,
            "name": name_en,
            "cn_name": name_cn,
            "sector": sector_en,
            "sector_cn": sector_cn,
            "sector_label": f"{sector_cn} ({sector_en})",
            "trading_date": trading_date,
            "price": round(price, 2),
            "prev_close": round(prev_close, 2),
            "open": round(open_p, 2),
            "high": round(high_p, 2),
            "low": round(low_p, 2),
            "change": round(change, 2),
            "change_pct": round(change_pct, 2),
            "market_cap": round(market_cap, 0),
            "market_cap_b": round(market_cap / 1e9, 2),
            "market_cap_fmt": self.format_market_cap(market_cap),
            "volume": volume,
            "volume_fmt": self.format_volume(volume),
            "avg_volume_20d": round(avg_vol_20d, 0),
            "avg_volume_20d_fmt": self.format_volume(avg_vol_20d),
            "rvol": round(rvol, 2),
            "turnover": round(turnover, 0),
            "turnover_b": round(turnover / 1e9, 2),
            "turnover_fmt": self.format_market_cap(turnover),
            "intraday_range_pct": round(intraday_range_pct, 2),
            "intraday_pos_pct": round(float(np.clip(intraday_pos_pct, 0.0, 100.0)), 1),
            "high_52w": round(high_52w, 2),
            "low_52w": round(low_52w, 2),
            "drawdown_52w_pct": round(drawdown_52w_pct, 2),
            "pos_52w_pct": round(float(np.clip(pos_52w_pct, 0.0, 100.0)), 1),
            "sparkline_20d": closes_20d,
        }

    @staticmethod
    def format_market_cap(val: float) -> str:
        if val >= 1e12:
            return f"${val / 1e12:.2f}T"
        if val >= 1e9:
            return f"${val / 1e9:.2f}B"
        if val >= 1e6:
            return f"${val / 1e6:.2f}M"
        return f"${val:,.0f}"

    @staticmethod
    def format_volume(val: float) -> str:
        if val >= 1e9:
            return f"{val / 1e9:.2f}B"
        if val >= 1e6:
            return f"{val / 1e6:.2f}M"
        if val >= 1e3:
            return f"{val / 1e3:.1f}K"
        return f"{int(val)}"
