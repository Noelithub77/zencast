// Publishes dist/zencast to the `release` branch, which Sine installs from and polls for updates.
// Sine re-downloads a URL-installed mod when the branch's theme.json has a newer updatedAt.
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

export const RELEASE_BRANCH = "release"
export const REPO_URL = "https://github.com/Noelithub77/zencast"
const RAW_URL = "https://raw.githubusercontent.com/Noelithub77/zencast/master"
const ORPHAN = "zencast-release-tmp"

export type Bump = "patch" | "minor" | "major"

export function isBump(value: string): value is Bump {
  return value === "patch" || value === "minor" || value === "major"
}

export interface ReleaseResult {
  version: string
  updatedAt: string
  source: string
  commit: string | null
  pushed: boolean
}

function git(cwd: string, args: string[]): string {
  const run = spawnSync("git", args, { cwd, encoding: "utf8" })
  if (run.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${run.stderr.trim()}`)
  return run.stdout.trim()
}

export function bumpVersion(version: string, bump: Bump): string {
  const parts = version.split(".").map(Number)
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) throw new Error(`Not a semver version: ${version}`)
  const [major, minor, patch] = parts
  if (bump === "major") return `${major + 1}.0.0`
  if (bump === "minor") return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

/** Raises the version in mod/theme.json, commits it and tags it on the current branch. */
export async function bumpSource(root: string, bump: Bump, dryRun: boolean): Promise<string> {
  const path = join(root, "mod", "theme.json")
  const theme: unknown = JSON.parse(await readFile(path, "utf8"))
  if (typeof theme !== "object" || theme === null || !("version" in theme) || typeof theme.version !== "string")
    throw new Error("mod/theme.json has no version")
  const version = bumpVersion(theme.version, bump)
  if (dryRun) return version
  if (git(root, ["status", "--porcelain", "--", "mod/theme.json"])) throw new Error("mod/theme.json has uncommitted changes")
  await writeFile(path, `${JSON.stringify({ ...theme, version }, null, 2)}\n`)
  git(root, ["commit", "--quiet", "-m", `Release ${version}`, "--", "mod/theme.json"])
  git(root, ["tag", `v${version}`])
  return version
}

// Relative links resolve against the release branch, which has no docs or source.
function absoluteLinks(readme: string): string {
  return readme.replace(/(\]\(|src=")(?!https?:|#|mailto:)([^)"]+)/g, (_, lead: string, path: string) => {
    const blob = /\.(png|gif|svg|webp|jpg)$/.test(path) ? RAW_URL : `${REPO_URL}/blob/master`
    return `${lead}${blob}/${path.replace(/^\.\//, "")}`
  })
}

/**
 * Replaces the release branch with the built mod, stamped with updatedAt, plus the README as the
 * landing page Sine's homepage button opens. Pushes unless dryRun.
 */
export async function publish(root: string, dist: string, options: { dryRun: boolean; push: boolean }): Promise<ReleaseResult> {
  if (!existsSync(join(dist, "theme.json"))) throw new Error("dist/zencast is missing; run pnpm ops build")
  const source = git(root, ["rev-parse", "--short", "HEAD"])
  const updatedAt = new Date().toISOString()
  const theme: unknown = JSON.parse(await readFile(join(dist, "theme.json"), "utf8"))
  if (typeof theme !== "object" || theme === null || !("version" in theme) || typeof theme.version !== "string")
    throw new Error("dist/zencast/theme.json has no version")
  const version = theme.version

  const work = await mkdtemp(join(tmpdir(), "zencast-release-"))
  try {
    const remote = git(root, ["ls-remote", "--heads", "origin", RELEASE_BRANCH])
    if (remote) {
      git(root, ["fetch", "--quiet", "origin", `${RELEASE_BRANCH}:refs/remotes/origin/${RELEASE_BRANCH}`])
      git(root, ["worktree", "add", "--quiet", "--detach", work, `origin/${RELEASE_BRANCH}`])
    } else {
      git(root, ["worktree", "add", "--quiet", "--detach", work])
      git(work, ["checkout", "--quiet", "--orphan", ORPHAN])
    }
    for (const entry of await readdir(work)) if (entry !== ".git") await rm(join(work, entry), { recursive: true, force: true })
    await cp(dist, work, { recursive: true })
    await writeFile(join(work, "theme.json"), `${JSON.stringify({ ...theme, updatedAt }, null, 2)}\n`)
    await writeFile(join(work, "README.md"), absoluteLinks(await readFile(join(root, "README.md"), "utf8")))

    git(work, ["add", "--all"])
    git(work, ["commit", "--quiet", "-m", `Zencast ${version}\n\nBuilt from ${source}.`])
    const commit = git(work, ["rev-parse", "--short", "HEAD"])
    const pushed = options.push && !options.dryRun
    if (pushed) git(work, ["push", "--quiet", "origin", `HEAD:refs/heads/${RELEASE_BRANCH}`])
    return { version, updatedAt, source, commit, pushed }
  } finally {
    git(root, ["worktree", "remove", "--force", work])
    // The first release commits on a scratch orphan branch; only the pushed ref matters.
    spawnSync("git", ["branch", "-D", ORPHAN], { cwd: root, stdio: "ignore" })
  }
}
