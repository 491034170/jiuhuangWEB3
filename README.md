## 在线网站
- 项目入口：https://jiuhuangweb3.pages.dev/
- 宣传页：https://jiuhuang.pages.dev/

## 部署流程
1. Cloudflare Dashboard → Pages → Create project，连接此 GitHub 仓库。
2. Build 设置：
   - Framework: None
   - Build command: 留空
   - Output directory: `/`
   - Functions: 保持开启（自动识别 `functions/` 目录）
3. 创建 D1 数据库，并在 Pages → Settings → Functions → D1 Bindings 新增：
   - Binding name: `DB`
   - Database: 选择线上实例 `jiuhuangweb3`
4. 初始化数据库：
   - `wrangler d1 migrations apply DB --remote --env production`
   - 或在 D1 Console 执行 `migrations/0001_init.sql`
5. 设置会话签名密钥：
   - Pages → Settings → Variables → 添加 `SESSION_SECRET`（生产/预览均需配置）
   - 本地调试：`wrangler secret put SESSION_SECRET`

## 功能概览
- **登录/注册**：采 PBKDF2 哈希存储密码，登录成功写入 HTTP-only Cookie。
- **会话接口**：`/session` 返回当前用户信息，首页可根据登录状态调整内容；`/logout` 清除会话。
- **学习任务面板**：登录后展示“三问区块链 + 食品安全”题目，答案自动缓存到浏览器 LocalStorage。
- **区块链新闻**：`/news` 抓取国内主流区块链 RSS（巴比特、金色财经、链闻），缓存 30 分钟后在首页动态展示，符合 Cloudflare 免费额度。
- **宣传链接**：首页醒目位置附上 https://jiuhuang.pages.dev/ ，方便同学了解更多项目背景。


