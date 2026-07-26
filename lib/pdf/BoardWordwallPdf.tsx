import React from "react";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

export type BoardWordwallPdfWord = {
  word: string;
  count: number;
  pinned?: boolean;
  featured?: boolean;
};

export type BoardWordwallPdfPayload = {
  title: string;
  subtitle: string;
  prompt: string;
  generatedAt: string;
  responseCount: number;
  spaceLabel?: string;
  logoPath?: string;
  words: BoardWordwallPdfWord[];
  labels: {
    generatedAt: string;
    prompt: string;
    responses: string;
    space: string;
    featured: string;
    pinned: string;
    allWords: string;
    noWords: string;
    site: string;
  };
};

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 11,
    color: "#0f172a",
    backgroundColor: "#f8fafc",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 20,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#dbeafe",
  },
  titleBlock: {
    flexGrow: 1,
  },
  kicker: {
    fontSize: 10,
    color: "#0369a1",
    fontWeight: 800,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: 900,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 12,
    color: "#475569",
    lineHeight: 1.35,
  },
  brand: {
    width: 116,
    alignItems: "flex-end",
  },
  logo: {
    width: 74,
    height: 30,
    objectFit: "contain",
  },
  site: {
    marginTop: 5,
    fontSize: 10,
    color: "#64748b",
  },
  metaRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
    marginBottom: 18,
  },
  metaCard: {
    flexGrow: 1,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  metaLabel: {
    fontSize: 9,
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: 800,
  },
  promptBox: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 900,
    lineHeight: 1.3,
    marginBottom: 12,
  },
  prompt: {
    fontSize: 18,
    fontWeight: 900,
    lineHeight: 1.25,
  },
  featuredBox: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#f59e0b",
    marginBottom: 16,
  },
  featuredWord: {
    fontSize: 34,
    fontWeight: 900,
  },
  cloud: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    minHeight: 180,
  },
  compactCloud: {
    minHeight: 82,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
  },
  pinnedChip: {
    borderColor: "#f59e0b",
    backgroundColor: "#fef3c7",
  },
  chipText: {
    fontWeight: 900,
  },
  count: {
    fontSize: 9,
    color: "#475569",
    fontWeight: 800,
  },
  empty: {
    color: "#64748b",
    fontSize: 13,
  },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 8,
    color: "#64748b",
    fontSize: 9,
  },
});

function wordSize(count: number) {
  if (count >= 8) return 24;
  if (count >= 5) return 20;
  if (count >= 3) return 17;
  if (count >= 2) return 15;
  return 13;
}

export function BoardWordwallPdf({ data }: { data: BoardWordwallPdfPayload }) {
  const featured = data.words.find((word) => word.featured);
  const pinned = data.words.filter((word) => word.pinned);
  const sortedWords = [...data.words].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.count - a.count || a.word.localeCompare(b.word);
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <Text style={styles.kicker}>321skole tavle</Text>
            <Text style={styles.title}>{data.title}</Text>
            <Text style={styles.subtitle}>{data.subtitle}</Text>
          </View>
          <View style={styles.brand}>
            {data.logoPath ? <Image style={styles.logo} src={data.logoPath} /> : null}
            <Text style={styles.site}>{data.labels.site}</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>{data.labels.generatedAt}</Text>
            <Text style={styles.metaValue}>{data.generatedAt}</Text>
          </View>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>{data.labels.responses}</Text>
            <Text style={styles.metaValue}>{data.responseCount}</Text>
          </View>
          {data.spaceLabel ? (
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>{data.labels.space}</Text>
              <Text style={styles.metaValue}>{data.spaceLabel}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.promptBox}>
          <Text style={styles.sectionTitle}>{data.labels.prompt}</Text>
          <Text style={styles.prompt}>{data.prompt}</Text>
        </View>

        {featured ? (
          <View style={styles.featuredBox}>
            <Text style={styles.sectionTitle}>{data.labels.featured}</Text>
            <Text style={styles.featuredWord}>
              {featured.word}
              {featured.count > 1 ? ` x${featured.count}` : ""}
            </Text>
          </View>
        ) : null}

        {pinned.length > 0 ? (
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.sectionTitle}>{data.labels.pinned}</Text>
            <View style={[styles.cloud, styles.compactCloud]}>
              {pinned.map((item) => (
                <View key={item.word} style={[styles.chip, styles.pinnedChip]}>
                  <Text style={[styles.chipText, { fontSize: wordSize(item.count) }]}>{item.word}</Text>
                  {item.count > 1 ? <Text style={styles.count}>x{item.count}</Text> : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>{data.labels.allWords}</Text>
        <View style={styles.cloud}>
          {sortedWords.length === 0 ? (
            <Text style={styles.empty}>{data.labels.noWords}</Text>
          ) : (
            sortedWords.map((item) => (
              <View key={item.word} style={item.pinned ? [styles.chip, styles.pinnedChip] : styles.chip}>
                <Text style={[styles.chipText, { fontSize: wordSize(item.count) }]}>{item.word}</Text>
                {item.count > 1 ? <Text style={styles.count}>x{item.count}</Text> : null}
              </View>
            ))
          )}
        </View>

        <View style={styles.footer} fixed>
          <Text>{data.labels.site}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
