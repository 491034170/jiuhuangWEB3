import { type Env, json, badRequest, parseFormOrJson, redirect303, verifyPassword } from './_utils'

// GET /login → 重定向到静态页面
export const onRequestGet: PagesFunction<Env> = async () => redirect303('/login.html')

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!('DB' in env) || !env.DB) {
      return badRequest('未发现 D1 绑定：请在 Pages 项目 Settings → Functions → D1 Bindings 添加名为 DB 的绑定')
    }

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
  } catch (err: any) {
    return json({ ok: false, error: String(err?.message || err) }, { status: 500 })
  }
}
