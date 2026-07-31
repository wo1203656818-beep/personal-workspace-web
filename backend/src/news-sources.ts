export interface FeedSourceConfig {
  name: string
  url: string
  type: 'rss' | 'rsshub' | 'api'
  category: string
  lang?: string
  weight?: number
  rsshubPath?: string
}

// 精选资讯源 v6（2026-07-30）
// 策略：只保留能从 Cloudflare Worker 稳定抓取的高质量源
//   - Reddit 走 RSSHub 路由（原生 RSS 被 CF→CF 封杀）
//   - 中文源仅保留少数稳定 RSSHub 路由
//   - 付费墙/死链全部移除
//
// 分类：加密 / 财经 / 科技 / 综合

// RSSHub 公共实例池（多实例容错）
export const RSSHUB_INSTANCES = [
  'https://rsshub.app',
  'https://rsshub.rssforever.com',
  'https://hub.slarker.me',
  'https://rsshub.rss.tips',
  'https://rsshub.pseudoyu.com',
  'https://rss.wudifeixue.com',
  'https://rsshub.henry.wang',
  'https://rsshub.umzzz.com',
  'https://rss.datuan.dev',
  'https://rsshub.cups.moe',
]

export const PRESET_FEED_SOURCES: FeedSourceConfig[] = [
  // ═══════════════════════════════════════
  // 加密货币（8 个）
  // ═══════════════════════════════════════

  // 加密媒体（原生 RSS，稳定）
  {
    name: 'CoinDesk',
    url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    type: 'rss',
    category: '加密',
    weight: 5,
    lang: 'en',
  },
  {
    name: 'CoinTelegraph',
    url: 'https://cointelegraph.com/rss',
    type: 'rss',
    category: '加密',
    weight: 5,
    lang: 'en',
  },
  {
    name: 'The Block',
    url: 'https://www.theblock.co/rss.xml',
    type: 'rss',
    category: '加密',
    weight: 5,
    lang: 'en',
  },
  {
    name: 'Decrypt',
    url: 'https://decrypt.co/feed',
    type: 'rss',
    category: '加密',
    weight: 4,
    lang: 'en',
  },
  {
    name: 'Bitcoin Magazine',
    url: 'https://bitcoinmagazine.com/.rss/full/',
    type: 'rss',
    category: '加密',
    weight: 4,
    lang: 'en',
  },
  {
    name: 'Blockworks',
    url: 'https://blockworks.co/feed',
    type: 'rss',
    category: '加密',
    weight: 4,
    lang: 'en',
  },

  // 加密中文（RSSHub）
  {
    name: '金色财经',
    url: 'https://rsshub.app/jinse',
    type: 'rsshub',
    category: '加密',
    weight: 3,
    rsshubPath: '/jinse',
  },
  {
    name: 'PANews',
    url: 'https://rsshub.app/panews',
    type: 'rsshub',
    category: '加密',
    weight: 3,
    rsshubPath: '/panews',
  },

  // ═══════════════════════════════════════
  // 财经（6 个）
  // ═══════════════════════════════════════

  {
    name: 'CNBC Top News',
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114',
    type: 'rss',
    category: '财经',
    weight: 5,
    lang: 'en',
  },
  {
    name: 'MarketWatch',
    url: 'https://feeds.marketwatch.com/marketwatch/topstories/',
    type: 'rss',
    category: '财经',
    weight: 4,
    lang: 'en',
  },
  {
    name: 'Yahoo Finance',
    url: 'https://finance.yahoo.com/news/rssindex',
    type: 'rss',
    category: '财经',
    weight: 4,
    lang: 'en',
  },
  {
    name: 'Investing.com',
    url: 'https://www.investing.com/rss/news_1.rss',
    type: 'rss',
    category: '财经',
    weight: 3,
    lang: 'en',
  },

  // 财经中文（RSSHub）
  {
    name: '华尔街见闻',
    url: 'https://rsshub.app/wallstreetcn/news/global',
    type: 'rsshub',
    category: '财经',
    weight: 4,
    rsshubPath: '/wallstreetcn/news/global',
  },
  {
    name: '第一财经',
    url: 'https://rsshub.app/yicai/news',
    type: 'rsshub',
    category: '财经',
    weight: 4,
    rsshubPath: '/yicai/news',
  },

  // ═══════════════════════════════════════
  // 科技（12 个）
  // ═══════════════════════════════════════

  // Hacker News（原生 RSS，最稳定）
  {
    name: 'HN Best',
    url: 'https://hnrss.org/best',
    type: 'rss',
    category: '科技',
    weight: 5,
    lang: 'en',
  },
  {
    name: 'HN Front Page',
    url: 'https://hnrss.org/frontpage',
    type: 'rss',
    category: '科技',
    weight: 4,
    lang: 'en',
  },
  {
    name: 'HN Show HN',
    url: 'https://hnrss.org/show',
    type: 'rss',
    category: '科技',
    weight: 4,
    lang: 'en',
  },

  // 英文科技媒体（原生 RSS）
  {
    name: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
    type: 'rss',
    category: '科技',
    weight: 5,
    lang: 'en',
  },
  {
    name: 'The Verge',
    url: 'https://www.theverge.com/rss/index.xml',
    type: 'rss',
    category: '科技',
    weight: 4,
    lang: 'en',
  },
  {
    name: 'Ars Technica',
    url: 'https://feeds.arstechnica.com/arstechnica/index',
    type: 'rss',
    category: '科技',
    weight: 4,
    lang: 'en',
  },
  {
    name: 'MIT Tech Review',
    url: 'https://www.technologyreview.com/feed/',
    type: 'rss',
    category: '科技',
    weight: 4,
    lang: 'en',
  },
  {
    name: 'Hacker Noon',
    url: 'https://hackernoon.com/feed',
    type: 'rss',
    category: '科技',
    weight: 3,
    lang: 'en',
  },
  {
    name: 'Dev.to',
    url: 'https://dev.to/feed',
    type: 'rss',
    category: '科技',
    weight: 3,
    lang: 'en',
  },

  // 中文科技（RSSHub）
  {
    name: '少数派',
    url: 'https://rsshub.app/sspai/matrix',
    type: 'rsshub',
    category: '科技',
    weight: 3,
    rsshubPath: '/sspai/matrix',
  },
  {
    name: '36氪',
    url: 'https://rsshub.app/36kr/newsflashes',
    type: 'rsshub',
    category: '科技',
    weight: 4,
    rsshubPath: '/36kr/newsflashes',
  },
  {
    name: 'V2EX 最新',
    url: 'https://www.v2ex.com/index.xml',
    type: 'rss',
    category: '科技',
    weight: 4,
  },

  // ═══════════════════════════════════════
  // 综合（7 个）
  // ═══════════════════════════════════════

  // 英文综合（原生 RSS）
  {
    name: 'BBC World',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    type: 'rss',
    category: '综合',
    weight: 4,
    lang: 'en',
  },
  {
    name: 'The Guardian World',
    url: 'https://www.theguardian.com/world/rss',
    type: 'rss',
    category: '综合',
    weight: 4,
    lang: 'en',
  },
  {
    name: 'NPR News',
    url: 'https://feeds.npr.org/1001/rss.xml',
    type: 'rss',
    category: '综合',
    weight: 4,
    lang: 'en',
  },
  {
    name: 'AP News',
    url: 'https://feeds.apnews.com/apf-topnews',
    type: 'rss',
    category: '综合',
    weight: 4,
    lang: 'en',
  },
  {
    name: 'Al Jazeera',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    type: 'rss',
    category: '综合',
    weight: 3,
    lang: 'en',
  },

  // 中文综合（RSSHub）
  {
    name: '澎湃新闻',
    url: 'https://rsshub.app/thepaper/featured',
    type: 'rsshub',
    category: '综合',
    weight: 4,
    rsshubPath: '/thepaper/featured',
  },
  {
    name: '少数派热门',
    url: 'https://rsshub.app/sspai/popular',
    type: 'rsshub',
    category: '综合',
    weight: 3,
    rsshubPath: '/sspai/popular',
  },
]

