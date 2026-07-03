
## 2026-07-02 配置面板与 Agnes 诊断
- 已新增运行时配置模块：`server/lib/config.js`，支持 `/api/config` 读取/保存公开配置、`/api/config/diagnose` 诊断 Agnes/MiniMax。
- provider 已改为读取运行时配置：DeepSeek 歌词、MiniMax 音乐、Agnes 封面、番茄发布配置。
- 前端已新增接口配置面板：可填 DeepSeek/MiniMax/Agnes/番茄发布 URL、模型、Key/Token；密码字段留空会保留已有密钥。
- Agnes 默认 URL：`https://apihub.agnes-ai.com/v1`；图像模型改为 `agnes-image-2.1-flash`，用于排查原 503。
- `node --check` 已通过：server/index.js、server/lib/config.js、lyrics/music/cover/publisher providers。
- 待闭环：重启 8787 服务后保存默认非密钥配置，调用诊断接口确认 Agnes/MiniMax 状态。

### 诊断闭环
- 服务已重启并监听：`http://127.0.0.1:8787`。
- `/api/config` 已保存默认非密钥配置：Agnes URL `https://apihub.agnes-ai.com/v1`，Agnes 模型 `agnes-image-2.1-flash`，MiniMax URL `https://api.minimaxi.com/v1`。
- `/api/config/diagnose` 结果：Agnes `/models` 返回 200，Agnes 图片生成返回 200 并给出图片 URL，说明原 503 由旧模型名/配置导致。
- MiniMax 诊断返回 401：当前运行时配置未保存 MiniMax API Key，需要在页面配置面板填写后再诊断。

## 2026-07-02 MiniMax URL 与 UI 调整
- MiniMax API Key 已通过 `/api/config` 保存，页面只显示掩码。
- `server/providers/music.js` 已改为递归提取 MiniMax 返回里的音频 URL，字段包括 `audio_url`、`audioUrl`、`url`、`file_url`、`download_url`、`song_url`、`audio_file_url`、`music_url`、`play_url`。
- 如果 MiniMax 只返回 hex 音频数据，工作流现在会报错提示需要音频 URL，不再把 hex 当成功结果。
- `server/workflow.js` 会保存 `run.audioSourceUrl`；`public/app.js` 会在结果区显示 MiniMax 音频源 URL。
- `public/styles.css` 已重写，调整为更清晰的工作台式布局。

## 2026-07-02 MiniMax hex 自动解码
- 用户确认允许 MiniMax 返回 hex 时自动解码。
- `server/providers/music.js` 现为：优先提取/下载音频 URL；如果没有 URL 但响应是 hex 音频数据，则清洗空白后用 `Buffer.from(hex, 'hex')` 写入 MP3，并返回 `sourceType: 'hex'`。
- 非 URL 且非有效 hex 的响应仍会报错，避免生成不可播放的假 MP3。

## 2026-07-02 MiniMax JSON 内嵌 hex 修复
- 修复 MiniMax 返回 `{ data: { audio: "...hex..." } }` 时仍报“没有音频URL”的问题。
- 新增 `findHexAudio()` 递归查找 JSON 内的 hex 音频字段，支持 `audio`、`hex_audio`、`audio_hex`、`audio_data`、`data`。
- JSON 响应现在优先 URL；无 URL 时自动解码内嵌 hex 并保存 MP3。

## 2026-07-02 自动生成歌名
- 歌名输入框改为可留空，页面提示“留空自动生成”。
- 后端 `title` 校验改为可选，空值会进入工作流。
- 新增 `generateTitle()`：有歌名时清洗使用；无歌名时优先调用 DeepSeek 生成 2-8 字中文歌名，失败或无 Key 时用主题/情绪/风格本地兜底。
- 工作流开始后先补齐 `run.input.title`，再用于歌词、封面、音频、发布包文件名和发布信息。
- 已通过 `node --check`，服务已重启，8787 health 正常，页面确认歌名非必填。

## 2026-07-02 歌词固定兜底修复
- 排查发现当前配置 `deepseekKeyConfigured=false`，歌词生成未调用 DeepSeek，而是进入本地兜底。
- 原本地兜底是一段固定歌词，导致每次第一步歌词看起来一样。
- 已将兜底改为按 `title`、`theme`、`genre`、`mood` 动态生成，避免无 Key 时固定输出。
- 要真正使用模型生成歌词，需要在页面配置区填写并保存 DeepSeek Key，然后运行诊断确认 DeepSeek 可用。
- 已通过 `node --check server/providers/lyrics.js server/workflow.js`，服务已重启，8787 health 正常。
