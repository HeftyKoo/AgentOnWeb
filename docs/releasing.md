# Release AgentOnWeb

AgentOnWeb ships two independently versioned artifacts:

- `agentonweb-extension-<extensionVersion>.zip` for the Chrome Web Store;
- `@agentonweb/dsh-surface@<pluginVersion>` for npm, with the matching TGZ attached to the GitHub release.

The two versions move independently. An extension release does not require (or imply) an npm release, and vice versa. Cross-artifact compatibility is not carried by these versions — it is carried by `connectorProtocol` (the extension/plugin wire protocol) and `dsh` (the DSH harness compatibility) in `release-contract.json`.

`release-contract.json` is the version and compatibility authority:

- `extensionVersion` must match `apps/extension/package.json` and the generated Chrome/Safari manifests;
- `pluginVersion` must match `packages/dsh-surface-plugin/package.json`.

To release one side, bump only that side's version (in the contract and the matching `package.json`); the other side stays put.

## Build and audit

```sh
pnpm release:audit
```

The audit first enforces the package dependency and source-boundary contract, then typechecks, tests, and builds the workspace; creates production artifacts without source maps; repeats both package builds to prove byte-for-byte reproducibility; imports the packed DSH plugin outside the workspace; verifies exact archive contents; and writes `release/SHA256SUMS`.

The DSH package contains prebuilt `lib/` output. Installing it never needs a `prepare` script or pnpm build approval.

## Publish

Each artifact has its own tag prefix, so releases are cut independently:

- Extension release: push a tag matching `ext-v<extensionVersion>`. The workflow attaches the extension ZIP and its checksum to a GitHub release.
- DSH plugin release: push a tag matching `dsh-v<pluginVersion>`. The workflow publishes `@agentonweb/dsh-surface` to npm (configure `NPM_TOKEN` before tagging) and attaches the plugin TGZ and its checksum to a GitHub release.

Both tag kinds rerun the complete audit, so every release proves the whole workspace is reproducible even when only one artifact ships.

The Chrome Web Store upload remains an explicit store action using the exact audited ZIP. Store review and publication are not inferred from the GitHub release. Firefox signing and Safari containing-app packaging are not part of this Chrome release artifact.

Users install the DSH half with:

```sh
dsh plugin --profile web add @agentonweb/dsh-surface@<pluginVersion>
```

Restart `dsh web` after installation or upgrade.
