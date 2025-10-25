import { json } from './_utils'

interface NewsItem {
  title: string
  link: string
  published: string
  source: string
}

const RSS_SOURCES: Array<{ name: string; url: string; limit?: number }> = [
  { name: '巴比特', url: 'https://www.8btc.com/rss' },
  { name: '金色财经', url: 'https://www.jinse.com/rss/news' },
  { name: '链闻 ChainNews', url: 'https://www.chainnews.com/feed' },
]

const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes
const CACHE_KEY_PATH = '/__news-cache/v1'

function sanitizeText(value: string | null | undefined): string {
  if (!value) return ''
  return value.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/\s+/g, ' ').trim()
}

async function fetchRSSFeed(url: string, source: string, limit = 6): Promise<NewsItem[]> {
  const res = await fetch(url, { cf: { cacheTtl: 0, cacheEverything: false } })
  if (!res.ok) throw new Error(`fetch ${source} failed: ${res.status}`)

  const xml = await res.text()
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const items = Array.from(doc.querySelectorAll('item')).slice(0, limit)

  return items
    .map(item => {
      const title = sanitizeText(item.querySelector('title')?.textContent) || '未命名资讯'
      const link =
        sanitizeText(item.querySelector('link')?.textContent) ||
        sanitizeText(item.querySelector('guid')?.textContent) ||
        url
      const publishedRaw =
        sanitizeText(item.querySelector('pubDate')?.textContent) ||
        sanitizeText(item.querySelector('dc\\:date')?.textContent) ||
        ''
      const publishedDate = new Date(publishedRaw || Date.now())
      const published = Number.isNaN(publishedDate.valueOf())
        ? new Date().toISOString()
        : publishedDate.toISOString()

      return { title, link, published, source }
    })
    .filter(entry => entry.title && entry.link)
}

async function gatherNews(): Promise<NewsItem[]> {
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

  return collected
    .sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime())
    .slice(0, 12)
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
    const items = await gatherNews()
    const response = json({ ok: true, items, generatedAt: new Date(now).toISOString() })
    response.headers.set('cache-control', 'no-store')
    response.headers.set('x-news-generated-at', String(now))
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
