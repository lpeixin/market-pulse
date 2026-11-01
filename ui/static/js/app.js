/**
 * MarketPulse — Bilingual (EN / 中文) Frontend Visualization & Terminal Controller
 * Renders 4 interactive ECharts / HTML5 financial widgets with instant
 * Language (EN <-> 中文) and Color Habit (US Green-Up <-> CN Red-Up) switching.
 */

const urlParams = new URLSearchParams(window.location.search);
const initialLang =
  urlParams.get("lang") === "zh" || urlParams.get("lang") === "en"
    ? urlParams.get("lang")
    : localStorage.getItem("mp_lang") || "en";
const initialColor =
  urlParams.get("color") === "cn" || urlParams.get("color") === "us"
    ? urlParams.get("color")
    : localStorage.getItem("mp_color_mode") || "us";

const state = {
  lang: initialLang, // 'en' | 'zh'
  universeId: urlParams.get("universe") || "sp500_core",
  colorMode: initialColor, // 'us' = Green Up/Red Down, 'cn' = Red Up/Green Down
  glMode: "diverging", // 'diverging' | 'ranked'
  scatterFilter: "ALL", // 'ALL' | 'ANOMALY' | 'BREAKOUT_SURGE' | 'HEAVY_SELLOFF'
  treemapSector: "ALL",
  tableSearch: "",
  tableRegime: "ALL",
  tableSortKey: "market_cap",
  tableSortAsc: false,
  activeModalTicker: null,
  dashboardData: null,
  universesList: [],
  charts: {
    treemap: null,
    gainersLosers: null,
    scatter: null,
    sparkline: null,
  },
};

/* ==========================================================================
   0. BILINGUAL I18N DICTIONARY (EN & ZH)
   ========================================================================== */

