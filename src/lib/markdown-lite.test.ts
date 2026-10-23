import { describe, expect, it } from "vitest";
import { markdownToHtml, markdownToPlain } from "./markdown-lite";

describe("markdownToHtml", () => {
  it("renders the subset the drafts use", () => {
    const md = "# כותרת\n\n**בקצרה:** שורה\nועוד שורה\n\n## חלק\n\n- **א**: אחת\n- שתיים\n\n| מדד | לפני |\n| --- | --- |\n| ציון | 78 |\n";
    expect(markdownToHtml(md)).toBe(
      [
        "<h1>כותרת</h1>",
        "<p><strong>בקצרה:</strong> שורה<br>ועוד שורה</p>",
        "<h2>חלק</h2>",
        "<ul><li><strong>א</strong>: אחת</li><li>שתיים</li></ul>",
        "<table><thead><tr><th>מדד</th><th>לפני</th></tr></thead><tbody><tr><td>ציון</td><td>78</td></tr></tbody></table>",
      ].join("\n"),
    );
  });

  it("escapes the member's text, so it cannot add markup", () => {
    const html = markdownToHtml('<img src=x onerror="alert(1)"> & **<b>**');
    expect(html).toBe("<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; <strong>&lt;b&gt;</strong></p>");
  });

  it("treats a pipe line without a separator as text", () => {
    expect(markdownToHtml("| לא טבלה |")).toBe("<p>| לא טבלה |</p>");
  });
});

describe("markdownToPlain", () => {
  it("drops the marks and flattens tables", () => {
    expect(markdownToPlain("## חלק\n**חזק** רגיל\n| a | b |\n| --- | --- |\n| 1 | 2 |")).toBe("חלק\nחזק רגיל\na · b\n1 · 2");
  });
});
