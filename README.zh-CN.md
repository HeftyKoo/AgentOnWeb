# AgentOnWeb

**[English](README.md)** · **[简体中文](README.zh-CN.md)**

**在你正在浏览的网页上使用 Codex。**

一边看视频、查文档，一边让 Codex 写代码。AgentOnWeb 把 Codex 带到浏览器里，展示正在运行的会话，在任务完成或需要审批时提醒你。点击会话，就能回到对应的终端。

## 开始使用

适用于 **macOS + Chrome**。请先安装 [Node.js 22.19+](https://nodejs.org/en/download)，并安装、登录 Codex。

### 1. 安装浏览器扩展

[**从 Chrome 应用商店安装 AgentOnWeb**](https://chromewebstore.google.com/detail/agentonweb/lhbmeokjjcmklamnepcechnpcdjgkcoe)

### 2. 一键配置终端

在 Mac 的“终端”中运行一次：

```sh
curl -fsSL https://raw.githubusercontent.com/HeftyKoo/AgentOnWeb/main/scripts/install.sh | bash
```

安装器会配置本机终端、登录自动启动、Chrome 连接和 Codex 通知，并保留你已有的 Codex 设置。

### 3. 在网页上使用 Codex

打开任意网站，点击 AgentOnWeb，在它的终端中进入项目目录并启动 Codex：

```sh
cd ~/你的项目
codex
```

要接收会话通知，在 Codex 中打开 `/hooks`，审查并信任 **AgentOnWeb session status**，然后新建一个 Codex 会话。已安装的 hooks 只需信任一次。

## 写代码，也不离开当前网页

- **Chill（轻松）：**透过 Codex 工作区看到网页，自由调整透明度。
- **Focus（专注）：**使用不透明的工作区专注写代码。
- **Watch（观看）：**回到网页，Codex 继续运行。

在 Chill 下双击 **Option** 切换到网页交互，再次双击返回。你可以打开多个终端标签处理不同项目；点击会话通知返回对应标签，在 Codex 中完成审批。

| macOS 快捷键 | 操作 |
| --- | --- |
| `Control+0` | 显示或隐藏 AgentOnWeb |
| `Control+1 / 2 / 3` | Chill / Focus / Watch |
| `` Control+` `` | 切换工作区 |

扩展快捷键可在 Chrome 设置中修改。

## 也支持 DeepSeek Harness

习惯使用 DSH？你也可以接入它的会话、模型和工具，通过 dock 在 Codex 与 DSH 之间切换。参见 [DSH 安装指南](docs/dsh.md)。

[![观看 DSH 演示](docs/assets/agentonweb-demo-cover.png)](https://www.youtube.com/watch?v=DV8s9z-w4GE)

**DSH 演示：**[中文](https://www.youtube.com/watch?v=DV8s9z-w4GE) · [English](https://www.youtube.com/watch?v=s083RpD38HU)

## 帮助

[安装与常见问题](docs/one-command-setup.md) · [终端指南](packages/terminal-host/README.md) · [反馈问题](https://github.com/HeftyKoo/AgentOnWeb/issues) · [隐私政策](https://heftykoo.github.io/AgentOnWeb/privacy.html)

[开发文档](docs/development.md) · [更新记录](CHANGELOG.md)