const I18N = {
  en: {
    docTitle: "MarketPulse — US Equity Quantitative Visualization Terminal",
    tradingDatePrefix: "US Trading Day:",
    detectingSession: "Detecting market session...",
    loadError: "Failed to load market data. Click Force Refresh to retry.",
    universeLabel: "Universe:",
    editWatchlistBtn: "Watchlist",
    colorModeUS: "US Color (Green Up)",
    colorModeCN: "CN Color (Red Up)",
    pluginsBtnSuffix: "Plugins",
    forceRefreshBtn: "Force Refresh",
    fetchingLive: "Fetching Live Data...",
    loadingData: "Loading...",
    cacheHitLabel: "SQLite Local Cache",
    cacheLiveLabel: "Yahoo Finance Live -> SQLite",
    cacheHybridLabel: "Hybrid (Cache + Live Delta)",

    // KPI Strip
    kpiMcapTitle: "Universe Market Cap & Cap-Wtd Return",
    kpiCapWeightedTag: "(Cap-Wtd)",
    kpiEqualMedianTitle: "Equal-Wtd / Median",
    kpiBreadthTitle: "Market Breadth",
    kpiStocksUnit: "Stocks",
    kpiAdv: "Adv",
    kpiDec: "Dec",
    kpiFlat: "Flat",
    kpiTurnoverTitle: "Daily Turnover & Volume Anomalies",
    kpiNear52wTitle: "Near 52W High",
    kpiNear52wSub: "(DD ≤ 5%)",
    kpiLeadingSector: "Leading Sector",
    kpiLaggingSector: "Lagging Sector",

    // Widget 1: Treemap
    w1Title: "Market Cap Treemap",
    w1Subtitle:
      "GICS Sector → Ticker 2-Level Hierarchy · Area = Market Cap · Color = Daily Return (-5% to +5%)",
    w1AllSectors: "All GICS Sectors",
    w1ResetBtn: "Reset View",
    w1FooterHint:
      "Click any stock block to inspect 20-day price trend & detailed metrics",
    ttSectorMcap: "Sector Market Cap:",
    ttSectorReturn: "Cap-Weighted Return:",
    ttSectorCount: "Constituents:",
    ttPriceChg: "Price / Change:",
    ttMcapWeight: "Market Cap (Sector Wt):",
    ttTurnoverRvol: "Turnover / RVOL:",
    tt52wdd: "52W High Drawdown:",
    ttClickHint: "Click to inspect 20-day price trend & details →",

    // Widget 2: Top Gainers & Losers
    w2Title: "Top Gainers & Losers Ranking",
    w2Subtitle:
      "Bidirectional horizontal comparison of Top 10 Gainers vs Top 10 Losers · Hover for Amplitude & Turnover",
    w2ModeDiverging: "Butterfly View",
    w2ModeRanked: "Ranked Extremes",
    w2FooterHint:
      "Hover bars to inspect Intraday Amplitude (%) · Daily Turnover ($) · Relative Volume (RVOL)",
    w2SpreadLabel: "Top-Bottom Spread:",
    w2LegendLosers: "Top 10 Losers",
    w2LegendGainers: "Top 10 Gainers",
    ttAmplitude: "Intraday Amplitude:",
    ttTurnover: "Daily Turnover:",
    ttRvolMcap: "RVOL / Market Cap:",

    // Widget 3: Volume Anomaly Scatter
    w3Title: "Volume Anomaly vs. Return Radar",
    w3Subtitle:
      "X-Axis: Daily Return (%) · Y-Axis: Relative Volume (RVOL = Vol / 20D Avg) · Bubble Size = Market Cap",
    w3FilterAll: "All",
    w3FilterAnomaly: "Anomalies (≥1.5x)",
    w3FilterBreakout: "Breakout Surge",
    w3FilterSelloff: "Heavy Selloff",
    w3FooterHint:
      'Dashed Threshold: <strong class="font-mono-num" style="color: #f59e0b;">RVOL = 1.50x</strong> (Above threshold indicates institutional volume anomaly)',
    w3BadgeBreakout: "Breakout",
    w3BadgeSelloff: "Selloff",
    w3AxisX: "Daily Return (%)",
    w3AxisY: "Relative Volume (RVOL)",
    w3ThresholdLine: "RVOL = 1.5x Anomaly Threshold",
    ttDailyReturnX: "Daily Return (X):",
    ttRvolY: "Relative Volume RVOL (Y):",
    ttVolVsAvg: "Volume / 20D Avg:",
    ttMcapBubble: "Market Cap (Bubble):",

    // Widget 4: Intraday & 52W Table
    w4Title: "Intraday Range & 52W Water-Level Table",
    w4Subtitle:
      "Visual Intraday Price Position Bar (Low–Close–High) & Drawdown from 52-Week High (%) Progress Bar",
    w4SearchPlaceholder: "Search ticker / name / sector...",
    w4RegimeAll: "All Water-Levels",
    w4RegimeStrong: "Strong Close (Pos≥75%)",
    w4RegimeWeak: "Weak Close (Pos≤25%)",
    w4RegimeAth: "Near 52W High (DD≤3%)",
    w4RegimeDeep: "Deep Drawdown (DD≥20%)",
    thTicker: "Ticker / Company",
    thPrice: "Price",
    thChange: "Change %",
    thMcap: "Market Cap",
    thRvol: "RVOL",
    thIntraday: "Intraday Position (Low — Close — High)",
    thDrawdown: "52W High Drawdown",
    tbRange: "Range",
    tbPos: "Pos",
    tbClosePosTitle: "Intraday Close Position",
    tb52wRangeTitle: "52W Range",
    tbShowing: "Showing",
    tbOf: "of",
    tbStrongClose: "Strong Close (≥75%)",
    tbWeakClose: "Weak Close (≤25%)",
    tbAvg52wDd: "Avg 52W Drawdown",

    // Modals
    modalClose: "Close ✕",
    modalKpiPrice: "Latest Price / Change",
    modalKpiMcap: "Market Cap / Turnover",
    modalKpiRvol: "Relative Volume (RVOL)",
    modalKpi52w: "52W Drawdown / 52W High",
    modalSparklineTitle: "Trailing 20 Trading Days Close Price Action",
    modalCloseSeries: "Close Price",
    modalWatchlistTitle: "Custom Watchlist Configuration",
    modalWatchlistDesc:
      'Enter US stock tickers separated by commas or spaces (e.g., <code class="font-mono-num">NVDA, TSLA, PLTR, AMD, META, COIN, ARM, MSTR</code>). MarketPulse will automatically fetch and cache their market data.',
    modalWatchlistReset: "Reset Defaults",
    modalWatchlistSave: "Save & Switch to Watchlist",
    modalPluginsTitle: "MarketPulse Modular Analyzer Plugins (analyzers/)",
    modalPluginsDesc:
      'All visual computation modules inherit from <code class="font-mono-num">analyzers.base.BaseAnalyzer</code> and register via <code class="font-mono-num">@AnalyzerRegistry.register</code>, enabling zero-friction expansion for backtesting, ETF flows, and volatility modules:',
  },
  zh: {
    docTitle: "MarketPulse — 美股多维量化行情可视化终端",
    tradingDatePrefix: "美股交易日:",
    detectingSession: "正在检测交易日状态...",
    loadError: "数据加载异常，请点击强制刷新重试",
    universeLabel: "股票池:",
    editWatchlistBtn: "自定义池配置",
    colorModeUS: "美股配色 (绿涨红跌)",
    colorModeCN: "中式配色 (红涨绿跌)",
    pluginsBtnSuffix: "分析插件",
    forceRefreshBtn: "强制刷新数据",
    fetchingLive: "正在拉取实时行情...",
    loadingData: "加载数据中...",
    cacheHitLabel: "SQLite 本地缓存",
    cacheLiveLabel: "Yahoo Finance 实时 -> SQLite",
    cacheHybridLabel: "混合源 (本地缓存 + 增量实时)",

    // KPI Strip
    kpiMcapTitle: "股票池总市值 & 加权收益",
    kpiCapWeightedTag: "(加权)",
    kpiEqualMedianTitle: "等权均值 / 中位数",
    kpiBreadthTitle: "市场涨跌宽度",
    kpiStocksUnit: "只标的",
    kpiAdv: "涨",
    kpiDec: "跌",
    kpiFlat: "平",
    kpiTurnoverTitle: "当日总成交额 & 放量异动",
    kpiNear52wTitle: "逼近 52周高点",
    kpiNear52wSub: "(回撤 ≤ 5%)",
    kpiLeadingSector: "领涨行业板块",
    kpiLaggingSector: "领跌行业板块",

    // Widget 1: Treemap
    w1Title: "大盘市值热力图 (Market Cap Treemap)",
    w1Subtitle:
      "GICS 行业 → 个股两级嵌套 · 面积严格映射总市值 · 颜色深浅映射当日涨跌幅 (-5% ~ +5%)",
    w1AllSectors: "全部 GICS 行业",
    w1ResetBtn: "重置视图",
    w1FooterHint: "点击任意个股方块可查看过去 20 日价格走势与多维指标详情",
    ttSectorMcap: "板块总市值:",
    ttSectorReturn: "市值加权涨跌:",
    ttSectorCount: "成分股数量:",
    ttPriceChg: "最新价 / 涨跌幅:",
    ttMcapWeight: "总市值 (板块占比):",
    ttTurnoverRvol: "当日成交额 / RVOL:",
    tt52wdd: "52周高点回撤:",
    ttClickHint: "点击查看 20 日价格趋势与详情 →",

    // Widget 2: Top Gainers & Losers
    w2Title: "多空涨跌幅龙虎榜 (Top Gainers & Losers)",
    w2Subtitle:
      "同屏双向对比当日涨幅 Top 10 与跌幅 Top 10 · 悬停查看日内振幅与成交额",
    w2ModeDiverging: "双向对称视图",
    w2ModeRanked: "首尾极值排序",
    w2FooterHint:
      "悬停条形图查看：日内振幅 (Amplitude%) · 当日成交额 (Turnover$) · 相对量比 (RVOL)",
    w2SpreadLabel: "首尾极差:",
    w2LegendLosers: "跌幅榜 Top 10 (Losers)",
    w2LegendGainers: "涨幅榜 Top 10 (Gainers)",
    ttAmplitude: "日内振幅 (Amplitude):",
    ttTurnover: "当日成交额 (Turnover):",
    ttRvolMcap: "相对量比 (RVOL) / 市值:",

    // Widget 3: Volume Anomaly Scatter
    w3Title: "量价异动雷达 (Volume Anomaly vs. Return)",
    w3Subtitle:
      "X 轴当日涨跌幅 (%) · Y 轴相对成交量比率 (RVOL = 成交量/20日均量) · 气泡大小映射市值",
    w3FilterAll: "全部标的",
    w3FilterAnomaly: "异动 (RVOL≥1.5x)",
    w3FilterBreakout: "放量突破",
    w3FilterSelloff: "放量杀跌",
    w3FooterHint:
      '虚线阈值: <strong class="font-mono-num" style="color: #f59e0b;">RVOL = 1.50x</strong> (高于阈值代表显著放量异动)',
    w3BadgeBreakout: "放量突破",
    w3BadgeSelloff: "放量杀跌",
    w3AxisX: "涨跌幅 (%)",
    w3AxisY: "相对成交量 (RVOL)",
    w3ThresholdLine: "RVOL = 1.5x 异动阈值线",
    ttDailyReturnX: "当日涨跌幅 (X轴):",
    ttRvolY: "相对成交量 RVOL (Y轴):",
    ttVolVsAvg: "当日量 / 20日均量:",
    ttMcapBubble: "总市值 (气泡大小):",

    // Widget 4: Intraday & 52W Table
    w4Title: "日内多空博弈与 52 周水位表 (Intraday Range & 52W Drawdown)",
    w4Subtitle:
      "可视化日内价格位置条 (Low–Close–High) 与距离 52 周高点回撤幅度进度条",
    w4SearchPlaceholder: "搜索代码/名称/行业...",
    w4RegimeAll: "全部水位状态",
    w4RegimeStrong: "日内高收 (位置≥75%)",
    w4RegimeWeak: "日内低收 (位置≤25%)",
    w4RegimeAth: "逼近52周新高 (回撤≤3%)",
    w4RegimeDeep: "深度回撤 (回撤≥20%)",
    thTicker: "代码 / 公司",
    thPrice: "最新价",
    thChange: "涨跌幅",
    thMcap: "总市值",
    thRvol: "量比 RVOL",
    thIntraday: "日内价格位置 (Low — Close — High)",
    thDrawdown: "52周高点回撤",
    tbRange: "振幅",
    tbPos: "位置",
    tbClosePosTitle: "收盘价位置",
    tb52wRangeTitle: "52周区间",
    tbShowing: "显示",
    tbOf: "/",
    tbStrongClose: "日内高位收盘(≥75%)",
    tbWeakClose: "日内低位收盘(≤25%)",
    tbAvg52wDd: "平均52周回撤",

    // Modals
    modalClose: "关闭 ✕",
    modalKpiPrice: "最新价 / 涨跌幅",
    modalKpiMcap: "总市值 / 成交额",
    modalKpiRvol: "相对量比 (RVOL)",
    modalKpi52w: "52周回撤 / 52周高点",
    modalSparklineTitle: "过去 20 个交易日收盘价走势 (20-Day Close Price Action)",
    modalCloseSeries: "收盘价",
    modalWatchlistTitle: "自定义观察池配置 (Custom Watchlist)",
    modalWatchlistDesc:
      '输入美股代码（以逗号或空格分隔，例如 <code class="font-mono-num">NVDA, TSLA, PLTR, AMD, META, COIN, ARM, MSTR</code>），保存后自动拉取最新行情并缓存。',
    modalWatchlistReset: "恢复默认推荐",
    modalWatchlistSave: "保存并切换到自定义池",
    modalPluginsTitle: "MarketPulse 模块化分析器插件架构 (analyzers/)",
    modalPluginsDesc:
      '所有可视化计算模块均继承自 <code class="font-mono-num">analyzers.base.BaseAnalyzer</code> 并通过装饰器注册至 <code class="font-mono-num">AnalyzerRegistry</code>，无需修改核心数据引擎即可平滑扩展回测、资金流与波动率新面板：',
  },
};

function t(key) {
  return I18N[state.lang]?.[key] ?? I18N.en[key] ?? key;
}

function isZh() {
  return state.lang === "zh";
}

function stockName(item) {
  if (!item) return "";
  return isZh()
    ? item.cn_name || item.name || item.company_name || item.ticker
    : item.name || item.company_name || item.cn_name || item.ticker;
}

function sectorName(item) {
  if (!item) return "";
  return isZh() ? item.sector_cn || item.sector : item.sector || item.sector_cn;
}

/* ==========================================================================
   1. COLOR THEME & LANGUAGE ENGINE
   ========================================================================== */

function getPalette() {
  const isUS = state.colorMode === "us";
  const green = {
    main: "#10b981",
    bright: "#34d399",
    deep: "#065f46",
    soft: "rgba(16, 185, 129, 0.20)",
    rgb: [16, 185, 129],
  };
  const red = {
    main: "#f43f5e",
    bright: "#fb7185",
    deep: "#9f1239",
    soft: "rgba(244, 63, 94, 0.20)",
    rgb: [244, 63, 94],
  };

  return {
    up: isUS ? green : red,
    down: isUS ? red : green,
    neutral: "#334155",
    amber: "#f59e0b",
    cyan: "#38bdf8",
  };
}

