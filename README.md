## 在线网站
- https://jiuhuangweb3.pages.dev/

## 连接 Cloudflare Pages
1. Cloudflare Dashboard → Pages → Create project → 选择 GitHub 仓库
2. Build 设置：
   - Framework: None
   - Build command: 留空
   - Output directory: `/`（根目录）
   - Functions: 保持开启（识别 `functions/`）
3. 创建 D1（Workers & Pages → D1 → Create）
4. 绑定 D1 到 Pages 项目（Settings → Functions → D1 Bindings）：
   - Binding name: `DB`（必须与代码一致）
   - 选择上一步创建的数据库
5. 执行迁移（任选其一）：
   - 本地 Wrangler：`wrangler d1 migrations apply <数据库名或绑定名> --remote`
   - 或在 D1 控制台运行 `migrations/0001_init.sql` 的内容

借助 AI 搭建并学习了项目流程。

