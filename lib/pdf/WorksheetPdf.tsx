// lib/pdf/WorksheetPdf.tsx
import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

type PdfTaskType = "truefalse" | "mcq" | "open";

type PdfTask = {
  type: PdfTaskType;
  prompt: string;
  options?: string[];
  correctAnswer?: unknown;
  answerSpace?: "short" | "medium" | "long";
};

export type PdfLesson = {
  title: string;
  level?: string;
  topic?: string;
  language?: string;
  estimatedMinutes?: number;

  producerName?: string;
  coverImageUrl?: string;
  logoUrl?: string;
  sourceText?: string;

  includeAnswerKey?: boolean;

  tasks: PdfTask[];
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 32,
    paddingHorizontal: 36,
    fontSize: 11,
  },

  // Header
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  headerLeft: {
    flexGrow: 1,
    paddingRight: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: 800,
    marginBottom: 4,
  },
  subline: {
    fontSize: 10,
    color: "#444",
  },
  producer: {
    fontSize: 10,
    marginTop: 4,
    color: "#333",
  },

  brandWrap: {
    width: 120,
    alignItems: "flex-end",
  },
  logo: {
    width: 60,
    height: 20,
    objectFit: "contain",
  },
  brandText: {
    marginTop: 4,
    fontSize: 12,
    color: "#666",
  },

  // Student info
  studentRow: {
    flexDirection: "row",
    gap: 14,
    marginTop: 10,
    flexWrap: "wrap",
  },
  field: {
    flexDirection: "row",
    gap: 6,
    alignItems: "flex-end",
  },
  fieldLabel: {
    fontSize: 10,
    color: "#444",
  },
  fieldLine: {
    borderBottomWidth: 1,
    borderBottomColor: "#111",
    width: 160,
    height: 12,
  },

  // 16:9 cover image
  coverWrap: {
    marginTop: 14,
    width: "100%",
  },
  cover: {
    width: "100%",
    aspectRatio: 16 / 9,
    objectFit: "cover",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 4,
  },

  // Text block
  textBlock: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#ddd",
  },
  textHeading: {
    fontSize: 11,
    fontWeight: 800,
    marginBottom: 6,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 1.5,
  },

  // Tasks
  tasksHeading: {
    fontSize: 14,
    fontWeight: 800,
    marginBottom: 8,
  },
  task: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#ddd",
  },
  prompt: {
    fontSize: 11,
    marginBottom: 6,
  },
  optionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 4,
    alignItems: "center",
  },
  checkbox: {
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: "#111",
    marginRight: 6,
  },
  tfRow: {
    flexDirection: "row",
    gap: 18,
    marginTop: 6,
  },
  line: {
    height: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#111",
    marginTop: 6,
  },

  // Answer key
  answerKey: {
    marginTop: 6,
    fontSize: 10,
    color: "#333",
  },
});

function linesFor(space: "short" | "medium" | "long") {
  if (space === "short") return 3;
  if (space === "long") return 12;
  return 7;
}

function normalizeText(s?: string) {
  return (s ?? "").toString();
}

function formatAnswer(a: unknown): string {
  if (a === null || a === undefined) return "";
  if (typeof a === "string") return a;
  if (typeof a === "number" || typeof a === "boolean") return String(a);
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

export function WorksheetPdf({ lesson }: { lesson: PdfLesson }) {
  const metaParts = [
    lesson.level ? `Level: ${lesson.level}` : null,
    lesson.topic ? `Topic: ${lesson.topic}` : null,
    lesson.language ? `Language: ${lesson.language}` : null,
    typeof lesson.estimatedMinutes === "number" ? `Time: ${lesson.estimatedMinutes} min` : null,
  ].filter(Boolean) as string[];

  const tasks = (lesson.tasks || []).filter((t) => (t.prompt ?? "").trim().length > 0);
  const showText = (lesson.sourceText ?? "").trim().length > 0;

  const logoSrc =
    lesson.logoUrl?.trim() ||
    "/logo321ny.png";

  return (
    <Document>
      {/* Side 1 */}
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>{lesson.title || "Worksheet"}</Text>

            {metaParts.length > 0 ? (
              <Text style={styles.subline}>{metaParts.join(" • ")}</Text>
            ) : null}

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

          <View style={styles.brandWrap}>
            <Image style={styles.logo} src={logoSrc} />
            <Text style={styles.brandText}>321school.com</Text>
          </View>
        </View>

        {lesson.coverImageUrl?.trim() ? (
          <View style={styles.coverWrap}>
            <Image style={styles.cover} src={lesson.coverImageUrl} />
          </View>
        ) : null}

        <View style={styles.textBlock}>
          <Text style={styles.textHeading}>Text</Text>
          <Text style={styles.paragraph}>
            {showText ? normalizeText(lesson.sourceText) : " "}
          </Text>
        </View>
      </Page>

      {/* Side 2 */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.tasksHeading}>Tasks</Text>

        <View>
          {tasks.map((t, idx) => (
            <View key={idx} style={styles.task} wrap={false}>
              <Text style={styles.prompt}>
                {idx + 1}. {t.prompt}
              </Text>

              {t.type === "mcq" ? (
                <View>
                  {(t.options || []).slice(0, 8).map((opt, i) => (
                    <View key={i} style={styles.optionRow}>
                      <View style={styles.checkbox} />
                      <Text>{opt}</Text>
                    </View>
                  ))}

                  {lesson.includeAnswerKey ? (
                    <Text style={styles.answerKey}>
                      Answer: {formatAnswer(t.correctAnswer)}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {t.type === "truefalse" ? (
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
                      Answer: {formatAnswer(t.correctAnswer)}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {t.type === "open" ? (
                <View>
                  {Array.from({ length: linesFor(t.answerSpace || "medium") }).map((_, i) => (
                    <View key={i} style={styles.line} />
                  ))}

                  {lesson.includeAnswerKey &&
                  typeof t.correctAnswer === "string" &&
                  t.correctAnswer.trim() ? (
                    <Text style={styles.answerKey}>
                      Suggested answer: {t.correctAnswer}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}