// Turns blog/main.md into blog/dist/medium.html for pasting into Medium.
// Images point at GitHub (push first), so Medium can copy them on paste.
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

const blogDir = join(import.meta.dirname, "..")
const imageBase = process.env.IMAGE_BASE ?? "https://raw.githubusercontent.com/Noelithub77/zencast/master/blog/"

const escapeHtml = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")

function inline(text: string) {
  const codes: string[] = []
  // Code spans are set aside first so their contents never become links or emphasis.
  const out = escapeHtml(text)
    .replace(/`([^`]+)`/g, (_, code: string) => `${codes.push(code) - 1}`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
  return out.replace(/(\d+)/g, (_, i: string) => `<code>${codes[Number(i)]}</code>`)
}

const LISTS = [
  { tag: "ul", item: /^[-*] / },
  { tag: "ol", item: /^\d+\. / },
]

function render(markdown: string) {
  const lines = markdown.split("\n")
  const html: string[] = []
  let paragraph: string[] = []
  const flush = () => {
    if (paragraph.length) html.push(`<p>${inline(paragraph.join(" "))}</p>`)
    paragraph = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ""
    const image = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
    const list = LISTS.find((l) => l.item.test(line))
    if (line.startsWith("```")) {
      flush()
      const code: string[] = []
      while (++i < lines.length && !lines[i]?.startsWith("```")) code.push(lines[i] ?? "")
      html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`)
    } else if (image) {
      flush()
      const [, alt = "", path = ""] = image
      const src = new URL(path, imageBase).href
      const caption = lines[i + 1]?.match(/^\*([^*].*)\*$/)
      if (caption) i++
      html.push(`<figure><img src="${src}" alt="${escapeHtml(alt)}">${caption ? `<figcaption>${inline(caption[1] ?? "")}</figcaption>` : ""}</figure>`)
    } else if (/^#{1,3} /.test(line)) {
      flush()
      const level = line.indexOf(" ")
      html.push(`<h${level}>${inline(line.slice(level + 1))}</h${level}>`)
    } else if (line.startsWith("> ")) {
      flush()
      html.push(`<blockquote>${inline(line.slice(2))}</blockquote>`)
    } else if (list) {
      flush()
      const items: string[] = []
      for (; i < lines.length && list.item.test(lines[i] ?? ""); i++) items.push(`<li>${inline((lines[i] ?? "").replace(list.item, ""))}</li>`)
      i--
      html.push(`<${list.tag}>${items.join("")}</${list.tag}>`)
    } else if (line.trim() === "") {
      flush()
    } else {
      paragraph.push(line.trim())
    }
  }
  flush()
  return html.join("\n")
}

const markdown = await readFile(join(blogDir, "main.md"), "utf8")
const title = markdown.match(/^# (.+)$/m)?.[1] ?? "Zencast"
const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body { max-width: 720px; margin: 48px auto; padding: 0 16px; font: 19px/1.6 Georgia, serif; color: #242424; background: #fff; }
h1, h2 { font-family: system-ui, sans-serif; line-height: 1.2; } img { max-width: 100%; }
figure { margin: 32px 0; } figcaption { text-align: center; color: #6b6b6b; font-size: 15px; }
pre { background: #f2f2f2; padding: 16px; overflow-x: auto; font-size: 15px; } code { font-size: 0.9em; }
blockquote { border-left: 3px solid #242424; margin: 24px 0; padding-left: 20px; font-style: italic; }
</style></head><body>
${render(markdown)}
</body></html>
`
await mkdir(join(blogDir, "dist"), { recursive: true })
const outPath = join(blogDir, "dist", "medium.html")
await writeFile(outPath, page)
console.log(`wrote ${outPath}`)
