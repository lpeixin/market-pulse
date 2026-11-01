"""
Widget 4 Analyzer: Intraday Range & 52W Drawdown Table (日内多空博弈与 52 周水位表).
Provides compact tabular insights with:
- Visual Intraday Price Position Bar (Low - Open/Close - High)
- Drawdown from 52W High (%) progress bar & 52W range water level
"""

from __future__ import annotations

from typing import Any, Dict, List

import pandas as pd

from analyzers.base import AnalyzerRegistry, BaseAnalyzer


@AnalyzerRegistry.register
class Intraday52WTableAnalyzer(BaseAnalyzer):
    plugin_id = "intraday_52w_table"
    plugin_name = "日内多空博弈与 52 周水位表 (Intraday Range & 52W Drawdown)"
    plugin_description = "包含日内价格位置条 (Low-Close-High) 与距离 52 周高点回撤幅度进度条"
    version = "1.0.0"

    def analyze(self, df: pd.DataFrame, records: List[Dict[str, Any]]) -> Dict[str, Any]:
        if df.empty:
            return {"rows": [], "summary": {}}

        # Default sort by Market Cap descending (frontend also supports interactive column sorting)
        sorted_df = df.sort_values(by="market_cap", ascending=False)
        rows: List[Dict[str, Any]] = []

        for _, row in sorted_df.iterrows():
            low_p = float(row["low"])
            high_p = float(row["high"])
            open_p = float(row["open"])
            close_p = float(row["price"])
            span = high_p - low_p
            open_pos_pct = (
                round((open_p - low_p) / span * 100.0, 1) if span > 1e-9 else 50.0
            )
            open_pos_pct = max(0.0, min(100.0, open_pos_pct))
            close_pos_pct = float(row["intraday_pos_pct"])

            dd_52w = float(row["drawdown_52w_pct"])  # e.g., -14.2%
            if dd_52w >= -3.0:
                regime_52w = "NEAR_ATH"
                regime_label = "逼近新高"
            elif dd_52w >= -10.0:
                regime_52w = "HEALTHY"
                regime_label = "强势区间"
            elif dd_52w >= -20.0:
                regime_52w = "CORRECTION"
                regime_label = "技术回调"
            else:
                regime_52w = "DEEP_DRAWDOWN"
                regime_label = "深度回撤"

            rows.append(
                {
                    "ticker": str(row["ticker"]),
                    "name": str(row["name"]),
                    "cn_name": str(row["cn_name"]),
                    "sector": str(row["sector"]),
                    "sector_cn": str(row["sector_cn"]),
                    "price": close_p,
                    "prev_close": float(row["prev_close"]),
                    "open": open_p,
                    "high": high_p,
                    "low": low_p,
                    "change": float(row["change"]),
                    "change_pct": float(row["change_pct"]),
                    "market_cap": float(row["market_cap"]),
                    "market_cap_b": float(row["market_cap_b"]),
                    "market_cap_fmt": str(row["market_cap_fmt"]),
                    "rvol": float(row["rvol"]),
                    "volume_fmt": str(row["volume_fmt"]),
                    "turnover_fmt": str(row["turnover_fmt"]),
                    "intraday_range_pct": float(row["intraday_range_pct"]),
                    "intraday_pos_pct": close_pos_pct,
                    "intraday_open_pos_pct": open_pos_pct,
                    "is_bullish_candle": close_p >= open_p,
                    "high_52w": float(row["high_52w"]),
                    "low_52w": float(row["low_52w"]),
                    "drawdown_52w_pct": dd_52w,
                    "drawdown_abs_pct": round(abs(dd_52w), 2),
                    "pos_52w_pct": float(row["pos_52w_pct"]),
                    "regime_52w": regime_52w,
                    "regime_label": regime_label,
                    "sparkline_20d": row.get("sparkline_20d", []),
                }
            )

        strong_close_count = int((df["intraday_pos_pct"] >= 75.0).sum())
        weak_close_count = int((df["intraday_pos_pct"] <= 25.0).sum())
        near_high_52w_count = int((df["drawdown_52w_pct"] >= -5.0).sum())
        deep_dd_52w_count = int((df["drawdown_52w_pct"] <= -20.0).sum())

        return {
            "rows": rows,
            "summary": {
                "total": len(rows),
                "strong_intraday_close_count": strong_close_count,
                "weak_intraday_close_count": weak_close_count,
                "near_52w_high_count": near_high_52w_count,
                "deep_drawdown_count": deep_dd_52w_count,
                "avg_drawdown_52w_pct": round(float(df["drawdown_52w_pct"].mean()), 2),
            },
        }
