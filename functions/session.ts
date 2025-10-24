import { type Env, json, readSession, DEFAULT_SESSION_SECRET } from './_utils'

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await readSession(request, env.SESSION_SECRET || DEFAULT_SESSION_SECRET)
  if (!user) return json({ ok: false, user: null }, { status: 401 })
  return json({ ok: true, user })
}
