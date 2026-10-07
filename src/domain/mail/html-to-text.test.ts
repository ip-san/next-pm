import { describe, expect, it } from "bun:test";
import { htmlToText } from "./html-to-text";

describe("htmlToText", () => {
  it("keeps paragraph breaks and turns <br> into a newline", () => {
    expect(htmlToText("<p>first line<br>second line</p><p>next paragraph</p>")).toBe(
      "first line\nsecond line\n\nnext paragraph",
    );
  });

  it("drops script and style content", () => {
    expect(htmlToText("<style>p{color:red}</style><p>visible</p><script>alert(1)</script>")).toBe("visible");
  });

  it("decodes named and numeric entities", () => {
    expect(htmlToText("<p>a &amp; b &lt;c&gt; &#x3042;</p>")).toBe("a & b <c> あ");
  });

  it("keeps list items on separate lines", () => {
    expect(htmlToText("<ul><li>one</li><li>two</li></ul>")).toBe("one\n\ntwo");
  });

  it("returns an empty string for empty html", () => {
    expect(htmlToText("")).toBe("");
  });
});