function interpolateReturnColor(changePct) {
  const pal = getPalette();
  const clamped = Math.max(-5.0, Math.min(5.0, Number(changePct) || 0));
  const neutral = [26, 36, 54];

  if (Math.abs(clamped) < 0.08) {
    return `rgb(${neutral[0]}, ${neutral[1]}, ${neutral[2]})`;
  }

  const ratio = Math.min(1.0, Math.abs(clamped) / 5.0);
  const weight = 0.28 + 0.72 * Math.pow(ratio, 0.75);
  const target = clamped > 0 ? pal.up.rgb : pal.down.rgb;

  const r = Math.round(neutral[0] + (target[0] - neutral[0]) * weight);
  const g = Math.round(neutral[1] + (target[1] - neutral[1]) * weight);
  const b = Math.round(neutral[2] + (target[2] - neutral[2]) * weight);
  return `rgb(${r}, ${g}, ${b})`;
}

function applyStaticTranslations() {
  document.title = t("docTitle");
  document.documentElement.setAttribute("lang", isZh() ? "zh-CN" : "en");
  document.documentElement.setAttribute("data-lang", state.lang);
  localStorage.setItem("mp_lang", state.lang);

  // Language toggle button highlight
  const langLabel = document.getElementById("lang-toggle-label");
  if (langLabel) {
    langLabel.innerHTML = isZh()
      ? `<span style="color:#64748b;">EN</span> / <strong style="color:#38bdf8;">中文</strong>`
      : `<strong style="color:#38bdf8;">EN</strong> / <span style="color:#64748b;">中文</span>`;
  }

  const setTxt = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
  };
  const setHtml = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = t(key);
  };

  setTxt("label-universe-select", "universeLabel");
  setTxt("label-edit-watchlist", "editWatchlistBtn");
  setTxt("refresh-btn-text", "forceRefreshBtn");

  // Widget 1
  setTxt("w1-title", "w1Title");
  setTxt("w1-subtitle", "w1Subtitle");
  setTxt("btn-treemap-reset", "w1ResetBtn");
  setTxt("w1-footer-hint", "w1FooterHint");

  // Widget 2
  setTxt("w2-title", "w2Title");
  setTxt("w2-subtitle", "w2Subtitle");
  setTxt("btn-gl-diverging", "w2ModeDiverging");
  setTxt("btn-gl-ranked", "w2ModeRanked");
  setTxt("w2-footer-hint", "w2FooterHint");

  // Widget 3
  setTxt("w3-title", "w3Title");
  setTxt("w3-subtitle", "w3Subtitle");
  setTxt("btn-sf-all", "w3FilterAll");
  setTxt("btn-sf-anomaly", "w3FilterAnomaly");
  setTxt("btn-sf-breakout", "w3FilterBreakout");
  setTxt("btn-sf-selloff", "w3FilterSelloff");
  setHtml("w3-footer-hint", "w3FooterHint");

  // Widget 4
  setTxt("w4-title", "w4Title");
  setTxt("w4-subtitle", "w4Subtitle");
  const searchInput = document.getElementById("table-search-input");
  if (searchInput) searchInput.placeholder = t("w4SearchPlaceholder");
  setTxt("opt-regime-all", "w4RegimeAll");
  setTxt("opt-regime-strong", "w4RegimeStrong");
  setTxt("opt-regime-weak", "w4RegimeWeak");
  setTxt("opt-regime-ath", "w4RegimeAth");
  setTxt("opt-regime-deep", "w4RegimeDeep");
  setTxt("th-ticker", "thTicker");
  setTxt("th-price", "thPrice");
  setTxt("th-change", "thChange");
  setTxt("th-mcap", "thMcap");
  setTxt("th-rvol", "thRvol");
  setTxt("th-intraday", "thIntraday");
  setTxt("th-drawdown", "thDrawdown");

  // Modals
  setTxt("btn-close-stock-modal", "modalClose");
  setTxt("modal-sparkline-title", "modalSparklineTitle");
  setTxt("modal-watchlist-title", "modalWatchlistTitle");
  setHtml("modal-watchlist-desc", "modalWatchlistDesc");
  setTxt("btn-close-watchlist-modal", "modalClose");
  setTxt("btn-reset-default-watchlist", "modalWatchlistReset");
  setTxt("btn-save-watchlist", "modalWatchlistSave");
  setTxt("modal-plugins-title", "modalPluginsTitle");
  setHtml("modal-plugins-desc", "modalPluginsDesc");
  setTxt("btn-close-plugins-modal", "modalClose");
}

function updateThemeUI() {
  document.documentElement.setAttribute("data-color-mode", state.colorMode);
  localStorage.setItem("mp_color_mode", state.colorMode);

  const labelEl = document.getElementById("color-mode-label");
  const indicatorEl = document.getElementById("color-mode-indicator");
  const legendGrad = document.getElementById("treemap-legend-gradient");
  const pal = getPalette();

  if (labelEl) {
    labelEl.textContent =
      state.colorMode === "us" ? t("colorModeUS") : t("colorModeCN");
  }

  if (indicatorEl) {
    indicatorEl.innerHTML = `
      <span style="width: 8px; height: 8px; border-radius: 50%; background: ${pal.up.main}; display: inline-block;"></span>
      <span style="width: 8px; height: 8px; border-radius: 50%; background: ${pal.down.main}; display: inline-block;"></span>
    `;
  }

  if (legendGrad) {
    legendGrad.style.background = `linear-gradient(90deg, ${pal.down.main} 0%, #1e293b 50%, ${pal.up.main} 100%)`;
  }
}

function formatSignPct(val) {
  const num = Number(val) || 0;
  return `${num >= 0 ? "+" : ""}${num.toFixed(2)}%`;
}

function getChangeClass(val) {
  const num = Number(val) || 0;
  if (num > 0.01) return "text-up";
  if (num < -0.01) return "text-down";
  return "text-flat";
}

function getBadgeClass(val) {
  const num = Number(val) || 0;
  if (num > 0.01) return "badge-change badge-up";
  if (num < -0.01) return "badge-change badge-down";
  return "badge-change badge-flat";
}

/* ==========================================================================
   2. DATA FETCHING & TOP BAR RENDERING
   ========================================================================== */

