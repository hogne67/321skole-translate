import { NextResponse } from "next/server";
import { pdf } from "@react-pdf/renderer";
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { BoardImagePdf, type BoardImagePdfPayload } from "@/lib/pdf/BoardImagePdf";

export const runtime = "nodejs";

type WebStreamReader = {
  read: () => Promise<{ done: boolean; value?: Uint8Array }>;
};

type WebReadableStreamLike = {
  getReader: () => WebStreamReader;
};

type NodeStreamLike = {
  on: (event: "data" | "end" | "error", cb: (...args: unknown[]) => void) => void;
};

function hasGetReader(x: unknown): x is WebReadableStreamLike {
  return typeof x === "object" && x !== null && "getReader" in x && typeof (x as { getReader?: unknown }).getReader === "function";
}

function hasOn(x: unknown): x is NodeStreamLike {
  return typeof x === "object" && x !== null && "on" in x && typeof (x as { on?: unknown }).on === "function";
}

async function webStreamToBuffer(stream: WebReadableStreamLike): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Buffer[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.length) chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
}

async function nodeStreamToBuffer(stream: NodeStreamLike): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];

    stream.on("data", (...args: unknown[]) => {
      const c = args[0];
      if (Buffer.isBuffer(c)) chunks.push(c);
      else if (c instanceof Uint8Array) chunks.push(Buffer.from(c));
      else chunks.push(Buffer.from(String(c)));
    });

    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", (...args: unknown[]) => reject(args[0]));
  });
}

async function toNodeBuffer(x: unknown): Promise<Buffer> {
  if (!x) return Buffer.from([]);
  if (Buffer.isBuffer(x)) return x;
  if (x instanceof Uint8Array) return Buffer.from(x);
  if (x instanceof ArrayBuffer) return Buffer.from(new Uint8Array(x));
  if (hasGetReader(x)) return await webStreamToBuffer(x);
  if (hasOn(x)) return await nodeStreamToBuffer(x);
  return Buffer.from(String(x));
}

function safeFilename(input: string) {
  return input
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 80);
}

function logoDataUrl() {
  const logoPath = path.join(process.cwd(), "public", "logo321ny.png");
  const buffer = fs.readFileSync(logoPath);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function imageUrlToDataUrl(imageUrl: string | undefined) {
  if (!imageUrl) return "";
  if (imageUrl.startsWith("data:image/")) return imageUrl;

  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return "";

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) return "";

    const buffer = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return "";
  }
}

function isSentence(value: unknown): value is BoardImagePdfPayload["sentences"][number] {
  if (!value || typeof value !== "object") return false;
  const item = value as { id?: unknown; name?: unknown; text?: unknown };
  return typeof item.id === "string" && typeof item.name === "string" && typeof item.text === "string";
}

function isPayload(value: unknown): value is BoardImagePdfPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as { title?: unknown; prompt?: unknown; labels?: unknown; sentences?: unknown };
  return (
    typeof payload.title === "string" &&
    typeof payload.prompt === "string" &&
    typeof payload.labels === "object" &&
    payload.labels !== null &&
    Array.isArray(payload.sentences) &&
    payload.sentences.every(isSentence)
  );
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { data?: unknown };

    if (!isPayload(body?.data)) {
      return NextResponse.json({ error: "Missing or invalid image activity payload" }, { status: 400 });
    }

    const data: BoardImagePdfPayload = {
      ...body.data,
      logoPath: logoDataUrl(),
      imageUrl: await imageUrlToDataUrl(body.data.imageUrl),
      sentences: body.data.sentences.slice(0, 80),
    };

    type PdfElement = Parameters<typeof pdf>[0];
    const element = React.createElement(BoardImagePdf, { data }) as unknown as PdfElement;
    const instance = pdf(element);
    const out = await instance.toBuffer();
    const buffer = await toNodeBuffer(out);
    const filename = `${safeFilename(data.title || "bildeaktivitet") || "bildeaktivitet"}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error: "PDF generation failed",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
