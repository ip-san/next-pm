import path from "node:path";
import { Font } from "@react-pdf/renderer";

/** The family the PDF exports use. React-PDF's built-in fonts have no CJK glyphs. */
export const PDF_FONT_FAMILY = "Noto Sans JP";

/**
 * Registered once for every PDF export. Each export used to register the same family itself, which
 * left three sources for one family in React-PDF's font store. The font is bundled locally rather
 * than fetched from a CDN, since the app runs self-hosted with no assumed internet access.
 */
Font.register({
  family: PDF_FONT_FAMILY,
  src: path.join(process.cwd(), "src/app/api/projects/[identifier]/gantt/pdf/fonts/noto-sans-jp-400.woff"),
});
