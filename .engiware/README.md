# Engiware Upstream Tracking

`upstream-v2.sha` records the OpenCode V2 commit included in the Engiware branch. The lineage CI
job verifies that this commit is a real ancestor of both Engiware and the live upstream V2 branch.

Update Engiware in a temporary branch:

```sh
git fetch upstream v2
git rebase upstream/v2
printf '%s\n' "$(git rev-parse upstream/v2)" > .engiware/upstream-v2.sha
```

Resolve conflicts without replacing current upstream Session, startup, or build behavior wholesale,
then run the package checks described in `.github/workflows/engiware-ci.yml`.

External Python release inputs are content-locked in
`distribution/engicode/sources.lock.json`. After intentionally changing one of those workspaces,
refresh and review the lock with:

```sh
bun distribution/engicode/source-lock.ts write --workspace-root /path/to/workspace
git diff -- distribution/engicode/sources.lock.json
```
