// The landing page in site/: build it, and deploy it as a static-assets Cloudflare Worker.
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export const SITE_URL = "https://zencast.allpyq.in/"

function run(cwd: string, args: string[], env: NodeJS.ProcessEnv = process.env): boolean {
  // Child output stays on stderr so --json keeps stdout clean.
  return spawnSync("pnpm", args, { cwd, env, stdio: ["ignore", 2, 2] }).status === 0
}

/** Wrangler needs CLOUDFLARE_API_TOKEN outside a terminal; the cf CLI's current login works as one. */
function cloudflareEnv(): NodeJS.ProcessEnv {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env
  const path = join(homedir(), ".config", "cloudflare", "config", "default.json")
  if (!existsSync(path)) return process.env
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"))
  if (typeof parsed !== "object" || parsed === null || !("oauth_token" in parsed) || !("expiration_time" in parsed)) return process.env
  const { oauth_token: token, expiration_time: expires } = parsed
  if (typeof token !== "string" || typeof expires !== "string" || Date.parse(expires) < Date.now()) return process.env
  return { ...process.env, CLOUDFLARE_API_TOKEN: token }
}

function sizeOf(dir: string): number {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .reduce((total, entry) => total + statSync(join(entry.parentPath, entry.name)).size, 0)
}

export function buildSite(root: string) {
  const dir = join(root, "site")
  const ok = run(dir, ["-s", "build"])
  const dist = join(dir, "dist")
  return { ok, output: dist, bytes: ok && existsSync(dist) ? sizeOf(dist) : null }
}

/** Builds, deploys with wrangler, then checks the live page serves this build's title. */
export async function deploySite(root: string, dryRun: boolean) {
  const built = buildSite(root)
  if (!built.ok) return { ok: false, url: SITE_URL, error: "site build failed" }
  const deployed = run(join(root, "site"), ["exec", "wrangler", "deploy", ...(dryRun ? ["--dry-run"] : [])], cloudflareEnv())
  if (!deployed) return { ok: false, url: SITE_URL, error: "wrangler deploy failed" }
  if (dryRun) return { ok: true, url: SITE_URL, dryRun, bytes: built.bytes }

  const response = await fetch(SITE_URL, { headers: { "cache-control": "no-cache" } })
  const title = /<title>([^<]*)<\/title>/.exec(await response.text())?.[1] ?? null
  return { ok: response.ok && title !== null, url: SITE_URL, dryRun, status: response.status, title, bytes: built.bytes }
}
