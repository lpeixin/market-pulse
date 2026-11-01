"""
MarketPulse — FastAPI Backend & Cross-Platform PyWebView Desktop Entrypoint.

Usage:
  1. Native Desktop App Mode (PyWebView window + embedded FastAPI server):
     python app.py

  2. Browser Debug Mode (Opens in default browser + FastAPI server):
     python app.py --browser

  3. Headless / Local Server Mode (FastAPI server only on http://127.0.0.1:8765):
     python app.py --server-only
"""

from __future__ import annotations

import argparse
import logging
import socket
import threading
import time
import webbrowser
from pathlib import Path
from typing import Any, Dict, List

import requests
import uvicorn
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from analyzers import AnalyzerRegistry
from core.data_fetcher import MarketDataFetcher

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("MarketPulse.App")

BASE_DIR = Path(__file__).resolve().parent
UI_DIR = BASE_DIR / "ui"
STATIC_DIR = UI_DIR / "static"

app = FastAPI(
    title="MarketPulse Quantitative Visual Terminal API",
    description="Local US Stock Market Data Engine & Multi-Dimensional Visual Analyzer",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

fetcher = MarketDataFetcher()


class WatchlistUpdatePayload(BaseModel):
    tickers: List[str]


@app.get("/", include_in_schema=False)
def serve_index() -> FileResponse:
    """Serve the main Dark Mode Financial Terminal UI."""
    return FileResponse(str(UI_DIR / "index.html"))


@app.get("/api/health")
def api_health() -> Dict[str, Any]:
    """Health check endpoint."""
    return {
        "status": "ok",
        "app": "MarketPulse",
        "version": "1.0.0",
        "plugins_loaded": len(AnalyzerRegistry.get_all_plugins_meta()),
    }


@app.get("/api/universes")
def api_get_universes() -> Dict[str, Any]:
    """Return all configured stock universes and registered analyzer plugins."""
    return {
        "universes": fetcher.get_universes_summary(),
        "plugins": AnalyzerRegistry.get_all_plugins_meta(),
    }


@app.get("/api/dashboard")
def api_get_dashboard(
    universe: str = Query("sp500_core", description="Stock universe ID"),
    force_refresh: bool = Query(False, description="Force live fetch from Yahoo Finance"),
) -> JSONResponse:
    """
    Fetch market data for the requested universe (using SQLite cache unless force_refresh=True)
    and run all registered modular visual analyzers.
    """
    t0 = time.perf_counter()
    raw_bundle = fetcher.fetch_universe_data(
        universe_id=universe, force_refresh=force_refresh
    )
    records = raw_bundle.get("records", [])
    widgets = AnalyzerRegistry.run_all(records)
    elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)

    response_payload = {
        "universe": raw_bundle["universe"],
        "universes_list": fetcher.get_universes_summary(),
        "session": {
            **raw_bundle["session"],
            "compute_ms": elapsed_ms,
        },
        "indices": raw_bundle["indices"],
        "records": records,
        "widgets": widgets,
        "plugins": AnalyzerRegistry.get_all_plugins_meta(),
    }
    return JSONResponse(content=response_payload)


@app.post("/api/watchlist")
def api_update_watchlist(payload: WatchlistUpdatePayload) -> Dict[str, Any]:
    """Update the tickers in custom_watchlist and persist to SQLite metadata."""
    updated = fetcher.update_custom_watchlist(payload.tickers)
    return {
        "status": "ok",
        "universe_id": "custom_watchlist",
        "tickers": updated,
        "count": len(updated),
    }


def find_available_port(preferred_port: int = 8765) -> int:
    """Check if preferred_port is free; otherwise find an available local port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        if s.connect_ex(("127.0.0.1", preferred_port)) != 0:
            return preferred_port
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def wait_for_server(url: str, timeout: float = 10.0) -> bool:
    """Poll health endpoint until server is ready."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            resp = requests.get(f"{url}/api/health", timeout=0.5)
            if resp.status_code == 200:
                return True
        except Exception:
            pass
        time.sleep(0.15)
    return False


def start_background_server(host: str, port: int) -> threading.Thread:
    """Start Uvicorn server in a daemon thread."""
    config = uvicorn.Config(
        app=app,
        host=host,
        port=port,
        log_level="warning",
        access_log=False,
    )
    server = uvicorn.Server(config=config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    return thread


def main() -> None:
    parser = argparse.ArgumentParser(
        description="MarketPulse — US Stock Market Visual Terminal"
    )
    parser.add_argument(
        "--host", default="127.0.0.1", help="Bind host (default: 127.0.0.1)"
    )
    parser.add_argument(
        "--port", type=int, default=8765, help="Bind port (default: 8765)"
    )
    parser.add_argument(
        "--browser",
        action="store_true",
        help="Open in default web browser instead of native PyWebView window",
    )
    parser.add_argument(
        "--server-only",
        action="store_true",
        help="Run FastAPI server only without launching a GUI window",
    )
    args = parser.parse_args()

    port = (
        args.port
        if args.server_only
        else find_available_port(preferred_port=args.port)
    )
    url = f"http://{args.host}:{port}"

    if args.server_only:
        logger.info("Starting MarketPulse Server at %s", url)
        uvicorn.run(app, host=args.host, port=port, log_level="info")
        return

    logger.info("Starting MarketPulse local backend at %s ...", url)
    start_background_server(args.host, port)
    wait_for_server(url, timeout=10.0)
    logger.info("MarketPulse backend ready at %s", url)

    if args.browser:
        logger.info("Opening MarketPulse in web browser: %s", url)
        webbrowser.open(url)
        try:
            while True:
                time.sleep(1.0)
        except KeyboardInterrupt:
            logger.info("Shutting down MarketPulse.")
        return

    # Default: Launch native cross-platform desktop window via pywebview
    try:
        import webview

        logger.info("Launching native PyWebView desktop window...")
        window = webview.create_window(
            title="MarketPulse — 美股多维量化行情可视化终端",
            url=url,
            width=1540,
            height=960,
            min_size=(1100, 720),
            background_color="#070b12",
            text_select=True,
        )
        webview.start(debug=False)
    except Exception as exc:
        logger.warning(
            "PyWebView native window unavailable (%s). Falling back to browser at %s",
            exc,
            url,
        )
        webbrowser.open(url)
        try:
            while True:
                time.sleep(1.0)
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