async function loadDashboard(forceRefresh = false) {
  const refreshBtn = document.getElementById("btn-refresh");
  const refreshText = document.getElementById("refresh-btn-text");
  const refreshIcon = document.getElementById("refresh-icon");

  try {
    refreshBtn.classList.add("loading");
    refreshBtn.disabled = true;
    if (refreshIcon) refreshIcon.style.display = "none";
    refreshText.textContent = forceRefresh ? t("fetchingLive") : t("loadingData");

    const url = `/api/dashboard?universe=${encodeURIComponent(
      state.universeId
    )}&force_refresh=${forceRefresh ? "true" : "false"}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    state.dashboardData = data;

    renderAll();

    // Check if URL requested opening a specific stock modal
    const modalTicker = urlParams.get("modal");
    if (modalTicker && !state.activeModalTicker) {
      state.activeModalTicker = modalTicker.toUpperCase();
      openStockDetailModal(state.activeModalTicker);
    }
  } catch (err) {
    console.error("Failed to load dashboard data:", err);
    document.getElementById("session-label-badge").textContent = t("loadError");
  } finally {
    refreshBtn.classList.remove("loading");
    refreshBtn.disabled = false;
    if (refreshIcon) refreshIcon.style.display = "inline-block";
    refreshText.textContent = t("forceRefreshBtn");
  }
}

function populateSectorDropdown(data) {
  const sel = document.getElementById("treemap-sector-filter");
  if (!sel || !data?.widgets?.market_cap_treemap) return;
  const sectors = data.widgets.market_cap_treemap.sector_summary || [];
  const currentVal = state.treemapSector;

  let html = `<option value="ALL">${t("w1AllSectors")} (${sectors.length})</option>`;
  for (const s of sectors) {
    const sign = s.change_pct >= 0 ? "+" : "";
    const label = isZh() ? `${s.sector_cn} · ${s.sector}` : s.sector;
    html += `<option value="${s.sector}">${label} (${sign}${s.change_pct}%)</option>`;
  }
  sel.innerHTML = html;
  if ([...sel.options].some((o) => o.value === currentVal)) {
    sel.value = currentVal;
  } else {
    state.treemapSector = "ALL";
    sel.value = "ALL";
  }
}

function renderAll() {
  applyStaticTranslations();
  updateThemeUI();
  if (!state.dashboardData) return;

  populateSectorDropdown(state.dashboardData);
  renderHeaderStatus();
  renderIndicesRibbon();
  renderKpiStrip();
  renderTreemap();
  renderGainersLosers();
  renderVolumeScatter();
  renderIntradayTable();

  if (
    state.activeModalTicker &&
    document.getElementById("stock-detail-modal").classList.contains("open")
  ) {
    openStockDetailModal(state.activeModalTicker);
  }
}

function renderHeaderStatus() {
  const { session, universe, plugins } = state.dashboardData;
  if (!session) return;

  const dotEl = document.getElementById("session-dot");
  dotEl.className = `pulse-dot ${session.is_intraday ? "intraday" : "closed"}`;

  document.getElementById("trading-date-badge").textContent =
    `${t("tradingDatePrefix")} ${session.trading_date}`;

  const sessionText = isZh()
    ? session.session_label_zh || session.session_label
    : session.session_label_en || session.session_label;
  document.getElementById("session-label-badge").textContent = sessionText;

  let cacheSourceText = session.data_source || "SQLite Cache";
  if (cacheSourceText.includes("Local Cache")) {
    cacheSourceText = t("cacheHitLabel");
  } else if (cacheSourceText.includes("Live -> SQLite")) {
    cacheSourceText = t("cacheLiveLabel");
  } else if (cacheSourceText.includes("Hybrid")) {
    cacheSourceText = t("cacheHybridLabel");
  }
  document.getElementById("cache-source-badge").textContent = cacheSourceText;
  document.getElementById("timestamp-badge").textContent =
    session.et_time || session.local_time;

  if (plugins) {
    document.getElementById("plugin-count-badge").textContent =
      `${plugins.length} ${t("pluginsBtnSuffix")}`;
  }

  if (state.dashboardData.universes_list) {
    state.universesList = state.dashboardData.universes_list;
    const uSelect = document.getElementById("universe-select");
    uSelect.innerHTML = state.universesList
      .map((u) => {
        const uName = isZh() ? u.name_zh || u.name : u.name_en || u.name;
        return `<option value="${u.id}" ${
          u.id === universe.id ? "selected" : ""
        }>${uName} (${u.count})</option>`;
      })
      .join("");
  }
}

function renderIndicesRibbon() {
  const container = document.getElementById("indices-ribbon");
  const indices = state.dashboardData?.indices || [];
  if (!indices.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = indices
    .map((idx) => {
      const chgClass = getChangeClass(idx.change_pct);
      const badgeClass = getBadgeClass(idx.change_pct);
      const sign = idx.change >= 0 ? "+" : "";
      const displayName = isZh()
        ? idx.name_zh || idx.name
        : idx.name_en || idx.name;
      return `
        <div class="ribbon-card">
          <div class="ribbon-card-top">
            <span style="font-weight: 700; color: #e2e8f0;">${displayName}</span>
            <span class="font-mono-num" style="font-size: 10.5px; color: var(--text-muted);">${idx.short_name}</span>
          </div>
          <div class="ribbon-card-bottom">
            <span class="ribbon-value font-mono-num">${Number(idx.price).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}</span>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="font-mono-num ${chgClass}" style="font-size: 11.5px;">${sign}${Number(idx.change).toFixed(2)}</span>
              <span class="font-mono-num ${badgeClass}">${formatSignPct(idx.change_pct)}</span>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderKpiStrip() {
  const container = document.getElementById("kpi-strip");
  const ov = state.dashboardData?.widgets?.overview_summary;
  if (!ov) return;

  const capRetClass = getChangeClass(ov.cap_weighted_return_pct);
  const eqRetClass = getChangeClass(ov.equal_weighted_return_pct);
  const topSector = ov.sector_ranking?.[0];
  const worstSector = ov.sector_ranking?.[ov.sector_ranking.length - 1];

  const topSecName = topSector ? sectorName(topSector) : "--";
  const worstSecName = worstSector ? sectorName(worstSector) : "--";

  container.innerHTML = `
    <div class="kpi-box">
      <div>
        <div style="font-size: 11px; color: var(--text-secondary);">${t("kpiMcapTitle")}</div>
        <div style="display: flex; align-items: baseline; gap: 8px; margin-top: 3px;">
          <span class="font-mono-num" style="font-size: 16px; font-weight: 800;">${ov.total_market_cap_fmt}</span>
          <span class="font-mono-num ${capRetClass}" style="font-size: 13px; font-weight: 700;">${formatSignPct(ov.cap_weighted_return_pct)} ${t("kpiCapWeightedTag")}</span>
        </div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 11px; color: var(--text-muted);">${t("kpiEqualMedianTitle")}</div>
        <div class="font-mono-num ${eqRetClass}" style="font-size: 12px; font-weight: 600; margin-top: 3px;">
          ${formatSignPct(ov.equal_weighted_return_pct)} / ${formatSignPct(ov.median_return_pct)}
        </div>
      </div>
    </div>

    <div class="kpi-box" style="flex-direction: column; align-items: stretch;">
      <div style="display: flex; justify-content: space-between; font-size: 11px;">
        <span style="color: var(--text-secondary);">${t("kpiBreadthTitle")} (${ov.total_stocks} ${t("kpiStocksUnit")})</span>
        <span class="font-mono-num">
          <strong class="text-up">${ov.advancers} ${t("kpiAdv")}</strong> ·
          <strong class="text-down">${ov.decliners} ${t("kpiDec")}</strong>
          ${ov.unchanged ? `· <span class="text-flat">${ov.unchanged} ${t("kpiFlat")}</span>` : ""}
        </span>
      </div>
      <div class="breadth-bar-track">
        <div class="breadth-bar-fill" style="width: ${ov.advance_ratio_pct}%;"></div>
      </div>
    </div>

    <div class="kpi-box">
      <div>
        <div style="font-size: 11px; color: var(--text-secondary);">${t("kpiTurnoverTitle")}</div>
        <div style="display: flex; align-items: baseline; gap: 8px; margin-top: 3px;">
          <span class="font-mono-num" style="font-size: 16px; font-weight: 800;">${ov.total_turnover_fmt}</span>
          <span class="font-mono-num" style="font-size: 12px; color: #f59e0b; font-weight: 700;">
            ${ov.anomaly_volume_count} RVOL≥1.5x
          </span>
        </div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 11px; color: var(--text-muted);">${t("kpiNear52wTitle")}</div>
        <div class="font-mono-num" style="font-size: 13px; font-weight: 700; color: #38bdf8; margin-top: 3px;">
          ${ov.near_52w_high_count} ${t("kpiNear52wSub")}
        </div>
      </div>
    </div>

    <div class="kpi-box">
      <div>
        <div style="font-size: 11px; color: var(--text-secondary);">${t("kpiLeadingSector")}</div>
        <div style="margin-top: 3px; font-weight: 700; font-size: 12px;">
          ${topSector ? `${topSecName} <span class="font-mono-num ${getChangeClass(topSector.change_pct)}">${formatSignPct(topSector.change_pct)}</span>` : "--"}
        </div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 11px; color: var(--text-secondary);">${t("kpiLaggingSector")}</div>
        <div style="margin-top: 3px; font-weight: 700; font-size: 12px;">
          ${worstSector ? `${worstSecName} <span class="font-mono-num ${getChangeClass(worstSector.change_pct)}">${formatSignPct(worstSector.change_pct)}</span>` : "--"}
        </div>
      </div>
    </div>
  `;
}

/* ==========================================================================
   3. WIDGET 1: MARKET CAP TREEMAP
   ========================================================================== */

function renderTreemap() {
  const dom = document.getElementById("chart-treemap");
  if (!dom) return;
  if (!state.charts.treemap) {
    state.charts.treemap = echarts.init(dom, null, { renderer: "canvas" });
    state.charts.treemap.on("click", (params) => {
      if (params.data && params.data.ticker) {
        openStockDetailModal(params.data.ticker);
      }
    });
  }

  const treemapPayload = state.dashboardData?.widgets?.market_cap_treemap;
  if (!treemapPayload || !treemapPayload.tree) return;

  let rawTree = treemapPayload.tree;
  if (state.treemapSector !== "ALL") {
    rawTree = rawTree.filter((sec) => sec.sector === state.treemapSector);
  }

  const styledTree = rawTree.map((sectorNode) => {
    const secSign = sectorNode.change_pct >= 0 ? "+" : "";
    const secTitle = isZh() ? sectorNode.sector_cn : sectorNode.sector;
    return {
      ...sectorNode,
      name: `${secTitle} (${secSign}${sectorNode.change_pct}%) · ${sectorNode.market_cap_fmt}`,
      value: sectorNode.market_cap_b,
      itemStyle: {
        borderColor: "#0b111e",
        borderWidth: 2,
        gapWidth: 2,
      },
      children: (sectorNode.children || []).map((leaf) => {
        const bgColor = interpolateReturnColor(leaf.change_pct);
        return {
          ...leaf,
          name: leaf.ticker,
          value: leaf.market_cap_b,
          itemStyle: {
            color: bgColor,
            borderColor: "rgba(11, 17, 30, 0.85)",
            borderWidth: 1,
          },
        };
      }),
    };
  });

  const option = {
    backgroundColor: "transparent",
    tooltip: {
      backgroundColor: "rgba(15, 23, 42, 0.96)",
      borderColor: "#334155",
      borderWidth: 1,
      textStyle: { color: "#f8fafc", fontSize: 12 },
      formatter: (info) => {
        const d = info.data;
        if (!d) return "";
        if (d.children) {
          const sign = d.change_pct >= 0 ? "+" : "";
          const secHeader = isZh()
            ? `${d.sector_cn} (${d.sector})`
            : d.sector;
          return `
            <div style="min-width: 195px;">
              <div style="font-weight: 800; font-size: 13px; margin-bottom: 4px; color: #38bdf8;">
                ${secHeader}
              </div>
              <div style="display: flex; justify-content: space-between; margin: 2px 0;">
                <span style="color:#94a3b8;">${t("ttSectorMcap")}</span>
                <strong class="font-mono-num">${d.market_cap_fmt} (${d.weight_pct}%)</strong>
              </div>
              <div style="display: flex; justify-content: space-between; margin: 2px 0;">
                <span style="color:#94a3b8;">${t("ttSectorReturn")}</span>
                <strong class="font-mono-num">${sign}${d.change_pct}%</strong>
              </div>
              <div style="display: flex; justify-content: space-between; margin: 2px 0;">
                <span style="color:#94a3b8;">${t("ttSectorCount")}</span>
                <strong class="font-mono-num">${d.stock_count}</strong>
              </div>
            </div>
          `;
        }
        const sign = d.change_pct >= 0 ? "+" : "";
        return `
          <div style="min-width: 220px;">
            <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #334155; padding-bottom: 4px; margin-bottom: 5px;">
              <div>
                <strong style="font-size: 14px; color: #fff;">${d.ticker}</strong>
                <span style="color: #94a3b8; font-size: 11.5px; margin-left: 4px;">${stockName(d)}</span>
              </div>
              <span style="font-size: 11px; color: #38bdf8;">${sectorName(d)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin: 2px 0;">
              <span style="color:#94a3b8;">${t("ttPriceChg")}</span>
              <strong class="font-mono-num">$${d.price.toFixed(2)} (${sign}${d.change_pct.toFixed(2)}%)</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin: 2px 0;">
              <span style="color:#94a3b8;">${t("ttMcapWeight")}</span>
              <strong class="font-mono-num">${d.market_cap_fmt} (${d.weight_in_sector_pct}%)</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin: 2px 0;">
              <span style="color:#94a3b8;">${t("ttTurnoverRvol")}</span>
              <strong class="font-mono-num">${d.turnover_fmt} / ${d.rvol.toFixed(2)}x</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin: 2px 0;">
              <span style="color:#94a3b8;">${t("tt52wdd")}</span>
              <strong class="font-mono-num">${d.drawdown_52w_pct.toFixed(2)}%</strong>
            </div>
            <div style="margin-top: 5px; font-size: 10.5px; color: #64748b; text-align: right;">
              ${t("ttClickHint")}
            </div>
          </div>
        `;
      },
    },
    series: [
      {
        name: "Market Cap Treemap",
        type: "treemap",
        width: "100%",
        height: "100%",
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        label: {
          show: true,
          position: "inside",
          formatter: (params) => {
            const d = params.data;
            if (!d || !d.ticker) return params.name;
            const sign = d.change_pct >= 0 ? "+" : "";
            return `{ticker|${d.ticker}}\n{chg|${sign}${d.change_pct.toFixed(2)}%}\n{price|$${d.price.toFixed(2)}}`;
          },
          rich: {
            ticker: {
              fontSize: 13,
              fontWeight: 800,
              color: "#ffffff",
              lineHeight: 16,
              fontFamily: "JetBrains Mono, SF Mono, monospace",
              textShadowColor: "rgba(0, 0, 0, 0.65)",
              textShadowBlur: 3,
            },
            chg: {
              fontSize: 11.5,
              fontWeight: 700,
              color: "#f8fafc",
              lineHeight: 15,
              fontFamily: "JetBrains Mono, SF Mono, monospace",
              textShadowColor: "rgba(0, 0, 0, 0.65)",
              textShadowBlur: 3,
            },
            price: {
              fontSize: 10,
              fontWeight: 500,
              color: "rgba(241, 245, 249, 0.88)",
              lineHeight: 13,
              fontFamily: "JetBrains Mono, SF Mono, monospace",
              textShadowColor: "rgba(0, 0, 0, 0.65)",
              textShadowBlur: 2,
            },
          },
        },
        upperLabel: {
          show: true,
          height: 20,
          color: "#e2e8f0",
          fontSize: 11,
          fontWeight: "bold",
          backgroundColor: "#0f172a",
          padding: [2, 6],
        },
        levels: [
          {
            itemStyle: { borderColor: "#090d16", borderWidth: 2, gapWidth: 2 },
            upperLabel: { show: false },
          },
          {
            itemStyle: {
              borderColor: "#111827",
              borderWidth: 2,
              gapWidth: 1.5,
            },
            upperLabel: { show: true, height: 19 },
          },
          {
            itemStyle: {
              borderColor: "rgba(15, 23, 42, 0.7)",
              borderWidth: 1,
              gapWidth: 1,
            },
          },
        ],
        data: styledTree,
      },
    ],
  };

  state.charts.treemap.setOption(option, true);
}

/* ==========================================================================
   4. WIDGET 2: TOP GAINERS & LOSERS BAR CHART
   ========================================================================== */

function renderGainersLosers() {
  const dom = document.getElementById("chart-gainers-losers");
  if (!dom) return;
  if (!state.charts.gainersLosers) {
    state.charts.gainersLosers = echarts.init(dom, null, { renderer: "canvas" });
    state.charts.gainersLosers.on("click", (params) => {
      const ticker = params.data?.meta?.ticker;
      if (ticker) openStockDetailModal(ticker);
    });
  }

  const gl = state.dashboardData?.widgets?.top_gainers_losers;
  if (!gl) return;
  const pal = getPalette();

  const gainers = gl.gainers || [];
  const losers = gl.losers || [];

  const spreadBadge = document.getElementById("gl-spread-badge");
  if (spreadBadge && gl.best_ticker && gl.worst_ticker) {
    const spread = (gl.best_ticker.change_pct - gl.worst_ticker.change_pct).toFixed(2);
    spreadBadge.innerHTML = `${t("w2SpreadLabel")} <strong style="color:#f8fafc;">${spread}%</strong> (${gl.best_ticker.ticker} ${formatSignPct(gl.best_ticker.change_pct)} vs ${gl.worst_ticker.ticker} ${formatSignPct(gl.worst_ticker.change_pct)})`;
  }

  const tooltipFormatter = (params) => {
    const item = Array.isArray(params)
      ? params.find((p) => p.data && p.data.meta) || params[0]
      : params;
    const d = item?.data?.meta;
    if (!d) return "";
    const sign = d.change_pct >= 0 ? "+" : "";
    return `
      <div style="min-width: 215px;">
        <div style="display:flex; justify-content:space-between; border-bottom:1px solid #334155; padding-bottom:4px; margin-bottom:5px;">
          <strong>#${d.rank} ${d.ticker} · ${stockName(d)}</strong>
          <span style="color:#38bdf8; font-size:11px;">${sectorName(d)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin:2px 0;">
          <span style="color:#94a3b8;">${t("ttPriceChg")}</span>
          <strong class="font-mono-num">$${d.price.toFixed(2)} (${sign}${d.change_pct.toFixed(2)}%)</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin:2px 0;">
          <span style="color:#94a3b8;">${t("ttAmplitude")}</span>
          <strong class="font-mono-num" style="color:#f59e0b;">${d.intraday_range_pct.toFixed(2)}% ($${d.low.toFixed(2)} - $${d.high.toFixed(2)})</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin:2px 0;">
          <span style="color:#94a3b8;">${t("ttTurnover")}</span>
          <strong class="font-mono-num" style="color:#38bdf8;">${d.turnover_fmt}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin:2px 0;">
          <span style="color:#94a3b8;">${t("ttRvolMcap")}</span>
          <strong class="font-mono-num">${d.rvol.toFixed(2)}x / ${d.market_cap_fmt}</strong>
        </div>
      </div>
    `;
  };

  const loserLegend = t("w2LegendLosers");
  const gainerLegend = t("w2LegendGainers");

  if (state.glMode === "diverging") {
    const pairs = [...(gl.paired_ranks || [])].reverse();
    const yCategories = pairs.map((p) => `TOP ${p.rank}`);

    const gainerSeriesData = pairs.map((p) => {
      const g = p.gainer;
      if (!g) return { value: 0, meta: null };
      const val = Math.max(0.05, g.change_pct);
      return {
        value: val,
        meta: g,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: pal.up.soft },
            { offset: 1, color: pal.up.main },
          ]),
          borderRadius: [0, 4, 4, 0],
        },
      };
    });

    const loserSeriesData = pairs.map((p) => {
      const l = p.loser;
      if (!l) return { value: 0, meta: null };
      const val = Math.min(-0.05, l.change_pct);
      return {
        value: val,
        meta: l,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(1, 0, 0, 0, [
            { offset: 0, color: pal.down.soft },
            { offset: 1, color: pal.down.main },
          ]),
          borderRadius: [4, 0, 0, 4],
        },
      };
    });

    const maxAbs = Math.max(
      ...gainers.map((g) => Math.abs(g.change_pct)),
      ...losers.map((l) => Math.abs(l.change_pct)),
      3.0
    );
    const axisBound = Math.ceil(maxAbs * 1.48);

    const option = {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(15, 23, 42, 0.96)",
        borderColor: "#334155",
        borderWidth: 1,
        textStyle: { color: "#f8fafc", fontSize: 12 },
        formatter: tooltipFormatter,
      },
      legend: {
        top: 0,
        right: 10,
        textStyle: { color: "#94a3b8", fontSize: 11 },
        data: [loserLegend, gainerLegend],
      },
      grid: {
        top: 28,
        bottom: 24,
        left: 65,
        right: 65,
        containLabel: false,
      },
      xAxis: {
        type: "value",
        min: -axisBound,
        max: axisBound,
        splitLine: {
          lineStyle: { color: "rgba(51, 65, 85, 0.35)", type: "dashed" },
        },
        axisLabel: {
          color: "#64748b",
          fontSize: 10.5,
          formatter: (v) => `${v > 0 ? "+" : ""}${v}%`,
        },
      },
      yAxis: {
        type: "category",
        data: yCategories,
        axisLine: { lineStyle: { color: "#334155" } },
        axisTick: { show: false },
        axisLabel: {
          color: "#94a3b8",
          fontSize: 10.5,
          fontWeight: 700,
          fontFamily: "JetBrains Mono, monospace",
        },
      },
      series: [
        {
          name: loserLegend,
          type: "bar",
          stack: "bidirectional",
          barWidth: 16,
          data: loserSeriesData,
          label: {
            show: true,
            position: "left",
            color: pal.down.bright,
            fontSize: 11,
            fontWeight: 700,
            fontFamily: "JetBrains Mono, monospace",
            formatter: (params) => {
              const m = params.data?.meta;
              if (!m) return "";
              return `${m.ticker} ${formatSignPct(m.change_pct)}`;
            },
          },
        },
        {
          name: gainerLegend,
          type: "bar",
          stack: "bidirectional",
          barWidth: 16,
          data: gainerSeriesData,
          label: {
            show: true,
            position: "right",
            color: pal.up.bright,
            fontSize: 11,
            fontWeight: 700,
            fontFamily: "JetBrains Mono, monospace",
            formatter: (params) => {
              const m = params.data?.meta;
              if (!m) return "";
              return `${m.ticker} ${formatSignPct(m.change_pct)}`;
            },
          },
        },
      ],
    };

    state.charts.gainersLosers.setOption(option, true);
  } else {
    const combined = [...losers, ...[...gainers].reverse()];
    const yLabels = combined.map((d) => d.ticker);
    const barData = combined.map((d) => ({
      value: d.change_pct,
      meta: d,
      itemStyle: {
        color: d.change_pct >= 0 ? pal.up.main : pal.down.main,
        borderRadius: d.change_pct >= 0 ? [0, 3, 3, 0] : [3, 0, 0, 3],
      },
    }));

    const option = {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(15, 23, 42, 0.96)",
        borderColor: "#334155",
        borderWidth: 1,
        textStyle: { color: "#f8fafc", fontSize: 12 },
        formatter: tooltipFormatter,
      },
      grid: { top: 12, bottom: 24, left: 62, right: 62 },
      xAxis: {
        type: "value",
        splitLine: {
          lineStyle: { color: "rgba(51, 65, 85, 0.35)", type: "dashed" },
        },
        axisLabel: {
          color: "#64748b",
          fontSize: 10.5,
          formatter: (v) => `${v > 0 ? "+" : ""}${v}%`,
        },
      },
      yAxis: {
        type: "category",
        data: yLabels,
        axisLine: { lineStyle: { color: "#334155" } },
        axisTick: { show: false },
        axisLabel: {
          color: "#e2e8f0",
          fontSize: 10,
          fontWeight: 700,
          fontFamily: "JetBrains Mono, monospace",
        },
      },
      series: [
        {
          type: "bar",
          barWidth: 11,
          data: barData,
          label: {
            show: true,
            position: (params) => (params.value >= 0 ? "right" : "left"),
            color: "#e2e8f0",
            fontSize: 10,
            fontFamily: "JetBrains Mono, monospace",
            formatter: (params) => formatSignPct(params.value),
          },
        },
      ],
    };

    state.charts.gainersLosers.setOption(option, true);
  }
}

