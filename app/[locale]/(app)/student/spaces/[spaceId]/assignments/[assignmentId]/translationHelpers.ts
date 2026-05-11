export async function translateOne(text: string, targetLang: string) {
    const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, targetLang }),
    });

    const raw = await res.text();

    let data: unknown = {};

    try {
        data = raw ? JSON.parse(raw) : {};
    } catch {
        throw new Error(
            `Translate API returned non-JSON (HTTP ${res.status}): ${raw.slice(0, 200)}`
        );
    }

    const d = data as {
        error?: unknown;
        translatedText?: unknown;
        translation?: unknown;
        text?: unknown;
    };

    if (d?.error) {
        throw new Error(`Translate API error (HTTP ${res.status}): ${String(d.error)}`);
    }

    if (!res.ok) {
        throw new Error(`Translate HTTP ${res.status}: ${raw.slice(0, 200)}`);
    }

    const out = String(
        d?.translatedText ?? d?.translation ?? d?.text ?? ""
    ).trim();

    if (!out) {
        throw new Error("Translate returned empty");
    }

    return out;
}