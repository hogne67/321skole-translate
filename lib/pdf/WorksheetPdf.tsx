// lib/pdf/WorksheetPdf.tsx
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";

type PdfTaskType = "truefalse" | "mcq" | "open";

type PdfTask = {
  type: PdfTaskType;
  prompt: string;
  options?: string[];
  correctAnswer?: any;
  answerSpace?: "short" | "medium" | "long";
};

export type PdfLesson = {
  title: string;
  level?: string;
  topic?: string;
  language?: string;
  estimatedMinutes?: number;

  // ✅ Nytt
  producerName?: string; // står under tittel
  coverImageUrl?: string; // 3:4 bildeplass
  logoUrl?: string; // 321skole logo
  sourceText?: string; // lesetekst

  // ✅ Print settings
  includeAnswerKey?: boolean; // teacher version

  tasks: PdfTask[];
};

const styles = StyleSheet.create({
  page: { paddingTop: 32, paddingBottom: 32, paddingHorizontal: 36, fontSize: 11 },

  // Header
  headerRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  headerLeft: { flexGrow: 1 },
  title: { fontSize: 18, fontWeight: 800, marginBottom: 4 },
  subline: { fontSize: 10, color: "#444" },
  producer: { fontSize: 10, marginTop: 4 },
  logo: { width: 90, height: 24, objectFit: "contain" },

  // Student info lines
  studentRow: { flexDirection: "row", gap: 14, marginTop: 10 },
  field: { flexDirection: "row", gap: 6, alignItems: "flex-end" },
  fieldLabel: { fontSize: 10, color: "#444" },
  fieldLine: { borderBottomWidth: 1, borderBottomColor: "#111", width: 160, height: 12 },

  // Cover image (3:4)
  coverWrap: { marginTop: 12 },
  cover: {
    width: 180,
    height: 240, // 3:4
    objectFit: "cover",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 4,
  },

  // Text
  textBlock: { marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#ddd" },
  textHeading: { fontSize: 11, fontWeight: 800, marginBottom: 6 },
  paragraph: { fontSize: 11, lineHeight: 1.4 },

  // Tasks
  tasksHeading: { fontSize: 14, fontWeight: 800, marginBottom: 8 },
  task: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#ddd" },
  prompt: { fontSize: 11, marginBottom: 6 },
  optionRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
  checkbox: { width: 10, height: 10, borderWidth: 1, borderColor: "#111", marginRight: 6 },
  tfRow: { flexDirection: "row", gap: 18, marginTop: 6 },
  line: { height: 12, borderBottomWidth: 1, borderBottomColor: "#111", marginTop: 6 },

  // Answer key
  answerKey: { marginTop: 6, fontSize: 10, color: "#333" },
});

function linesFor(space: "short" | "medium" | "long") {
  if (space === "short") return 3;
  if (space === "long") return 12;
  return 7;
}

function normalizeText(s?: string) {
  return (s ?? "").toString();
}

export function WorksheetPdf({ lesson }: { lesson: PdfLesson }) {
  const metaParts = [
    lesson.level ? `Level: ${lesson.level}` : null,
    lesson.topic ? `Topic: ${lesson.topic}` : null,
    lesson.language ? `Language: ${lesson.language}` : null,
    typeof lesson.estimatedMinutes === "number" ? `Time: ${lesson.estimatedMinutes} min` : null,
  ].filter(Boolean);

  const tasks = (lesson.tasks || [])
    .filter((t) => (t.prompt ?? "").trim().length > 0); // ✅ skjul tomme

  const showText = (lesson.sourceText ?? "").trim().length > 0;

  return (
    <Document>
      {/* ✅ Side 1: header + producer + logo + studentlines + bilde + tekst */}
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>{lesson.title || "Worksheet"}</Text>
            {metaParts.length > 0 && <Text style={styles.subline}>{metaParts.join(" • ")}</Text>}
            {lesson.producerName?.trim() ? (
              <Text style={styles.producer}>Producer: {lesson.producerName}</Text>
            ) : null}

            <View style={styles.studentRow}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Name</Text>
                <View style={styles.fieldLine} />
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Date</Text>
                <View style={styles.fieldLine} />
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Class</Text>
                <View style={[styles.fieldLine, { width: 120 }]} />
              </View>
            </View>
          </View>

          {lesson.logoUrl?.trim() ? (
            <Image style={styles.logo} src={lesson.logoUrl} />
          ) : null}
        </View>

        {lesson.coverImageUrl?.trim() ? (
          <View style={styles.coverWrap}>
            <Image style={styles.cover} src={lesson.coverImageUrl} />
          </View>
        ) : null}

        {showText ? (
          <View style={styles.textBlock}>
            <Text style={styles.textHeading}>Text</Text>
            <Text style={styles.paragraph}>{normalizeText(lesson.sourceText)}</Text>
          </View>
        ) : (
          <View style={styles.textBlock}>
            <Text style={styles.textHeading}>Text</Text>
            <Text style={styles.paragraph}> </Text>
          </View>
        )}
      </Page>

      {/* ✅ Side 2+: Oppgaver */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.tasksHeading}>Tasks</Text>

        <View>
          {tasks.map((t, idx) => (
            <View key={idx} style={styles.task} wrap={false}>
              <Text style={styles.prompt}>
                {idx + 1}. {t.prompt}
              </Text>

              {t.type === "mcq" && (
                <View>
                  {(t.options || []).slice(0, 8).map((opt, i) => (
                    <View key={i} style={styles.optionRow}>
                      <View style={styles.checkbox} />
                      <Text>{opt}</Text>
                    </View>
                  ))}
                  {lesson.includeAnswerKey ? (
                    <Text style={styles.answerKey}>
                      Answer: {typeof t.correctAnswer === "string" ? t.correctAnswer : JSON.stringify(t.correctAnswer)}
                    </Text>
                  ) : null}
                </View>
              )}

              {t.type === "truefalse" && (
                <View>
                  <View style={styles.tfRow}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <View style={styles.checkbox} />
                      <Text>True</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <View style={styles.checkbox} />
                      <Text>False</Text>
                    </View>
                  </View>
                  {lesson.includeAnswerKey ? (
                    <Text style={styles.answerKey}>
                      Answer: {String(t.correctAnswer ?? "")}
                    </Text>
                  ) : null}
                </View>
              )}

              {t.type === "open" && (
                <View>
                  {Array.from({ length: linesFor(t.answerSpace || "medium") }).map((_, i) => (
                    <View key={i} style={styles.line} />
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}
