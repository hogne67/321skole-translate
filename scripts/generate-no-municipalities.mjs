// scripts/generate-no-municipalities.mjs
import fs from "node:fs/promises";

const DATE = "2026-01-01"; // bytt ved behov
const URL = `https://data.ssb.no/api/klass/v1/classifications/131/codesAt.json?date=${DATE}`;

const res = await fetch(URL);
if (!res.ok) {
  throw new Error(`Failed fetch ${URL}: ${res.status} ${res.statusText}`);
}
const json = await res.json();

// SSB returnerer typisk { codes: [{ code, name, ...}, ...] }
const codes = json?.codes || [];
if (!Array.isArray(codes) || codes.length < 300) {
  throw new Error(`Unexpected response shape/size. keys=${Object.keys(json || {})}`);
}

// Vi lager en enkel struktur: { code, name, countyCode }
const municipalities = codes
  .map((c) => ({
    code: String(c.code),
    name: String(c.name),
    countyCode: String(c.code).slice(0, 2),
  }))
  .filter((x) => x.code.length === 4 && x.name.length > 0)
  .sort((a, b) => a.name.localeCompare(b.name, "nb"));

const out = `// AUTO-GENERATED from SSB Klass API (classification 131) at date ${DATE}
// Do not edit by hand. Run: node scripts/generate-no-municipalities.mjs

export type NoMunicipality = {
  code: string;      // kommunenummer (4 siffer)
  name: string;      // kommunenavn
  countyCode: string; // fylkesnummer (2 første sifre i kommunenummer)
};

export const NO_MUNICIPALITIES: NoMunicipality[] = ${JSON.stringify(municipalities, null, 2)} as const;

export const NO_MUNICIPALITY_NAMES: string[] =
  NO_MUNICIPALITIES.map((m) => m.name) as const;
`;

await fs.mkdir("lib/geo", { recursive: true });
await fs.writeFile("lib/geo/noMunicipalities.ts", out, "utf8");

console.log(`✅ Wrote lib/geo/noMunicipalities.ts (${municipalities.length} municipalities)`);
