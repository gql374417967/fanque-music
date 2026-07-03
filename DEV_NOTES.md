# 开发记录

- 项目从 Vite/React 切换为 Express + 原生 H5，原因：npm 安装 Vite/esbuild 时 `@esbuild/win32-x64/esbuild.exe --version` 触发 EBUSY。
- 轻量依赖安装成功：`npm install --no-audit --no-fund` added 149 packages。
- 8 个后端 JS 文件 `node --check` 通过。
- 首次启动失败：`archiver` 在当前 Node v24 ESM 下不提供 default export，需要用 `createRequire` 兼容加载 CommonJS。

- 第二次启动失败：Express 5 / path-to-regexp 不接受 `app.get('*')`，报 `Missing parameter name at index 1: *`；改为末尾 `app.use((req,res,next)=>...)` 兜底。

- 试跑创建任务成功，但轮询 `/api/workflows/:id` 404；后端原本只有 `/api/runs/:id`。已增加 `/api/workflows/:id` 兼容别名。

- `archiver@8` 不再提供函数工厂导出，本地 `require('archiver')` 仅有 `ZipArchive` 等类。已改为 `new ZipArchive({ zlib: { level: 9 } })` 生成 ZIP。
