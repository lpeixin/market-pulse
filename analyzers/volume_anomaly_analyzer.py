"""
Widget 3 Analyzer: Volume Anomaly vs. Return Scatter (量价异动雷达).
X-axis: Daily Return (%)
Y-axis: Relative Volume Ratio (RVOL = Volume / 20D Avg Volume)
Bubble Size: Market Cap
Reference line at RVOL = 1.5x to capture high-volume breakouts and selloffs.
"""

from __future__ import annotations

from typing import Any, Dict, List

import numpy as np
import pandas as pd

from analyzers.base import AnalyzerRegistry, BaseAnalyzer


@AnalyzerRegistry.register
class VolumeAnomalyScatterAnalyzer(BaseAnalyzer):
    plugin_id = "volume_anomaly_scatter"
    plugin_name = "量价异动雷达 (Volume Anomaly vs. Return)"
    plugin_name_zh = "量价异动雷达 (Volume Anomaly vs. Return)"
    plugin_name_en = "Volume Anomaly vs. Return Radar"
    plugin_description = "X轴涨跌幅 vs Y轴相对成交量比率(RVOL)，1.5x 阈值捕捉放量突破与放量杀跌"
    plugin_description_zh = "X轴涨跌幅 vs Y轴相对成交量比率(RVOL)，1.5x 阈值捕捉放量突破与放量杀跌"
    plugin_description_en = "X-axis Return (%) vs Y-axis Relative Volume (RVOL) with 1.5x anomaly threshold for breakouts & selloffs"
    version = "1.0.0"

    RVOL_THRESHOLD = 1.5

    def analyze(self, df: pd.DataFrame, records: List[Dict[str, Any]]) -> Dict[str, Any]:
        if df.empty:
            return {
                "rvol_threshold": self.RVOL_THRESHOLD,
                "points": [],
                "anomalies": [],
                "quadrant_counts": {
                    "breakout_surge": 0,
                    "heavy_selloff": 0,
                    "quiet_advance": 0,
                    "quiet_pullback": 0,
                },
            }

        points: List[Dict[str, Any]] = []
        quadrant_counts = {
            "breakout_surge": 0,  # RVOL >= 1.5 and change_pct >= 0
            "heavy_selloff": 0,   # RVOL >= 1.5 and change_pct < 0
            "quiet_advance": 0,   # RVOL < 1.5 and change_pct >= 0
            "quiet_pullback": 0,  # RVOL < 1.5 and change_pct < 0
        }

        max_mcap_b = float(df["market_cap_b"].max()) if len(df) else 1000.0
        min_mcap_b = float(df["market_cap_b"].min()) if len(df) else 10.0

        for _, row in df.iterrows():
            chg = float(row["change_pct"])
            rvol = float(row["rvol"])
            mcap_b = float(row["market_cap_b"])

            if rvol >= self.RVOL_THRESHOLD and chg >= 0:
                quadrant = "BREAKOUT_SURGE"
                quadrant_label = "放量突破 (RVOL ≥ 1.5x)"
                quadrant_label_en = "Breakout Surge (RVOL ≥ 1.5x)"
                quadrant_counts["breakout_surge"] += 1
            elif rvol >= self.RVOL_THRESHOLD and chg < 0:
                quadrant = "HEAVY_SELLOFF"
                quadrant_label = "放量杀跌 (RVOL ≥ 1.5x)"
                quadrant_label_en = "Heavy Selloff (RVOL ≥ 1.5x)"
                quadrant_counts["heavy_selloff"] += 1
            elif chg >= 0:
                quadrant = "QUIET_ADVANCE"
                quadrant_label = "温和上涨"
                quadrant_label_en = "Normal Advance"
                quadrant_counts["quiet_advance"] += 1
            else:
                quadrant = "QUIET_PULLBACK"
                quadrant_label = "缩量/常规回调"
                quadrant_label_en = "Normal Pullback"
                quadrant_counts["quiet_pullback"] += 1

            # Compute normalized visual bubble size (12px .. 46px) using sqrt of Market Cap
            if max_mcap_b > min_mcap_b:
                norm = (np.sqrt(mcap_b) - np.sqrt(min_mcap_b)) / (
                    np.sqrt(max_mcap_b) - np.sqrt(min_mcap_b)
                )
            else:
                norm = 0.5
            symbol_size = round(float(13.0 + norm * 33.0), 1)

            points.append(
                {
                    "ticker": str(row["ticker"]),
                    "name": str(row["name"]),
                    "cn_name": str(row["cn_name"]),
                    "sector": str(row["sector"]),
                    "sector_cn": str(row["sector_cn"]),
                    "change_pct": chg,
                    "rvol": rvol,
                    "price": float(row["price"]),
                    "market_cap_b": mcap_b,
                    "market_cap_fmt": str(row["market_cap_fmt"]),
                    "volume_fmt": str(row["volume_fmt"]),
                    "avg_volume_20d_fmt": str(row["avg_volume_20d_fmt"]),
                    "turnover_fmt": str(row["turnover_fmt"]),
                    "intraday_range_pct": float(row["intraday_range_pct"]),
                    "drawdown_52w_pct": float(row["drawdown_52w_pct"]),
                    "symbol_size": symbol_size,
                    "quadrant": quadrant,
                    "quadrant_label": quadrant_label,
                    "quadrant_label_zh": quadrant_label,
                    "quadrant_label_en": quadrant_label_en,
                    "is_anomaly": rvol >= self.RVOL_THRESHOLD,
                }
            )

        # Sort anomalies by RVOL descending
        anomalies = [p for p in points if p["is_anomaly"]]
        anomalies.sort(key=lambda x: x["rvol"], reverse=True)

        return {
            "rvol_threshold": self.RVOL_THRESHOLD,
            "points": points,
            "anomalies": anomalies,
            "quadrant_counts": quadrant_counts,
        }
