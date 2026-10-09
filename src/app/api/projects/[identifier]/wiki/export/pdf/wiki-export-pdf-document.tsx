import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Locale } from "@/domain/i18n/locales";
import { translate } from "@/domain/i18n/messages";
import { PDF_FONT_FAMILY } from "@/interface/pdf/japanese-font";

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 9, fontFamily: PDF_FONT_FAMILY },
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

export function WikiExportPdfDocument({ projectName, pages, locale }: { projectName: string; pages: WikiExportPage[]; locale: Locale }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{projectName} — Wiki</Text>

        <Text style={styles.tocHeading}>{translate(locale, "export.toc")}</Text>
        {pages.length === 0 ? (
          <Text style={styles.emptyMessage}>{translate(locale, "export.noPages")}</Text>
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
