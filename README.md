# Jiohuang Pages Demo (Cloudflare Pages + Functions + D1)

本仓库包含：静态页面（`login.html`/`register.html`/`index.html`）、Pages Functions（`functions/`）和 D1 迁移（`migrations/`）。

## 一键推到 GitHub（从本地）
在 PowerShell 中执行（把仓库地址替换为你刚在 GitHub 创建的空仓库）：

```powershell
cd "M:\site\23461200330-王鑫-第四次作业"
git init
git config user.name "Your Name"
git config user.email "you@example.com"
git add .
git commit -m "init: pages + functions + d1"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

若提示登录：使用 GitHub 个人访问令牌（PAT），或浏览器弹窗完成认证。

## 连接 Cloudflare Pages
1. 在 Cloudflare Dashboard → Pages → Create project → 选择此 GitHub 仓库。
2. Build 设置：
   - Framework: None
   - Build command: 留空
   - Output directory: `/`（根目录）
   - Functions: 保持开启（识别 `functions/`）
3. 创建 D1（Workers & Pages → D1 → Create）。
4. 绑定 D1 到 Pages 项目（Settings → Functions → D1 Bindings）：
   - Binding name: `DB`（必须与代码一致）
   - 选择上一步数据库
5. 执行迁移（任选其一）：
   - 本地 Wrangler：`wrangler d1 migrations apply <数据库名> --remote`
   - 或在 D1 控制台运行 `migrations/0001_init.sql` 的内容。

完整说明见 `DEPLOY_CLOUDFLARE.md`。