/* ==========================================================================
   5. WIDGET 3: VOLUME ANOMALY VS RETURN SCATTER
   ========================================================================== */

function renderVolumeScatter() {
  const dom = document.getElementById("chart-volume-scatter");
  if (!dom) return;
  if (!state.charts.scatter) {
    state.charts.scatter = echarts.init(dom, null, { renderer: "canvas" });
    state.charts.scatter.on("click", (params) => {
      const ticker = params.data?.meta?.ticker;
      if (ticker) openStockDetailModal(ticker);
    });
  }

  const va = state.dashboardData?.widgets?.volume_anomaly_scatter;
  if (!va) return;
  const pal = getPalette();

  const qCounts = va.quadrant_counts || {};
  const badgesEl = document.getElementById("scatter-quadrant-badges");
  if (badgesEl) {
    badgesEl.innerHTML = `
      <span class="badge-change badge-up font-mono-num">${t("w3BadgeBreakout")}: ${qCounts.breakout_surge || 0}</span>
      <span class="badge-change badge-down font-mono-num">${t("w3BadgeSelloff")}: ${qCounts.heavy_selloff || 0}</span>
    `;
  }

  let pts = va.points || [];
  if (state.scatterFilter === "ANOMALY") {
    pts = pts.filter((p) => p.is_anomaly);
  } else if (state.scatterFilter !== "ALL") {
    pts = pts.filter((p) => p.quadrant === state.scatterFilter);
  }

  const scatterData = pts.map((p) => {
    const isUp = p.change_pct >= 0;
    const baseColor = isUp ? pal.up : pal.down;
    return {
      value: [p.change_pct, p.rvol, p.market_cap_b],
      symbolSize: p.symbol_size,
      meta: p,
      itemStyle: {
        color: baseColor.soft,
        borderColor: baseColor.bright,
        borderWidth: p.is_anomaly ? 2.4 : 1.3,
        shadowBlur: p.is_anomaly ? 12 : 0,
        shadowColor: p.is_anomaly ? baseColor.main : "transparent",
      },
      label: {
        show: p.is_anomaly || p.market_cap_b >= 1200 || Math.abs(p.change_pct) >= 3.0,
        position: "top",
        distance: 3,
        formatter: () => p.ticker,
        color: p.is_anomaly ? "#ffffff" : "#cbd5e1",
        fontSize: p.is_anomaly ? 11 : 10,
        fontWeight: p.is_anomaly ? 800 : 600,
        fontFamily: "JetBrains Mono, monospace",
      },
    };
  });

  const maxRvol = Math.max(...(va.points || []).map((p) => p.rvol), 2.5);
  const yMax = Math.ceil(maxRvol * 1.15 * 10) / 10;

  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(15, 23, 42, 0.96)",
      borderColor: "#334155",
      borderWidth: 1,
      textStyle: { color: "#f8fafc", fontSize: 12 },
      formatter: (params) => {
        const d = params.data?.meta;
        if (!d) return "";
        const sign = d.change_pct >= 0 ? "+" : "";
        const qLabel = isZh()
          ? d.quadrant_label_zh || d.quadrant_label
          : d.quadrant_label_en || d.quadrant_label;
        return `
          <div style="min-width: 220px;">
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid #334155; padding-bottom:4px; margin-bottom:5px;">
              <strong>${d.ticker} · ${stockName(d)}</strong>
              <span style="color:#f59e0b; font-size:11px; font-weight:700;">${qLabel}</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin:2px 0;">
              <span style="color:#94a3b8;">${t("ttDailyReturnX")}</span>
              <strong class="font-mono-num">${sign}${d.change_pct.toFixed(2)}% ($${d.price.toFixed(2)})</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin:2px 0;">
              <span style="color:#94a3b8;">${t("ttRvolY")}</span>
              <strong class="font-mono-num" style="color:${d.is_anomaly ? "#f59e0b" : "#f8fafc"};">${d.rvol.toFixed(2)}x</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin:2px 0;">
              <span style="color:#94a3b8;">${t("ttVolVsAvg")}</span>
              <strong class="font-mono-num">${d.volume_fmt} / ${d.avg_volume_20d_fmt}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin:2px 0;">
              <span style="color:#94a3b8;">${t("ttMcapBubble")}</span>
              <strong class="font-mono-num">${d.market_cap_fmt}</strong>
            </div>
          </div>
        `;
      },
    },
    grid: { top: 26, bottom: 34, left: 52, right: 28 },
    xAxis: {
      type: "value",
      name: t("w3AxisX"),
      nameLocation: "middle",
      nameGap: 22,
      nameTextStyle: { color: "#94a3b8", fontSize: 11 },
      splitLine: {
        lineStyle: { color: "rgba(51, 65, 85, 0.35)", type: "dashed" },
      },
      axisLine: { lineStyle: { color: "#475569" } },
      axisLabel: {
        color: "#94a3b8",
        fontSize: 10.5,
        formatter: (v) => `${v > 0 ? "+" : ""}${v}%`,
      },
    },
    yAxis: {
      type: "value",
      name: t("w3AxisY"),
      min: 0,
      max: yMax,
      nameTextStyle: { color: "#94a3b8", fontSize: 11, align: "left" },
      splitLine: {
        lineStyle: { color: "rgba(51, 65, 85, 0.35)", type: "dashed" },
      },
      axisLine: { lineStyle: { color: "#475569" } },
      axisLabel: {
        color: "#94a3b8",
        fontSize: 10.5,
        formatter: (v) => `${v.toFixed(1)}x`,
      },
    },
    series: [
      {
        name: "Volume Scatter",
        type: "scatter",
        data: scatterData,
        markLine: {
          silent: true,
          symbol: ["none", "none"],
          data: [
            {
              yAxis: va.rvol_threshold || 1.5,
              lineStyle: { color: "#f59e0b", type: "dashed", width: 1.8 },
              label: {
                formatter: t("w3ThresholdLine"),
                position: "insideEndTop",
                color: "#f59e0b",
                fontSize: 11,
                fontWeight: 700,
              },
            },
            {
              xAxis: 0,
              lineStyle: {
                color: "rgba(148, 163, 184, 0.45)",
                type: "dashed",
                width: 1.2,
              },
              label: { show: false },
            },
          ],
        },
        markArea: {
          silent: true,
          itemStyle: { color: "rgba(245, 158, 11, 0.04)" },
          data: [[{ yAxis: va.rvol_threshold || 1.5 }, { yAxis: yMax }]],
        },
      },
    ],
  };

  state.charts.scatter.setOption(option, true);
}

