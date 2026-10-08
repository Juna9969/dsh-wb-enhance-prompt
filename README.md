# dsh-wb-enhance-prompt

DeepSeek Harness 原生插件：WB Enhance Prompt 1.5.5-share 的原生移植。在对话输入栏「模型」按钮左侧增加「增强」入口，重写当前草稿（不发送消息、不运行 Agent）；可跟随当前会话模型，也可独立配置 OpenAI 兼容接口（HTTP/HTTPS、Chat Completions / Responses）。

功能细节、隐私边界与本地验证记录见 **[README.zh-CN.md](README.zh-CN.md)**；来源声明见 [NOTICE.md](NOTICE.md)。

> Native DeepSeek Harness plugin port of WB Enhance Prompt 1.5.5-share. Not an official WorkBuddy, Augment, Codex or DeepSeek product.

## 安装

### 方式 A：Harness 插件管理入口（Desktop，推荐）

1. 获取安装包：下载 [Releases](https://github.com/Juna9969/dsh-wb-enhance-prompt/releases) 中的 `dsh-wb-enhance-prompt-2.1.0.tgz`，或按方式 C 从源码打包。
   > `v2.1.0` 起包含「有界近期会话上下文」（`src/history.js`）。更早的 `v2.0.0` 资产（2026-09-28 构建）不含该功能，请优先使用 `v2.1.0`。
2. 在 Harness 的「插件」管理入口选择从本地 `.tgz` 安装，填写该文件的**绝对路径**。
3. 启用 `dsh-wb-enhance-prompt` 组合包，然后刷新**原来的** Harness 页面。

> **不要执行 `dsh plugin --profile desktop ...`**：Desktop profile 由 Electron 应用管理，该命令会被拒绝。

### 方式 B：独立 CLI 管理的 Web profile

```powershell
dsh plugin --profile web add "C:\absolute\path\to\dsh-wb-enhance-prompt-2.1.0.tgz"
```

将 `web` 换成实际的 profile 名称，**不要替换为 `desktop`**。

### 方式 C：从源码获取与安装

```powershell
# 1) 克隆并（可选）构建，得到 lib/client.js
git clone https://github.com/Juna9969/dsh-wb-enhance-prompt.git
cd dsh-wb-enhance-prompt
node scripts/build.mjs       # 改动过客户端源码时执行；克隆自 main 也建议执行一次
npm pack                     # 生成 dsh-wb-enhance-prompt-2.1.0.tgz（也可跳过，直接装源码目录）

# 2) 切到目标 profile 目录再安装
cd "$env:USERPROFILE\.dsh\profiles\<profile>"
pnpm add "C:\absolute\path\to\dsh-wb-enhance-prompt-2.1.0.tgz"
# 或直接指向源码目录：pnpm add "C:\absolute\path\to\dsh-wb-enhance-prompt"
```

并确认该 profile 的 `package.json` 中 `dsh.profile.bundles` 列表包含 `dsh-wb-enhance-prompt`。直接指向源码目录安装时，务必先执行 `node scripts/build.mjs` 生成 `lib/client.js`。

## 依赖安装

- **运行**：支持原生 `dsh.bundle.patch` 与 `dsh.client` 的 Harness（本机在 Harness 0.1.7-rc.2 / Desktop 0.2.0-rc.1 验证）。运行时**无第三方依赖**；`@deepseek-ai/cordis` 是宿主提供的可选 peer，不会从公共源拉取。
- **开发**：Node.js ≥ 24（本机 24.21.0）。仅开发/构建需要，使用者无需安装。

## 构建步骤

发行包已包含 `lib/client.js`，**使用者不需要构建**。改动客户端源码后需要重建：

```powershell
node scripts/build.mjs      # 把 src/ 内联生成 lib/client.js
```

`lib/client.js` 是 `scripts/build.mjs` 的确定性产物，可复现构建。

## 加载与启用

- 安装后刷新 Harness 页面，输入栏模型按钮左侧出现「增强」。
- 写草稿 → 点「增强」；右键「增强」（或点右侧「⌄」）打开设置：增强模式（精炼/深度/创意）、模型来源（跟随当前对话模型 / 独立 OpenAI 兼容接口）、Base URL、模型名、协议、API Key。
- 停用：在「插件」页关闭该组合包（不删除已保存设置）。更换同名 Host 模块后，建议等现有任务结束再重启 Harness，避免继续使用进程缓存中的旧代码。

## 自检

```powershell
node --check src/host.js
node --test test/*.test.mjs
```

## 许可

MIT（见 [LICENSE](LICENSE)）。图标来源 Lucide（ISC），详见 [NOTICE.md](NOTICE.md)。
