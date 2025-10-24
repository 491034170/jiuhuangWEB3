import { type Env, json, badRequest, parseFormOrJson, redirect303, hashPassword } from './_utils'

// GET /register → 重定向到静态页面
export const onRequestGet: PagesFunction<Env> = async () => redirect303('/register.html')

// POST /register → 写入 D1
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!('DB' in env) || !env.DB) {
      return badRequest('未发现 D1 绑定：请在 Pages 项目 Settings → Functions → D1 Bindings 添加名为 DB 的绑定')
    }

    const data = await parseFormOrJson(request)
    const username = (data.username || '').trim()
    const email = (data.email || '').trim().toLowerCase()
    const password = data.password || ''
    const confirm = data.confirm || ''

    if (!username || username.length < 3) return badRequest('用户名长度至少 3')
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return badRequest('邮箱格式不正确')
    if (!password || password.length < 8) return badRequest('密码至少 8 位')
    if (password !== confirm) return badRequest('两次密码不一致')

    const exists = await env.DB.prepare('SELECT id FROM users WHERE username = ? OR email = ?').bind(username, email).first()
    if (exists) return badRequest('用户名或邮箱已存在')

    const { saltB64, hashB64 } = await hashPassword(password)
    await env.DB.prepare('INSERT INTO users (username, email, password_hash, password_salt) VALUES (?, ?, ?, ?)')
      .bind(username, email, hashB64, saltB64)
      .run()

    const accept = request.headers.get('accept') || ''
    if (accept.includes('application/json')) return json({ ok: true })
    return redirect303('/login.html')
  } catch (err: any) {
    return json({ ok: false, error: String(err?.message || err) }, { status: 500 })
  }
}