/* ==========================================================================
   6. WIDGET 4: INTRADAY RANGE & 52W WATER-LEVEL TABLE
   ========================================================================== */

function renderIntradayTable() {
  const tbody = document.getElementById("intraday-table-tbody");
  const tbData = state.dashboardData?.widgets?.intraday_52w_table;
  if (!tbody || !tbData) return;

  const pal = getPalette();
  let rows = [...(tbData.rows || [])];

  const q = state.tableSearch.trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (r) =>
        r.ticker.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.cn_name.toLowerCase().includes(q) ||
        r.sector.toLowerCase().includes(q) ||
        r.sector_cn.toLowerCase().includes(q)
    );
  }

  if (state.tableRegime === "STRONG_CLOSE") {
    rows = rows.filter((r) => r.intraday_pos_pct >= 75.0);
  } else if (state.tableRegime === "WEAK_CLOSE") {
    rows = rows.filter((r) => r.intraday_pos_pct <= 25.0);
  } else if (state.tableRegime === "NEAR_ATH") {
    rows = rows.filter((r) => r.drawdown_52w_pct >= -3.0);
  } else if (state.tableRegime === "DEEP_DRAWDOWN") {
    rows = rows.filter((r) => r.drawdown_52w_pct <= -20.0);
  }

  const sortKey = state.tableSortKey;
  const dir = state.tableSortAsc ? 1 : -1;
  rows.sort((a, b) => {
    const va = a[sortKey];
    const vb = b[sortKey];
    if (typeof va === "string") {
      return va.localeCompare(vb) * dir;
    }
    return ((Number(va) || 0) - (Number(vb) || 0)) * dir;
  });

  document.querySelectorAll("#intraday-52w-table thead th").forEach((th) => {
    const k = th.getAttribute("data-sort");
    const ind = th.querySelector(".sort-indicator");
    if (!ind) return;
    if (k === sortKey) {
      ind.textContent = state.tableSortAsc ? "▲" : "▼";
    } else {
      ind.textContent = "";
    }
  });

  tbody.innerHTML = rows
    .map((r) => {
      const chgClass = getChangeClass(r.change_pct);
      const badgeClass = getBadgeClass(r.change_pct);
      const isUp = r.change_pct >= 0;
      const barColor = isUp ? pal.up.main : pal.down.main;

      const leftPct = Math.min(r.intraday_open_pos_pct, r.intraday_pos_pct);
      const widthPct = Math.max(
        4,
        Math.abs(r.intraday_pos_pct - r.intraday_open_pos_pct)
      );

      const ddAbs = Math.abs(r.drawdown_52w_pct);
      const ddBarWidth = Math.min(100, (ddAbs / 45.0) * 100);
      const ddColor =
        ddAbs <= 5 ? "#38bdf8" : ddAbs <= 15 ? "#f59e0b" : pal.down.main;

      const rvolColor =
        r.rvol >= 1.5
          ? "color: #f59e0b; font-weight: 800;"
          : "color: var(--text-secondary);";

      const regText = isZh()
        ? r.regime_label_zh || r.regime_label
        : r.regime_label_en || r.regime_label;

      return `
        <tr data-ticker="${r.ticker}">
          <td>
            <div style="display: flex; align-items: center; gap: 6px;">
              <strong class="font-mono-num" style="color: #fff; font-size: 12.5px;">${r.ticker}</strong>
              <span style="font-size: 11px; color: var(--text-secondary); max-width: 115px; overflow: hidden; text-overflow: ellipsis;">${stockName(r)}</span>
            </div>
            <div style="font-size: 10px; color: var(--text-muted);">${sectorName(r)}</div>
          </td>
          <td class="font-mono-num ${chgClass}" style="text-align: right; font-weight: 700;">
            $${r.price.toFixed(2)}
          </td>
          <td style="text-align: right;">
            <span class="font-mono-num ${badgeClass}">${formatSignPct(r.change_pct)}</span>
          </td>
          <td class="font-mono-num" style="text-align: right; color: #e2e8f0;">
            ${r.market_cap_fmt}
          </td>
          <td class="font-mono-num" style="text-align: right; ${rvolColor}">
            ${r.rvol.toFixed(2)}x
          </td>
          <td class="intraday-cell">
            <div class="range-bar-labels font-mono-num">
              <span>L: $${r.low.toFixed(2)}</span>
              <span style="color: #cbd5e1;">${t("tbRange")} ${r.intraday_range_pct.toFixed(1)}% · ${t("tbPos")} ${r.intraday_pos_pct.toFixed(0)}%</span>
              <span>H: $${r.high.toFixed(2)}</span>
            </div>
            <div class="range-bar-track">
              <div class="range-bar-fill" style="left: ${leftPct}%; width: ${widthPct}%; background: ${barColor};"></div>
              <div class="range-bar-marker" style="left: ${r.intraday_pos_pct}%;" title="${t("tbClosePosTitle")}: ${r.intraday_pos_pct}%"></div>
            </div>
          </td>
          <td class="drawdown-cell">
            <div class="range-bar-labels font-mono-num">
              <span style="color: #e2e8f0; font-weight: 700;">${r.drawdown_52w_pct.toFixed(2)}%</span>
              <span style="color: ${ddColor}; font-size: 9.5px;">${regText}</span>
              <span>H:$${r.high_52w.toFixed(0)}</span>
            </div>
            <div class="dd-bar-track" title="${t("tb52wRangeTitle")}: $${r.low_52w.toFixed(2)} — $${r.high_52w.toFixed(2)} (${r.pos_52w_pct}%)">
              <div class="dd-bar-fill" style="width: ${ddBarWidth.toFixed(1)}%; background: ${ddColor};"></div>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  tbody.querySelectorAll("tr[data-ticker]").forEach((tr) => {
    tr.addEventListener("click", () => {
      openStockDetailModal(tr.getAttribute("data-ticker"));
    });
  });

  const sum = tbData.summary || {};
  document.getElementById("table-count-label").textContent =
    `${t("tbShowing")} ${rows.length} ${t("tbOf")} ${sum.total || rows.length} ${t("kpiStocksUnit")}`;
  document.getElementById("table-regime-summary").innerHTML = `
    ${t("tbStrongClose")}: <strong class="font-mono-num" style="color:#f8fafc;">${sum.strong_intraday_close_count || 0}</strong> ·
    ${t("tbWeakClose")}: <strong class="font-mono-num" style="color:#f8fafc;">${sum.weak_intraday_close_count || 0}</strong> ·
    ${t("tbAvg52wDd")}: <strong class="font-mono-num" style="color:#f59e0b;">${sum.avg_drawdown_52w_pct || 0}%</strong>
  `;
}

/* ==========================================================================
   7. INTERACTIVE MODALS
   ========================================================================== */

function openStockDetailModal(ticker) {
  const records = state.dashboardData?.records || [];
  const stock = records.find((r) => r.ticker === ticker);
  if (!stock) return;

  state.activeModalTicker = ticker;
  const modal = document.getElementById("stock-detail-modal");
  modal.classList.add("open");

  document.getElementById("modal-stock-ticker").textContent = stock.ticker;
  document.getElementById("modal-stock-name").textContent = isZh()
    ? `${stock.cn_name} (${stock.name})`
    : stock.name;
  document.getElementById("modal-stock-sector").textContent = sectorName(stock);

  const chgClass = getChangeClass(stock.change_pct);
  const kpisEl = document.getElementById("modal-stock-kpis");
  kpisEl.innerHTML = `
    <div class="ribbon-card">
      <div class="ribbon-card-top">${t("modalKpiPrice")}</div>
      <div class="font-mono-num ${chgClass}" style="font-size: 15px; font-weight: 800;">
        $${stock.price.toFixed(2)} (${formatSignPct(stock.change_pct)})
      </div>
    </div>
    <div class="ribbon-card">
      <div class="ribbon-card-top">${t("modalKpiMcap")}</div>
      <div class="font-mono-num" style="font-size: 14px; font-weight: 700;">
        ${stock.market_cap_fmt} / ${stock.turnover_fmt}
      </div>
    </div>
    <div class="ribbon-card">
      <div class="ribbon-card-top">${t("modalKpiRvol")}</div>
      <div class="font-mono-num" style="font-size: 14px; font-weight: 700; color: ${stock.rvol >= 1.5 ? "#f59e0b" : "#f8fafc"};">
        ${stock.rvol.toFixed(2)}x (${stock.volume_fmt})
      </div>
    </div>
    <div class="ribbon-card">
      <div class="ribbon-card-top">${t("modalKpi52w")}</div>
      <div class="font-mono-num" style="font-size: 14px; font-weight: 700;">
        ${stock.drawdown_52w_pct.toFixed(2)}% ($${stock.high_52w.toFixed(2)})
      </div>
    </div>
  `;

  const chartDom = document.getElementById("modal-sparkline-chart");
  if (!state.charts.sparkline) {
    state.charts.sparkline = echarts.init(chartDom, null, { renderer: "canvas" });
  } else {
    state.charts.sparkline.resize();
  }

  const pal = getPalette();
  const prices = stock.sparkline_20d || [];
  const isTrendUp =
    prices.length >= 2 ? prices[prices.length - 1] >= prices[0] : true;
  const lineColor = isTrendUp ? pal.up.main : pal.down.main;

  state.charts.sparkline.setOption(
    {
      backgroundColor: "transparent",
      grid: { top: 15, bottom: 24, left: 52, right: 18 },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(15, 23, 42, 0.95)",
        borderColor: "#334155",
        textStyle: { color: "#f8fafc", fontSize: 12 },
      },
      xAxis: {
        type: "category",
        data: prices.map((_, idx) => `T-${prices.length - 1 - idx}`),
        axisLabel: { color: "#64748b", fontSize: 10 },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      yAxis: {
        type: "value",
        scale: true,
        splitLine: {
          lineStyle: { color: "rgba(51, 65, 85, 0.35)", type: "dashed" },
        },
        axisLabel: {
          color: "#94a3b8",
          fontSize: 10.5,
          formatter: (v) => `$${v.toFixed(0)}`,
        },
      },
      series: [
        {
          name: t("modalCloseSeries"),
          type: "line",
          smooth: 0.25,
          data: prices,
          symbolSize: 6,
          lineStyle: { color: lineColor, width: 2.5 },
          itemStyle: { color: lineColor },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: isTrendUp ? pal.up.soft : pal.down.soft },
              { offset: 1, color: "rgba(15, 23, 42, 0.0)" },
            ]),
          },
        },
      ],
    },
    true
  );
}

/* ==========================================================================
   8. EVENT LISTENERS & INITIALIZATION
   ========================================================================== */

function bindEvents() {
  document.getElementById("universe-select").addEventListener("change", (e) => {
    state.universeId = e.target.value;
    state.treemapSector = "ALL";
    loadDashboard(false);
  });

  document.getElementById("btn-color-mode").addEventListener("click", () => {
    state.colorMode = state.colorMode === "us" ? "cn" : "us";
    renderAll();
  });

  document.getElementById("btn-lang-toggle").addEventListener("click", () => {
    state.lang = state.lang === "en" ? "zh" : "en";
    renderAll();
  });

  document.getElementById("btn-refresh").addEventListener("click", () => {
    loadDashboard(true);
  });

  document
    .getElementById("treemap-sector-filter")
    .addEventListener("change", (e) => {
      state.treemapSector = e.target.value;
      renderTreemap();
    });

  document.getElementById("btn-treemap-reset").addEventListener("click", () => {
    state.treemapSector = "ALL";
    document.getElementById("treemap-sector-filter").value = "ALL";
    renderTreemap();
  });

  document.querySelectorAll("[data-gl-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll("[data-gl-mode]")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.glMode = btn.getAttribute("data-gl-mode");
      renderGainersLosers();
    });
  });

  document.querySelectorAll("[data-scatter-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll("[data-scatter-filter]")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.scatterFilter = btn.getAttribute("data-scatter-filter");
      renderVolumeScatter();
    });
  });

  document
    .getElementById("table-search-input")
    .addEventListener("input", (e) => {
      state.tableSearch = e.target.value;
      renderIntradayTable();
    });

  document
    .getElementById("table-regime-filter")
    .addEventListener("change", (e) => {
      state.tableRegime = e.target.value;
      renderIntradayTable();
    });

  document.querySelectorAll("#intraday-52w-table thead th").forEach((th) => {
    th.addEventListener("click", () => {
      const sortKey = th.getAttribute("data-sort");
      if (!sortKey) return;
      if (state.tableSortKey === sortKey) {
        state.tableSortAsc = !state.tableSortAsc;
      } else {
        state.tableSortKey = sortKey;
        state.tableSortAsc = sortKey === "ticker";
      }
      renderIntradayTable();
    });
  });

  document
    .getElementById("btn-close-stock-modal")
    .addEventListener("click", () => {
      document.getElementById("stock-detail-modal").classList.remove("open");
    });

  document
    .getElementById("btn-edit-watchlist")
    .addEventListener("click", () => {
      const customUniv = (state.universesList || []).find(
        (u) => u.id === "custom_watchlist"
      );
      const currentTickers = customUniv
        ? customUniv.tickers.join(", ")
        : "NVDA, TSLA, PLTR, META, AMD, AVGO, NFLX, LLY, JPM, GS, GE, UBER, COST, XOM, CEG";
      document.getElementById("watchlist-textarea").value = currentTickers;
      document.getElementById("watchlist-modal").classList.add("open");
    });

  document
    .getElementById("btn-close-watchlist-modal")
    .addEventListener("click", () => {
      document.getElementById("watchlist-modal").classList.remove("open");
    });

  document
    .getElementById("btn-reset-default-watchlist")
    .addEventListener("click", () => {
      document.getElementById("watchlist-textarea").value =
        "NVDA, TSLA, PLTR, META, AMD, AVGO, NFLX, LLY, JPM, GS, GE, UBER, COST, XOM, CEG";
    });

  document
    .getElementById("btn-save-watchlist")
    .addEventListener("click", async () => {
      const rawText = document.getElementById("watchlist-textarea").value;
      const tickers = rawText
        .split(/[\s,;]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      if (!tickers.length) return;
      try {
        await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tickers }),
        });
        document.getElementById("watchlist-modal").classList.remove("open");
        state.universeId = "custom_watchlist";
        document.getElementById("universe-select").value = "custom_watchlist";
        loadDashboard(false);
      } catch (err) {
        console.error("Failed to update watchlist:", err);
      }
    });

  document.getElementById("btn-plugins").addEventListener("click", () => {
    const plugins = state.dashboardData?.plugins || [];
    const listEl = document.getElementById("plugins-list-container");
    listEl.innerHTML = plugins
      .map((p) => {
        const pName = isZh() ? p.name_zh || p.name : p.name_en || p.name;
        const pDesc = isZh()
          ? p.description_zh || p.description
          : p.description_en || p.description;
        return `
          <div class="ribbon-card" style="display:flex; flex-direction:row; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-weight:700; color:#f8fafc;">${pName}</div>
              <div style="font-size:11.5px; color:var(--text-secondary); margin-top:2px;">${pDesc}</div>
            </div>
            <div style="text-align:right;">
              <span class="brand-tag font-mono-num">${p.id}</span>
              <div class="font-mono-num" style="font-size:10.5px; color:#10b981; margin-top:4px;">v${p.version} · ACTIVE</div>
            </div>
          </div>
        `;
      })
      .join("");
    document.getElementById("plugins-modal").classList.add("open");
  });

  document
    .getElementById("btn-close-plugins-modal")
    .addEventListener("click", () => {
      document.getElementById("plugins-modal").classList.remove("open");
    });

  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        backdrop.classList.remove("open");
      }
    });
  });

  window.addEventListener("resize", () => {
    Object.values(state.charts).forEach((chart) => {
      if (chart) chart.resize();
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  applyStaticTranslations();
  updateThemeUI();
  bindEvents();
  loadDashboard(false);
});
