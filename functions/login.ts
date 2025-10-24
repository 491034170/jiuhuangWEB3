import {
  type Env,
  json,
  badRequest,
  parseFormOrJson,
  redirect303,
  verifyPassword,
  createSessionCookie,
  DEFAULT_SESSION_SECRET,
} from './_utils'

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!('DB' in env) || !env.DB) {
      return badRequest('未发现 D1 绑定：请在 Pages Functions 设置名为 DB 的数据库绑定。')
    }

    const data = await parseFormOrJson(request)
    const usernameOrEmail = (data.username || data.email || '').trim().toLowerCase()
    const password = data.password || ''
    if (!usernameOrEmail || !password) return badRequest('请输入账号和密码。')

    const row = await env.DB
      .prepare('SELECT id, username, email, password_hash, password_salt FROM users WHERE lower(username)=? OR lower(email)=?')
      .bind(usernameOrEmail, usernameOrEmail)
      .first<any>()

    if (!row) return badRequest('账号不存在。')

    const ok = await verifyPassword(password, row.password_salt, row.password_hash)
    if (!ok) return badRequest('密码错误。')

    const secure = new URL(request.url).protocol === 'https:'
    const secret = env.SESSION_SECRET || DEFAULT_SESSION_SECRET
    const cookie = await createSessionCookie(
      { id: row.id, username: row.username, email: row.email },
      secret,
      secure
    )

    const headers = new Headers()
    headers.append('Set-Cookie', cookie)

    const accept = request.headers.get('accept') || ''
    if (accept.includes('application/json')) {
      return json({ ok: true, user: { id: row.id, username: row.username, email: row.email } }, { headers })
    }
    return redirect303('/index.html', undefined, headers)
  } catch (err: any) {
    return json({ ok: false, error: String(err?.message || err) }, { status: 500 })
  }
}
