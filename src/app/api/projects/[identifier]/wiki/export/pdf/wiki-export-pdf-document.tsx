import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

// Same registration as the gantt/issues PDF exports — no CJK glyphs in React-PDF's built-in
// fonts, and this app assumes no internet access at render time.
Font.register({
  family: "Noto Sans JP",
  src: path.join(process.cwd(), "src/app/api/projects/[identifier]/gantt/pdf/fonts/noto-sans-jp-400.woff"),
});

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 9, fontFamily: "Noto Sans JP" },
  title: { fontSize: 14, marginBottom: 12 },
  tocHeading: { fontSize: 10, fontWeight: "bold", marginBottom: 4 },
  tocItem: { marginBottom: 2 },
  pageBlock: { marginTop: 16, borderTop: 1, borderColor: "#999999", paddingTop: 8 },
  pageTitle: { fontSize: 12, marginBottom: 6 },
  pageText: { whiteSpace: "pre-wrap" },
  emptyMessage: { color: "#666666" },
});

export interface WikiExportPage {
  title: string;
  text: string;
}

export function WikiExportPdfDocument({ projectName, pages }: { projectName: string; pages: WikiExportPage[] }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{projectName} — Wiki</Text>

        <Text style={styles.tocHeading}>目次</Text>
        {pages.length === 0 ? (
          <Text style={styles.emptyMessage}>ページはありません。</Text>
        ) : (
          pages.map((page) => (
            <Text key={page.title} style={styles.tocItem}>
              {page.title}
            </Text>
          ))
        )}

        {pages.map((page) => (
          <View key={page.title} style={styles.pageBlock}>
            <Text style={styles.pageTitle}>{page.title}</Text>
            <Text style={styles.pageText}>{page.text}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}
