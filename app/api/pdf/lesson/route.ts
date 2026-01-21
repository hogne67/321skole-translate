// app/api/pdf/lesson/route.ts
import { NextResponse } from "next/server";
import { pdf } from "@react-pdf/renderer";
import React from "react";
import { WorksheetPdf, PdfLesson } from "@/lib/pdf/WorksheetPdf";

export const runtime = "nodejs";

async function toNodeBuffer(x: any): Promise<Buffer> {
  if (!x) return Buffer.from([]);

  // Already a Node Buffer
  if (Buffer.isBuffer(x)) return x;

  // Uint8Array / ArrayBuffer
  if (x instanceof Uint8Array) return Buffer.from(x);
  if (x instanceof ArrayBuffer) return Buffer.from(new Uint8Array(x));

  // Web ReadableStream (has getReader)
  if (typeof x?.getReader === "function") {
    const ab = await new Response(x).arrayBuffer();
    return Buffer.from(new Uint8Array(ab));
  }

  // Node stream (has .on)
  if (typeof x?.on === "function") {
    return await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      x.on("data", (c: any) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      x.on("end", () => resolve(Buffer.concat(chunks)));
      x.on("error", reject);
    });
  }

  // Fallback
  return Buffer.from(String(x));
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { lesson: PdfLesson };

    if (!body?.lesson) {
      return NextResponse.json({ error: "Missing lesson payload" }, { status: 400 });
    }

    const element = React.createElement(WorksheetPdf, { lesson: body.lesson });

    // TypeScript: pdf() expects a Document element; our component returns <Document />
    const instance = pdf(element as any);

    const out = await instance.toBuffer(); // may be Buffer or stream depending on version
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
  } catch (err: any) {
    return NextResponse.json(
      { error: "PDF generation failed", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}

