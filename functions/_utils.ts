const encoder = new TextEncoder()
const decoder = new TextDecoder()
const SESSION_COOKIE = 'session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

export const DEFAULT_SESSION_SECRET = 'dev-secret-change-me'

export interface Env {
  DB: D1Database
  SESSION_SECRET?: string
}

export interface SessionUser {
  id: number
  username: string
  email: string
}

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

export function redirect303(url: string, body?: string, extraHeaders?: HeadersInit) {
  const headers = new Headers({ Location: url, 'content-type': 'text/html; charset=utf-8' })
  if (extraHeaders) {
    const extras = new Headers(extraHeaders)
    extras.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') headers.append(key, value)
      else headers.set(key, value)
    })
  }
  return new Response(body ?? '', { status: 303, headers })
}

// Password hashing via PBKDF2 (demo only; Workers limit iterations to <= 100000)
async function pbkdf2(password: string, salt: Uint8Array, iterations = 100000, length = 32): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
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

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach(b => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(value: string): Uint8Array {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4))
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/') + pad
  const binary = atob(normalized)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function importHmacKey(secret: string) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ])
}

export async function createSessionCookie(user: SessionUser, secret: string, secure: boolean): Promise<string> {
  if (!secret) throw new Error('SESSION_SECRET is not configured')
  const payload = { ...user, exp: Date.now() + SESSION_MAX_AGE * 1000 }
  const payloadBytes = encoder.encode(JSON.stringify(payload))
  const payloadB64 = base64UrlEncode(payloadBytes)
  const key = await importHmacKey(secret)
  const sigBytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64)))
  const sigB64 = base64UrlEncode(sigBytes)
  const cookieValue = `${payloadB64}.${sigB64}`
  const attributes = [
    `${SESSION_COOKIE}=${cookieValue}`,
    'Path=/',
    `Max-Age=${SESSION_MAX_AGE}`,
    'HttpOnly',
    'SameSite=Lax',
  ]
  if (secure) attributes.push('Secure')
  return attributes.join('; ')
}

export function clearSessionCookie(secure: boolean) {
  const attributes = [`${SESSION_COOKIE}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax']
  if (secure) attributes.push('Secure')
  return attributes.join('; ')
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {}
  const out: Record<string, string> = {}
  cookieHeader.split(';').forEach(part => {
    const [rawName, ...rest] = part.trim().split('=')
    if (!rawName) return
    out[decodeURIComponent(rawName)] = decodeURIComponent(rest.join('='))
  })
  return out
}

export async function readSession(request: Request, secret?: string): Promise<SessionUser | null> {
  if (!secret) return null
  const cookies = parseCookies(request.headers.get('cookie'))
  const raw = cookies[SESSION_COOKIE]
  if (!raw) return null
  const [payloadB64, sigB64] = raw.split('.')
  if (!payloadB64 || !sigB64) return null
  const key = await importHmacKey(secret)
  const sigBytes = base64UrlDecode(sigB64)
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(payloadB64))
  if (!valid) return null
  const payloadBytes = base64UrlDecode(payloadB64)
  const data = JSON.parse(decoder.decode(payloadBytes)) as SessionUser & { exp?: number }
  if (data.exp && data.exp < Date.now()) return null
  return { id: data.id, username: data.username, email: data.email }
}
