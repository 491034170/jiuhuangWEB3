import { json } from './_utils'

interface NewsItem {
  title: string
  link: string
  published: string
  source: string
}

const RSS_SOURCES: Array<{ name: string; url: string; limit?: number }> = [
  { name: 'IT之家', url: 'https://www.ithome.com/rss' },
  { name: '中国新闻网·财经', url: 'https://www.chinanews.com/rss/finance.xml' },
  { name: '虎嗅', url: 'https://www.huxiu.com/rss/0.xml' },
]

const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes
const CACHE_KEY_PATH = '/__news-cache/v1'
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) JiuhuangBot/1.0 Chrome/118 Safari/537.36'

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return HTML_ENTITIES[entity] ?? match
  })
}

function sanitizeText(value: string | null | undefined): string {
  if (!value) return ''
  return decodeHtmlEntities(value.replace(/<!\[CDATA\[|\]\]>/g, '').trim())
}

function extractTagContent(xml: string, tag: string): string {
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const match = xml.match(pattern)
  return match ? sanitizeText(match[1]) : ''
}

function extractFirstMatch(xml: string, expressions: string[]): string {
  for (const expr of expressions) {
    const value = extractTagContent(xml, expr)
    if (value) return value
  }
  return ''
}

function splitItems(xml: string): string[] {
  const matches = xml.match(/<item[\s\S]*?<\/item>/gi)
  return matches ?? []
}

function buildFallbackNews(): NewsItem[] {
  const now = new Date()
  return [
    {
      title: '韭黄溯源系统试点筹备中，征集场景需求',
      link: 'https://jiuhuang.pages.dev/',
      published: now.toISOString(),
      source: '项目动态',
    },
    {
      title: '农业数字化与冷链协同最新进展',
      link: 'https://www.chinanews.com/cj/',
      published: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
      source: '行业观察',
    },
    {
      title: '冷链温控与链上协同实践参考',
      link: 'https://www.infoq.cn/topic/区块链',
      published: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
      source: '技术解读',
    },
  ]
}

async function fetchRSSFeed(url: string, source: string, limit = 6): Promise<NewsItem[]> {
  const res = await fetch(url, {
    cf: { cacheTtl: 0, cacheEverything: false },
    headers: {
      'user-agent': USER_AGENT,
      accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
    },
  })
  if (!res.ok) throw new Error(`fetch ${source} failed: ${res.status}`)

  const xml = await res.text()
  const items = splitItems(xml).slice(0, limit)

  return items
    .map(item => {
      const title = extractTagContent(item, 'title') || '未命名资讯'
      const link = extractFirstMatch(item, ['link', 'guid']) || url
      const publishedRaw = extractFirstMatch(item, [
        'pubDate',
        'dc:date',
        'dc:created',
        'updated',
        'lastBuildDate',
      ])
      const publishedDate = new Date(publishedRaw || Date.now())
      const published = Number.isNaN(publishedDate.valueOf())
        ? new Date().toISOString()
        : publishedDate.toISOString()

      return { title, link, published, source }
    })
    .filter(entry => entry.title && entry.link)
}

async function gatherNews(): Promise<{ items: NewsItem[]; usedFallback: boolean }> {
  const collected: NewsItem[] = []
  const seenLinks = new Set<string>()

  for (const feed of RSS_SOURCES) {
    try {
      const items = await fetchRSSFeed(feed.url, feed.name, feed.limit ?? 6)
      for (const item of items) {
        const key = item.link || `${feed.name}:${item.title}`
        if (seenLinks.has(key)) continue
        seenLinks.add(key)
        collected.push(item)
      }
    } catch (err) {
      console.error('news feed failed', feed.name, err)
    }
  }

  const sorted = collected
    .sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime())
    .slice(0, 12)

  if (!sorted.length) {
    return { items: buildFallbackNews(), usedFallback: true }
  }
  return { items: sorted, usedFallback: false }
}

export const onRequestGet: PagesFunction = async ({ request }) => {
  const cache = caches.default
  const cacheKey = new Request(new URL(CACHE_KEY_PATH, request.url).toString(), { method: 'GET' })
  const cached = await cache.match(cacheKey)
  const now = Date.now()
  const fallback = cached ? cached.clone() : null

  if (cached) {
    const generatedAt = Number(cached.headers.get('x-news-generated-at') || '')
    if (!Number.isNaN(generatedAt) && now - generatedAt < CACHE_TTL_MS) {
      return cached
    }
  }

  try {
    const { items, usedFallback } = await gatherNews()
    const response = json({ ok: true, items, generatedAt: new Date(now).toISOString(), fallback: usedFallback })
    response.headers.set('cache-control', 'no-store')
    response.headers.set('x-news-generated-at', String(now))
    if (usedFallback) response.headers.set('x-news-fallback', '1')
    await cache.put(cacheKey, response.clone())
    return response
  } catch (err: any) {
    if (fallback) {
      fallback.headers.set('x-news-stale', '1')
      fallback.headers.set('x-news-error', String(err?.message || err))
      return fallback
    }
    return json({ ok: false, error: '抓取资讯失败', detail: String(err?.message || err) }, { status: 502 })
  }
}
