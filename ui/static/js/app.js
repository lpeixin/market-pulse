/**
 * MarketPulse — Frontend Visualization & Terminal Controller
 * Renders 4 interactive ECharts / HTML5 financial widgets with instant
 * US (Green Up / Red Down) <-> CN (Red Up / Green Down) theme switching.
 */

const state = {
  universeId: "sp500_core",
  colorMode: localStorage.getItem("mp_color_mode") || "us", // 'us' = Green Up/Red Down, 'cn' = Red Up/Green Down
  glMode: "diverging", // 'diverging' | 'ranked'
  scatterFilter: "ALL", // 'ALL' | 'ANOMALY' | 'BREAKOUT_SURGE' | 'HEAVY_SELLOFF'
  treemapSector: "ALL",
  tableSearch: "",
  tableRegime: "ALL",
  tableSortKey: "market_cap",
  tableSortAsc: false,
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
   1. COLOR THEME ENGINE (US Green-Up/Red-Down vs CN Red-Up/Green-Down)
   ========================================================================== */

function getPalette() {
  const isUS = state.colorMode === "us";
  const green = {
    main: "#10b981",
    bright: "#34d399",
    deep: "#065f46",
    soft: "rgba(16, 185, 129, 0.20)",
    rgb: [16, 185, 129],
    deepRgb: [6, 95, 70],
  };
  const red = {
    main: "#f43f5e",
    bright: "#fb7185",
    deep: "#9f1239",
    soft: "rgba(244, 63, 94, 0.20)",
    rgb: [244, 63, 94],
    deepRgb: [159, 18, 57],
  };

  return {
    up: isUS ? green : red,
    down: isUS ? red : green,
    neutral: "#334155",
    neutralRgb: [30, 41, 59],
    amber: "#f59e0b",
    cyan: "#38bdf8",
    textPrimary: "#f1f5f9",
    textSecondary: "#94a3b8",
    border: "#1e293b",
  };
}

/**
 * Smoothly maps return percentage in [-5%, +5%] to a rich financial terminal RGB color.
 */
function interpolateReturnColor(changePct) {
  const pal = getPalette();
  const clamped = Math.max(-5.0, Math.min(5.0, Number(changePct) || 0));
  const neutral = [26, 36, 54]; // Dark slate at 0%

  if (Math.abs(clamped) < 0.08) {
    return `rgb(${neutral[0]}, ${neutral[1]}, ${neutral[2]})`;
  }

  const ratio = Math.min(1.0, Math.abs(clamped) / 5.0);
  // Nonlinear curve so +/-1% is already clearly distinguishable
  const weight = 0.28 + 0.72 * Math.pow(ratio, 0.75);
  const target = clamped > 0 ? pal.up.rgb : pal.down.rgb;

  const r = Math.round(neutral[0] + (target[0] - neutral[0]) * weight);
  const g = Math.round(neutral[1] + (target[1] - neutral[1]) * weight);
  const b = Math.round(neutral[2] + (target[2] - neutral[2]) * weight);
  return `rgb(${r}, ${g}, ${b})`;
}

function updateThemeUI() {
  document.documentElement.setAttribute("data-color-mode", state.colorMode);
  localStorage.setItem("mp_color_mode", state.colorMode);

  const labelEl = document.getElementById("color-mode-label");
  const indicatorEl = document.getElementById("color-mode-indicator");
  const legendGrad = document.getElementById("treemap-legend-gradient");
  const pal = getPalette();

  if (state.colorMode === "us") {
    labelEl.textContent = "美股配色 (绿涨红跌)";
  } else {
    labelEl.textContent = "中式配色 (红涨绿跌)";
  }

  indicatorEl.innerHTML = `
    <span style="width: 8px; height: 8px; border-radius: 50%; background: ${pal.up.main}; display: inline-block;"></span>
    <span style="width: 8px; height: 8px; border-radius: 50%; background: ${pal.down.main}; display: inline-block;"></span>
  `;

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
    refreshText.textContent = forceRefresh ? "正在拉取实时行情..." : "加载数据中...";

    const url = `/api/dashboard?universe=${encodeURIComponent(
      state.universeId
    )}&force_refresh=${forceRefresh ? "true" : "false"}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    state.dashboardData = data;

    populateSectorDropdown(data);
    renderAll();
  } catch (err) {
    console.error("Failed to load dashboard data:", err);
    document.getElementById("session-label-badge").textContent =
      "数据加载异常，请点击强制刷新重试";
  } finally {
    refreshBtn.classList.remove("loading");
    refreshBtn.disabled = false;
    if (refreshIcon) refreshIcon.style.display = "inline-block";
    refreshText.textContent = "强制刷新数据";
  }
}

function populateSectorDropdown(data) {
  const sel = document.getElementById("treemap-sector-filter");
  if (!sel || !data?.widgets?.market_cap_treemap) return;
  const sectors = data.widgets.market_cap_treemap.sector_summary || [];
  const currentVal = state.treemapSector;

  let html = `<option value="ALL">全部 GICS 行业 (${sectors.length})</option>`;
  for (const s of sectors) {
    const sign = s.change_pct >= 0 ? "+" : "";
    html += `<option value="${s.sector}">${s.sector_cn} · ${s.sector} (${sign}${s.change_pct}%)</option>`;
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
  if (!state.dashboardData) return;
  updateThemeUI();
  renderHeaderStatus();
  renderIndicesRibbon();
  renderKpiStrip();
  renderTreemap();
  renderGainersLosers();
  renderVolumeScatter();
  renderIntradayTable();
}

function renderHeaderStatus() {
  const { session, universe, plugins } = state.dashboardData;
  if (!session) return;

  const dotEl = document.getElementById("session-dot");
  dotEl.className = `pulse-dot ${session.is_intraday ? "intraday" : "closed"}`;

  document.getElementById("trading-date-badge").textContent =
    `美股交易日: ${session.trading_date}`;
  document.getElementById("session-label-badge").textContent =
    session.session_label;
  document.getElementById("cache-source-badge").textContent =
    session.data_source || "SQLite Cache";
  document.getElementById("timestamp-badge").textContent =
    session.et_time || session.local_time;

  if (plugins) {
    document.getElementById("plugin-count-badge").textContent =
      `${plugins.length} 分析插件`;
  }

  // Sync universe select options counts if universes metadata is present
  if (state.dashboardData.universes_list) {
    state.universesList = state.dashboardData.universes_list;
    const uSelect = document.getElementById("universe-select");
    uSelect.innerHTML = state.universesList
      .map(
        (u) =>
          `<option value="${u.id}" ${
            u.id === universe.id ? "selected" : ""
          }>${u.name} (${u.count})</option>`
      )
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
      const isVix = idx.short_name === "VIX";
      const chgClass = getChangeClass(idx.change_pct);
      const badgeClass = getBadgeClass(idx.change_pct);
      const sign = idx.change >= 0 ? "+" : "";
      return `
        <div class="ribbon-card">
          <div class="ribbon-card-top">
            <span style="font-weight: 700; color: #e2e8f0;">${idx.name}</span>
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

  container.innerHTML = `
    <div class="kpi-box">
      <div>
        <div style="font-size: 11px; color: var(--text-secondary);">股票池总市值 &amp; 加权收益</div>
        <div style="display: flex; align-items: baseline; gap: 8px; margin-top: 3px;">
          <span class="font-mono-num" style="font-size: 16px; font-weight: 800;">${ov.total_market_cap_fmt}</span>
          <span class="font-mono-num ${capRetClass}" style="font-size: 13px; font-weight: 700;">${formatSignPct(ov.cap_weighted_return_pct)} (加权)</span>
        </div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 11px; color: var(--text-muted);">等权均值 / 中位数</div>
        <div class="font-mono-num ${eqRetClass}" style="font-size: 12px; font-weight: 600; margin-top: 3px;">
          ${formatSignPct(ov.equal_weighted_return_pct)} / ${formatSignPct(ov.median_return_pct)}
        </div>
      </div>
    </div>

    <div class="kpi-box" style="flex-direction: column; align-items: stretch;">
      <div style="display: flex; justify-content: space-between; font-size: 11px;">
        <span style="color: var(--text-secondary);">市场涨跌宽度 (${ov.total_stocks} 只标的)</span>
        <span class="font-mono-num">
          <strong class="text-up">${ov.advancers} 涨</strong> ·
          <strong class="text-down">${ov.decliners} 跌</strong>
          ${ov.unchanged ? `· <span class="text-flat">${ov.unchanged} 平</span>` : ""}
        </span>
      </div>
      <div class="breadth-bar-track">
        <div class="breadth-bar-fill" style="width: ${ov.advance_ratio_pct}%;"></div>
      </div>
    </div>

    <div class="kpi-box">
      <div>
        <div style="font-size: 11px; color: var(--text-secondary);">当日总成交额 &amp; 放量异动</div>
        <div style="display: flex; align-items: baseline; gap: 8px; margin-top: 3px;">
          <span class="font-mono-num" style="font-size: 16px; font-weight: 800;">${ov.total_turnover_fmt}</span>
          <span class="font-mono-num" style="font-size: 12px; color: #f59e0b; font-weight: 700;">
            ${ov.anomaly_volume_count} 只 RVOL≥1.5x
          </span>
        </div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 11px; color: var(--text-muted);">逼近 52周高点</div>
        <div class="font-mono-num" style="font-size: 13px; font-weight: 700; color: #38bdf8; margin-top: 3px;">
          ${ov.near_52w_high_count} 只 (回撤≤5%)
        </div>
      </div>
    </div>

    <div class="kpi-box">
      <div>
        <div style="font-size: 11px; color: var(--text-secondary);">领涨行业板块</div>
        <div style="margin-top: 3px; font-weight: 700; font-size: 12.5px;">
          ${topSector ? `${topSector.sector_cn} <span class="font-mono-num ${getChangeClass(topSector.change_pct)}">${formatSignPct(topSector.change_pct)}</span>` : "--"}
        </div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 11px; color: var(--text-secondary);">领跌行业板块</div>
        <div style="margin-top: 3px; font-weight: 700; font-size: 12.5px;">
          ${worstSector ? `${worstSector.sector_cn} <span class="font-mono-num ${getChangeClass(worstSector.change_pct)}">${formatSignPct(worstSector.change_pct)}</span>` : "--"}
        </div>
      </div>
    </div>
  `;
}

/* ==========================================================================
   3. WIDGET 1: MARKET CAP TREEMAP (大盘市值热力图)
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

  // Transform tree nodes with explicit dynamic colors mapped from change_pct
  const styledTree = rawTree.map((sectorNode) => {
    const secSign = sectorNode.change_pct >= 0 ? "+" : "";
    return {
      ...sectorNode,
      name: `${sectorNode.sector_cn} (${secSign}${sectorNode.change_pct}%) · ${sectorNode.market_cap_fmt}`,
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
        // Sector Node Tooltip
        if (d.children) {
          const sign = d.change_pct >= 0 ? "+" : "";
          return `
            <div style="min-width: 190px;">
              <div style="font-weight: 800; font-size: 13px; margin-bottom: 4px; color: #38bdf8;">
                ${d.sector_cn} (${d.sector})
              </div>
              <div style="display: flex; justify-content: space-between; margin: 2px 0;">
                <span style="color:#94a3b8;">板块总市值:</span>
                <strong class="font-mono-num">${d.market_cap_fmt} (${d.weight_pct}%)</strong>
              </div>
              <div style="display: flex; justify-content: space-between; margin: 2px 0;">
                <span style="color:#94a3b8;">市值加权涨跌:</span>
                <strong class="font-mono-num">${sign}${d.change_pct}%</strong>
              </div>
              <div style="display: flex; justify-content: space-between; margin: 2px 0;">
                <span style="color:#94a3b8;">成分股数量:</span>
                <strong class="font-mono-num">${d.stock_count} 只</strong>
              </div>
            </div>
          `;
        }
        // Individual Stock Leaf Tooltip
        const sign = d.change_pct >= 0 ? "+" : "";
        return `
          <div style="min-width: 215px;">
            <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #334155; padding-bottom: 4px; margin-bottom: 5px;">
              <div>
                <strong style="font-size: 14px; color: #fff;">${d.ticker}</strong>
                <span style="color: #94a3b8; font-size: 11.5px; margin-left: 4px;">${d.cn_name}</span>
              </div>
              <span style="font-size: 11px; color: #38bdf8;">${d.sector_cn}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin: 2px 0;">
              <span style="color:#94a3b8;">最新价 / 涨跌幅:</span>
              <strong class="font-mono-num">$${d.price.toFixed(2)} (${sign}${d.change_pct.toFixed(2)}%)</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin: 2px 0;">
              <span style="color:#94a3b8;">总市值 (板块占比):</span>
              <strong class="font-mono-num">${d.market_cap_fmt} (${d.weight_in_sector_pct}%)</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin: 2px 0;">
              <span style="color:#94a3b8;">当日成交额 / RVOL:</span>
              <strong class="font-mono-num">${d.turnover_fmt} / ${d.rvol.toFixed(2)}x</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin: 2px 0;">
              <span style="color:#94a3b8;">52周高点回撤:</span>
              <strong class="font-mono-num">${d.drawdown_52w_pct.toFixed(2)}%</strong>
            </div>
            <div style="margin-top: 5px; font-size: 10.5px; color: #64748b; text-align: right;">
              点击查看 20 日价格趋势与详情 →
            </div>
          </div>
        `;
      },
    },
    series: [
      {
        name: "美股市值热力图",
        type: "treemap",
        width: "100%",
        height: "100%",
        roam: false,
        nodeClick: false,
        breadcrumb: {
          show: false,
        },
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
            itemStyle: {
              borderColor: "#090d16",
              borderWidth: 2,
              gapWidth: 2,
            },
            upperLabel: { show: false },
          },
          {
            itemStyle: {
              borderColor: "#111827",
              borderWidth: 2,
              gapWidth: 1.5,
            },
            upperLabel: {
              show: true,
              height: 19,
            },
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
   4. WIDGET 2: TOP GAINERS & LOSERS BAR CHART (多空涨跌幅龙虎榜)
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

  // Update footer spread badge
  const spreadBadge = document.getElementById("gl-spread-badge");
  if (spreadBadge && gl.best_ticker && gl.worst_ticker) {
    const spread = (gl.best_ticker.change_pct - gl.worst_ticker.change_pct).toFixed(2);
    spreadBadge.innerHTML = `首尾极差: <strong style="color:#f8fafc;">${spread}%</strong> (${gl.best_ticker.ticker} ${formatSignPct(gl.best_ticker.change_pct)} vs ${gl.worst_ticker.ticker} ${formatSignPct(gl.worst_ticker.change_pct)})`;
  }

  const tooltipFormatter = (params) => {
    const item = Array.isArray(params)
      ? params.find((p) => p.data && p.data.meta) || params[0]
      : params;
    const d = item?.data?.meta;
    if (!d) return "";
    const sign = d.change_pct >= 0 ? "+" : "";
    return `
      <div style="min-width: 210px;">
        <div style="display:flex; justify-content:space-between; border-bottom:1px solid #334155; padding-bottom:4px; margin-bottom:5px;">
          <strong>#${d.rank} ${d.ticker} · ${d.cn_name}</strong>
          <span style="color:#38bdf8; font-size:11px;">${d.sector_cn}</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin:2px 0;">
          <span style="color:#94a3b8;">最新价 / 涨跌幅:</span>
          <strong class="font-mono-num">$${d.price.toFixed(2)} (${sign}${d.change_pct.toFixed(2)}%)</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin:2px 0;">
          <span style="color:#94a3b8;">日内振幅 (Amplitude):</span>
          <strong class="font-mono-num" style="color:#f59e0b;">${d.intraday_range_pct.toFixed(2)}% ($${d.low.toFixed(2)} - $${d.high.toFixed(2)})</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin:2px 0;">
          <span style="color:#94a3b8;">当日成交额 (Turnover):</span>
          <strong class="font-mono-num" style="color:#38bdf8;">${d.turnover_fmt}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin:2px 0;">
          <span style="color:#94a3b8;">相对量比 (RVOL) / 市值:</span>
          <strong class="font-mono-num">${d.rvol.toFixed(2)}x / ${d.market_cap_fmt}</strong>
        </div>
      </div>
    `;
  };

  if (state.glMode === "diverging") {
    // Bidirectional butterfly horizontal bar chart: Rank #1 (top) to Rank #10 (bottom)
    const pairs = [...(gl.paired_ranks || [])].reverse(); // reverse so Rank 1 is at top of Y axis
    const yCategories = pairs.map((p) => `TOP ${p.rank}`);

    const gainerSeriesData = pairs.map((p) => {
      const g = p.gainer;
      if (!g) return { value: 0, meta: null };
      // Ensure positive visual bar length even if all stocks fell on a broad market selloff day
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
        data: ["跌幅榜 Top 10 (Losers)", "涨幅榜 Top 10 (Gainers)"],
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
          name: "跌幅榜 Top 10 (Losers)",
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
          name: "涨幅榜 Top 10 (Gainers)",
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
    // Ranked mode: Top 10 Gainers and Top 10 Losers in a single sorted horizontal bar chart
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
      grid: {
        top: 12,
        bottom: 24,
        left: 62,
        right: 62,
      },
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
   5. WIDGET 3: VOLUME ANOMALY VS RETURN SCATTER (量价异动雷达)
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

  // Quadrant count badges
  const qCounts = va.quadrant_counts || {};
  const badgesEl = document.getElementById("scatter-quadrant-badges");
  if (badgesEl) {
    badgesEl.innerHTML = `
      <span class="badge-change badge-up font-mono-num">放量突破: ${qCounts.breakout_surge || 0}</span>
      <span class="badge-change badge-down font-mono-num">放量杀跌: ${qCounts.heavy_selloff || 0}</span>
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
        color: isUp ? baseColor.soft : baseColor.soft,
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
        return `
          <div style="min-width: 215px;">
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid #334155; padding-bottom:4px; margin-bottom:5px;">
              <strong>${d.ticker} · ${d.cn_name}</strong>
              <span style="color:#f59e0b; font-size:11px; font-weight:700;">${d.quadrant_label}</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin:2px 0;">
              <span style="color:#94a3b8;">当日涨跌幅 (X轴):</span>
              <strong class="font-mono-num">${sign}${d.change_pct.toFixed(2)}% ($${d.price.toFixed(2)})</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin:2px 0;">
              <span style="color:#94a3b8;">相对成交量 RVOL (Y轴):</span>
              <strong class="font-mono-num" style="color:${d.is_anomaly ? "#f59e0b" : "#f8fafc"};">${d.rvol.toFixed(2)}x</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin:2px 0;">
              <span style="color:#94a3b8;">当日量 / 20日均量:</span>
              <strong class="font-mono-num">${d.volume_fmt} / ${d.avg_volume_20d_fmt}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin:2px 0;">
              <span style="color:#94a3b8;">总市值 (气泡大小):</span>
              <strong class="font-mono-num">${d.market_cap_fmt}</strong>
            </div>
          </div>
        `;
      },
    },
    grid: {
      top: 26,
      bottom: 34,
      left: 52,
      right: 28,
    },
    xAxis: {
      type: "value",
      name: "涨跌幅 (%)",
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
      name: "相对成交量 (RVOL)",
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
        name: "量价异动散点",
        type: "scatter",
        data: scatterData,
        markLine: {
          silent: true,
          symbol: ["none", "none"],
          data: [
            {
              yAxis: va.rvol_threshold || 1.5,
              lineStyle: {
                color: "#f59e0b",
                type: "dashed",
                width: 1.8,
              },
              label: {
                formatter: "RVOL = 1.5x 异动阈值线",
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
          itemStyle: {
            color: "rgba(245, 158, 11, 0.04)",
          },
          data: [
            [
              { yAxis: va.rvol_threshold || 1.5 },
              { yAxis: yMax },
            ],
          ],
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

  // Apply search filter
  const q = state.tableSearch.trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (r) =>
        r.ticker.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.cn_name.toLowerCase().includes(q) ||
        r.sector_cn.toLowerCase().includes(q)
    );
  }

  // Apply regime filter
  if (state.tableRegime === "STRONG_CLOSE") {
    rows = rows.filter((r) => r.intraday_pos_pct >= 75.0);
  } else if (state.tableRegime === "WEAK_CLOSE") {
    rows = rows.filter((r) => r.intraday_pos_pct <= 25.0);
  } else if (state.tableRegime === "NEAR_ATH") {
    rows = rows.filter((r) => r.drawdown_52w_pct >= -3.0);
  } else if (state.tableRegime === "DEEP_DRAWDOWN") {
    rows = rows.filter((r) => r.drawdown_52w_pct <= -20.0);
  }

  // Sort rows
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

  // Update table sort header indicators
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

      // Intraday range span between Open and Close
      const leftPct = Math.min(r.intraday_open_pos_pct, r.intraday_pos_pct);
      const widthPct = Math.max(
        4,
        Math.abs(r.intraday_pos_pct - r.intraday_open_pos_pct)
      );

      // 52W Drawdown visual progress width (cap at 50% drawdown = 100% bar width for visual clarity)
      const ddAbs = Math.abs(r.drawdown_52w_pct);
      const ddBarWidth = Math.min(100, (ddAbs / 45.0) * 100);
      const ddColor =
        ddAbs <= 5
          ? "#38bdf8"
          : ddAbs <= 15
          ? "#f59e0b"
          : pal.down.main;

      const rvolColor =
        r.rvol >= 1.5
          ? "color: #f59e0b; font-weight: 800;"
          : "color: var(--text-secondary);";

      return `
        <tr data-ticker="${r.ticker}">
          <td>
            <div style="display: flex; align-items: center; gap: 6px;">
              <strong class="font-mono-num" style="color: #fff; font-size: 12.5px;">${r.ticker}</strong>
              <span style="font-size: 11px; color: var(--text-secondary);">${r.cn_name}</span>
            </div>
            <div style="font-size: 10px; color: var(--text-muted);">${r.sector_cn}</div>
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
              <span style="color: #cbd5e1;">振幅 ${r.intraday_range_pct.toFixed(1)}% · 位置 ${r.intraday_pos_pct.toFixed(0)}%</span>
              <span>H: $${r.high.toFixed(2)}</span>
            </div>
            <div class="range-bar-track">
              <div class="range-bar-fill" style="left: ${leftPct}%; width: ${widthPct}%; background: ${barColor};"></div>
              <div class="range-bar-marker" style="left: ${r.intraday_pos_pct}%;" title="收盘价位置: ${r.intraday_pos_pct}%"></div>
            </div>
          </td>
          <td class="drawdown-cell">
            <div class="range-bar-labels font-mono-num">
              <span style="color: #e2e8f0; font-weight: 700;">${r.drawdown_52w_pct.toFixed(2)}%</span>
              <span style="color: ${ddColor}; font-size: 10px;">${r.regime_label}</span>
              <span>52W H: $${r.high_52w.toFixed(2)}</span>
            </div>
            <div class="dd-bar-track" title="52周区间: $${r.low_52w.toFixed(2)} — $${r.high_52w.toFixed(2)} (当前处于52周区间 ${r.pos_52w_pct}%)">
              <div class="dd-bar-fill" style="width: ${ddBarWidth.toFixed(1)}%; background: ${ddColor};"></div>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  // Bind row click to open Stock Detail Modal
  tbody.querySelectorAll("tr[data-ticker]").forEach((tr) => {
    tr.addEventListener("click", () => {
      openStockDetailModal(tr.getAttribute("data-ticker"));
    });
  });

  // Footer summary
  const sum = tbData.summary || {};
  document.getElementById("table-count-label").textContent =
    `显示 ${rows.length} / ${sum.total || rows.length} 只标的`;
  document.getElementById("table-regime-summary").innerHTML = `
    日内高位收盘(≥75%): <strong class="font-mono-num" style="color:#f8fafc;">${sum.strong_intraday_close_count || 0}</strong> ·
    日内低位收盘(≤25%): <strong class="font-mono-num" style="color:#f8fafc;">${sum.weak_intraday_close_count || 0}</strong> ·
    平均52周回撤: <strong class="font-mono-num" style="color:#f59e0b;">${sum.avg_drawdown_52w_pct || 0}%</strong>
  `;
}

/* ==========================================================================
   7. INTERACTIVE MODALS (20D Sparkline Detail, Watchlist Editor, Plugins)
   ========================================================================== */

function openStockDetailModal(ticker) {
  const records = state.dashboardData?.records || [];
  const stock = records.find((r) => r.ticker === ticker);
  if (!stock) return;

  const modal = document.getElementById("stock-detail-modal");
  modal.classList.add("open");

  document.getElementById("modal-stock-ticker").textContent = stock.ticker;
  document.getElementById("modal-stock-name").textContent = `${stock.cn_name} (${stock.name})`;
  document.getElementById("modal-stock-sector").textContent = stock.sector_cn;

  const chgClass = getChangeClass(stock.change_pct);
  const kpisEl = document.getElementById("modal-stock-kpis");
  kpisEl.innerHTML = `
    <div class="ribbon-card">
      <div class="ribbon-card-top">最新价 / 涨跌幅</div>
      <div class="font-mono-num ${chgClass}" style="font-size: 15px; font-weight: 800;">
        $${stock.price.toFixed(2)} (${formatSignPct(stock.change_pct)})
      </div>
    </div>
    <div class="ribbon-card">
      <div class="ribbon-card-top">总市值 / 成交额</div>
      <div class="font-mono-num" style="font-size: 14px; font-weight: 700;">
        ${stock.market_cap_fmt} / ${stock.turnover_fmt}
      </div>
    </div>
    <div class="ribbon-card">
      <div class="ribbon-card-top">相对量比 (RVOL)</div>
      <div class="font-mono-num" style="font-size: 14px; font-weight: 700; color: ${stock.rvol >= 1.5 ? "#f59e0b" : "#f8fafc"};">
        ${stock.rvol.toFixed(2)}x (${stock.volume_fmt})
      </div>
    </div>
    <div class="ribbon-card">
      <div class="ribbon-card-top">52周回撤 / 52周高点</div>
      <div class="font-mono-num" style="font-size: 14px; font-weight: 700;">
        ${stock.drawdown_52w_pct.toFixed(2)}% ($${stock.high_52w.toFixed(2)})
      </div>
    </div>
  `;

  // Render 20-Day Close Sparkline EChart
  const chartDom = document.getElementById("modal-sparkline-chart");
  if (!state.charts.sparkline) {
    state.charts.sparkline = echarts.init(chartDom, null, { renderer: "canvas" });
  } else {
    state.charts.sparkline.resize();
  }

  const pal = getPalette();
  const prices = stock.sparkline_20d || [];
  const isTrendUp = prices.length >= 2 ? prices[prices.length - 1] >= prices[0] : true;
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
        splitLine: { lineStyle: { color: "rgba(51, 65, 85, 0.35)", type: "dashed" } },
        axisLabel: {
          color: "#94a3b8",
          fontSize: 10.5,
          formatter: (v) => `$${v.toFixed(0)}`,
        },
      },
      series: [
        {
          name: "收盘价",
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
  // Universe selector
  document.getElementById("universe-select").addEventListener("change", (e) => {
    state.universeId = e.target.value;
    state.treemapSector = "ALL";
    loadDashboard(false);
  });

  // Color Mode Toggle (US <-> CN)
  document.getElementById("btn-color-mode").addEventListener("click", () => {
    state.colorMode = state.colorMode === "us" ? "cn" : "us";
    renderAll();
  });

  // Force Refresh Button
  document.getElementById("btn-refresh").addEventListener("click", () => {
    loadDashboard(true);
  });

  // Treemap sector filter & reset
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

  // Gainers / Losers view mode toggle
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

  // Volume Scatter quadrant filter pills
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

  // Table search & regime filter & column sorting
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

  // Stock Detail Modal close
  document
    .getElementById("btn-close-stock-modal")
    .addEventListener("click", () => {
      document.getElementById("stock-detail-modal").classList.remove("open");
    });

  // Custom Watchlist Modal
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

  // Plugins Modal
  document.getElementById("btn-plugins").addEventListener("click", () => {
    const plugins = state.dashboardData?.plugins || [];
    const listEl = document.getElementById("plugins-list-container");
    listEl.innerHTML = plugins
      .map(
        (p) => `
        <div class="ribbon-card" style="display:flex; flex-direction:row; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-weight:700; color:#f8fafc;">${p.name}</div>
            <div style="font-size:11.5px; color:var(--text-secondary); margin-top:2px;">${p.description}</div>
          </div>
          <div style="text-align:right;">
            <span class="brand-tag font-mono-num">${p.id}</span>
            <div class="font-mono-num" style="font-size:10.5px; color:#10b981; margin-top:4px;">v${p.version} · ACTIVE</div>
          </div>
        </div>
      `
      )
      .join("");
    document.getElementById("plugins-modal").classList.add("open");
  });

  document
    .getElementById("btn-close-plugins-modal")
    .addEventListener("click", () => {
      document.getElementById("plugins-modal").classList.remove("open");
    });

  // Close modals when clicking backdrop
  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        backdrop.classList.remove("open");
      }
    });
  });

  // Window resize responsiveness for all ECharts instances
  window.addEventListener("resize", () => {
    Object.values(state.charts).forEach((chart) => {
      if (chart) chart.resize();
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  updateThemeUI();
  bindEvents();
  loadDashboard(false);
});
