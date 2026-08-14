# Drawnix 云端思维导图库

架构：GitHub Pages 托管 Drawnix 前端；Google Apps Script 作为隐藏 iframe 云端桥接；Google Drive 保存目录与每张思维导图 JSON。

## 1. 部署 Apps Script 后台

1. 打开 https://script.google.com/ 新建项目。
2. 用 `apps-script/Code.gs` 替换默认 Code.gs。
3. 新建 HTML 文件 `Bridge`，粘贴 `apps-script/Bridge.html`。
4. 部署 > 新部署 > Web 应用。
5. 执行身份：我；访问权限：仅自己。
6. 授权后复制 `/exec` 地址。

如后续使用自定义域名，请把该域名 origin 加到 Code.gs 的 `ALLOWED_PARENT_ORIGINS`。

## 2. 部署 GitHub Pages

1. 新建 Public 仓库，把本项目所有文件上传到仓库根目录。
2. Settings > Pages > Source 选择 `GitHub Actions`。
3. push 到 main 后，Actions 会安装 Drawnix 依赖并自动发布。
4. 第一次打开网页会要求粘贴 Apps Script `/exec` 地址。

## 3. 云端数据

Apps Script 会在 Google Drive 创建 `MindMap Cloud Data` 文件夹，其中：

- `drawnix-library.json`：思维导图目录
- `map-<id>.json`：每张 Drawnix 思维导图

如果 Drive 根目录存在旧的 `ecommerce-pyramid-data.json`，首次初始化时会尝试转换为 Drawnix 思维导图；旧文件不会删除。

## 安全说明

Apps Script Bridge 只接受来自 `https://chenjunxiuafei-hue.github.io`（以及本地开发地址）的 postMessage。Web App 建议保持“仅自己”访问。GitHub Pages 页面公开并不等于 Drive 数据公开；Drive 读写仍需要你的 Google Apps Script 登录权限。
