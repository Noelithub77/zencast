---
name: release
description: Release Zencast to users through the release branch that Sine installs and updates from. Use when cutting a version, publishing a build, or changing the setup scripts, update flow or Sine store listing.
---

# Release

Channels, the update mechanism and Sine's rules live in `docs/distribution.md`; read it before changing how Zencast is installed or updated.

## Cut a release

1. Start from a clean `master` that matches `origin/master` (`git status`, `git fetch`). `pnpm ops release` refuses a dirty tree.
2. Run the checks: `pnpm typecheck`, `pnpm lint`, `pnpm ops e2e`. All green before going on.
3. Pick the bump from the changes since the last `v*` tag: `patch` for fixes, `minor` for features, `major` for breaking config or key changes.
4. Run `pnpm ops release --bump <part> --dry-run`, then `pnpm ops release --bump <part>`, or trigger the Release workflow from the Actions tab with the same bump.
5. Verify the published state, each from GitHub rather than the local tree:
   - `git ls-remote origin release v<version>` shows both refs.
   - `https://raw.githubusercontent.com/Noelithub77/zencast/release/theme.json` has the new `version` and an `updatedAt` from this run.

Installed copies update on their next Zen start; there is no push to users.

## Change the setup scripts

`scripts/install/install.sh` and `install.ps1` are twins: change both, keeping prompts and the `mods.json` entry identical. Test the bash script against a temporary profile only, never the user's real one:

```bash
bash scripts/install/install.sh --profile <temp profile with Sine> --yes
```

Then check `chrome/sine-mods/zencast/theme.json`, the `zencast` entry in `chrome/sine-mods/mods.json` (`homepage` is the release branch, `"no-updates": false`) and `sine.allow-unsafe-js` in `prefs.js`. `pnpm ops e2e` copies Sine into a temporary profile; reuse that with `--keep` when you need a profile with Sine.
