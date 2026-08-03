import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

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
  trackerName: string;
  subject: string;
  statusName: string;
  doneRatio: number;
}

export function IssuesPdfDocument({ projectName, rows }: { projectName: string; rows: IssuesPdfRow[] }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{projectName} — チケット一覧</Text>

        <View style={styles.headerRow}>
          <Text style={styles.colId}>#</Text>
          <Text style={styles.colTracker}>トラッカー</Text>
          <Text style={styles.colSubject}>件名</Text>
          <Text style={styles.colStatus}>ステータス</Text>
          <Text style={styles.colDoneRatio}>進捗率</Text>
        </View>

        {rows.length === 0 ? (
          <Text style={styles.emptyMessage}>該当するチケットはありません。</Text>
        ) : (
          rows.map((row) => (
            <View key={row.id} style={styles.row}>
              <Text style={styles.colId}>{row.id.slice(0, 8)}</Text>
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
