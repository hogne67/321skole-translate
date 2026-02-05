// app/api/pdf/lesson/route.ts
import { NextResponse } from "next/server";
import { pdf } from "@react-pdf/renderer";
import React from "react";
import { WorksheetPdf, PdfLesson } from "@/lib/pdf/WorksheetPdf";

export const runtime = "nodejs";

// Minimal “web stream” typing (uten DOM-lib)
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

  // Les til done=true
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
      const c = args[0]; // vanligvis chunk
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

  if (hasGetReader(x)) {
    return await webStreamToBuffer(x);
  }

  if (hasOn(x)) {
    return await nodeStreamToBuffer(x);
  }

  return Buffer.from(String(x));
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { lesson?: PdfLesson };

    if (!body?.lesson) {
      return NextResponse.json({ error: "Missing lesson payload" }, { status: 400 });
    }

    type PdfElement = Parameters<typeof pdf>[0];

const element = React.createElement(WorksheetPdf, { lesson: body.lesson }) as unknown as PdfElement;
const instance = pdf(element);


    const out = await instance.toBuffer(); // kan være Buffer eller stream avhengig av versjon
    const buffer = await toNodeBuffer(out);

    const filename =
      (body.lesson.title || "worksheet").replaceAll(" ", "_") +
      (body.lesson.includeAnswerKey ? "_teacher" : "") +
      ".pdf";

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