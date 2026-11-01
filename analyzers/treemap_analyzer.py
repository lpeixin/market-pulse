"""
Widget 1 Analyzer: Market Cap Treemap (大盘市值热力图).
Builds a two-level GICS Sector -> Stock Ticker hierarchy where rectangle area
maps strictly to Market Cap and color intensity maps to daily return (%).
"""

from __future__ import annotations

from typing import Any, Dict, List

import pandas as pd

from analyzers.base import AnalyzerRegistry, BaseAnalyzer


@AnalyzerRegistry.register
class MarketCapTreemapAnalyzer(BaseAnalyzer):
    plugin_id = "market_cap_treemap"
    plugin_name = "大盘市值热力图 (Market Cap Treemap)"
    plugin_name_zh = "大盘市值热力图 (Market Cap Treemap)"
    plugin_name_en = "Market Cap Treemap"
    plugin_description = "按 GICS 行业 -> 个股两级嵌套，面积严格映射市值，色阶映射涨跌幅"
    plugin_description_zh = "按 GICS 行业 -> 个股两级嵌套，面积严格映射市值，色阶映射涨跌幅"
    plugin_description_en = "Two-level GICS Sector -> Stock hierarchy mapping area to Market Cap and color to Daily Return (%)"
    version = "1.0.0"

    def analyze(self, df: pd.DataFrame, records: List[Dict[str, Any]]) -> Dict[str, Any]:
        if df.empty:
            return {"tree": [], "sector_summary": [], "color_domain": [-5.0, 5.0]}

        total_universe_mcap = float(df["market_cap"].sum())
        tree_nodes: List[Dict[str, Any]] = []
        sector_summary: List[Dict[str, Any]] = []

        for (sector_en, sector_cn), grp in df.groupby(["sector", "sector_cn"]):
            sec_mcap = float(grp["market_cap"].sum())
            sec_mcap_b = round(sec_mcap / 1e9, 2)
            sec_weighted_ret = (
                float((grp["change_pct"] * grp["market_cap"]).sum() / sec_mcap)
                if sec_mcap > 0
                else float(grp["change_pct"].mean())
            )
            sec_turnover = float(grp["turnover"].sum())
            sec_weight_pct = (
                round(sec_mcap / total_universe_mcap * 100.0, 2)
                if total_universe_mcap > 0
                else 0.0
            )

            # Sort stocks within sector by Market Cap descending
            grp_sorted = grp.sort_values(by="market_cap", ascending=False)
            children: List[Dict[str, Any]] = []
            for _, row in grp_sorted.iterrows():
                mcap = float(row["market_cap"])
                mcap_b = round(mcap / 1e9, 2)
                chg_pct = float(row["change_pct"])
                price = float(row["price"])
                children.append(
                    {
                        "name": str(row["ticker"]),
                        "ticker": str(row["ticker"]),
                        "company_name": str(row["name"]),
                        "cn_name": str(row["cn_name"]),
                        "sector": sector_en,
                        "sector_cn": sector_cn,
                        "value": mcap_b,  # ECharts treemap uses first value or scalar value for area
                        "market_cap": mcap,
                        "market_cap_b": mcap_b,
                        "market_cap_fmt": str(row["market_cap_fmt"]),
                        "price": price,
                        "change": float(row["change"]),
                        "change_pct": round(chg_pct, 2),
                        "rvol": float(row["rvol"]),
                        "volume_fmt": str(row["volume_fmt"]),
                        "turnover_fmt": str(row["turnover_fmt"]),
                        "intraday_range_pct": float(row["intraday_range_pct"]),
                        "drawdown_52w_pct": float(row["drawdown_52w_pct"]),
                        "high_52w": float(row["high_52w"]),
                        "low_52w": float(row["low_52w"]),
                        "weight_in_sector_pct": round(mcap / sec_mcap * 100.0, 1)
                        if sec_mcap > 0
                        else 0.0,
                    }
                )

            sector_label = f"{sector_cn} · {sector_en}"
            tree_nodes.append(
                {
                    "name": sector_label,
                    "sector": sector_en,
                    "sector_cn": sector_cn,
                    "value": sec_mcap_b,
                    "market_cap": sec_mcap,
                    "market_cap_b": sec_mcap_b,
                    "market_cap_fmt": f"${sec_mcap / 1e12:.2f}T"
                    if sec_mcap >= 1e12
                    else f"${sec_mcap / 1e9:.2f}B",
                    "change_pct": round(sec_weighted_ret, 2),
                    "turnover_fmt": f"${sec_turnover / 1e9:.2f}B",
                    "weight_pct": sec_weight_pct,
                    "stock_count": len(children),
                    "children": children,
                }
            )

            sector_summary.append(
                {
                    "sector": sector_en,
                    "sector_cn": sector_cn,
                    "market_cap_b": sec_mcap_b,
                    "weight_pct": sec_weight_pct,
                    "change_pct": round(sec_weighted_ret, 2),
                    "stock_count": len(children),
                }
            )

        # Sort sectors by total market cap descending
        tree_nodes.sort(key=lambda x: x["market_cap"], reverse=True)
        sector_summary.sort(key=lambda x: x["market_cap_b"], reverse=True)

        return {
            "tree": tree_nodes,
            "sector_summary": sector_summary,
            "color_domain": [-5.0, 5.0],
        }
