"""
Widget 2 Analyzer: Top Gainers & Losers Bar Chart (多空涨跌幅龙虎榜).
Produces bidirectional horizontal ranking of Top 10 Gainers and Top 10 Losers,
enriched with Intraday Amplitude (%) and Turnover ($) for hover inspection.
"""

from __future__ import annotations

from typing import Any, Dict, List

import pandas as pd

from analyzers.base import AnalyzerRegistry, BaseAnalyzer


@AnalyzerRegistry.register
class TopGainersLosersAnalyzer(BaseAnalyzer):
    plugin_id = "top_gainers_losers"
    plugin_name = "多空涨跌幅龙虎榜 (Top 10 Gainers & Losers)"
    plugin_name_zh = "多空涨跌幅龙虎榜 (Top 10 Gainers & Losers)"
    plugin_name_en = "Top 10 Gainers & Losers Ranking"
    plugin_description = "双向水平条形图同屏对比涨幅前 10 与跌幅前 10 标的，含日内振幅与成交额"
    plugin_description_zh = "双向水平条形图同屏对比涨幅前 10 与跌幅前 10 标的，含日内振幅与成交额"
    plugin_description_en = "Bidirectional horizontal bar chart contrasting Top 10 Gainers vs Losers with intraday range & turnover"
    version = "1.0.0"

    def analyze(self, df: pd.DataFrame, records: List[Dict[str, Any]]) -> Dict[str, Any]:
        if df.empty:
            return {"gainers": [], "losers": [], "combined_bars": []}

        # Sort descending by change_pct for Gainers
        sorted_desc = df.sort_values(by="change_pct", ascending=False)
        # Sort ascending by change_pct for Losers
        sorted_asc = df.sort_values(by="change_pct", ascending=True)

        top_n = min(10, len(df))
        gainers_df = sorted_desc.head(top_n)
        losers_df = sorted_asc.head(top_n)

        def _serialize_list(sub_df: pd.DataFrame, side: str) -> List[Dict[str, Any]]:
            items: List[Dict[str, Any]] = []
            for rank, (_, row) in enumerate(sub_df.iterrows(), start=1):
                items.append(
                    {
                        "rank": rank,
                        "side": side,
                        "ticker": str(row["ticker"]),
                        "name": str(row["name"]),
                        "cn_name": str(row["cn_name"]),
                        "sector": str(row["sector"]),
                        "sector_cn": str(row["sector_cn"]),
                        "price": float(row["price"]),
                        "change": float(row["change"]),
                        "change_pct": float(row["change_pct"]),
                        "intraday_range_pct": float(row["intraday_range_pct"]),
                        "turnover": float(row["turnover"]),
                        "turnover_b": float(row["turnover_b"]),
                        "turnover_fmt": str(row["turnover_fmt"]),
                        "volume_fmt": str(row["volume_fmt"]),
                        "rvol": float(row["rvol"]),
                        "market_cap_fmt": str(row["market_cap_fmt"]),
                        "high": float(row["high"]),
                        "low": float(row["low"]),
                        "open": float(row["open"]),
                    }
                )
            return items

        gainers = _serialize_list(gainers_df, "GAINER")
        losers = _serialize_list(losers_df, "LOSER")

        # Paired rows (Rank 1..10) for synchronized dual/diverging horizontal bar rendering
        paired_ranks: List[Dict[str, Any]] = []
        for idx in range(top_n):
            paired_ranks.append(
                {
                    "rank": idx + 1,
                    "gainer": gainers[idx] if idx < len(gainers) else None,
                    "loser": losers[idx] if idx < len(losers) else None,
                }
            )

        return {
            "top_n": top_n,
            "gainers": gainers,
            "losers": losers,
            "paired_ranks": paired_ranks,
            "best_ticker": gainers[0] if gainers else None,
            "worst_ticker": losers[0] if losers else None,
        }
