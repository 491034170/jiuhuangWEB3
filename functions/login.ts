import { type Env, json, badRequest, parseFormOrJson, redirect303, verifyPassword } from './_utils'

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const data = await parseFormOrJson(request)
  const usernameOrEmail = (data.username || data.email || '').trim().toLowerCase()
  const password = data.password || ''
  if (!usernameOrEmail || !password) return badRequest('缺少用户名/邮箱或密码')

  const row = await env.DB.prepare('SELECT id, username, email, password_hash, password_salt FROM users WHERE lower(username)=? OR lower(email)=?')
    .bind(usernameOrEmail, usernameOrEmail)
    .first<any>()

  if (!row) return badRequest('账号不存在')

  const ok = await verifyPassword(password, row.password_salt, row.password_hash)
  if (!ok) return badRequest('密码错误')

  const accept = request.headers.get('accept') || ''
  if (accept.includes('application/json')) return json({ ok: true, user: { id: row.id, username: row.username, email: row.email } })
  return redirect303('/index.html')
}

