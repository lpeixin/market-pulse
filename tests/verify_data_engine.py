"""
Verification script for MarketPulse Multi-Market Data Engine (US / CN A-Shares / HK),
SQLite Cache, and Modular Analyzers.
"""

import sys
import time
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from analyzers import AnalyzerRegistry
from core.data_fetcher import MarketDataFetcher


def main() -> None:
    print("=" * 78)
    print("MarketPulse V1.1 — Multi-Market (US / CN / HK) Data Engine Verification")
    print("=" * 78)

    fetcher = MarketDataFetcher()

    market_universes = [
        ("US", ["sp500_core", "nasdaq_core", "mega_tech", "custom_watchlist"]),
        ("CN", ["cn_csi300_core", "cn_tech_growth", "cn_custom_watchlist"]),
        ("HK", ["hk_hsi_core", "hk_hstech_core", "hk_custom_watchlist"]),
        (
            "CRYPTO",
            [
                "crypto_top_core",
                "crypto_defi_infra",
                "crypto_equities_etf",
                "crypto_custom_watchlist",
            ],
        ),
    ]

    for mkt, uids in market_universes:
        primary_uid = uids[0]
        t0 = time.perf_counter()
        payload = fetcher.fetch_universe_data(
            universe_id=primary_uid, force_refresh=False, market=mkt
        )
        t1 = time.perf_counter()

        # Pre-warm secondary universes for this market
        for uid in uids[1:]:
            fetcher.fetch_universe_data(
                universe_id=uid, force_refresh=False, market=mkt
            )

        session = payload["session"]
        records = payload["records"]
        indices = payload["indices"]
        csym = payload["universe"].get("currency_symbol", "$")

        print(f"\n[{mkt} MARKET] Primary Universe: {payload['universe']['name_en']} ({primary_uid})")
        print(f"  - Trading Date Detected : {session['trading_date']} ({session['market_time']})")
        print(f"  - Market Session        : {session['session_code']} ({session['session_label']})")
        print(f"  - Currency / Source     : {payload['universe']['currency']} ({csym}) | {session['data_source']}")
        print(f"  - Fetch Elapsed         : {t1 - t0:.2f}s | Equities: {len(records)} | Indices: {len(indices)}")

        assert len(records) >= 15, f"Expected >=15 stocks for {mkt}, got {len(records)}"

        print(f"  - {mkt} Core Indices:")
        for idx in indices:
            sign = "+" if idx["change_pct"] >= 0 else ""
            print(
                f"      {idx['short_name']:<8} ({idx['name_zh']:<10} / {idx['name_en']:<20}): "
                f"{idx['price']:>10,.2f}  ({sign}{idx['change_pct']:.2f}%)"
            )

        widgets = AnalyzerRegistry.run_all(records)
        ov = widgets["overview_summary"]
        gl = widgets["top_gainers_losers"]
        va = widgets["volume_anomaly_scatter"]
        print(
            f"  - Analyzer Summary      : Total MCap={ov['total_market_cap_fmt']} | "
            f"Cap-Wtd Return={ov['cap_weighted_return_pct']:+.2f}% | "
            f"Breadth={ov['advancers']} Adv / {ov['decliners']} Dec | "
            f"Anomalies={len(va['anomalies'])}"
        )
        if gl["best_ticker"] and gl["worst_ticker"]:
            print(
                f"  - Top Gainer / Loser    : {gl['best_ticker']['ticker']} ({gl['best_ticker']['cn_name']} "
                f"{gl['best_ticker']['change_pct']:+.2f}%) vs "
                f"{gl['worst_ticker']['ticker']} ({gl['worst_ticker']['cn_name']} "
                f"{gl['worst_ticker']['change_pct']:+.2f}%)"
            )

        # Verify SQLite Cache Hit speed
        tc0 = time.perf_counter()
        cached_payload = fetcher.fetch_universe_data(
            universe_id=primary_uid, force_refresh=False, market=mkt
        )
        tc1 = time.perf_counter()
        print(
            f"  - SQLite Cache Hit      : {(tc1 - tc0) * 1000:.2f}ms "
            f"(Source='{cached_payload['session']['data_source']}')"
        )

    print("\n" + "=" * 78)
    print("ALL 4 MARKETS (US / CN A-SHARES / HK STOCKS / CRYPTO) & ANALYZERS PASSED!")
    print("=" * 78)


if __name__ == "__main__":
    main()
