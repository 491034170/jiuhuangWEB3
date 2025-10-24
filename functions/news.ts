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

const CACHE_TTL = 30 * 60 // 30 minutes

async function fetchRSSFeed(url: string, source: string, limit = 6): Promise<NewsItem[]> {
  const res = await fetch(url, { cf: { cacheTtl: 0, cacheEverything: false } })
  if (!res.ok) throw new Error(`fetch ${source} failed: ${res.status}`)
  const xml = await res.text()
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const items = Array.from(doc.querySelectorAll('item')).slice(0, limit)
  return items.map(item => ({
    title: item.querySelector('title')?.textContent?.trim() || '无标题',
    link: item.querySelector('link')?.textContent?.trim() || url,
    published: new Date(item.querySelector('pubDate')?.textContent || Date.now()).toISOString(),
    source,
  }))
}

async function gatherNews(): Promise<NewsItem[]> {
  const results: NewsItem[] = []
  for (const feed of RSS_SOURCES) {
    try {
      results.push(...(await fetchRSSFeed(feed.url, feed.name, feed.limit ?? 6)))
    } catch (err) {
      console.error('news feed failed', feed.name, err)
    }
  }
  return results
    .filter(item => item && item.title && item.link)
    .sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime())
    .slice(0, 12)
}

export const onRequestGet: PagesFunction = async ({ request }) => {
  const cache = caches.default
  const cacheKey = new Request(`${new URL(request.url).origin}/news-cache`, {
    headers: request.headers,
  })

  let cached = await cache.match(cacheKey)
  if (cached) {
    return cached
  }

  try {
    const items = await gatherNews()
    const response = json({ ok: true, items })
    response.headers.set('Cache-Control', `public, max-age=${CACHE_TTL}`)
    await cache.put(cacheKey, response.clone())
    return response
  } catch (err: any) {
    return json({ ok: false, error: String(err?.message || err) }, { status: 502 })
  }
}
