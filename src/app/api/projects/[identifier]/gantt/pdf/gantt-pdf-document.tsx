import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { GanttMonthTick } from "@/domain/gantt/layout";

const ROW_HEIGHT = 18;
const LABEL_WIDTH = 220;

// Every label on this page is Japanese; React-PDF's built-in fonts (Helvetica etc.) have
// no CJK glyphs and silently render mojibake instead — this registers a Japanese-subset
// font (bundled locally rather than fetched from a CDN at render time, since this app is
// meant to run self-hosted with no assumed internet access) before the document renders.
Font.register({
  family: "Noto Sans JP",
  src: path.join(process.cwd(), "src/app/api/projects/[identifier]/gantt/pdf/fonts/noto-sans-jp-400.woff"),
});

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 8, fontFamily: "Noto Sans JP" },
  title: { fontSize: 12, marginBottom: 4 },
  subtitle: { fontSize: 9, marginBottom: 12, color: "#555555" },
  headerRow: { flexDirection: "row", borderBottom: 1, borderColor: "#999999", height: ROW_HEIGHT, alignItems: "center" },
  labelHeaderCell: { width: LABEL_WIDTH, fontWeight: "bold" },
  timelineHeader: { position: "relative", flexGrow: 1, height: ROW_HEIGHT },
  monthTick: { position: "absolute", top: 0, borderLeft: 1, borderColor: "#cccccc", paddingLeft: 2 },
  row: { flexDirection: "row", borderBottom: 0.5, borderColor: "#dddddd", height: ROW_HEIGHT, alignItems: "center" },
  labelCell: { width: LABEL_WIDTH },
  timeline: { position: "relative", flexGrow: 1, height: ROW_HEIGHT },
  bar: { position: "absolute", top: 3, height: ROW_HEIGHT - 6, backgroundColor: "#93c5fd" },
  barDone: { height: "100%", backgroundColor: "#2563eb" },
  emptyMessage: { marginTop: 8, color: "#666666" },
});

interface GanttPdfRow {
  label: string;
  depth: number;
  leftPercent: number;
  widthPercent: number;
  doneRatio: number;
}

export function GanttPdfDocument({
  projectName,
  windowStart,
  windowEnd,
  monthTicks,
  rows,
}: {
  projectName: string;
  windowStart: string;
  windowEnd: string;
  monthTicks: GanttMonthTick[];
  rows: GanttPdfRow[];
}) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>{projectName} — ガントチャート</Text>
        <Text style={styles.subtitle}>
          {windowStart} 〜 {windowEnd}
        </Text>

        <View style={styles.headerRow}>
          <Text style={styles.labelHeaderCell}>チケット</Text>
          <View style={styles.timelineHeader}>
            {monthTicks.map((tick) => (
              <Text key={tick.label} style={[styles.monthTick, { left: `${tick.leftPercent}%` }]}>
                {tick.label}
              </Text>
            ))}
          </View>
        </View>

        {rows.length === 0 ? (
          <Text style={styles.emptyMessage}>この期間に開始日・期日が設定されたチケットはありません。</Text>
        ) : (
          rows.map((row, index) => (
            <View key={index} style={styles.row}>
              <Text style={[styles.labelCell, { paddingLeft: row.depth * 8 }]}>{row.label}</Text>
              <View style={styles.timeline}>
                <View style={[styles.bar, { left: `${row.leftPercent}%`, width: `${row.widthPercent}%` }]}>
                  <View style={[styles.barDone, { width: `${row.doneRatio}%` }]} />
                </View>
              </View>
            </View>
          ))
        )}
      </Page>
    </Document>
  );
}

export type { GanttPdfRow };
