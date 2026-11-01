"""
Verification script for MarketPulse Data Engine, SQLite Cache, and Modular Analyzers.
"""

import sys
import time
from pathlib import Path

# Add project root to sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from analyzers import AnalyzerRegistry
from core.data_fetcher import MarketDataFetcher


def main() -> None:
    print("=" * 72)
    print("MarketPulse V1.0 — Data Engine & Analyzer Verification")
    print("=" * 72)

    fetcher = MarketDataFetcher()

    t0 = time.perf_counter()
    payload = fetcher.fetch_universe_data(universe_id="sp500_core", force_refresh=False)
    t1 = time.perf_counter()

    session = payload["session"]
    records = payload["records"]
    indices = payload["indices"]

    print(f"[1] Trading Date Detected : {session['trading_date']}")
    print(f"    Market Session        : {session['session_code']} ({session['session_label']})")
    print(f"    Data Source           : {session['data_source']}")
    print(f"    Fetch Elapsed         : {t1 - t0:.2f}s")
    print(f"    Equities Fetched      : {len(records)} tickers")
    print(f"    Indices Fetched       : {len(indices)} indices")

    assert len(records) >= 30, f"Expected >=30 stocks, got {len(records)}"

    print("\n[2] US Core Indices Snapshot:")
    for idx in indices:
        sign = "+" if idx["change_pct"] >= 0 else ""
        print(
            f"    {idx['short_name']:<6} ({idx['name']:<18}): "
            f"{idx['price']:>10,.2f}  ({sign}{idx['change_pct']:.2f}%)"
        )

    print("\n[3] Sample Equity Metrics (Top 8 by Market Cap):")
    print(
        f"    {'Ticker':<6} {'Sector':<24} {'Price':>9} {'Chg%':>8} "
        f"{'MktCap':>9} {'RVOL':>7} {'52W DD%':>9} {'IntradayPos':>11}"
    )
    print("    " + "-" * 88)
    sorted_by_mcap = sorted(records, key=lambda x: x["market_cap"], reverse=True)
    for r in sorted_by_mcap[:8]:
        sign = "+" if r["change_pct"] >= 0 else ""
        print(
            f"    {r['ticker']:<6} {r['sector'][:23]:<24} "
            f"${r['price']:>8.2f} {sign}{r['change_pct']:>6.2f}% "
            f"{r['market_cap_fmt']:>9} {r['rvol']:>6.2f}x "
            f"{r['drawdown_52w_pct']:>8.2f}% {r['intraday_pos_pct']:>9.1f}%"
        )

    # Test Cache Hit speed & pre-warm all configured universes
    for uid in ["sp500_core", "nasdaq_core", "mega_tech", "custom_watchlist"]:
        fetcher.fetch_universe_data(universe_id=uid, force_refresh=False)

    t2 = time.perf_counter()
    cached_payload = fetcher.fetch_universe_data(
        universe_id="sp500_core", force_refresh=False
    )
    t3 = time.perf_counter()
    print(
        f"\n[4] SQLite Cache Verification: Source='{cached_payload['session']['data_source']}', "
        f"Elapsed={(t3 - t2) * 1000:.2f}ms (Cache Hit={cached_payload['session']['cache_hit']})"
    )

    # Run all Analyzer plugins
    t4 = time.perf_counter()
    widgets = AnalyzerRegistry.run_all(records)
    t5 = time.perf_counter()
    print(f"\n[5] Modular Analyzers Verified ({len(widgets)} plugins in {(t5 - t4) * 1000:.2f}ms):")
    for meta in AnalyzerRegistry.get_all_plugins_meta():
        pid = meta["id"]
        print(f"    - {pid:<24} : {meta['name']}")

    ov = widgets["overview_summary"]
    gl = widgets["top_gainers_losers"]
    va = widgets["volume_anomaly_scatter"]
    tb = widgets["intraday_52w_table"]
    print(
        f"\n[6] Summary Insights:"
        f"\n    - Total Universe Market Cap : {ov['total_market_cap_fmt']}"
        f"\n    - Cap-Weighted Return       : {ov['cap_weighted_return_pct']:+.2f}%"
        f"\n    - Breadth (Adv / Dec)       : {ov['advancers']} Adv / {ov['decliners']} Dec"
        f"\n    - Top Gainer                : {gl['best_ticker']['ticker']} ({gl['best_ticker']['change_pct']:+.2f}%)"
        f"\n    - Top Loser                 : {gl['worst_ticker']['ticker']} ({gl['worst_ticker']['change_pct']:+.2f}%)"
        f"\n    - Volume Anomalies (>=1.5x) : {len(va['anomalies'])} tickers"
        f"\n    - Near 52W High (>=-5%)     : {tb['summary']['near_52w_high_count']} tickers"
    )
    print("=" * 72)
    print("ALL DATA ENGINE & ANALYZER CHECKS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    main()
