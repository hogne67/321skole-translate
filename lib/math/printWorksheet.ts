/** Print the rendered worksheet only after its fonts and images are ready. */
export async function printMathWorksheet(root: ParentNode = document): Promise<void> {
  await Promise.all([
    document.fonts?.ready,
    ...Array.from(root.querySelectorAll("img")).map(image =>
      image.decode().catch(() => undefined)
    ),
  ]);
  window.print();
}
