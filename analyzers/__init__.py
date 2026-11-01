"""
MarketPulse Modular Analyzer Package.
Imports and registers all built-in analyzer plugins automatically.
"""

from analyzers.base import AnalyzerRegistry, BaseAnalyzer
from analyzers.gainers_losers_analyzer import TopGainersLosersAnalyzer
from analyzers.intraday_52w_analyzer import Intraday52WTableAnalyzer
from analyzers.overview_summary import OverviewSummaryAnalyzer
from analyzers.treemap_analyzer import MarketCapTreemapAnalyzer
from analyzers.volume_anomaly_analyzer import VolumeAnomalyScatterAnalyzer

__all__ = [
    "BaseAnalyzer",
    "AnalyzerRegistry",
    "OverviewSummaryAnalyzer",
    "MarketCapTreemapAnalyzer",
    "TopGainersLosersAnalyzer",
    "VolumeAnomalyScatterAnalyzer",
    "Intraday52WTableAnalyzer",
]
