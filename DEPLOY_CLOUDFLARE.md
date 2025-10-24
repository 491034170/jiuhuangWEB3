Cloudflare Pages + Functions + D1 部署指南

目录结构
- functions/: Pages Functions（仅接管 POST 方法）
- migrations/: D1 数据库迁移（0001_init.sql）
- wrangler.toml: 本地开发与绑定示例（生产以仪表盘绑定为准）
- login.html, register.html, index.html: 静态页面

一、准备
1) 安装 Wrangler（可选：本地测试）
   - npm i -g wrangler
   - 或使用 npx：npx wrangler --version

二、本地开发（可选）
1) 创建 D1 并应用迁移
   - wrangler d1 create pages_app_db
   - wrangler d1 migrations apply pages_app_db --local
2) 运行本地预览（包含 Functions 与 D1）
   - npx wrangler pages dev . --compatibility-date=2024-09-20
   - 打开 http://localhost:8788

三、部署到 Cloudflare Pages
1) 在 Cloudflare Dashboard 创建 Pages 项目，连接此仓库
   - Build command: 空（静态站点，无需构建）
   - Build output directory: 根目录（/）
2) 启用 Functions
   - 项目 Settings -> Functions -> 选择 “Functions: On”（若未默认开启）
3) 创建 D1 数据库（生产）
   - Workers & Pages -> D1 -> Create -> 名称：pages_app_db（或自定义）
4) 绑定 D1 到 Pages 项目
   - Pages 项目 -> Settings -> Functions -> D1 Bindings -> Add binding
   - Binding name 填写：DB（必须与代码一致）
   - 选择刚才创建的数据库
5) 应用迁移到生产数据库
   - 推荐使用 Wrangler：
     - wrangler d1 migrations apply <数据库名称> --remote
     - 其中 <数据库名称> 与仪表盘中的名字一致
   - 或在 D1 控制台手动执行 migrations/0001_init.sql 的 SQL 内容

6)（可选）用 GitHub Actions 自动迁移
   - 在 GitHub 仓库 Settings → Secrets and variables → Actions 新增：
     - CF_ACCOUNT_ID：你的 Cloudflare Account ID
     - CF_API_TOKEN：具有 D1 Edit 权限的 API Token
     - D1_DB_NAME：（可选）数据库名称，未设置则默认使用 `pages_app_db`
   - 工作流文件：`.github/workflows/d1-migrate.yml`
     - 在每次推送到 `main` 或手动触发时，自动执行 `wrangler d1 migrations apply <DB_NAME> --remote`
   - 提示：Actions 与 Pages 部署顺序一般不影响使用；如需严格先迁移后部署，可将 Pages 部署设置为 “仅手动或触发器”，或改为在 Pages 部署完成的 Webhook 上触发迁移。

四、接口说明
- POST /register
  - 入参：username, email, password, confirm（form 或 JSON）
  - 行为：写入 D1（PBKDF2 派生哈希，演示用途），成功后 303 跳转到 /login.html；若 Accept: application/json 则返回 { ok: true }
- POST /login
  - 入参：username（或 email）, password
  - 行为：校验密码，成功返回 { ok: true } 或 303 跳转 /index.html
- POST /verify（演示）
  - 入参：{ address, signature, message }
  - 行为：仅做格式校验并返回 { ok: true, verified: false }；生产需替换为 ECDSA 恢复地址的真正验证

五、前端表单无需修改
- login.html 与 register.html 已指向 /login 与 /register（POST），Pages Functions 将处理；GET 仍走静态文件。

六、合规提示（中国）
- 若面向公众上线并收集邮箱等个人信息，应：
  - 明示用户同意并告知用途与保存期限
  - 最小必要、分级分类、加密存储
  - 提供注销/删除机制
  - 业务化运营需完成域名备案（ICP）等合规事项

故障排查
- 访问 405：通常为以 GET 打到 /register（函数只接管 POST），请访问 /register.html 页面；表单提交才会走 POST。
- 连接被拒：Pages 开发服务未运行或端口不对；本地请用 wrangler pages dev。
- 数据表不存在：确认已对目标 D1 执行 migrations/0001_init.sql（--remote）。
