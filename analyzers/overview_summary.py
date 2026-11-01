"""
Market Breadth & Overview Summary Analyzer.
Computes market-wide KPIs, advance/decline breadth, and sector rankings.
"""

from __future__ import annotations

from typing import Any, Dict, List

import numpy as np
import pandas as pd

from analyzers.base import AnalyzerRegistry, BaseAnalyzer


@AnalyzerRegistry.register
class OverviewSummaryAnalyzer(BaseAnalyzer):
    plugin_id = "overview_summary"
    plugin_name = "全市场宽度与核心指标 (Market Breadth & KPI)"
    plugin_description = "计算股票池涨跌家数比、市值加权涨跌幅、总成交额与行业板块强弱排序"
    version = "1.0.0"

    def analyze(self, df: pd.DataFrame, records: List[Dict[str, Any]]) -> Dict[str, Any]:
        if df.empty:
            return {
                "total_stocks": 0,
                "advancers": 0,
                "decliners": 0,
                "unchanged": 0,
                "total_market_cap_fmt": "$0",
                "total_turnover_fmt": "$0",
                "cap_weighted_return_pct": 0.0,
                "equal_weighted_return_pct": 0.0,
                "median_return_pct": 0.0,
                "anomaly_volume_count": 0,
                "near_52w_high_count": 0,
                "sector_ranking": [],
            }

        total_stocks = len(df)
        advancers = int((df["change_pct"] > 0.01).sum())
        decliners = int((df["change_pct"] < -0.01).sum())
        unchanged = total_stocks - advancers - decliners

        total_mcap = float(df["market_cap"].sum())
        total_turnover = float(df["turnover"].sum())

        if total_mcap > 0:
            cap_weighted_ret = float(
                (df["change_pct"] * df["market_cap"]).sum() / total_mcap
            )
        else:
            cap_weighted_ret = float(df["change_pct"].mean())

        equal_weighted_ret = float(df["change_pct"].mean())
        median_ret = float(df["change_pct"].median())
        anomaly_vol_count = int((df["rvol"] >= 1.5).sum())
        near_52w_high_count = int((df["drawdown_52w_pct"] >= -5.0).sum())

        # Sector ranking by cap-weighted return
        sector_rows = []
        for (sector_en, sector_cn), grp in df.groupby(["sector", "sector_cn"]):
            sec_mcap = float(grp["market_cap"].sum())
            sec_ret = (
                float((grp["change_pct"] * grp["market_cap"]).sum() / sec_mcap)
                if sec_mcap > 0
                else float(grp["change_pct"].mean())
            )
            sector_rows.append(
                {
                    "sector": sector_en,
                    "sector_cn": sector_cn,
                    "count": int(len(grp)),
                    "market_cap": sec_mcap,
                    "market_cap_b": round(sec_mcap / 1e9, 2),
                    "change_pct": round(sec_ret, 2),
                }
            )
        sector_rows.sort(key=lambda x: x["change_pct"], reverse=True)

        return {
            "total_stocks": total_stocks,
            "advancers": advancers,
            "decliners": decliners,
            "unchanged": unchanged,
            "advance_ratio_pct": round(advancers / total_stocks * 100.0, 1)
            if total_stocks
            else 0.0,
            "total_market_cap": total_mcap,
            "total_market_cap_fmt": f"${total_mcap / 1e12:.2f}T"
            if total_mcap >= 1e12
            else f"${total_mcap / 1e9:.2f}B",
            "total_turnover": total_turnover,
            "total_turnover_fmt": f"${total_turnover / 1e9:.2f}B",
            "cap_weighted_return_pct": round(cap_weighted_ret, 2),
            "equal_weighted_return_pct": round(equal_weighted_ret, 2),
            "median_return_pct": round(median_ret, 2),
            "anomaly_volume_count": anomaly_vol_count,
            "near_52w_high_count": near_52w_high_count,
            "sector_ranking": sector_rows,
        }
