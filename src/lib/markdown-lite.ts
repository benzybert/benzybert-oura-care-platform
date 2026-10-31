/**
 * Markdown to HTML for the small subset the experiment drafts use: `#`/`##` headings, `- ` lists,
 * pipe tables, paragraphs, `**bold**` and `[text](https://...)` links (http and https only). Everything is HTML-escaped first, so the member's own
 * words cannot inject markup: the output is safe to render in the preview and to put on the
 * clipboard as rich text. Not a general Markdown parser, on purpose.
 */

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * Links are matched after escaping, so neither part can carry markup: quotes are already entities
 * and the address must start with http(s)://.
 */
const LINK_RE = /\[([^\]\n]+)\]\((https?:\/\/[^\s()<>"]+)\)/g;

const inline = (s: string) =>
  escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(LINK_RE, '<a href="$2">$1</a>');

const isTableRow = (line: string) => /^\|.*\|$/.test(line.trim());
const isTableSeparator = (line: string) => /^\|(\s*:?-{3,}:?\s*\|)+$/.test(line.trim());
const cells = (line: string) =>
  line
    .trim()
    .slice(1, -1)
    .split("|")
    .map((c) => c.trim());

export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i += 1;
      continue;
    }

    const heading = /^(#{1,3}) (.+)$/.exec(line);
    if (heading) {
      const level = (heading[1] ?? "#").length;
      out.push(`<h${level}>${inline((heading[2] ?? "").trim())}</h${level}>`);
      i += 1;
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith("- ")) {
        items.push(`<li>${inline((lines[i] ?? "").slice(2).trim())}</li>`);
        i += 1;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (isTableRow(line) && isTableSeparator(lines[i + 1] ?? "")) {
      const head = cells(line).map((c) => `<th>${inline(c)}</th>`).join("");
      i += 2;
      const body: string[] = [];
      while (i < lines.length && isTableRow(lines[i] ?? "")) {
        body.push(`<tr>${cells(lines[i] ?? "").map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`);
        i += 1;
      }
      out.push(`<table><thead><tr>${head}</tr></thead><tbody>${body.join("")}</tbody></table>`);
      continue;
    }

    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i] ?? "";
      if (l.trim() === "" || /^#{1,3} /.test(l) || l.startsWith("- ") || (isTableRow(l) && isTableSeparator(lines[i + 1] ?? ""))) break;
      para.push(inline(l.trim()));
      i += 1;
    }
    out.push(`<p>${para.join("<br>")}</p>`);
  }

  return out.join("\n");
}

/** The same draft as plain text, for the clipboard's text/plain part next to the HTML. */
export function markdownToPlain(md: string): string {
  return md
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => !isTableSeparator(l))
    .map((l) =>
      l
        .replace(/^#{1,3} /, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(LINK_RE, "$1: $2")
        .replace(/^\|(.*)\|$/, (_, inner: string) => inner.split("|").map((c) => c.trim()).join(" · ")),
    )
    .join("\n");
}