// 关键词黑名单：命中即丢弃，不入库
export const TITLE_BLACKLIST_PATTERNS = [
  // 八卦娱乐
  /明星|出轨|离婚|绯闻|恋情|官宣|代言|粉丝|综艺|选秀|演唱会|专辑| MV\b/i,
  // 标题党
  /震惊|惊呆|不寒而栗|恍然大悟|你知道吗|竟然|居然|万万没想到|收藏！|转发！|必看|速看/,
  /点击查看|更多详情|完整视频|现场图|组图|高清图|福利|领红包|签到|抽奖/,
  // 体育
  /NBA| CBA|中超|英超|西甲|意甲|德甲|欧冠|世界杯|奥运会|世锦赛|决赛|半决赛/i,
  // 低质量
  /运势|星座|塔罗|风水|算命|占卜|解梦|测试你的|你是哪种/,
  // Reddit 规则帖
  /Daily Discussion|Weekly Thread|Megathread|MOD NOTE|Rule Update|AMA Announcement/i,
]

// 关键词白名单：高权重关键词，命中时提升 AI 评分优先级
export const TITLE_HIGHLIGHT_PATTERNS = [
  // 突发/异动
  /突发|紧急|重大|重磅|突破|里程碑|首次|独家| Breaking| Just | Happening Now/i,
  /暴雷|崩盘|暴跌|暴涨|闪崩|异动|黑马|爆发|归零|rug pull/i,
  // 加密货币
  /比特币| BTC|以太坊| ETH| Solana| SOL|USDT|USDC|稳定币| DeFi| NFT|空投| airdrop/i,
  /链上|巨鲸| Whale|合约|期现| funding|持仓| Open Interest|爆仓|清算/i,
  /上线| listed|上线交易所|上线币安|上线 Coinbase| mainnet|主网/i,
  // 财经
  /降息|加息|通胀| CPI| GDP|非农| FOMC|美联储| Powell|鲍威尔/i,
  /财报|盈利| EPS|拆股| stock split|回购| dividend|股息/i,
  // 科技/AI
  / AI\b|人工智能|大模型| GPT| Claude| Gemini| LLM|机器学习|深度学习| transformer/i,
  /芯片|半导体|台积电|英伟达| NVIDIA| AMD|苹果| Apple|华为| OpenAI| Anthropic/i,
  // 风险/早期信号
  /漏洞| exploit|黑客| hack|被盗|被黑|安全| audit|审计/i,
  /监管| SEC|批准| reject| ETF|申请|提交/i,
]
