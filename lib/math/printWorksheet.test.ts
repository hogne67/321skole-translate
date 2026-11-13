import assert from "node:assert/strict";
import test from "node:test";
import { printMathWorksheet } from "./printWorksheet";

test("printing waits for fonts and images, and a broken image does not block the dialog", async () => {
  let finishFonts!: () => void;
  let finishImage!: () => void;
  let printed = 0;
  const fontReady = new Promise<void>(resolve => { finishFonts = resolve; });
  const imageReady = new Promise<void>(resolve => { finishImage = resolve; });
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { fonts: { ready: fontReady } } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { print() { printed++; } } });
  try {
    const root = { querySelectorAll: () => [{ decode: () => imageReady }, { decode: async () => { throw new Error("Broken image"); } }] } as unknown as ParentNode;
    const pending = printMathWorksheet(root);
    finishFonts();
    await Promise.resolve();
    assert.equal(printed, 0);
    finishImage();
    await pending;
    assert.equal(printed, 1);
  } finally {
    if (oldDocument) Object.defineProperty(globalThis, "document", oldDocument);
    else Reflect.deleteProperty(globalThis, "document");
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
