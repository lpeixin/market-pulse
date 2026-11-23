"""
Intelligent Multi-Market (US / CN A-Shares / HK) Trading Day Detector & Batch Data Fetcher.
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
CN_ZONE = ZoneInfo("Asia/Shanghai")
HK_ZONE = ZoneInfo("Asia/Hong_Kong")
UTC_ZONE = ZoneInfo("UTC")

MARKET_TIMEZONES: Dict[str, Tuple[ZoneInfo, str]] = {
    "US": (ET_ZONE, "ET"),
    "CN": (CN_ZONE, "CST"),
    "HK": (HK_ZONE, "HKT"),
    "CRYPTO": (UTC_ZONE, "UTC"),
}

MARKET_CUSTOM_WATCHLIST_IDS: Dict[str, str] = {
    "US": "custom_watchlist",
    "CN": "cn_custom_watchlist",
    "HK": "hk_custom_watchlist",
    "CRYPTO": "crypto_custom_watchlist",
}

CRYPTO_SHORTHAND_MAP: Dict[str, str] = {
    "UNI": "UNI7083-USD",
    "UNI-USD": "UNI7083-USD",
    "SUI": "SUI20947-USD",
    "SUI-USD": "SUI20947-USD",
    "APT": "APT21794-USD",
    "APT-USD": "APT21794-USD",
    "ARB": "ARB11841-USD",
    "ARB-USD": "ARB11841-USD",
    "IMX": "IMX10603-USD",
    "IMX-USD": "IMX10603-USD",
    "STX": "STX4847-USD",
    "STX-USD": "STX4847-USD",
    "GRT": "GRT6719-USD",
    "GRT-USD": "GRT6719-USD",
    "PEPE": "PEPE24478-USD",
    "PEPE-USD": "PEPE24478-USD",
}

CRYPTO_EQUITY_TICKERS = {
    "IBIT", "FBTC", "ETHA", "BITB", "ARKB", "GBTC", "ETHE",
    "MSTR", "COIN", "HOOD", "XYZ", "SQ", "PYPL",
    "MARA", "RIOT", "CLSK", "IREN", "CORZ", "HUT", "WULF", "CIFR", "BTDR",
}

# Baseline approximate diluted shares outstanding (in billions of shares)
# Used to dynamically compute accurate Market Cap = price * shares if fast_info is rate-limited
APPROX_SHARES_BILLIONS: Dict[str, float] = {
    # --- US Equities ---
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
    # --- China A-Shares (CNY total shares in billions) ---
    "600519.SS": 1.256,
    "000858.SZ": 3.882,
    "600887.SS": 6.366,
    "603288.SS": 5.561,
    "300750.SZ": 4.403,
    "300274.SZ": 2.073,
    "600406.SS": 8.033,
    "601668.SS": 41.62,
    "601919.SS": 15.96,
    "002352.SZ": 4.816,
    "601398.SS": 356.41,
    "601288.SS": 349.98,
    "600036.SS": 25.22,
    "601318.SS": 18.21,
    "600030.SS": 14.82,
    "300059.SZ": 15.79,
    "688981.SS": 7.97,
    "601138.SS": 19.86,
    "002415.SZ": 9.233,
    "002475.SZ": 7.226,
    "002371.SZ": 0.533,
    "300308.SZ": 1.121,
    "002230.SZ": 2.312,
    "688041.SS": 2.324,
    "601012.SS": 7.578,
    "002594.SZ": 2.909,
    "000333.SZ": 7.65,
    "000651.SZ": 5.631,
    "601888.SS": 2.069,
    "300760.SZ": 1.212,
    "600276.SS": 6.379,
    "603259.SS": 2.912,
    "600941.SS": 21.45,
    "601728.SS": 91.51,
    "002027.SZ": 14.44,
    "601857.SS": 183.02,
    "601088.SS": 19.87,
    "600028.SS": 121.74,
    "600900.SS": 24.468,
    "601985.SS": 18.88,
    "601899.SS": 26.58,
    "600309.SS": 3.14,
    "600048.SS": 11.97,
    "001979.SZ": 9.061,
    # --- Hong Kong Equities (HKD total shares in billions) ---
    "0700.HK": 9.28,
    "0941.HK": 21.45,
    "9999.HK": 3.22,
    "9888.HK": 2.80,
    "1024.HK": 4.33,
    "9988.HK": 19.16,
    "3690.HK": 6.08,
    "1211.HK": 2.909,
    "9618.HK": 2.94,
    "9961.HK": 0.68,
    "2015.HK": 2.12,
    "9868.HK": 1.90,
    "0175.HK": 10.07,
    "2020.HK": 2.83,
    "1810.HK": 24.95,
    "0981.HK": 7.97,
    "0992.HK": 12.40,
    "0005.HK": 18.15,
    "0939.HK": 250.01,
    "1299.HK": 11.02,
    "0388.HK": 1.268,
    "2318.HK": 18.21,
    "0883.HK": 47.53,
    "1088.HK": 19.87,
    "9633.HK": 11.25,
    "0291.HK": 3.244,
    "2269.HK": 4.15,
    "1093.HK": 11.83,
    "0001.HK": 3.83,
    "0669.HK": 1.83,
    "0002.HK": 2.526,
    "0016.HK": 2.898,
    "1109.HK": 7.131,
    "2899.HK": 26.58,
    # --- Cryptocurrencies (Circulating supply in billions of coins/tokens) ---
    "BTC-USD": 0.0198,
    "ETH-USD": 0.1204,
    "SOL-USD": 0.475,
    "BNB-USD": 0.144,
    "XRP-USD": 57.1,
    "DOGE-USD": 147.0,
    "ADA-USD": 35.1,
    "TRX-USD": 86.2,
    "AVAX-USD": 0.409,
    "LINK-USD": 0.626,
    "DOT-USD": 1.52,
    "NEAR-USD": 1.22,
    "SUI20947-USD": 2.93,
    "APT21794-USD": 0.535,
    "ATOM-USD": 0.391,
    "LTC-USD": 0.0752,
    "BCH-USD": 0.0198,
    "XLM-USD": 30.1,
    "ETC-USD": 0.149,
    "UNI7083-USD": 0.600,
    "AAVE-USD": 0.015,
    "MKR-USD": 0.00088,
    "LDO-USD": 0.895,
    "CRV-USD": 1.24,
    "RUNE-USD": 0.338,
    "FIL-USD": 0.605,
    "ICP-USD": 0.475,
    "GRT6719-USD": 9.55,
    "FET-USD": 2.44,
    "ARB11841-USD": 4.10,
    "OP-USD": 1.25,
    "IMX10603-USD": 1.69,
    "STX4847-USD": 1.50,
    "SHIB-USD": 589260.0,
    "PEPE24478-USD": 420690.0,
    # --- Crypto Equities, Miners & Spot ETFs (Shares in billions) ---
    "IBIT": 0.86,
    "FBTC": 0.26,
    "ETHA": 0.32,
    "BITB": 0.075,
    "MSTR": 0.245,
    "COIN": 0.251,
    "HOOD": 0.885,
    "XYZ": 0.618,
    "MARA": 0.335,
    "RIOT": 0.345,
    "CLSK": 0.278,
    "IREN": 0.215,
    "CORZ": 0.285,
    "HUT": 0.095,
    "WULF": 0.382,
}


class MarketDataFetcher:
    """Fetches, enriches, and caches US, China A-Share, and Hong Kong market data."""

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
        # Merge any user-customized watchlists saved in SQLite app_meta (per market)
        for mkt, uid in MARKET_CUSTOM_WATCHLIST_IDS.items():
            meta_key = (
                "custom_watchlist_tickers"
                if mkt == "US"
                else f"custom_watchlist_tickers_{mkt}"
            )
            saved_custom = self.cache.get_meta(meta_key)
            if saved_custom and isinstance(saved_custom, list):
                if uid in config.get("universes", {}):
                    config["universes"][uid]["tickers"] = saved_custom
        saved_stocks = self.cache.get_meta("custom_stocks_meta")
        if saved_stocks and isinstance(saved_stocks, dict):
            config.setdefault("stocks", {}).update(saved_stocks)
        return config

    def reload_config(self) -> Dict[str, Any]:
        self.universe_config = self._load_universe_config()
        return self.universe_config

    def get_markets_summary(self) -> List[Dict[str, Any]]:
        """Return metadata for all supported markets (US, CN, HK)."""
        self.reload_config()
        markets = self.universe_config.get("markets", {})
        result = []
        for mid, mdata in markets.items():
            result.append(
                {
                    "id": mid,
                    "name_en": mdata.get("name_en", mid),
                    "name_zh": mdata.get("name_zh", mid),
                    "short_en": mdata.get("short_en", mid),
                    "short_zh": mdata.get("short_zh", mid),
                    "currency": mdata.get("currency", "USD"),
                    "currency_symbol": mdata.get("currency_symbol", "$"),
                    "default_universe": mdata.get("default_universe", "sp500_core"),
                }
            )
        return result

    def get_universes_summary(
        self, market: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Return list of available stock universes and their metadata (optionally filtered by market)."""
        self.reload_config()
        universes = self.universe_config.get("universes", {})
        result = []
        for uid, udata in universes.items():
            u_market = udata.get("market", "US")
            if isinstance(market, str) and market and u_market.upper() != market.upper():
                continue
            result.append(
                {
                    "id": uid,
                    "market": u_market,
                    "name": udata.get("name", uid),
                    "name_zh": udata.get("name_zh", udata.get("name", uid)),
                    "name_en": udata.get("name_en", udata.get("name", uid)),
                    "description": udata.get("description", ""),
                    "description_zh": udata.get(
                        "description_zh", udata.get("description", "")
                    ),
                    "description_en": udata.get(
                        "description_en", udata.get("description", "")
                    ),
                    "count": len(udata.get("tickers", [])),
                    "tickers": udata.get("tickers", []),
                }
            )
        return result

    @staticmethod
    def normalize_ticker_for_market(raw_ticker: str, market: str = "US") -> str:
        """Normalize user-entered ticker symbol according to market convention."""
        sym = str(raw_ticker).strip().upper()
        if not sym:
            return ""
        mkt = market.upper()
        if mkt == "CN":
            # Support bare 6-digit A-share codes like 600519 -> 600519.SS, 300750 -> 300750.SZ
            if sym.isdigit() and len(sym) == 6:
                if sym.startswith(("6", "5", "9")):
                    return f"{sym}.SS"
                return f"{sym}.SZ"
            if sym.endswith(".SH"):
                return sym[:-3] + ".SS"
            return sym
        if mkt == "HK":
            # Support bare numeric HK codes like 700 -> 0700.HK, 9988 -> 9988.HK
            if sym.endswith(".HK"):
                code_part = sym[:-3]
                if code_part.isdigit() and len(code_part) < 4:
                    return f"{code_part.zfill(4)}.HK"
                return sym
            if sym.isdigit():
                return f"{sym.zfill(4)}.HK"
            return sym
        if mkt == "CRYPTO":
            if sym in CRYPTO_SHORTHAND_MAP:
                return CRYPTO_SHORTHAND_MAP[sym]
            if sym in CRYPTO_EQUITY_TICKERS or sym.endswith("-USD"):
                return sym
            return f"{sym}-USD"
        # Default US
        return sym.replace(".", "-")

    def update_custom_watchlist(
        self,
        tickers: List[str],
        new_stock_meta: Optional[Dict[str, Any]] = None,
        market: str = "US",
    ) -> List[str]:
        """Update custom watchlist tickers for a specific market (US / CN / HK) in SQLite metadata."""
        mkt = market.upper() if market.upper() in MARKET_CUSTOM_WATCHLIST_IDS else "US"
        cleaned = []
        for t in tickers:
            sym = self.normalize_ticker_for_market(t, market=mkt)
            if sym and sym not in cleaned:
                cleaned.append(sym)
        meta_key = (
            "custom_watchlist_tickers"
            if mkt == "US"
            else f"custom_watchlist_tickers_{mkt}"
        )
        self.cache.set_meta(meta_key, cleaned)
        if new_stock_meta:
            existing_meta = self.cache.get_meta("custom_stocks_meta", {}) or {}
            existing_meta.update(new_stock_meta)
            self.cache.set_meta("custom_stocks_meta", existing_meta)
        self.reload_config()
        return cleaned

    @classmethod
    def get_market_session_info(
        cls,
        market: str = "US",
        reference_trading_date: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Determine market session status (INTRADAY, PRE_MARKET, LUNCH_BREAK, AFTER_HOURS, CLOSED)
        and candidate trading date in the market's native timezone (ET / CST / HKT).
        """
        mkt = market.upper() if market.upper() in MARKET_TIMEZONES else "US"
        tz, tz_abbr = MARKET_TIMEZONES[mkt]

        now_utc = datetime.now(timezone.utc)
        now_mkt = now_utc.astimezone(tz)
        now_local = datetime.now()
        weekday = now_mkt.weekday()  # 0=Mon .. 6=Sun
        current_time = now_mkt.time()

        formatted_mkt_time = now_mkt.strftime(f"%Y-%m-%d %H:%M:%S {tz_abbr}")

        if mkt == "CRYPTO":
            effective_date = reference_trading_date or str(now_mkt.date())
            return {
                "market": "CRYPTO",
                "trading_date": effective_date,
                "session_code": "CRYPTO_24_7",
                "session_label": "7×24h 全天候交易 · 实时行情快照",
                "session_label_zh": "7×24h 全天候交易 · 实时行情快照",
                "session_label_en": "24/7 Continuous Trading · Live Snapshot",
                "is_intraday": True,
                "market_time": formatted_mkt_time,
                "et_time": formatted_mkt_time,
                "local_time": now_local.strftime("%Y-%m-%d %H:%M:%S"),
            }

        market_prefix_zh = {"US": "美股", "CN": "A股", "HK": "港股"}[mkt]
        market_prefix_en = {"US": "US Market", "CN": "China A-Shares", "HK": "HK Market"}[mkt]

        if mkt == "US":
            market_open = time(9, 30)
            market_close = time(16, 0)
            pre_open = time(4, 0)
            after_close = time(20, 0)
            is_lunch = False
        elif mkt == "CN":
            market_open = time(9, 30)
            market_close = time(15, 0)
            pre_open = time(9, 15)
            after_close = time(15, 30)
            is_lunch = time(11, 30) <= current_time < time(13, 0)
        else:  # HK
            market_open = time(9, 30)
            market_close = time(16, 0)
            pre_open = time(9, 0)
            after_close = time(16, 30)
            is_lunch = time(12, 0) <= current_time < time(13, 0)

        if weekday >= 5:
            session_code = "WEEKEND_CLOSED"
            session_label = f"{market_prefix_zh}周末休市 · 已回溯最近交易日收盘"
            session_label_en = f"{market_prefix_en} Weekend Closed · Rolled Back to Last Close"
            is_intraday = False
        elif is_lunch:
            session_code = "LUNCH_BREAK"
            session_label = f"{market_prefix_zh}午间休市 · 早盘行情快照"
            session_label_en = f"{market_prefix_en} Midday Break · Morning Session Snapshot"
            is_intraday = True
        elif market_open <= current_time < market_close:
            session_code = "INTRADAY"
            session_label = f"{market_prefix_zh}盘中交易 · 实时行情快照"
            session_label_en = f"{market_prefix_en} Open · Live Intraday Snapshot"
            is_intraday = True
        elif pre_open <= current_time < market_open:
            session_code = "PRE_MARKET"
            session_label = f"{market_prefix_zh}盘前时段 · 已回溯最近交易日收盘"
            session_label_en = f"{market_prefix_en} Pre-Market · Rolled Back to Previous Close"
            is_intraday = False
        elif market_close <= current_time < after_close:
            session_code = "AFTER_HOURS"
            session_label = f"{market_prefix_zh}盘后收盘 · 当日收盘快照"
            session_label_en = f"{market_prefix_en} After-Hours · Today's Closing Snapshot"
            is_intraday = False
        else:
            session_code = "OVERNIGHT_CLOSED"
            session_label = f"{market_prefix_zh}休市时段 · 已回溯最近交易日收盘"
            session_label_en = f"{market_prefix_en} Closed · Rolled Back to Last Close"
            is_intraday = False

        if weekday == 5:
            candidate_dt = now_mkt.date() - pd.Timedelta(days=1)
        elif weekday == 6:
            candidate_dt = now_mkt.date() - pd.Timedelta(days=2)
        elif weekday == 0 and current_time < market_open:
            candidate_dt = now_mkt.date() - pd.Timedelta(days=3)
        elif current_time < market_open:
            candidate_dt = now_mkt.date() - pd.Timedelta(days=1)
        else:
            candidate_dt = now_mkt.date()

        effective_date = reference_trading_date or str(candidate_dt)
        if (
            reference_trading_date
            and weekday < 5
            and current_time >= market_open
            and reference_trading_date < str(now_mkt.date())
        ):
            session_code = "HOLIDAY_CLOSED"
            session_label = f"{market_prefix_zh}节假日休市 · 已回溯最近交易日收盘"
            session_label_en = f"{market_prefix_en} Holiday · Rolled Back to Last Close"
            is_intraday = False

        formatted_mkt_time = now_mkt.strftime(f"%Y-%m-%d %H:%M:%S {tz_abbr}")

        return {
            "market": mkt,
            "trading_date": effective_date,
            "session_code": session_code,
            "session_label": session_label,
            "session_label_zh": session_label,
            "session_label_en": session_label_en,
            "is_intraday": is_intraday,
            "market_time": formatted_mkt_time,
            "et_time": formatted_mkt_time,
            "local_time": now_local.strftime("%Y-%m-%d %H:%M:%S"),
        }

    @classmethod
    def get_us_market_session_info(
        cls,
        reference_trading_date: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Backward-compatible helper for US market session detection."""
        return cls.get_market_session_info(
            market="US", reference_trading_date=reference_trading_date
        )

    def _detect_latest_trading_date(self, market: str = "US") -> Optional[str]:
        """Quickly probe market benchmark index 10-day history to confirm exact latest trading day."""
        markets_cfg = self.universe_config.get("markets", {})
        probe_ticker = (
            markets_cfg.get(market.upper(), {}).get("probe_ticker") or "^GSPC"
        )
        try:
            df = yf.download(
                probe_ticker,
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
            logger.warning("Probe %s trading date failed: %s", probe_ticker, exc)
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
                mc = getattr(fi, "market_cap", None)
                if not mc and hasattr(fi, "get"):
                    mc = fi.get("market_cap") or fi.get("marketCap")
                if mc and float(mc) > 0:
                    return sym, float(mc)
            except Exception:
                pass
            return sym, None

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
                    shares = cached_shares.get(sym)
                    if not shares and sym in APPROX_SHARES_BILLIONS:
                        shares = APPROX_SHARES_BILLIONS[sym] * 1e9
                    if shares and price > 0:
                        market_caps[sym] = float(shares * price)
                    else:
                        market_caps[sym] = 50e9

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
        self,
        trading_date: str,
        force_refresh: bool = False,
        market: str = "US",
    ) -> List[Dict[str, Any]]:
        """Fetch benchmark indices for the specified market (US / CN / HK)."""
        mkt = market.upper()
        markets_cfg = self.universe_config.get("markets", {})
        indices_cfg = (
            markets_cfg.get(mkt, {}).get("indices")
            or self.universe_config.get("indices", [])
        )
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
                        rec["market"] = mkt
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
                decimals = 3 if price < 10.0 else 2
                results.append(
                    {
                        "ticker": sym,
                        "market": mkt,
                        "name": item.get("name", sym),
                        "name_en": item.get("name_en", item.get("name", sym)),
                        "name_zh": item.get("name_zh", item.get("name", sym)),
                        "short_name": item.get("short_name", sym),
                        "price": round(price, decimals),
                        "prev_close": round(prev_close, decimals),
                        "change": round(change, decimals),
                        "change_pct": round(change_pct, 2),
                        "trading_date": pd.Timestamp(tdf.index[-1]).strftime(
                            "%Y-%m-%d"
                        ),
                    }
                )
            if results:
                self.cache.save_indices(trading_date, results)
                return results
        except Exception as exc:
            logger.warning("Failed to fetch %s indices from yfinance: %s", mkt, exc)

        cached = self.cache.get_indices(trading_date, idx_tickers)
        return [cached[t] for t in idx_tickers if t in cached]

    def fetch_universe_data(
        self,
        universe_id: Optional[str] = None,
        force_refresh: bool = False,
        market: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Main entrypoint to fetch and compute all metrics for a selected universe & market.
        """
        self.reload_config()
        universes = self.universe_config.get("universes", {})
        markets_cfg = self.universe_config.get("markets", {})

        # Resolve universe_id and market
        if isinstance(universe_id, str) and universe_id in universes:
            uid = universe_id
            mkt = universes[uid].get("market", "US").upper()
        elif isinstance(market, str) and market.upper() in markets_cfg:
            mkt = market.upper()
            uid = markets_cfg[mkt].get("default_universe", "sp500_core")
        else:
            default_uid = self.universe_config.get("default_universe", "sp500_core")
            uid = default_uid if default_uid in universes else "sp500_core"
            mkt = universes[uid].get("market", "US").upper()

        market_meta = markets_cfg.get(mkt, markets_cfg.get("US", {}))
        currency_code = market_meta.get("currency", "USD")
        currency_symbol = market_meta.get("currency_symbol", "$")

        universe_obj = universes[uid]
        tickers: List[str] = [
            str(t).upper() for t in universe_obj.get("tickers", [])
        ]
        stocks_meta = self.universe_config.get("stocks", {})
        sector_meta = self.universe_config.get("sector_meta", {})

        # Step 1: Determine expected trading date for this specific market
        session_guess = self.get_market_session_info(market=mkt)
        us_session_guess = self.get_market_session_info(market="US")
        cached_date = self.cache.get_latest_cached_trading_date(tickers=tickers)

        target_date = session_guess["trading_date"]
        min_acceptable_date = (
            min(target_date, us_session_guess["trading_date"])
            if mkt == "CRYPTO"
            else target_date
        )

        if not force_refresh and cached_date:
            cached_records = (
                self.cache.get_latest_equities_by_ticker(
                    tickers, min_trading_date=min_acceptable_date
                )
                if mkt == "CRYPTO"
                else self.cache.get_equities(cached_date, tickers)
            )
            if (
                len(cached_records) == len(tickers)
                and (
                    (cached_date >= target_date and not session_guess["is_intraday"])
                    or (mkt == "CRYPTO" and cached_date >= min_acceptable_date)
                )
            ):
                session_info = self.get_market_session_info(
                    market=mkt, reference_trading_date=cached_date
                )
                session_info["data_source"] = "SQLite Local Cache"
                session_info["cache_hit"] = True
                session_info["currency"] = currency_code
                session_info["currency_symbol"] = currency_symbol
                session_info["cached_at"] = next(
                    iter(cached_records.values())
                ).get("_cached_at", session_info["local_time"])
                indices_data = self.fetch_indices_snapshot(
                    cached_date, force_refresh=False, market=mkt
                )
                ordered_records = [
                    cached_records[t] for t in tickers if t in cached_records
                ]
                return {
                    "market": market_meta,
                    "universe": {
                        "id": uid,
                        "market": mkt,
                        "currency": currency_code,
                        "currency_symbol": currency_symbol,
                        "name": universe_obj.get("name", uid),
                        "name_en": universe_obj.get(
                            "name_en", universe_obj.get("name", uid)
                        ),
                        "name_zh": universe_obj.get(
                            "name_zh", universe_obj.get("name", uid)
                        ),
                        "description": universe_obj.get("description", ""),
                        "count": len(ordered_records),
                    },
                    "session": session_info,
                    "indices": indices_data,
                    "records": ordered_records,
                }

        probed_date = self._detect_latest_trading_date(market=mkt)
        if probed_date:
            target_date = probed_date

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
                "Fetching 1Y history from Yahoo Finance for %d %s tickers...",
                len(missing_tickers),
                mkt,
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
                    dates_found = [
                        pd.Timestamp(df.index[-1]).strftime("%Y-%m-%d")
                        for df in extracted_dfs.values()
                    ]
                    actual_trading_date = max(set(dates_found), key=dates_found.count)

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
                            market=mkt,
                            currency_code=currency_code,
                            currency_symbol=currency_symbol,
                        )
                        fetched_records.append(rec)

                    self.cache.save_equities(actual_trading_date, fetched_records)
            except Exception as exc:
                logger.error("Error fetching batch data from yfinance: %s", exc)

        all_records_map: Dict[str, Dict[str, Any]] = {}
        if actual_trading_date != target_date and not force_refresh:
            all_records_map.update(
                self.cache.get_equities(actual_trading_date, tickers)
            )
        else:
            all_records_map.update(cached_for_target)

        for r in fetched_records:
            all_records_map[r["ticker"]] = r

        if not all_records_map and cached_date:
            actual_trading_date = cached_date
            all_records_map = self.cache.get_equities(cached_date, tickers)

        ordered_records = [
            all_records_map[t] for t in tickers if t in all_records_map
        ]

        session_info = self.get_market_session_info(
            market=mkt, reference_trading_date=actual_trading_date
        )
        session_info["currency"] = currency_code
        session_info["currency_symbol"] = currency_symbol
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
            actual_trading_date, force_refresh=force_refresh, market=mkt
        )

        return {
            "market": market_meta,
            "universe": {
                "id": uid,
                "market": mkt,
                "currency": currency_code,
                "currency_symbol": currency_symbol,
                "name": universe_obj.get("name", uid),
                "name_en": universe_obj.get("name_en", universe_obj.get("name", uid)),
                "name_zh": universe_obj.get("name_zh", universe_obj.get("name", uid)),
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
        market: str = "US",
        currency_code: str = "USD",
        currency_symbol: str = "$",
    ) -> Dict[str, Any]:
        """Compute all required financial & technical metrics for a single ticker."""
        latest = tdf.iloc[-1]
        prev = tdf.iloc[-2] if len(tdf) >= 2 else latest

        price = float(latest["Close"])
        prev_close = float(prev["Close"])
        open_p = float(latest["Open"]) if not pd.isna(latest["Open"]) else price
        high_p = (
            float(latest["High"])
            if not pd.isna(latest["High"])
            else max(price, open_p)
        )
        low_p = (
            float(latest["Low"])
            if not pd.isna(latest["Low"])
            else min(price, open_p)
        )
        high_p = max(high_p, price, open_p)
        low_p = min(low_p, price, open_p)

        volume = int(float(latest["Volume"])) if not pd.isna(latest["Volume"]) else 0

        vol_series = tdf["Volume"].dropna()
        if len(vol_series) > 1:
            hist_vols = (
                vol_series.iloc[-21:-1]
                if len(vol_series) >= 21
                else vol_series.iloc[:-1]
            )
            avg_vol_20d = (
                float(hist_vols.mean()) if len(hist_vols) > 0 else float(volume)
            )
        else:
            avg_vol_20d = float(volume) if volume > 0 else 1.0

        rvol = (volume / avg_vol_20d) if avg_vol_20d > 0 else 1.0

        high_series = tdf["High"].dropna()
        low_series = tdf["Low"].dropna()
        high_52w = float(high_series.max()) if not high_series.empty else high_p
        low_52w = float(low_series.min()) if not low_series.empty else low_p
        high_52w = max(high_52w, high_p)
        low_52w = min(low_52w, low_p)

        change = price - prev_close
        change_pct = (change / prev_close * 100.0) if prev_close > 0 else 0.0

        intraday_range_pct = (
            (high_p - low_p) / prev_close * 100.0 if prev_close > 0 else 0.0
        )
        intraday_span = high_p - low_p
        intraday_pos_pct = (
            (price - low_p) / intraday_span * 100.0
            if intraday_span > 1e-9
            else 50.0
        )

        drawdown_52w_pct = (
            (price - high_52w) / high_52w * 100.0 if high_52w > 0 else 0.0
        )
        span_52w = high_52w - low_52w
        pos_52w_pct = (
            (price - low_52w) / span_52w * 100.0 if span_52w > 1e-9 else 50.0
        )

        # For Yahoo Finance *-USD crypto pairs, Volume is already reported in USD (24h dollar turnover)
        if sym.endswith("-USD"):
            turnover = float(volume)
        else:
            turnover = price * volume

        closes_20d = [
            self._round_price(float(x))
            for x in tdf["Close"].dropna().iloc[-20:].tolist()
        ]

        sector_en = meta.get("sector", "Information Technology")
        sector_cn = sector_meta.get(sector_en, {}).get("cn_name", sector_en)
        name_en = meta.get("name", sym)
        name_cn = meta.get("cn_name", name_en)
        display_ticker = meta.get(
            "display_ticker",
            sym[:-4] if sym.endswith("-USD") else sym,
        )

        return {
            "ticker": sym,
            "display_ticker": display_ticker,
            "market": market,
            "currency": currency_code,
            "currency_symbol": currency_symbol,
            "name": name_en,
            "cn_name": name_cn,
            "sector": sector_en,
            "sector_cn": sector_cn,
            "sector_label": f"{sector_cn} ({sector_en})",
            "trading_date": trading_date,
            "price": self._round_price(price),
            "prev_close": self._round_price(prev_close),
            "open": self._round_price(open_p),
            "high": self._round_price(high_p),
            "low": self._round_price(low_p),
            "change": self._round_price(change),
            "change_pct": round(change_pct, 2),
            "market_cap": round(market_cap, 0),
            "market_cap_b": round(market_cap / 1e9, 2),
            "market_cap_fmt": self.format_market_cap(market_cap, currency_symbol),
            "volume": volume,
            "volume_fmt": self.format_volume(volume),
            "avg_volume_20d": round(avg_vol_20d, 0),
            "avg_volume_20d_fmt": self.format_volume(avg_vol_20d),
            "rvol": round(rvol, 2),
            "turnover": round(turnover, 0),
            "turnover_b": round(turnover / 1e9, 2),
            "turnover_fmt": self.format_market_cap(turnover, currency_symbol),
            "intraday_range_pct": round(intraday_range_pct, 2),
            "intraday_pos_pct": round(float(np.clip(intraday_pos_pct, 0.0, 100.0)), 1),
            "high_52w": self._round_price(high_52w),
            "low_52w": self._round_price(low_52w),
            "drawdown_52w_pct": round(drawdown_52w_pct, 2),
            "pos_52w_pct": round(float(np.clip(pos_52w_pct, 0.0, 100.0)), 1),
            "sparkline_20d": closes_20d,
        }

    @staticmethod
    def _round_price(val: float) -> float:
        abs_v = abs(val)
        if abs_v == 0:
            return 0.0
        if abs_v >= 1.0:
            return round(val, 2)
        if abs_v >= 0.01:
            return round(val, 4)
        if abs_v >= 0.0001:
            return round(val, 6)
        return round(val, 8)

    @staticmethod
    def format_market_cap(val: float, currency_symbol: str = "$") -> str:
        if val >= 1e12:
            return f"{currency_symbol}{val / 1e12:.2f}T"
        if val >= 1e9:
            return f"{currency_symbol}{val / 1e9:.2f}B"
        if val >= 1e6:
            return f"{currency_symbol}{val / 1e6:.2f}M"
        return f"{currency_symbol}{val:,.0f}"

    @staticmethod
    def format_volume(val: float) -> str:
        if val >= 1e9:
            return f"{val / 1e9:.2f}B"
        if val >= 1e6:
            return f"{val / 1e6:.2f}M"
        if val >= 1e3:
            return f"{val / 1e3:.1f}K"
        return f"{int(val)}"
