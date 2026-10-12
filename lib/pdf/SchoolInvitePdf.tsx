import React from "react";
import { Document, Page, Text, View, Image, Link, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { inviteEmailCopy, type InviteEmailDetails } from "../schools/inviteEmail";

const styles = StyleSheet.create({
  page: { padding: 44, fontFamily: "Helvetica", fontSize: 11, lineHeight: 1.5, color: "#172033" },
  brand: { color: "#2457d6", fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 24 },
  title: { fontSize: 24, fontFamily: "Helvetica-Bold", lineHeight: 1.2, marginBottom: 26 },
  paragraph: { marginBottom: 13 },
  box: { backgroundColor: "#f1f5fc", borderRadius: 10, padding: 20, marginTop: 12, marginBottom: 22 },
  qrRow: { flexDirection: "row", alignItems: "center", gap: 24, marginBottom: 12 },
  qr: { width: 132, height: 132 },
  qrText: { flex: 1 },
  link: { color: "#2457d6", fontSize: 10 },
  code: { fontFamily: "Helvetica-Bold", fontSize: 13, marginTop: 8, marginBottom: 10 },
  footer: { borderTopWidth: 1, borderTopColor: "#dbe3ef", paddingTop: 18, marginTop: 16 },
});

export async function createSchoolInvitePdf(data: InviteEmailDetails): Promise<Buffer> {
  const copy = inviteEmailCopy(data);
  const qr = await QRCode.toDataURL(data.inviteUrl, { margin: 2, width: 360, errorCorrectionLevel: "M" });
  return renderToBuffer(<Document title={copy.title} author="321school">
    <Page size="A4" style={styles.page}>
      <Text style={styles.brand}>321school</Text>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.paragraph}>{copy.hello}</Text>
      <Text style={styles.paragraph}>{copy.intro}</Text>
      <Text style={styles.paragraph}>{copy.instructions}</Text>
      <View style={styles.box} wrap={false}>
        <View style={styles.qrRow}>
          <Image src={qr} style={styles.qr} />
          <View style={styles.qrText}>
            <Text style={styles.paragraph}>{copy.qr}</Text>
            <Link src={data.inviteUrl} style={styles.link}>{copy.action}</Link>
          </View>
        </View>
        {data.inviteCode ? <>
          <Text>{copy.code}</Text><Text style={styles.code}>{data.inviteCode}</Text>
          <Text>{copy.manual}</Text>
          <Link src={data.inviteUrl.split("?")[0]} style={styles.link}>{data.inviteUrl.split("?")[0]}</Link>
        </> : <Link src={data.inviteUrl} style={styles.link}>{data.inviteUrl}</Link>}
      </View>
      <Text style={styles.paragraph}>{copy.expires}</Text>
      <Text style={styles.paragraph}>{copy.closing}</Text>
      <View style={styles.footer} wrap={false}>
        <Text>{copy.regards}</Text>
        {data.adminName ? <Text>{data.adminName}</Text> : null}
        <Text>{data.schoolName}</Text>
      </View>
    </Page>
  </Document>);
}
