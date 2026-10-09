import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Locale } from "@/domain/i18n/locales";
import { translate } from "@/domain/i18n/messages";

// Same registration as the gantt PDF export — React-PDF's built-in fonts have no CJK glyphs,
// and this app is meant to run self-hosted with no assumed internet access, so the font is
// bundled locally rather than fetched from a CDN at render time.
Font.register({
  family: "Noto Sans JP",
  src: path.join(process.cwd(), "src/app/api/projects/[identifier]/gantt/pdf/fonts/noto-sans-jp-400.woff"),
});

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 8, fontFamily: "Noto Sans JP" },
  title: { fontSize: 12, marginBottom: 12 },
  headerRow: { flexDirection: "row", borderBottom: 1, borderColor: "#999999", paddingBottom: 4, marginBottom: 2, fontWeight: "bold" },
  row: { flexDirection: "row", borderBottom: 0.5, borderColor: "#dddddd", paddingVertical: 3 },
  colId: { width: 60 },
  colTracker: { width: 70 },
  colSubject: { flexGrow: 1 },
  colStatus: { width: 70 },
  colDoneRatio: { width: 40, textAlign: "right" },
  emptyMessage: { marginTop: 8, color: "#666666" },
});

export interface IssuesPdfRow {
  id: string;
  number: number;
  trackerName: string;
  subject: string;
  statusName: string;
  doneRatio: number;
}

export function IssuesPdfDocument({ projectName, rows, locale }: { projectName: string; rows: IssuesPdfRow[]; locale: Locale }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{projectName} — {translate(locale, "export.issueList")}</Text>

        <View style={styles.headerRow}>
          <Text style={styles.colId}>#</Text>
          <Text style={styles.colTracker}>{translate(locale, "issue.attr.trackerId")}</Text>
          <Text style={styles.colSubject}>{translate(locale, "issue.attr.subject")}</Text>
          <Text style={styles.colStatus}>{translate(locale, "issue.attr.statusId")}</Text>
          <Text style={styles.colDoneRatio}>{translate(locale, "issue.attr.doneRatio")}</Text>
        </View>

        {rows.length === 0 ? (
          <Text style={styles.emptyMessage}>{translate(locale, "export.noIssues")}</Text>
        ) : (
          rows.map((row) => (
            <View key={row.id} style={styles.row}>
              <Text style={styles.colId}>{row.number}</Text>
              <Text style={styles.colTracker}>{row.trackerName}</Text>
              <Text style={styles.colSubject}>{row.subject}</Text>
              <Text style={styles.colStatus}>{row.statusName}</Text>
              <Text style={styles.colDoneRatio}>{row.doneRatio}%</Text>
            </View>
          ))
        )}
      </Page>
    </Document>
  );
}
