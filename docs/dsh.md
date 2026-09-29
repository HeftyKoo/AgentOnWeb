# Use DeepSeek Harness with AgentOnWeb

Install AgentOnWeb from the [Chrome Web Store](https://chromewebstore.google.com/detail/agentonweb/lhbmeokjjcmklamnepcechnpcdjgkcoe) or [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/agentonweb/).

With Node.js 22.19+ installed, run:

```sh
npm install -g @deepseek-ai/dsh@latest
dsh plugin --profile web add @agentonweb/dsh-surface@0.2.0
dsh web
```

Configure your model provider in DSH and keep `dsh web` running. Restart it after installing or updating the plugin.

Open AgentOnWeb on a normal website. Expand the dock, click **+**, choose **DeepSeek Harness**, then approve **Allow connection** in the DSH page. Safari may request local workspace and session-storage access.

Use Chill, Focus or Watch to choose how your workspace appears. Switch between DSH and your Codex terminal from the dock; both keep running.

Revoke access in **DSH Settings → AgentOnWeb → Revoke connection**. If no workspace appears, check that DSH is running on the same computer and restart it after adding the plugin. Model credentials and tool approvals are managed in DSH.

[DSH plugin guide](../packages/dsh-surface-plugin/README.md) · [Back to AgentOnWeb](../README.md)

## DSH demo

[![Watch the DSH demo](assets/agentonweb-demo-cover.png)](https://www.youtube.com/watch?v=s083RpD38HU)

[English](https://www.youtube.com/watch?v=s083RpD38HU) · [中文](https://www.youtube.com/watch?v=DV8s9z-w4GE)
