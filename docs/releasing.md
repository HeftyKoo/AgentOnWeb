# Release AgentOnWeb

AgentOnWeb ships two independently installable artifacts at the same product version:

- `agentonweb-extension-<version>.zip` for the Chrome Web Store;
- `@agentonweb/dsh-surface@<version>` for npm, with the matching TGZ attached to the GitHub release.

`release-contract.json` is the compatibility authority. The WXT-generated Chrome manifest, workspace packages, DSH plugin metadata, and connector protocol must agree with it.

## Build and audit

```sh
pnpm release:audit
```

The audit first enforces the package dependency and source-boundary contract, then typechecks, tests, and builds the workspace; creates production artifacts without source maps; repeats both package builds to prove byte-for-byte reproducibility; imports the packed DSH plugin outside the workspace; verifies exact archive contents; and writes `release/SHA256SUMS`.

The DSH package contains prebuilt `lib/` output. Installing it never needs a `prepare` script or pnpm build approval.

## Publish

Create and push a tag matching `v<version>`. The release workflow reruns the complete audit, publishes `@agentonweb/dsh-surface` to npm, and attaches the extension ZIP, plugin TGZ, and checksums to a GitHub release. Configure `NPM_TOKEN` before tagging.

The Chrome Web Store upload remains an explicit store action using the exact audited ZIP. Store review and publication are not inferred from the GitHub release. Firefox signing and Safari containing-app packaging are not part of this Chrome release artifact.

Users install the DSH half with:

```sh
dsh plugin --profile web add @agentonweb/dsh-surface@<version>
```

Restart `dsh web` after installation or upgrade.
