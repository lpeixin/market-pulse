"""
Base plugin interface and registry for MarketPulse quantitative & visual analyzers.
New modules (e.g., Historical Max Drawdown, ETF Flows, Volatility Regime) simply
subclass BaseAnalyzer and register with AnalyzerRegistry.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Type

import pandas as pd


class BaseAnalyzer(ABC):
    """Abstract base class for all modular dashboard analyzers."""

    plugin_id: str = "base"
    plugin_name: str = "Base Analyzer"
    plugin_name_en: str = "Base Analyzer"
    plugin_name_zh: str = "基础分析器"
    plugin_description: str = ""
    plugin_description_en: str = ""
    plugin_description_zh: str = ""
    version: str = "1.0.0"

    @abstractmethod
    def analyze(self, df: pd.DataFrame, records: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Execute quantitative/visual transformation on the standardized universe DataFrame.
        Must return a JSON-serializable dictionary payload for the frontend widget.
        """
        raise NotImplementedError


class AnalyzerRegistry:
    """Central plugin registry managing all active MarketPulse analyzers."""

    _registry: Dict[str, Type[BaseAnalyzer]] = {}

    @classmethod
    def register(cls, analyzer_cls: Type[BaseAnalyzer]) -> Type[BaseAnalyzer]:
        cls._registry[analyzer_cls.plugin_id] = analyzer_cls
        return analyzer_cls

    @classmethod
    def get_all_plugins_meta(cls) -> List[Dict[str, str]]:
        return [
            {
                "id": a_cls.plugin_id,
                "name": a_cls.plugin_name,
                "name_en": getattr(a_cls, "plugin_name_en", a_cls.plugin_name),
                "name_zh": getattr(a_cls, "plugin_name_zh", a_cls.plugin_name),
                "description": a_cls.plugin_description,
                "description_en": getattr(
                    a_cls, "plugin_description_en", a_cls.plugin_description
                ),
                "description_zh": getattr(
                    a_cls, "plugin_description_zh", a_cls.plugin_description
                ),
                "version": a_cls.version,
            }
            for a_cls in cls._registry.values()
        ]

    @classmethod
    def run_all(
        cls, records: List[Dict[str, Any]]
    ) -> Dict[str, Dict[str, Any]]:
        """Run all registered analyzers and return keyed widget payloads."""
        df = pd.DataFrame(records) if records else pd.DataFrame()
        results: Dict[str, Dict[str, Any]] = {}
        for plugin_id, analyzer_cls in cls._registry.items():
            analyzer = analyzer_cls()
            results[plugin_id] = analyzer.analyze(df, records)
        return results
