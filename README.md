# MarketPulse — 美股多维量化行情可视化终端

**MarketPulse** 是一款面向金融工程与量化研究的本地跨平台桌面应用，基于 **Python (`yfinance` + `pandas` + `SQLite`) + FastAPI + ECharts + PyWebView** 构建。启动时自动识别美股最近一个完整交易日（或盘中实时快照），利用本地 SQLite 缓存避免重复请求限流，并在暗黑金融终端界面中呈现多维交互看板。

---

## 核心特性 (V1.0 MVP)

1. **智能交易日识别与本地 SQLite 缓存 (`core/data_fetcher.py`, `core/cache.py`)**
   - 自动检测美东时间（`America/New_York`）当前所处交易阶段（盘中实时、盘前、盘后、周末或节假日休市），休市时段自动回溯至最近一个完整交易日收盘数据。
   - 内置 SQLite 本地持久化缓存（`data/market_cache.db`），同一交易日切换股票池或重启应用均以毫秒级（`< 2ms`）响应，同时支持顶栏 **“强制刷新数据”** 实时重抓。
2. **四大核心可视化视图 (`analyzers/` + `ui/`)**
   - **01 大盘市值热力图 (Market Cap Treemap)**：按 `GICS 行业 -> 个股` 两级嵌套，矩形面积严格映射总市值（Market Cap），色阶映射当日涨跌幅（`-5%` 至 `+5%`），方块内直显 `Ticker + 涨跌幅% + 最新价`。
   - **02 多空涨跌幅龙虎榜 (Top Gainers & Losers Bar Chart)**：双向水平条形图同屏对比当日涨幅 Top 10 与跌幅 Top 10，支持双向对称视图与极值排序切换，悬停展示日内振幅与成交额。
   - **03 量价异动雷达 (Volume Anomaly vs. Return Scatter)**：X 轴为当日涨跌幅（%），Y 轴为相对成交量比率（`RVOL = 当日成交量 / 20日均量`），气泡大小映射市值，内嵌 `RVOL = 1.5x` 异动阈值线，快速识别放量突破与放量杀跌标的。
   - **04 日内多空博弈与 52 周水位表 (Intraday Range & 52W Drawdown Table)**：紧凑型可排序交互表格，内嵌可视化 **日内价格位置条（Low–Close–High）** 与 **距离 52 周高点回撤幅度进度条（Drawdown from 52W High %）**。
3. **高扩展性插件架构 (`analyzers/base.py`)**
   - 每个可视化面板的数据计算逻辑封装在独立的 `analyzers/` 插件中，通过 `@AnalyzerRegistry.register` 自动注册，方便未来扩展“历史最大回撤对比”、“ETF 资金流”、“波动率曲面”等新模块。
4. **金融终端交互体验**
   - 一键切换 **美股配色（绿涨红跌）** 与 **中式配色（红涨绿跌）**。
   - 内置 4 套核心股票池（`S&P 500 核心权重`、`纳指核心科技`、`核心科技巨头`、`自定义观察池`），支持在界面中直接增删自定义观察池成分股。
   - 点击任意热力图方块、条形图、散点气泡或表格行，即可弹出 **个股 20 日收盘走势（Sparkline）与多维指标详情弹窗**。

---

## 目录结构

```text
market-pulse/
├── app.py                          # FastAPI 后端服务与 PyWebView 原生桌面窗口入口
├── requirements.txt                # Python 依赖清单
├── config/
│   └── universe.json               # GICS 行业分类、美股核心指数与四大预设股票池配置
├── core/
│   ├── __init__.py
│   ├── cache.py                    # SQLite 本地缓存引擎 (data/market_cache.db)
│   └── data_fetcher.py             # 智能交易日识别与 yfinance 批量行情拉取/指标计算
├── analyzers/
│   ├── __init__.py                 # 自动加载并注册所有分析器插件
│   ├── base.py                     # BaseAnalyzer 抽象基类与 AnalyzerRegistry 插件注册表
│   ├── overview_summary.py         # 全市场涨跌宽度、市值加权收益与行业排序分析器
│   ├── treemap_analyzer.py         # Widget 01: 大盘市值热力图数据构建器
│   ├── gainers_losers_analyzer.py  # Widget 02: 多空涨跌幅龙虎榜构建器
│   ├── volume_anomaly_analyzer.py  # Widget 03: 量价异动雷达 (RVOL vs Return) 分析器
│   └── intraday_52w_analyzer.py    # Widget 04: 日内多空位置与 52 周回撤水位分析器
├── ui/
│   ├── index.html                  # 暗黑金融终端主界面
│   └── static/
│       ├── css/terminal.css        # 响应式暗黑终端样式与红绿双主题变量
│       ├── js/app.js               # 前端状态管理与 ECharts 四大视图渲染逻辑
│       └── vendor/echarts.min.js   # 本地化 ECharts 5 引擎（零外部 CDN 依赖）
└── tests/
    └── verify_data_engine.py       # 数据拉取、SQLite 缓存与分析器自动化验证脚本
```

---

## 快速启动

```bash
# 1. 创建并激活虚拟环境 (已完成)
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 2. 运行数据引擎与缓存验证脚本
python tests/verify_data_engine.py

# 3. 启动原生跨平台桌面窗口 (PyWebView)
python app.py

# 或启动本地 Web 服务并在浏览器中打开调试 (http://127.0.0.1:8765)
python app.py --server-only
```
