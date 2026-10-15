// Renders a markdown file to a self-contained, readable HTML page and opens it.
// No dependencies — Windows has no default .md viewer and this guide is mostly
// tables, which Notepad destroys.
//
//   node scripts/md-to-html.mjs docs/SETUP.md
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = process.argv[2] || "docs/SETUP.md";
const md = readFileSync(join(root, src), "utf8");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Inline formatting: code first so its contents are not further transformed.
function inline(s) {
  const code = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${code.push(`<code>${esc(c)}</code>`) - 1}\u0000`);
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => code[+i]);
  return s;
}

const out = [];
const lines = md.split("\n");
let i = 0, inCode = false, listType = null;

const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };

while (i < lines.length) {
  const line = lines[i];

  if (/^```/.test(line)) {
    if (!inCode) { closeList(); out.push("<pre><code>"); inCode = true; }
    else { out.push("</code></pre>"); inCode = false; }
    i++; continue;
  }
  if (inCode) { out.push(esc(line)); i++; continue; }

  // table: a header row followed by a |---|---| separator
  if (/^\s*\|/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || "")) {
    closeList();
    const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
    out.push("<table><thead><tr>" + cells(line).map(c => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>");
    i += 2;
    while (i < lines.length && /^\s*\|/.test(lines[i])) {
      out.push("<tr>" + cells(lines[i]).map(c => `<td>${inline(c)}</td>`).join("") + "</tr>");
      i++;
    }
    out.push("</tbody></table>");
    continue;
  }

  let m;
  if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
    closeList(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i++; continue;
  }
  if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { closeList(); out.push("<hr>"); i++; continue; }
  if ((m = line.match(/^>\s?(.*)$/))) {
    closeList();
    const buf = [];
    while (i < lines.length && /^>/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, "")); i++; }
    out.push(`<blockquote>${inline(buf.join(" "))}</blockquote>`);
    continue;
  }
  if ((m = line.match(/^\s*(\d+)\.\s+(.*)$/))) {
    if (listType !== "ol") { closeList(); out.push("<ol>"); listType = "ol"; }
    out.push(`<li>${inline(m[2])}</li>`); i++; continue;
  }
  if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
    if (listType !== "ul") { closeList(); out.push("<ul>"); listType = "ul"; }
    out.push(`<li>${inline(m[1])}</li>`); i++; continue;
  }
  if (!line.trim()) { closeList(); i++; continue; }

  const buf = [line];
  i++;
  while (i < lines.length && lines[i].trim() && !/^(\s*[-*\d>#]|\s*\||```)/.test(lines[i])) { buf.push(lines[i]); i++; }
  closeList();
  out.push(`<p>${inline(buf.join(" "))}</p>`);
}
closeList();

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(basename(src))}</title><style>
:root{--bg:#fbfbf9;--panel:#fff;--ink:#1b1b19;--muted:#63635e;--line:#e4e4de;--accent:#2f5d50;--codebg:#f2f2ee}
@media (prefers-color-scheme:dark){:root{--bg:#15151a;--panel:#1d1d22;--ink:#ededea;--muted:#9d9d97;--line:#32323a;--accent:#7fbda9;--codebg:#24242b}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:860px;margin:0 auto;padding:36px 20px 100px}
h1{font-size:28px;letter-spacing:-.02em;margin:0 0 20px}
h2{font-size:21px;margin:38px 0 12px;padding-top:18px;border-top:1px solid var(--line)}
h3{font-size:17px;margin:26px 0 8px}
p{margin:12px 0}
a{color:var(--accent)}
code{background:var(--codebg);padding:2px 6px;border-radius:5px;font:13.5px/1.5 ui-monospace,Consolas,monospace}
pre{background:var(--codebg);padding:14px 16px;border-radius:9px;overflow-x:auto;border:1px solid var(--line)}
pre code{background:none;padding:0;font-size:13px;white-space:pre}
table{border-collapse:collapse;width:100%;margin:16px 0;font-size:14.5px;display:block;overflow-x:auto}
th,td{border:1px solid var(--line);padding:8px 11px;text-align:left;vertical-align:top}
th{background:var(--codebg);font-weight:600}
blockquote{margin:16px 0;padding:12px 16px;border-left:3px solid var(--accent);background:var(--panel);border-radius:0 8px 8px 0;color:var(--muted)}
blockquote code{background:var(--codebg)}
hr{border:0;border-top:1px solid var(--line);margin:28px 0}
ol,ul{padding-left:24px}li{margin:6px 0}
strong{font-weight:650}
</style></head><body><main>
${out.join("\n")}
</main></body></html>`;

const dir = join(root, "docs", "_rendered");
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
const dest = join(dir, basename(src).replace(/\.md$/i, ".html"));
writeFileSync(dest, html, "utf8");
console.log("wrote " + dest);

if (!process.argv.includes("--no-open")) {
  spawn("cmd.exe", ["/c", "start", "", dest], { detached: true, stdio: "ignore" }).unref();
  console.log("opening in your default browser…");
}
