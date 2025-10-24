export interface Env { DB: D1Database }

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  if (!headers.has('content-type')) headers.set('content-type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(data), { ...init, headers })
}

export function badRequest(message: string) {
  return json({ ok: false, error: message }, { status: 400 })
}

export async function parseFormOrJson(request: Request): Promise<Record<string, string>> {
  const ct = request.headers.get('content-type') || ''
  if (ct.includes('application/json')) {
    const data = await request.json().catch(() => ({}))
    return Object.fromEntries(
      Object.entries(data as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')])
    )
  }
  if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
    const form = await request.formData()
    const out: Record<string, string> = {}
    for (const [k, v] of form.entries()) out[k] = typeof v === 'string' ? v : v.name
    return out
  }
  const text = await request.text()
  const params = new URLSearchParams(text)
  const out: Record<string, string> = {}
  for (const [k, v] of params.entries()) out[k] = v
  return out
}

export async function redirect303(url: string, body?: string) {
  return new Response(body ?? '', {
    status: 303,
    headers: { Location: url, 'content-type': 'text/html; charset=utf-8' },
  })
}

// Password hashing via PBKDF2 (demo only; Workers limit iterations to <= 100000)
async function pbkdf2(password: string, salt: Uint8Array, iterations = 100000, length = 32): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, length * 8)
  return new Uint8Array(bits)
}

export async function hashPassword(password: string): Promise<{ saltB64: string; hashB64: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const derived = await pbkdf2(password, salt)
  const saltB64 = btoa(String.fromCharCode(...salt))
  const hashB64 = btoa(String.fromCharCode(...derived))
  return { saltB64, hashB64 }
}

export async function verifyPassword(password: string, saltB64: string, hashB64: string): Promise<boolean> {
  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0))
  const derived = await pbkdf2(password, salt)
  const calc = btoa(String.fromCharCode(...derived))
  return calc === hashB64
}

