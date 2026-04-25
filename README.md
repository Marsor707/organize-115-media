# 115 影视整理助手

115 影视整理助手是一个 Chrome 扩展，用于在 115 网盘网页内采集当前目录、生成影视整理计划，并在人工确认后执行移动、重命名和空包裹目录清理。

当前开源版本只保留 Chrome 扩展入口。项目不对外维护旧的本地批处理、脚本生成和交互式命令流程。

## 核心能力

- 在 115 页面右下角注入整理助手面板
- 递归采集当前 115 文件夹的目录和文件信息
- 使用 TMDB 规范化电影、剧集、动漫、纪录片命名
- 可选启用 OpenAI 作为低置信度条目的 LLM fallback
- 生成 move / rename / delete / review 计划并提供预览
- 执行前校验来源目录 cid 和目标目录 cid
- 真实执行中遇到 405、验证码、风控提示会暂停并保留断点

## 技术栈

- Chrome Manifest V3
- 原生 JavaScript ES Modules
- `chrome.storage.local`
- 115 Web 文件接口
- TMDB API
- OpenAI Chat Completions 兼容接口
- Node.js 内置 `node:test`

## 安装方式

1. 打开 `chrome://extensions`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择本项目根目录
5. 打开扩展选项页填写配置
6. 打开 115 网盘页面，确认右下角出现“115 影视整理助手”面板

扩展入口文件在仓库根目录：

- `manifest.json`
- `service-worker.js`
- `options.html`
- `options.js`
- `snippets/organize-115-media-helper.user.js`

## 配置项

设置页会把配置保存到 `chrome.storage.local`，不会写入仓库文件。

必须配置：

- `TMDB_API_KEY`
- `TMDB_API_BASE_URL`

目标目录配置：

- `targetRootCid`
- `targetRootName`

建议在 115 目标目录页面点击“设为目标目录”，由扩展自动保存 cid 和目录名。

可选配置：

- `启用 LLM fallback`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`

启用 LLM fallback 后，扩展会把需要辅助判断的片名、文件名上下文发送给配置的 OpenAI 兼容接口。

## 使用流程

1. 在 115 网盘打开目标目录，点击“设为目标目录”。
2. 打开待整理来源目录，点击“采集当前目录”。
3. 采集完成后点击“生成计划”。
4. 在预览窗口检查移动、重命名、删除和待人工确认条目。
5. 确认来源目录和目标目录无误后，点击“执行计划”。
6. 如遇 405 或风控暂停，等待后点击“恢复”或让扩展自动恢复。

整理结果会落到目标目录下的分类目录：

- `电影`
- `剧集`
- `动漫`
- `纪录片`
- `待人工确认`

## 安全说明

真实执行会调用 115 Web 接口创建目录、移动文件、批量重命名和删除空包裹目录。执行前必须人工确认：

- 来源目录 cid 正确
- 目标目录 cid 正确
- 目标分类目录允许自动创建
- `reviews[]` 中的待确认条目已经看过
- `deletes[]` 只包含预期清理的包裹目录

删除阶段只处理计划中的 `deletes[]`。扩展会在对应包裹目录下的迁移条目完成后再尝试删除。

API Key 只保存在当前浏览器的 `chrome.storage.local`。不要把本地导出的采集 JSON、计划 JSON、日志或截图提交到仓库。

## 本地测试

```bash
node --check service-worker.js
node --check options.js
node --check snippets/organize-115-media-helper.user.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8'))"
npm test
```

## 仓库边界

仓库保留扩展运行所需源码和测试。以下内容不进入公开版本：

- 真实采集数据
- 真实执行计划
- 临时输出目录
- 生成型执行脚本
- 旧本地批处理入口
- 个人配置和环境变量
