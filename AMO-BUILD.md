# Reproduce the Firefox extension

This source archive contains the complete tracked source for AgentOnWeb 0.4.0.
Use Node.js 22.19.0 and pnpm 11.5.0 on Linux or macOS. No API keys, local
terminal service, model credentials or private signing configuration are needed.

```sh
corepack enable
corepack prepare pnpm@11.5.0 --activate
pnpm install --frozen-lockfile
pnpm build:extension:firefox
```

The unsigned Firefox MV2 extension is in `apps/extension/.output/firefox-mv2/`.
`scripts/build-extension.mjs` invokes WXT with
`pnpm --dir apps/extension exec wxt build -b firefox`. Upload the contents of this
directory as the Firefox package; do not use the Chrome MV3 package. AMO supplies
the add-on identity and signature during processing.

For all browser and package checks, run `pnpm release:audit`. The extension
version comes from `release-contract.json`; the lockfile pins build dependencies.
