export interface FeedSourceConfig {
  name: string
  url: string
  type: 'rss' | 'rsshub' | 'api'
  category: string
  lang?: string
  weight?: number
  // 可选：RSSHub 路由路径（用于多实例冗余抓取）
  rsshubPath?: string
}

// 资讯源清单（v5 · 2026-07-29 大规模扩展）
// 设计理念：集成全网公开爬虫资源，打破信息茧房
//   1. 利用 Reddit/HN/V2EX 原生 RSS（最稳定）
//   2. 利用 RSSHub 公共实例（19个）覆盖中文平台、社交媒体
//   3. 利用 RSS-Bridge 公共实例（22个）覆盖更多平台
//   4. 覆盖加密货币、财经、科技、综合、AI、Web3 等多赛道
//   5. 多实例冗余：关键源配置多个 RSSHub 实例，提高可用性
//
// 分类：
//   加密 —— 加密货币/DeFi/Web3/链上数据
//   财经 —— 美股/A股/期权/宏观经济
//   科技 —— 技术热点/AI/创业/编程
//   综合 —— 全球热点/小众发现/未来趋势

// RSSHub 公共实例池（用于轮询和冗余）
export const RSSHUB_INSTANCES = [
  'https://rsshub.app',                    // 官方
  'https://rsshub.rssforever.com',         // 阿联酋 稳定
  'https://hub.slarker.me',                // 美国 稳定
  'https://rsshub.rss.tips',               // 美国 稳定
  'https://rsshub.pseudoyu.com',           // 法国
  'https://rss.wudifeixue.com',            // 加拿大
  'https://rsshub.henry.wang',             // 英国
  'https://rsshub.umzzz.com',              // 香港
  'https://rss.datuan.dev',                // 越南
  'https://rsshub.cups.moe',               // 美国
]

