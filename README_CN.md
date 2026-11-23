<div align="center">

![MarketPulse Banner](docs/assets/banner.svg)

# MarketPulse

**跨平台多市场（美股 · 中国 A 股 · 香港港股 · 区块链加密货币）多维量化行情可视化终端**

[![Python](https://img.shields.io/badge/Python-3.9%2B-38bdf8?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-10b981?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![ECharts](https://img.shields.io/badge/Apache_ECharts-5.5-f43f5e?style=flat-square&logo=apacheecharts&logoColor=white)](https://echarts.apache.org/)
[![PyWebView](https://img.shields.io/badge/Desktop-PyWebView-a855f7?style=flat-square)](https://pywebview.flowrl.com/)
[![SQLite](https://img.shields.io/badge/Cache-SQLite_3-f59e0b?style=flat-square&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-slate?style=flat-square)](LICENSE)

<h3>
  <a href="README.md">English</a> &nbsp;|&nbsp; <strong>简体中文</strong>
</h3>

</div>

---

## 项目简介

**MarketPulse** 是一款面向金融数据工程、量化研究与跨市场交易者的本地跨平台桌面行情可视化终端。项目基于 **Python (`yfinance` + `pandas` + `SQLite`) + FastAPI + Apache ECharts 5 + PyWebView** 构建，无需任何付费 API Key 即可稳定拉取 **美股（US）**、**中国 A 股（CN）**、**香港港股（HK）** 与 **区块链加密货币（CRYPTO）** 四大市场的核心基准与代表性标的，并在现代暗黑金融终端（Dark Mode Financial Terminal）界面中生成高交互、多维度的可视化看板。

项目采用高内聚、低耦合的**模块化插件架构（`analyzers/`）**，将数据拉取/本地缓存层与量化指标计算层彻底解耦，方便后续无缝扩展“历史最大回撤对比”、“ETF 资金流向监控”、“波动率曲面分析”等新量化模块。

---

## 软件界面截图（中文界面）

### 1. 四大市场量化终端全景看板（以中国 A 股市场 + 中式红涨绿跌配色为例）
> 顶栏内置 `[US 美股 | CN A股 | HK 港股 | ₿ 加密]` 一键市场切换器。下图展示切换至 **CN A股（沪深 300 核心权重）** 后的全景视图：顶部自动联动 A 股五大核心基准（上证综指、深证成指、沪深 300 ETF、创业板 ETF、科创 50 ETF）、人民币（`¥`）计价的全市场宽度与 KPI 指标条，以及四大核心可视化视图。

![MarketPulse 中文主界面截图](docs/assets/screenshot_zh_main.png)

### 2. 区块链加密货币市场与 20 日价格走势详情弹窗（以 `BTC` 比特币为例）
> 切换至 **`₿ 加密`** 市场后，状态栏自动进入 `7×24h 全天候交易 · 实时行情快照` 模式，按六大原生 Web3 赛道（`Layer 1 公链`、`支付与价值存储`、`去中心化金融 (DeFi)`、`预言机与 Web3 基建`、`Layer 2 二层扩容`、`Meme 与社区生态`）构建市值热力图，并支持一键切换到**区块链概念股、矿企与现货 ETF 核心池**（`IBIT`, `FBTC`, `ETHA`, `MSTR`, `COIN`, `MARA`, `RIOT`, `CLSK`）：

![MarketPulse 中文加密货币与详情弹窗](docs/assets/screenshot_zh_detail.png)

---

## 核心功能特性

### 1. 四大市场智能交易日识别与本地 SQLite 缓存引擎 (`core/`)
- **顶栏四大市场一键切换 (`[US 美股 | CN A股 | HK 港股 | ₿ 加密]`)**：
  - **美股 (`US`)**：采用美东时间 `America/New_York`（`09:30–16:00 ET`），联动标普 500、纳指、道指、罗素 2000 与 VIX 指数，以美元（`$`）计价。
  - **中国 A 股 (`CN`)**：采用北京时间 `Asia/Shanghai`（`09:30–11:30, 13:00–15:00 CST`），联动上证综指、深证成指、沪深 300、创业板与科创 50，以人民币（`¥`）计价。
  - **香港港股 (`HK`)**：采用香港时间 `Asia/Hong_Kong`（`09:30–12:00, 13:00–16:00 HKT`），联动恒生指数、国企指数、恒生科技、红筹指数与盈富基金，以港币（`HK$`）计价。
  - **区块链加密货币 (`CRYPTO`)**：采用 `UTC` 7×24 小时全天候交易机制，联动 `BTC`、`ETH`、`SOL`、`BNB`、`XRP` 五大加密基准，针对低于 `$1` 的代币自动启用 4~8 位高精度小数显示。
- **跨时区开休市自动识别与回溯**：每次启动或切换市场时自动检测目标市场当前所处时段（**盘中交易**、**午间休市**、**盘前/盘后**、**周末/节假日休市**或 **7×24h 全天候交易**）。非交易时段自动回溯至该市场最近一个完整交易日收盘数据。
- **毫秒级 SQLite 本地持久化缓存 (`data/market_cache.db`)**：按 `(trading_date, ticker)` 复合主键建立本地缓存。同一交易日内切换四大市场、切换资产池或重启桌面端均直接命中本地 SQLite 缓存（耗时 **`< 2ms`**），彻底规避重复请求限流；同时提供顶栏 **“强制刷新数据”** 按钮支持随时重抓最新快照。
- **内置 14 套跨市场可配置资产池 (`config/universe.json`)**：
  - **美股 (`US`)**：`S&P 500 核心权重 (50)`、`纳指核心 (22)`、`核心科技巨头 (16)`、`美股自定义观察池`。
  - **中国 A 股 (`CN`)**：`沪深 300 核心权重 (全行业 44 龙头)`、`A 股硬科技与新能源核心 (18)`、`A 股自定义观察池`（支持直接输入 6 位代码如 `600519`, `300750` 自动补全 `.SS`/`.SZ`）。
  - **香港港股 (`HK`)**：`恒生核心蓝筹权重 (全行业 34 龙头)`、`恒生科技核心龙头 (16)`、`港股自定义观察池`（支持直接输入 4 位代码如 `0700`, `9988` 自动补全 `.HK`）。
  - **区块链加密货币 (`CRYPTO`)**：`加密货币核心市值 Top 35 (全赛道)`、`智能合约公链、DeFi 与 Web3 基建核心 (22)`、`区块链概念股、矿企与现货 ETF 核心池 (15)`、`加密货币自定义观察池`（支持直接输入 `BTC`, `ETH`, `SOL`, `DOGE`, `SUI`, `UNI` 等简称自动识别）。

### 2. 四大核心可视化视图 (`analyzers/` + `ui/`)

| 编号 | 视图名称 | 对应分析器插件 | 视觉映射与量化逻辑说明 |
| :-: | :--- | :--- | :--- |
| **01** | **大盘市值热力图**<br>*(Market Cap Treemap)* | `MarketCapTreemapAnalyzer` | 按 `GICS 行业 (Sector) -> 个股 (Ticker)` 两级嵌套。矩形面积严格映射个股**总市值（Market Cap）**，颜色深浅连续映射**当日涨跌幅（`-5%` 至 `+5%` 色阶过渡）**，方块内直显 `Ticker + 涨跌幅% + $最新价`，支持按 GICS 行业独立筛选。 |
| **02** | **多空涨跌幅龙虎榜**<br>*(Top Gainers & Losers)* | `TopGainersLosersAnalyzer` | 双向水平条形图同屏对比**当日涨幅前 10** 与**跌幅前 10** 标的（支持“双向对称蝴蝶视图”与“首尾极值排序视图”一键切换）。鼠标悬停展示**日内振幅（Amplitude %）**、**当日成交额（Turnover $）**与**相对量比（RVOL）**。 |
| **03** | **量价异动雷达**<br>*(Volume Anomaly Radar)* | `VolumeAnomalyScatterAnalyzer` | 散点图映射 **X 轴 = 当日涨跌幅 (%)**、**Y 轴 = 相对成交量比率 (`RVOL = 当日成交量 / 20日均量`)**、**气泡大小 = 总市值**。内置黄色虚线标出 `RVOL = 1.5x` 异动阈值线，支持一键过滤**放量突破**与**放量杀跌**标的。 |
| **04** | **日内多空博弈与 52 周水位表**<br>*(Intraday & 52W Water-Level)* | `Intraday52WTableAnalyzer` | 紧凑型高密度交互表格，支持搜索、水位状态筛选及全列点击排序。内嵌可视化的**日内价格位置条（Low–Close–High）**以及**距离 52 周高点回撤幅度进度条（Drawdown from 52W High %）**，自动划分`逼近新高`、`强势区间`、`技术回调`与`深度回撤`。 |

### 3. 国际化双语与双配色金融终端体验
- **中英文实时无缝切换 (`EN / 中文`)**：应用内所有界面标题、状态栏、行业名称、公司简称、图表坐标轴、Tooltip 悬浮提示及弹窗均支持点击顶栏 `EN / 中文` 按钮即时切换。
- **红绿涨跌配色习惯切换**：支持一键切换 **美股配色（绿涨红跌）** 与 **中式配色（红涨绿跌）**，切换后四大图表色阶、涨跌徽章与进度条同步重绘。
- **零外部 CDN 依赖**：本地内置 Apache ECharts 5 渲染引擎（`ui/static/vendor/echarts.min.js`），离线或受限网络下界面依然秒级加载。

---

## 核心量化指标计算公式

针对股票池内任意标的 $i$ 在交易日 $t$ 的行情序列，数据引擎自动计算以下核心指标：

$$\text{当日涨跌幅}_i (\%) = \frac{P_{i,t}^{\text{close}} - P_{i,t-1}^{\text{close}}}{P_{i,t-1}^{\text{close}}} \times 100, \qquad \text{相对量比 RVOL}_i = \frac{V_{i,t}}{\frac{1}{20}\sum_{k=1}^{20} V_{i,t-k}}$$

$$\text{日内价格位置}_i (\%) = \frac{P_{i,t}^{\text{close}} - P_{i,t}^{\text{low}}}{P_{i,t}^{\text{high}} - P_{i,t}^{\text{low}}} \times 100, \qquad \text{52周高点回撤}_i (\%) = \frac{P_{i,t}^{\text{close}} - \max_{\tau \in [t-251, t]} P_{i,\tau}^{\text{high}}}{\max_{\tau \in [t-251, t]} P_{i,\tau}^{\text{high}}} \times 100$$

---

## 系统架构与目录结构

```mermaid
flowchart LR
    subgraph Config ["配置层 (config/)"]
        U["config/universe.json"]
    end

    subgraph Engine ["核心数据与缓存引擎 (core/)"]
        DF["MarketDataFetcher\n(yfinance 批量抓取 + 美东交易日识别)"]
        DB[("SQLite 本地缓存\ndata/market_cache.db")]
        DF <--> DB
    end

    subgraph Plugins ["模块化分析器注册中心 (analyzers/)"]
        REG["AnalyzerRegistry"]
        A0["OverviewSummaryAnalyzer"]
        A1["MarketCapTreemapAnalyzer"]
        A2["TopGainersLosersAnalyzer"]
        A3["VolumeAnomalyScatterAnalyzer"]
        A4["Intraday52WTableAnalyzer"]
        REG --> A0 & A1 & A2 & A3 & A4
    end

    subgraph UI ["桌面封装与可视化前端 (app.py + ui/)"]
        API["FastAPI 本地后台服务"]
        WV["PyWebView 原生桌面窗口\n& 浏览器终端界面 (ECharts 5)"]
        API --> WV
    end

    U --> DF
    DF --> REG
    REG --> API
```

```text
market-pulse/
├── app.py                          # FastAPI 本地后端服务与 PyWebView 跨平台桌面窗口入口
├── requirements.txt                # Python 依赖包清单
├── README.md                       # 英文项目文档 (默认主文档)
├── README_CN.md                    # 简体中文项目文档
├── config/
│   └── universe.json               # GICS 行业分类、美股五大核心指数与四大预设股票池配置
├── core/
│   ├── __init__.py
│   ├── cache.py                    # SQLite 本地持久化缓存引擎 (data/market_cache.db)
│   └── data_fetcher.py             # 美股智能交易日识别与 yfinance 并发行情抓取/指标计算
├── analyzers/
│   ├── __init__.py                 # 自动加载并注册所有分析器插件
│   ├── base.py                     # BaseAnalyzer 抽象基类与 AnalyzerRegistry 插件注册中心
│   ├── overview_summary.py         # 全市场涨跌宽度、市值加权收益与行业板块排序分析器
│   ├── treemap_analyzer.py         # Widget 01: 大盘市值热力图两级嵌套树构建器
│   ├── gainers_losers_analyzer.py  # Widget 02: 多空涨跌幅龙虎榜构建器
│   ├── volume_anomaly_analyzer.py  # Widget 03: 量价异动雷达 (RVOL vs Return) 分析器
│   └── intraday_52w_analyzer.py    # Widget 04: 日内价格位置与 52 周回撤水位表分析器
├── ui/
│   ├── index.html                  # 暗黑金融终端主界面
│   └── static/
│       ├── css/terminal.css        # 响应式网格布局与美股/中式红绿双主题样式变量
│       ├── js/app.js               # 中英双语 i18n 控制器与 ECharts 5 四大图表渲染引擎
│       └── vendor/echarts.min.js   # 本地化 Apache ECharts 5 引擎（零外部 CDN 依赖）
├── docs/
│   └── assets/                     # 项目科技感 Banner 与中英文界面实测截图
└── tests/
    └── verify_data_engine.py       # 数据拉取、SQLite 缓存与分析器自动化验证脚本
```

---

## 快速启动指南

### 1. 安装依赖环境

```bash
# 克隆代码仓库
git clone https://github.com/lpeixin/market-pulse.git
cd market-pulse

# 创建并激活 Python 虚拟环境
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# 安装项目依赖
pip install --upgrade pip
pip install -r requirements.txt
```

### 2. 运行数据引擎与缓存验证脚本

```bash
python tests/verify_data_engine.py
```

### 3. 启动 MarketPulse 桌面端或调试服务

```bash
# 方式 1（默认）：启动 PyWebView 原生跨平台桌面窗口
python app.py

# 方式 2：启动本地服务并自动在系统浏览器中打开调试 (http://127.0.0.1:8765)
python app.py --browser

# 方式 3：仅启动 FastAPI 本地后台服务
python app.py --server-only --port 8765
```

---

## 模块化插件扩展指南 (`analyzers/`)

当需要新增自定义量化分析模块（如“历史最大回撤对比”、“ETF 资金流向”或“波动率状态分析”）时，只需在 `analyzers/` 目录下新建类并添加 `@AnalyzerRegistry.register` 装饰器：

```python
from typing import Any, Dict, List
import pandas as pd
from analyzers.base import AnalyzerRegistry, BaseAnalyzer

@AnalyzerRegistry.register
class VolatilityRegimeAnalyzer(BaseAnalyzer):
    plugin_id = "volatility_regime"
    plugin_name_en = "Intraday Volatility Regime"
    plugin_name_zh = "日内波动率状态分析"
    plugin_description_en = "Analyzes cross-sectional intraday amplitude dispersion"
    plugin_description_zh = "分析截面日内振幅离散度与波动率分位"
    version = "1.0.0"

    def analyze(self, df: pd.DataFrame, records: List[Dict[str, Any]]) -> Dict[str, Any]:
        return {
            "mean_amplitude_pct": round(float(df["intraday_range_pct"].mean()), 2),
            "max_amplitude_ticker": df.loc[df["intraday_range_pct"].idxmax(), "ticker"],
        }
```

在 `analyzers/__init__.py` 中导入该类后，`/api/dashboard` 接口会自动在 `widgets["volatility_regime"]` 字段下返回计算结果。

---

## 开源协议

本项目基于 [MIT License](LICENSE) 开源。
