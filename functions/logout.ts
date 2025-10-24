import { type Env, json, clearSessionCookie } from './_utils'

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const secure = new URL(request.url).protocol === 'https:'
  const headers = new Headers()
  headers.append('Set-Cookie', clearSessionCookie(secure))
  return json({ ok: true }, { headers })
}

export const onRequestGet = onRequestPost