export const PRESET_FEED_SOURCES: FeedSourceConfig[] = [
  // ========== 加密货币（40个）==========
  // Reddit 加密社区（一手散户情绪+早期项目讨论）
  { name: 'r/CryptoCurrency', url: 'https://www.reddit.com/r/CryptoCurrency/.rss?limit=50', type: 'rss', category: '加密', weight: 5, lang: 'en' },
  { name: 'r/Bitcoin', url: 'https://www.reddit.com/r/Bitcoin/.rss?limit=50', type: 'rss', category: '加密', weight: 4, lang: 'en' },
  { name: 'r/ethereum', url: 'https://www.reddit.com/r/ethereum/.rss?limit=50', type: 'rss', category: '加密', weight: 4, lang: 'en' },
  { name: 'r/solana', url: 'https://www.reddit.com/r/solana/.rss?limit=50', type: 'rss', category: '加密', weight: 4, lang: 'en' },
  { name: 'r/ethtrader', url: 'https://www.reddit.com/r/ethtrader/.rss?limit=50', type: 'rss', category: '加密', weight: 4, lang: 'en' },
  { name: 'r/defi', url: 'https://www.reddit.com/r/defi/.rss?limit=50', type: 'rss', category: '加密', weight: 4, lang: 'en' },
  { name: 'r/altcoin', url: 'https://www.reddit.com/r/altcoin/.rss?limit=50', type: 'rss', category: '加密', weight: 3, lang: 'en' },
  { name: 'r/CryptoCurrencyMoons', url: 'https://www.reddit.com/r/CryptoCurrencyMoons/.rss?limit=50', type: 'rss', category: '加密', weight: 3, lang: 'en' },
  { name: 'r/BitcoinMarkets', url: 'https://www.reddit.com/r/BitcoinMarkets/.rss?limit=50', type: 'rss', category: '加密', weight: 4, lang: 'en' },
  { name: 'r/binance', url: 'https://www.reddit.com/r/binance/.rss?limit=50', type: 'rss', category: '加密', weight: 3, lang: 'en' },
  { name: 'r/CryptoMarkets', url: 'https://www.reddit.com/r/CryptoMarkets/.rss?limit=50', type: 'rss', category: '加密', weight: 3, lang: 'en' },
  { name: 'r/ethfinance', url: 'https://www.reddit.com/r/ethfinance/.rss?limit=50', type: 'rss', category: '加密', weight: 3, lang: 'en' },
  { name: 'r/cardano', url: 'https://www.reddit.com/r/cardano/.rss?limit=50', type: 'rss', category: '加密', weight: 3, lang: 'en' },
  { name: 'r/polkkadot', url: 'https://www.reddit.com/r/polkkadot/.rss?limit=50', type: 'rss', category: '加密', weight: 3, lang: 'en' },
  { name: 'r/avalanche', url: 'https://www.reddit.com/r/avalanche/.rss?limit=50', type: 'rss', category: '加密', weight: 3, lang: 'en' },
  { name: 'r/CryptoCurrencies', url: 'https://www.reddit.com/r/CryptoCurrencies/.rss?limit=50', type: 'rss', category: '加密', weight: 3, lang: 'en' },
  { name: 'r/altcoin_news', url: 'https://www.reddit.com/r/altcoin_news/.rss?limit=50', type: 'rss', category: '加密', weight: 3, lang: 'en' },
  { name: 'r/cryptomoonshots', url: 'https://www.reddit.com/r/cryptomoonshots/.rss?limit=50', type: 'rss', category: '加密', weight: 2, lang: 'en' },
  { name: 'r/safemoon', url: 'https://www.reddit.com/r/safemoon/.rss?limit=50', type: 'rss', category: '加密', weight: 2, lang: 'en' },
  { name: 'r/pepecoin', url: 'https://www.reddit.com/r/pepecoin/.rss?limit=50', type: 'rss', category: '加密', weight: 2, lang: 'en' },

  // 加密专业媒体（原生 RSS）
  { name: 'The Block', url: 'https://www.theblock.co/rss.xml', type: 'rss', category: '加密', weight: 5, lang: 'en' },
  { name: 'Decrypt', url: 'https://decrypt.co/feed', type: 'rss', category: '加密', weight: 5, lang: 'en' },
  { name: 'CoinTelegraph', url: 'https://cointelegraph.com/rss', type: 'rss', category: '加密', weight: 5, lang: 'en' },
  { name: 'CryptoSlate', url: 'https://cryptoslate.com/feed/', type: 'rss', category: '加密', weight: 4, lang: 'en' },
  { name: 'Bitcoin Magazine', url: 'https://bitcoinmagazine.com/.rss/full/', type: 'rss', category: '加密', weight: 4, lang: 'en' },
  { name: 'NewsBTC', url: 'https://www.newsbtc.com/feed/', type: 'rss', category: '加密', weight: 3, lang: 'en' },
  { name: 'CryptoBriefing', url: 'https://cryptobriefing.com/feed/', type: 'rss', category: '加密', weight: 3, lang: 'en' },
  { name: 'The Defiant', url: 'https://thedefiant.io/api/feed', type: 'rss', category: '加密', weight: 4, lang: 'en' },
  { name: 'Blockworks', url: 'https://blockworks.co/feed', type: 'rss', category: '加密', weight: 4, lang: 'en' },
  { name: 'CoinGape', url: 'https://www.coingape.com/feed/', type: 'rss', category: '加密', weight: 3, lang: 'en' },
  { name: 'CryptoNews', url: 'https://cryptonews.com/news/feed/', type: 'rss', category: '加密', weight: 3, lang: 'en' },
  { name: 'BeInCrypto', url: 'https://beincrypto.com/feed/', type: 'rss', category: '加密', weight: 3, lang: 'en' },
  { name: 'FXStreet Crypto', url: 'https://www.fxstreet.com/rss/cryptocurrencies', type: 'rss', category: '加密', weight: 3, lang: 'en' },

  // RSSHub 加密源（CoinDesk 等无原生 RSS 的源）
  { name: 'CoinDesk', url: 'https://rsshub.app/coindesk', type: 'rsshub', category: '加密', weight: 4, lang: 'en', rsshubPath: '/coindesk' },
  { name: '金色财经', url: 'https://rsshub.app/jinse', type: 'rsshub', category: '加密', weight: 3, rsshubPath: '/jinse' },
  { name: '巴比特', url: 'https://rsshub.app/8btc', type: 'rsshub', category: '加密', weight: 3, rsshubPath: '/8btc' },
  { name: '链闻', url: 'https://rsshub.app/chainnews', type: 'rsshub', category: '加密', weight: 4, rsshubPath: '/chainnews' },
  { name: 'DeFi之道', url: 'https://rsshub.app/defidaonews', type: 'rsshub', category: '加密', weight: 3, rsshubPath: '/defidaonews' },
  { name: 'PANews', url: 'https://rsshub.app/panews', type: 'rsshub', category: '加密', weight: 3, rsshubPath: '/panews' },
  { name: 'Foresight News', url: 'https://rsshub.app/foresightnews', type: 'rsshub', category: '加密', weight: 3, rsshubPath: '/foresightnews' },

  // ========== 财经（35个）==========
  // Reddit 投资社区（散户情绪+期权异动最早期信号）
  { name: 'r/wallstreetbets', url: 'https://www.reddit.com/r/wallstreetbets/.rss?limit=50', type: 'rss', category: '财经', weight: 5, lang: 'en' },
  { name: 'r/stocks', url: 'https://www.reddit.com/r/stocks/.rss?limit=50', type: 'rss', category: '财经', weight: 4, lang: 'en' },
  { name: 'r/investing', url: 'https://www.reddit.com/r/investing/.rss?limit=50', type: 'rss', category: '财经', weight: 4, lang: 'en' },
  { name: 'r/options', url: 'https://www.reddit.com/r/options/.rss?limit=50', type: 'rss', category: '财经', weight: 4, lang: 'en' },
  { name: 'r/StockMarket', url: 'https://www.reddit.com/r/StockMarket/.rss?limit=50', type: 'rss', category: '财经', weight: 3, lang: 'en' },
  { name: 'r/pennystocks', url: 'https://www.reddit.com/r/pennystocks/.rss?limit=50', type: 'rss', category: '财经', weight: 3, lang: 'en' },
  { name: 'r/algotrading', url: 'https://www.reddit.com/r/algotrading/.rss?limit=50', type: 'rss', category: '财经', weight: 4, lang: 'en' },
  { name: 'r/dividends', url: 'https://www.reddit.com/r/dividends/.rss?limit=50', type: 'rss', category: '财经', weight: 3, lang: 'en' },
  { name: 'r/valueinvesting', url: 'https://www.reddit.com/r/valueinvesting/.rss?limit=50', type: 'rss', category: '财经', weight: 3, lang: 'en' },
  { name: 'r/FinancialIndependence', url: 'https://www.reddit.com/r/FinancialIndependence/.rss?limit=50', type: 'rss', category: '财经', weight: 3, lang: 'en' },
  { name: 'r/Forex', url: 'https://www.reddit.com/r/Forex/.rss?limit=50', type: 'rss', category: '财经', weight: 3, lang: 'en' },
  { name: 'r/economy', url: 'https://www.reddit.com/r/economy/.rss?limit=50', type: 'rss', category: '财经', weight: 4, lang: 'en' },
  { name: 'r/personalfinance', url: 'https://www.reddit.com/r/personalfinance/.rss?limit=50', type: 'rss', category: '财经', weight: 3, lang: 'en' },
  { name: 'r/RealEstate', url: 'https://www.reddit.com/r/RealEstate/.rss?limit=50', type: 'rss', category: '财经', weight: 3, lang: 'en' },
  { name: 'r/cryptomoonshots', url: 'https://www.reddit.com/r/cryptomoonshots/.rss?limit=50', type: 'rss', category: '财经', weight: 2, lang: 'en' },

  // 英文财经媒体
  { name: 'Bloomberg Markets', url: 'https://feeds.bloomberg.com/markets/news.rss', type: 'rss', category: '财经', weight: 5, lang: 'en' },
  { name: 'CNBC Top News', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114', type: 'rss', category: '财经', weight: 5, lang: 'en' },
  { name: 'MarketWatch', url: 'http://feeds.marketwatch.com/marketwatch/topstories/', type: 'rss', category: '财经', weight: 4, lang: 'en' },
  { name: 'Reuters Business', url: 'https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best', type: 'rss', category: '财经', weight: 5, lang: 'en' },
  { name: 'Financial Times', url: 'https://www.ft.com/rss/home', type: 'rss', category: '财经', weight: 5, lang: 'en' },
  { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex', type: 'rss', category: '财经', weight: 4, lang: 'en' },
  { name: 'Seeking Alpha', url: 'https://seekingalpha.com/market_currents.xml', type: 'rss', category: '财经', weight: 4, lang: 'en' },
  { name: 'Investing.com News', url: 'https://www.investing.com/rss/news_1.rss', type: 'rss', category: '财经', weight: 3, lang: 'en' },
  { name: 'The Motley Fool', url: 'https://www.fool.com/feeds/index.aspx?id=85', type: 'rss', category: '财经', weight: 3, lang: 'en' },
  { name: 'Business Insider', url: 'https://www.businessinsider.com/rss', type: 'rss', category: '财经', weight: 4, lang: 'en' },
  { name: 'Forbes Business', url: 'https://www.forbes.com/business/feed/', type: 'rss', category: '财经', weight: 4, lang: 'en' },

  // 中文财经（RSSHub）
  { name: '华尔街见闻-全球', url: 'https://rsshub.app/wallstreetcn/news/global', type: 'rsshub', category: '财经', weight: 4, rsshubPath: '/wallstreetcn/news/global' },
  { name: '华尔街见闻-要闻', url: 'https://rsshub.app/wallstreetcn/news/latest', type: 'rsshub', category: '财经', weight: 4, rsshubPath: '/wallstreetcn/news/latest' },
  { name: 'AI财经社', url: 'https://rsshub.app/aicaijing/latest', type: 'rsshub', category: '财经', weight: 3, rsshubPath: '/aicaijing/latest' },
  { name: '财新网-经济', url: 'https://rsshub.app/caixin/latest', type: 'rsshub', category: '财经', weight: 4, rsshubPath: '/caixin/latest' },
  { name: '36氪-快讯', url: 'https://rsshub.app/36kr/newsflashes', type: 'rsshub', category: '财经', weight: 4, rsshubPath: '/36kr/newsflashes' },
  { name: '虎嗅', url: 'https://rsshub.app/huxiu/article', type: 'rsshub', category: '财经', weight: 3, rsshubPath: '/huxiu/article' },
  { name: '钛媒体', url: 'https://rsshub.app/taimet36kr/newsflashes', type: 'rsshub', category: '财经', weight: 3, rsshubPath: '/tmtpost' },
  { name: '第一财经', url: 'https://rsshub.app/yicai/news', type: 'rsshub', category: '财经', weight: 4, rsshubPath: '/yicai/news' },
  { name: '雪球-热帖', url: 'https://rsshub.app/xueqiu/trending', type: 'rsshub', category: '财经', weight: 3, rsshubPath: '/xueqiu/trending' },

  // ========== 科技（50个）==========
  // Hacker News（科技创业一手，原生 RSS 最稳定）
  { name: 'HN Best', url: 'https://hnrss.org/best', type: 'rss', category: '科技', weight: 5, lang: 'en' },
  { name: 'HN Front Page', url: 'https://hnrss.org/frontpage', type: 'rss', category: '科技', weight: 4, lang: 'en' },
  { name: 'HN Show HN', url: 'https://hnrss.org/show', type: 'rss', category: '科技', weight: 4, lang: 'en' },
  { name: 'HN Ask HN', url: 'https://hnrss.org/ask', type: 'rss', category: '科技', weight: 3, lang: 'en' },
  { name: 'HN Jobs', url: 'https://hnrss.org/jobs', type: 'rss', category: '科技', weight: 3, lang: 'en' },

  // Reddit 技术社区
  { name: 'r/technology', url: 'https://www.reddit.com/r/technology/.rss?limit=50', type: 'rss', category: '科技', weight: 4, lang: 'en' },
  { name: 'r/MachineLearning', url: 'https://www.reddit.com/r/MachineLearning/.rss?limit=50', type: 'rss', category: '科技', weight: 4, lang: 'en' },
  { name: 'r/programming', url: 'https://www.reddit.com/r/programming/.rss?limit=50', type: 'rss', category: '科技', weight: 3, lang: 'en' },
  { name: 'r/artificial', url: 'https://www.reddit.com/r/artificial/.rss?limit=50', type: 'rss', category: '科技', weight: 4, lang: 'en' },
  { name: 'r/OpenAI', url: 'https://www.reddit.com/r/OpenAI/.rss?limit=50', type: 'rss', category: '科技', weight: 4, lang: 'en' },
  { name: 'r/ChatGPT', url: 'https://www.reddit.com/r/ChatGPT/.rss?limit=50', type: 'rss', category: '科技', weight: 4, lang: 'en' },
  { name: 'r/singularity', url: 'https://www.reddit.com/r/singularity/.rss?limit=50', type: 'rss', category: '科技', weight: 4, lang: 'en' },
  { name: 'r/StableDiffusion', url: 'https://www.reddit.com/r/StableDiffusion/.rss?limit=50', type: 'rss', category: '科技', weight: 4, lang: 'en' },
  { name: 'r/LocalLLaMA', url: 'https://www.reddit.com/r/LocalLLaMA/.rss?limit=50', type: 'rss', category: '科技', weight: 5, lang: 'en' },
  { name: 'r/coding', url: 'https://www.reddit.com/r/coding/.rss?limit=50', type: 'rss', category: '科技', weight: 3, lang: 'en' },
  { name: 'r/webdev', url: 'https://www.reddit.com/r/webdev/.rss?limit=50', type: 'rss', category: '科技', weight: 3, lang: 'en' },
  { name: 'r/javascript', url: 'https://www.reddit.com/r/javascript/.rss?limit=50', type: 'rss', category: '科技', weight: 3, lang: 'en' },
  { name: 'r/rust', url: 'https://www.reddit.com/r/rust/.rss?limit=50', type: 'rss', category: '科技', weight: 3, lang: 'en' },
  { name: 'r/golang', url: 'https://www.reddit.com/r/golang/.rss?limit=50', type: 'rss', category: '科技', weight: 3, lang: 'en' },
  { name: 'r/python', url: 'https://www.reddit.com/r/python/.rss?limit=50', type: 'rss', category: '科技', weight: 3, lang: 'en' },
  { name: 'r/SaaS', url: 'https://www.reddit.com/r/SaaS/.rss?limit=50', type: 'rss', category: '科技', weight: 4, lang: 'en' },
  { name: 'r/Entrepreneur', url: 'https://www.reddit.com/r/Entrepreneur/.rss?limit=50', type: 'rss', category: '科技', weight: 3, lang: 'en' },
  { name: 'r/startups', url: 'https://www.reddit.com/r/startups/.rss?limit=50', type: 'rss', category: '科技', weight: 4, lang: 'en' },
  { name: 'r/sidehustle', url: 'https://www.reddit.com/r/sidehustle/.rss?limit=50', type: 'rss', category: '科技', weight: 3, lang: 'en' },

  // V2EX（中文独立开发者/技术社区）
  { name: 'V2EX 最新', url: 'https://www.v2ex.com/index.xml', type: 'rss', category: '科技', weight: 4 },
  { name: 'V2EX 技术', url: 'https://www.v2ex.com/feed/tech.xml', type: 'rss', category: '科技', weight: 4 },
  { name: 'V2EX 创意', url: 'https://www.v2ex.com/feed/creative.xml', type: 'rss', category: '科技', weight: 3 },
  { name: 'V2EX 分享创造', url: 'https://www.v2ex.com/feed/create.xml', type: 'rss', category: '科技', weight: 4 },
  { name: 'V2EX Apple', url: 'https://www.v2ex.com/feed/apple.xml', type: 'rss', category: '科技', weight: 3 },

  // 英文科技媒体
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', type: 'rss', category: '科技', weight: 5, lang: 'en' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', type: 'rss', category: '科技', weight: 4, lang: 'en' },
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', type: 'rss', category: '科技', weight: 4, lang: 'en' },
  { name: 'Wired', url: 'https://www.wired.com/feed/rss', type: 'rss', category: '科技', weight: 4, lang: 'en' },
  { name: 'The Information', url: 'https://www.theinformation.com/feed', type: 'rss', category: '科技', weight: 4, lang: 'en' },
  { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/feed/', type: 'rss', category: '科技', weight: 4, lang: 'en' },
  { name: 'Hacker Noon', url: 'https://hackernoon.com/feed', type: 'rss', category: '科技', weight: 3, lang: 'en' },
  { name: 'VentureBeat', url: 'https://venturebeat.com/feed/', type: 'rss', category: '科技', weight: 4, lang: 'en' },
  { name: 'The Next Web', url: 'https://thenextweb.com/feed', type: 'rss', category: '科技', weight: 3, lang: 'en' },
  { name: 'ReadWrite', url: 'https://readwrite.com/feed/', type: 'rss', category: '科技', weight: 3, lang: 'en' },
  { name: 'Engadget', url: 'https://www.engadget.com/rss.xml', type: 'rss', category: '科技', weight: 3, lang: 'en' },
  { name: 'Gizmodo', url: 'https://gizmodo.com/rss', type: 'rss', category: '科技', weight: 3, lang: 'en' },
  { name: 'Lifehacker', url: 'https://lifehacker.com/rss/index.xml', type: 'rss', category: '科技', weight: 3, lang: 'en' },
  { name: 'Dev.to', url: 'https://dev.to/feed', type: 'rss', category: '科技', weight: 3, lang: 'en' },
  { name: 'FreeCodeCamp', url: 'https://www.freecodecamp.org/news/rss/', type: 'rss', category: '科技', weight: 3, lang: 'en' },

  // 中文科技（RSSHub）
  { name: '36氪', url: 'https://rsshub.app/36kr/newsflashes', type: 'rsshub', category: '科技', weight: 4, rsshubPath: '/36kr/newsflashes' },
  { name: '少数派', url: 'https://rsshub.app/sspai/matrix', type: 'rsshub', category: '科技', weight: 3, rsshubPath: '/sspai/matrix' },
  { name: '极客公园', url: 'https://rsshub.app/geekpark/breakingnews', type: 'rsshub', category: '科技', weight: 3, rsshubPath: '/geekpark/breakingnews' },
  { name: 'IT之家', url: 'https://rsshub.app/ithome/ranking', type: 'rsshub', category: '科技', weight: 3, rsshubPath: '/ithome/ranking' },
  { name: '开源中国', url: 'https://rsshub.app/oschina/news', type: 'rsshub', category: '科技', weight: 3, rsshubPath: '/oschina/news' },
  { name: '掘金', url: 'https://rsshub.app/juejin/category/backend', type: 'rsshub', category: '科技', weight: 3, rsshubPath: '/juejin/category/backend' },
  { name: 'CSDN', url: 'https://rsshub.app/csdn/news', type: 'rsshub', category: '科技', weight: 2, rsshubPath: '/csdn/news' },
  { name: '知乎热榜', url: 'https://rsshub.app/zhihu/hotlist', type: 'rsshub', category: '科技', weight: 4, rsshubPath: '/zhihu/hotlist' },
  { name: '知乎日报', url: 'https://rsshub.app/zhihu/daily', type: 'rsshub', category: '科技', weight: 3, rsshubPath: '/zhihu/daily' },

  // ========== 综合（40个）==========
  // Reddit 综合社区
  { name: 'r/worldnews', url: 'https://www.reddit.com/r/worldnews/.rss?limit=50', type: 'rss', category: '综合', weight: 4, lang: 'en' },
  { name: 'r/news', url: 'https://www.reddit.com/r/news/.rss?limit=50', type: 'rss', category: '综合', weight: 4, lang: 'en' },
  { name: 'r/Futurology', url: 'https://www.reddit.com/r/Futurology/.rss?limit=50', type: 'rss', category: '综合', weight: 3, lang: 'en' },
  { name: 'r/todayilearned', url: 'https://www.reddit.com/r/todayilearned/.rss?limit=50', type: 'rss', category: '综合', weight: 3, lang: 'en' },
  { name: 'r/IAmA', url: 'https://www.reddit.com/r/IAmA/.rss?limit=50', type: 'rss', category: '综合', weight: 3, lang: 'en' },
  { name: 'r/AskReddit', url: 'https://www.reddit.com/r/AskReddit/.rss?limit=50', type: 'rss', category: '综合', weight: 2, lang: 'en' },
  { name: 'r/explainlikeimfive', url: 'https://www.reddit.com/r/explainlikeimfive/.rss?limit=50', type: 'rss', category: '综合', weight: 2, lang: 'en' },
  { name: 'r/UpliftingNews', url: 'https://www.reddit.com/r/UpliftingNews/.rss?limit=50', type: 'rss', category: '综合', weight: 3, lang: 'en' },
  { name: 'r/TrueReddit', url: 'https://www.reddit.com/r/TrueReddit/.rss?limit=50', type: 'rss', category: '综合', weight: 3, lang: 'en' },
  { name: 'r/indepthstories', url: 'https://www.reddit.com/r/indepthstories/.rss?limit=50', type: 'rss', category: '综合', weight: 3, lang: 'en' },
  { name: 'r/Documentaries', url: 'https://www.reddit.com/r/Documentaries/.rss?limit=50', type: 'rss', category: '综合', weight: 3, lang: 'en' },
  { name: 'r/Damnthatsinteresting', url: 'https://www.reddit.com/r/Damnthatsinteresting/.rss?limit=50', type: 'rss', category: '综合', weight: 3, lang: 'en' },
  { name: 'r/space', url: 'https://www.reddit.com/r/space/.rss?limit=50', type: 'rss', category: '综合', weight: 4, lang: 'en' },
  { name: 'r/science', url: 'https://www.reddit.com/r/science/.rss?limit=50', type: 'rss', category: '综合', weight: 4, lang: 'en' },
  { name: 'r/psychology', url: 'https://www.reddit.com/r/psychology/.rss?limit=50', type: 'rss', category: '综合', weight: 3, lang: 'en' },
  { name: 'r/philosophy', url: 'https://www.reddit.com/r/philosophy/.rss?limit=50', type: 'rss', category: '综合', weight: 3, lang: 'en' },
  { name: 'r/history', url: 'https://www.reddit.com/r/history/.rss?limit=50', type: 'rss', category: '综合', weight: 3, lang: 'en' },
  { name: 'r/MapPorn', url: 'https://www.reddit.com/r/MapPorn/.rss?limit=50', type: 'rss', category: '综合', weight: 2, lang: 'en' },
  { name: 'r/dataisbeautiful', url: 'https://www.reddit.com/r/dataisbeautiful/.rss?limit=50', type: 'rss', category: '综合', weight: 3, lang: 'en' },

  // 英文综合媒体
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', type: 'rss', category: '综合', weight: 4, lang: 'en' },
  { name: 'BBC Technology', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', type: 'rss', category: '综合', weight: 3, lang: 'en' },
  { name: 'The Guardian World', url: 'https://www.theguardian.com/world/rss', type: 'rss', category: '综合', weight: 4, lang: 'en' },
  { name: 'The Guardian Tech', url: 'https://www.theguardian.com/technology/rss', type: 'rss', category: '综合', weight: 3, lang: 'en' },
  { name: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml', type: 'rss', category: '综合', weight: 4, lang: 'en' },
  { name: 'AP News', url: 'https://feeds.apnews.com/apf-topnews', type: 'rss', category: '综合', weight: 4, lang: 'en' },
  { name: 'Reuters World', url: 'https://www.reutersagency.com/feed/?best-topics=world-news&post_type=best', type: 'rss', category: '综合', weight: 5, lang: 'en' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', type: 'rss', category: '综合', weight: 4, lang: 'en' },
  { name: 'The Economist', url: 'https://www.economist.com/rss/latest.xml', type: 'rss', category: '综合', weight: 5, lang: 'en' },
  { name: 'Time', url: 'https://time.com/feed/', type: 'rss', category: '综合', weight: 3, lang: 'en' },
  { name: 'The Atlantic', url: 'https://www.theatlantic.com/feed/all/', type: 'rss', category: '综合', weight: 4, lang: 'en' },
  { name: 'Foreign Policy', url: 'https://foreignpolicy.com/feed/', type: 'rss', category: '综合', weight: 4, lang: 'en' },
  { name: 'Wired Science', url: 'https://www.wired.com/feed/category/science/latest/rss', type: 'rss', category: '综合', weight: 3, lang: 'en' },
  { name: 'National Geographic', url: 'https://www.nationalgeographic.com/feed/', type: 'rss', category: '综合', weight: 3, lang: 'en' },
  { name: 'Scientific American', url: 'https://www.scientificamerican.com/rss/news/', type: 'rss', category: '综合', weight: 3, lang: 'en' },
  { name: 'New Scientist', url: 'https://www.newscientist.com/feed/home/', type: 'rss', category: '综合', weight: 3, lang: 'en' },
  { name: 'Quanta Magazine', url: 'https://www.quantamagazine.org/feed/', type: 'rss', category: '综合', weight: 4, lang: 'en' },

  // 中文综合（RSSHub）
  { name: '微博热搜', url: 'https://rsshub.app/weibo/search/hot', type: 'rsshub', category: '综合', weight: 4, rsshubPath: '/weibo/search/hot' },
  { name: '澎湃新闻-热点', url: 'https://rsshub.app/thepaper/featured', type: 'rsshub', category: '综合', weight: 4, rsshubPath: '/thepaper/featured' },
  { name: '百度热搜', url: 'https://rsshub.app/baidu/topwords', type: 'rsshub', category: '综合', weight: 3, rsshubPath: '/baidu/topwords' },
  { name: '今日头条-热榜', url: 'https://rsshub.app/toutiao/hot', type: 'rsshub', category: '综合', weight: 3, rsshubPath: '/toutiao/hot' },
  { name: 'B站-热门', url: 'https://rsshub.app/bilibili/ranking/0/3/1', type: 'rsshub', category: '综合', weight: 3, rsshubPath: '/bilibili/ranking/0/3/1' },
  { name: '豆瓣-话题', url: 'https://rsshub.app/douban/explore', type: 'rsshub', category: '综合', weight: 2, rsshubPath: '/douban/explore' },

  // ========== AI 专门（15个）==========
  { name: 'r/OpenAI', url: 'https://www.reddit.com/r/OpenAI/.rss?limit=50', type: 'rss', category: '科技', weight: 4, lang: 'en' },
  { name: 'r/singularity', url: 'https://www.reddit.com/r/singularity/.rss?limit=50', type: 'rss', category: '科技', weight: 4, lang: 'en' },
  { name: 'r/LocalLLaMA', url: 'https://www.reddit.com/r/LocalLLaMA/.rss?limit=50', type: 'rss', category: '科技', weight: 5, lang: 'en' },
  { name: 'r/StableDiffusion', url: 'https://www.reddit.com/r/StableDiffusion/.rss?limit=50', type: 'rss', category: '科技', weight: 4, lang: 'en' },
  { name: 'r/ChatGPT', url: 'https://www.reddit.com/r/ChatGPT/.rss?limit=50', type: 'rss', category: '科技', weight: 4, lang: 'en' },
  { name: 'r/artificial', url: 'https://www.reddit.com/r/artificial/.rss?limit=50', type: 'rss', category: '科技', weight: 4, lang: 'en' },
  { name: 'r/MachineLearning', url: 'https://www.reddit.com/r/MachineLearning/.rss?limit=50', type: 'rss', category: '科技', weight: 4, lang: 'en' },
  { name: 'r/AI', url: 'https://www.reddit.com/r/ai/.rss?limit=50', type: 'rss', category: '科技', weight: 3, lang: 'en' },
  { name: 'r/deeplearning', url: 'https://www.reddit.com/r/deeplearning/.rss?limit=50', type: 'rss', category: '科技', weight: 3, lang: 'en' },
  { name: 'r/learnmachinelearning', url: 'https://www.reddit.com/r/learnmachinelearning/.rss?limit=50', type: 'rss', category: '科技', weight: 2, lang: 'en' },
  { name: 'r/computervision', url: 'https://www.reddit.com/r/computervision/.rss?limit=50', type: 'rss', category: '科技', weight: 3, lang: 'en' },
  { name: 'r/datascience', url: 'https://www.reddit.com/r/datascience/.rss?limit=50', type: 'rss', category: '科技', weight: 3, lang: 'en' },
  { name: 'Hugging Face Daily Papers', url: 'https://huggingface.co/papers', type: 'rss', category: '科技', weight: 5, lang: 'en' },
  { name: 'AI News (RSSHub)', url: 'https://rsshub.app/ainews', type: 'rsshub', category: '科技', weight: 4, rsshubPath: '/ainews' },
  { name: 'OpenReview (RSSHub)', url: 'https://rsshub.app/openreview/group/iclr.cc/2025/Conference', type: 'rsshub', category: '科技', weight: 4, rsshubPath: '/openreview/group/iclr.cc/2025/Conference' },
]

// 关键词黑名单：命中即丢弃，不入库（节省 AI 调用）
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
  // V2EX 水帖
  /求助|怎么办理|推荐一个|有没有|请问|新手小白|刚入门/,
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
  /期权| option|call|put|异动| unusual|大单| block trade/i,
  // 科技/AI
  / AI\b|人工智能|大模型| GPT| Claude| Gemini| LLM|机器学习|深度学习| transformer/i,
  /芯片|半导体|台积电|英伟达| NVIDIA| AMD|苹果| Apple|华为| OpenAI| Anthropic/i,
  // 风险/早期信号
  /漏洞| exploit|黑客| hack|被盗|被黑|安全| audit|审计/i,
  /监管| SEC|批准| reject| ETF|申请|提交/i,
]
