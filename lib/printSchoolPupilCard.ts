type PrintField = { label: string; value: string; code?: boolean };

export function printSchoolPupilCard(locale: string, title: string, name: string, fields: PrintField[]) {
  const frame = document.createElement("iframe");
  frame.title = title;
  frame.tabIndex = -1;
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0";
  document.body.append(frame);

  try {
    const printWindow = frame.contentWindow;
    const page = frame.contentDocument;
    if (!printWindow || !page) throw new Error("Print frame unavailable");
    page.title = title;
    page.documentElement.lang = locale;
    const style = page.createElement("style");
    style.textContent = `
      @page { margin: 18mm; }
      body { margin: 0; color: #0f172a; font: 12pt/1.45 system-ui, sans-serif; }
      article { max-width: 140mm; border: 1pt solid #64748b; border-radius: 3mm; padding: 7mm; break-inside: avoid; }
      h1 { margin: 0; font-size: 15pt; }
      p { margin: 2mm 0 4mm; font-size: 19pt; font-weight: 700; overflow-wrap: anywhere; }
      dl { margin: 0; }
      dt { margin-top: 3mm; color: #334155; font-size: 10pt; }
      dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
      dd.code { font: 700 18pt/1.4 ui-monospace, monospace; letter-spacing: .06em; }
    `;
    page.head.append(style);

    const card = page.createElement("article");
    const heading = page.createElement("h1");
    heading.textContent = title;
    const pupil = page.createElement("p");
    pupil.textContent = name;
    const details = page.createElement("dl");
    for (const field of fields) {
      const label = page.createElement("dt");
      label.textContent = field.label;
      const value = page.createElement("dd");
      value.textContent = field.value;
      if (field.code) value.className = "code";
      details.append(label, value);
    }
    card.append(heading, pupil, details);
    page.body.replaceChildren(card);

    printWindow.addEventListener("afterprint", () => frame.remove(), { once: true });
    printWindow.focus();
    printWindow.print();
    return frame;
  } catch (error) {
    frame.remove();
    throw error;
  }
}
