import React from "react";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

export type BoardImagePdfSentence = {
  id: string;
  name: string;
  text: string;
  pinned?: boolean;
  featured?: boolean;
};

export type BoardImagePdfPayload = {
  title: string;
  subtitle: string;
  prompt: string;
  imageUrl?: string;
  generatedAt: string;
  responseCount: number;
  spaceLabel?: string;
  logoPath?: string;
  sentences: BoardImagePdfSentence[];
  labels: {
    generatedAt: string;
    prompt: string;
    responses: string;
    space: string;
    featured: string;
    pinned: string;
    allSentences: string;
    noSentences: string;
    site: string;
  };
};

const styles = StyleSheet.create({
  page: {
    padding: 34,
    fontSize: 11,
    color: "#0f172a",
    backgroundColor: "#f8fafc",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd6fe",
  },
  titleBlock: {
    flexGrow: 1,
  },
  kicker: {
    fontSize: 10,
    color: "#7c3aed",
    fontWeight: 800,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  title: {
    fontSize: 26,
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
    marginTop: 16,
    marginBottom: 16,
  },
  metaCard: {
    flexGrow: 1,
    padding: 11,
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
  hero: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 16,
  },
  imageBox: {
    width: "46%",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#ddd6fe",
    backgroundColor: "#ffffff",
  },
  image: {
    width: "100%",
    aspectRatio: 1.777,
    objectFit: "cover",
  },
  imagePlaceholder: {
    height: 150,
    alignItems: "center",
    justifyContent: "center",
    color: "#64748b",
  },
  promptBox: {
    flexGrow: 1,
    width: "54%",
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#f5f3ff",
    borderWidth: 1,
    borderColor: "#c4b5fd",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 900,
    lineHeight: 1.3,
    marginBottom: 10,
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
    marginBottom: 14,
  },
  featuredText: {
    fontSize: 24,
    fontWeight: 900,
    lineHeight: 1.2,
  },
  sentenceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  sentenceCard: {
    width: "48%",
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  pinnedCard: {
    backgroundColor: "#fef3c7",
    borderColor: "#f59e0b",
  },
  sentenceName: {
    fontSize: 10,
    color: "#64748b",
    fontWeight: 800,
    marginBottom: 6,
  },
  sentenceText: {
    fontSize: 13,
    lineHeight: 1.35,
    fontWeight: 700,
  },
  empty: {
    color: "#64748b",
    fontSize: 13,
  },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 34,
    right: 34,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 8,
    color: "#64748b",
    fontSize: 9,
  },
});

export function BoardImagePdf({ data }: { data: BoardImagePdfPayload }) {
  const featured = data.sentences.find((sentence) => sentence.featured);
  const pinned = data.sentences.filter((sentence) => sentence.pinned);
  const orderedSentences = [...data.sentences].sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return 0;
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

        <View style={styles.hero}>
          <View style={styles.imageBox}>
            {data.imageUrl ? <Image style={styles.image} src={data.imageUrl} /> : <View style={styles.imagePlaceholder}><Text>{data.labels.prompt}</Text></View>}
          </View>
          <View style={styles.promptBox}>
            <Text style={styles.sectionTitle}>{data.labels.prompt}</Text>
            <Text style={styles.prompt}>{data.prompt}</Text>
          </View>
        </View>

        {featured ? (
          <View style={styles.featuredBox}>
            <Text style={styles.sectionTitle}>{data.labels.featured}</Text>
            <Text style={styles.sentenceName}>{featured.name}</Text>
            <Text style={styles.featuredText}>{featured.text}</Text>
          </View>
        ) : null}

        {pinned.length > 0 ? (
          <View style={{ marginBottom: 14 }}>
            <Text style={styles.sectionTitle}>{data.labels.pinned}</Text>
            <View style={styles.sentenceGrid}>
              {pinned.slice(0, 4).map((sentence) => (
                <View key={`pinned-${sentence.id}`} style={[styles.sentenceCard, styles.pinnedCard]} wrap={false}>
                  <Text style={styles.sentenceName}>{sentence.name}</Text>
                  <Text style={styles.sentenceText}>{sentence.text}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>{data.labels.allSentences}</Text>
        <View style={styles.sentenceGrid}>
          {orderedSentences.length === 0 ? (
            <Text style={styles.empty}>{data.labels.noSentences}</Text>
          ) : (
            orderedSentences.slice(0, 36).map((sentence) => (
              <View key={sentence.id} style={sentence.pinned || sentence.featured ? [styles.sentenceCard, styles.pinnedCard] : styles.sentenceCard} wrap={false}>
                <Text style={styles.sentenceName}>{sentence.name}</Text>
                <Text style={styles.sentenceText}>{sentence.text}</Text>
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
