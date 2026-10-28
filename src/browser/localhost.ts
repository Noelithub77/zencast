import { describeTab, listTabs } from "./tabs"

// Dev servers on this machine: listening TCP ports from the OS (`ss`, else `lsof`, else `netstat`),
// kept only when they answer HTTP, named by their page title.

const PROBE_MS = 800
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])

interface Listener {
  port: number
  process?: string
  pid?: number
}

export interface LocalServer {
  port: number
  url: string
  title: string
  process?: string
}

// Loopback and wildcard binds; a server bound to another address is not reachable as localhost.
const reachable = (host: string) => /^(127\.|\[?::1\]?$|\[?::\]?$|0\.0\.0\.0$|\*$)/.test(host.replace(/%.*$/, ""))

const portOf = (address: string) => {
  const match = /^(.*):(\d+)$/.exec(address)
  return match && reachable(match[1]) ? Number(match[2]) : null
}

// LISTEN 0 511 127.0.0.1:5173 0.0.0.0:* users:(("node",pid=123,fd=20))
function parseSs(text: string): Listener[] {
  return text.split("\n").flatMap((line) => {
    const [, , , local] = line.trim().split(/\s+/)
    const port = local ? portOf(local) : null
    if (!port) return []
    const owner = /users:\(\("([^"]+)",pid=(\d+)/.exec(line)
    return [{ port, process: owner?.[1], pid: owner ? Number(owner[2]) : undefined }]
  })
}

// node 123 noel 20u IPv4 0x… 0t0 TCP 127.0.0.1:5173 (LISTEN)
function parseLsof(text: string): Listener[] {
  return text.split("\n").flatMap((line) => {
    const fields = line.trim().split(/\s+/)
    const port = fields.at(-1) === "(LISTEN)" ? portOf(fields.at(-2) ?? "") : null
    return port ? [{ port, process: fields[0], pid: Number(fields[1]) }] : []
  })
}

// TCP 127.0.0.1:5173 0.0.0.0:0 LISTENING 1234
function parseNetstat(text: string): Listener[] {
  return text.split("\n").flatMap((line) => {
    const fields = line.trim().split(/\s+/)
    const port = fields[0] === "TCP" && fields[3] === "LISTENING" ? portOf(fields[1] ?? "") : null
    return port ? [{ port, pid: Number(fields[4]) }] : []
  })
}

const TOOLS = [
  { command: "ss", args: ["-Hltnp"], parse: parseSs },
  { command: "lsof", args: ["-nP", "-iTCP", "-sTCP:LISTEN"], parse: parseLsof },
  { command: "netstat", args: ["-ano", "-p", "tcp"], parse: parseNetstat },
]

async function run(command: string, args: string[]): Promise<string | null> {
  const { Subprocess } = ChromeUtils.importESModule("resource://gre/modules/Subprocess.sys.mjs")
  let path: string
  try {
    path = await Subprocess.pathSearch(command)
  } catch {
    return null
  }
  const process = await Subprocess.call({ command: path, arguments: args, stderr: "pipe" })
  let text = ""
  for (let chunk = await process.stdout.readString(); chunk; chunk = await process.stdout.readString()) text += chunk
  await process.wait()
  return text
}

async function listeners(): Promise<Listener[]> {
  for (const tool of TOOLS) {
    const text = await run(tool.command, tool.args)
    if (text !== null) return tool.parse(text)
  }
  return []
}

async function probe(listener: Listener): Promise<LocalServer | null> {
  const url = `http://localhost:${listener.port}/`
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(PROBE_MS), credentials: "omit", cache: "no-store" })
    const html = response.headers.get("content-type")?.includes("html") ? await response.text() : ""
    const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim()
    return { port: listener.port, url, title: title || `localhost:${listener.port}`, process: listener.process }
  } catch {
    return null
  }
}

/** Servers on this machine that answer HTTP, by port; Zen's own listeners are left out. */
export async function localServers(): Promise<LocalServer[]> {
  const seen = new Set<number>()
  const own = Services.appinfo.processID
  const candidates = (await listeners()).filter((l) => l.pid !== own && !seen.has(l.port) && seen.add(l.port))
  const servers = await Promise.all(candidates.map(probe))
  return servers.filter((server) => server !== null).sort((a, b) => a.port - b.port)
}

/** An open tab on that local port, in any space. */
export function localTab(win: Window, port: number): XULTab | undefined {
  return listTabs(win).find((tab) => {
    try {
      const url = new URL(describeTab(tab).url)
      return LOCAL_HOSTS.has(url.hostname) && Number(url.port || 80) === port
    } catch {
      return false
    }
  })
}
