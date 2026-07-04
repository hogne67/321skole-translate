"use client";

import { FormEvent, useState } from "react";
import { Sparkles, Save, ArrowLeft } from "lucide-react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import {
  DEFAULT_CURRICULUM_SOURCE,
  DEFAULT_PLANNER_DOCUMENT,
  DEFAULT_PLANNER_FRAME,
  type CurriculumSource,
  type CurriculumSourceType,
  type PlannerAiLevel,
  type PlannerDocument,
  type PlannerFrame,
  type PlannerIndividualDetails,
  type PlannerType,
} from "@/lib/planner/types";
import { useUserProfile } from "@/lib/useUserProfile";

const COUNTRIES = ["Norge", "England", "Brasil", "Egendefinert"];
const SCHOOL_TYPES = [
  "Barnehage",
  "Barneskole",
  "Ungdomsskole",
  "Videregående",
  "Voksenopplæring",
  "Universitet",
  "Arbeidsrettet opplæring",
];
const SUBJECTS = ["Norsk", "Matematikk", "Naturfag", "Samfunnsfag", "Engelsk", "Helsefag", "Yrkesfag"];
const LEVELS = ["Barnehage", "1. trinn", "2. trinn", "3. trinn", "4. trinn", "5. trinn", "6. trinn", "7. trinn", "8. trinn", "9. trinn", "10. trinn", "Videregående", "A1", "A2", "B1", "B2", "C1", "C2", "Moduler (FOV)"];
const LANGUAGES = ["Norsk", "Engelsk", "Portugisisk", "Spansk", "Arabisk", "Somali", "Ukrainsk"];
const FRAMEWORKS = ["LK20 / FOV", "National Curriculum", "BNCC", "Egendefinert rammeverk"];

export default function NewPlannerPage() {
  const locale = useLocale();
  const router = useRouter();
  const { user } = useUserProfile();
  const [frame, setFrame] = useState<PlannerFrame>(DEFAULT_PLANNER_FRAME);
  const [curriculum, setCurriculum] = useState<CurriculumSource>(DEFAULT_CURRICULUM_SOURCE);
  const [document, setDocument] = useState<PlannerDocument>(DEFAULT_PLANNER_DOCUMENT);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const hasDraft = Boolean(document.title || document.description || document.periods.length);

  function updateFrame<K extends keyof PlannerFrame>(key: K, value: PlannerFrame[K]) {
    setFrame((prev) => ({ ...prev, [key]: value }));
  }

  function updateCurriculum<K extends keyof CurriculumSource>(key: K, value: CurriculumSource[K]) {
    setCurriculum((prev) => ({ ...prev, [key]: value }));
  }

  function updateDocument<K extends keyof PlannerDocument>(key: K, value: PlannerDocument[K]) {
    setDocument((prev) => ({ ...prev, [key]: value }));
  }

  function updateIndividualDetails<K extends keyof PlannerIndividualDetails>(
    key: K,
    value: PlannerIndividualDetails[K]
  ) {
    setDocument((prev) => ({
      ...prev,
      individualDetails: {
        ...prev.individualDetails,
        [key]: value,
      },
    }));
  }

  async function generateDraft() {
    if (!user || generating) return;

    try {
      setGenerating(true);
      setError("");
      const token = await user.getIdToken();
      const res = await fetch("/api/teacher/planner/generate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ frame, curriculum, document }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        document?: PlannerDocument;
        error?: string;
      };
      if (!res.ok || !data.document) throw new Error(data.error || "Could not generate planner");
      setDocument(data.document);
    } catch (err) {
      console.error("Failed to generate planner", err);
      setError(err instanceof Error ? err.message : "Kunne ikke generere plan akkurat nå.");
    } finally {
      setGenerating(false);
    }
  }

  async function savePlanner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || saving) return;

    const title = document.title.trim();
    if (!title) {
      setError("Planen må ha en tittel før den kan lagres.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      const token = await user.getIdToken();
      const res = await fetch("/api/teacher/planner", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "draft",
          frame,
          curriculum,
          document,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { plannerId?: string; error?: string };
      if (!res.ok || !data.plannerId) throw new Error(data.error || "Could not save planner");
      router.push(`/${locale}/teacher/planner/${data.plannerId}`);
    } catch (err) {
      console.error("Failed to save planner", err);
      setError("Planen kunne ikke lagres akkurat nå.");
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl">
      <form onSubmit={savePlanner} className="grid gap-5">
        <section className="rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-800">
                Ny 321Planner
              </div>
              <h1 className="m-0 mt-3 text-2xl font-black text-slate-950">Lag ny plan</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Velg rammene, la AI lage et førsteutkast, og rediger før du lagrer planen.
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={() => router.push(`/${locale}/teacher/planner`)}>
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Tilbake
            </Button>
          </div>
        </section>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
        ) : null}

        <section className="grid gap-4 rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
          <div>
            <h2 className="m-0 text-lg font-extrabold text-slate-950">1. Planinformasjon</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Dette er rammene AI bruker for å foreslå en realistisk plan.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Land">
              <Select value={frame.country} onChange={(event) => updateFrame("country", event.target.value)}>
                {COUNTRIES.map((country) => <option key={country} value={country}>{country}</option>)}
              </Select>
            </Field>
            <Field label="Skoleslag">
              <Select value={frame.schoolType} onChange={(event) => updateFrame("schoolType", event.target.value)}>
                {SCHOOL_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </Select>
            </Field>
            <Field label="Fag">
              <Select value={frame.subject} onChange={(event) => updateFrame("subject", event.target.value)}>
                {SUBJECTS.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
              </Select>
            </Field>
            <Field label="Nivå">
              <Select value={frame.level} onChange={(event) => updateFrame("level", event.target.value)}>
                {LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
              </Select>
            </Field>
            <Field label="Språk">
              <Select value={frame.language} onChange={(event) => updateFrame("language", event.target.value)}>
                {LANGUAGES.map((language) => <option key={language} value={language}>{language}</option>)}
              </Select>
            </Field>
            <Field label="Skoleår">
              <Input value={frame.schoolYear} onChange={(event) => updateFrame("schoolYear", event.target.value)} />
            </Field>
            <Field label="Antall undervisningsuker">
              <Input
                type="number"
                min={1}
                max={52}
                value={frame.teachingWeeks}
                onChange={(event) => updateFrame("teachingWeeks", Number(event.target.value))}
              />
            </Field>
            <Field label="Antall timer">
              <Input
                type="number"
                min={1}
                value={frame.totalHours}
                onChange={(event) => updateFrame("totalHours", Number(event.target.value))}
              />
            </Field>
            <Field label="Plantype">
              <Select value={frame.planType} onChange={(event) => updateFrame("planType", event.target.value as PlannerType)}>
                <option value="annual">Årsplan</option>
                <option value="individual">Individuell plan</option>
              </Select>
            </Field>
            <Field label="AI-nivå">
              <Select value={frame.aiLevel} onChange={(event) => updateFrame("aiLevel", event.target.value as PlannerAiLevel)}>
                <option value="short">Kort</option>
                <option value="standard">Standard</option>
                <option value="detailed">Detaljert</option>
              </Select>
            </Field>
          </div>

          <Field label="Tema eller fokusområde">
            <Textarea
              value={frame.focusArea}
              onChange={(event) => updateFrame("focusArea", event.target.value)}
              rows={3}
              placeholder="F.eks. muntlig deltakelse, yrkesrettet norsk, eksamensforberedelse eller individuell progresjon."
            />
          </Field>
        </section>

        <section className="grid gap-4 rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
          <div>
            <h2 className="m-0 text-lg font-extrabold text-slate-950">2. Faglig grunnlag</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Velg offisiell læreplan, skriv inn egen tekst eller legg inn navn på dokumentet som grunnlag.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Kilde">
              <Select
                value={curriculum.type}
                onChange={(event) => updateCurriculum("type", event.target.value as CurriculumSourceType)}
              >
                <option value="official">Offisiell læreplan</option>
                <option value="custom">Egen tekst</option>
                <option value="upload">Last opp dokument</option>
              </Select>
            </Field>
            <Field label="Rammeverk">
              <Select value={curriculum.framework} onChange={(event) => updateCurriculum("framework", event.target.value)}>
                {FRAMEWORKS.map((framework) => <option key={framework} value={framework}>{framework}</option>)}
              </Select>
            </Field>
          </div>

          {curriculum.type === "custom" ? (
            <Field label="Egen læreplantekst">
              <Textarea
                value={curriculum.customText}
                onChange={(event) => updateCurriculum("customText", event.target.value)}
                rows={6}
              />
            </Field>
          ) : null}

          {curriculum.type === "upload" ? (
            <Field label="Dokumentnavn">
              <Input
                value={curriculum.uploadName}
                onChange={(event) => updateCurriculum("uploadName", event.target.value)}
                placeholder="F.eks. lokal_lareplan_norsk.pdf"
              />
            </Field>
          ) : null}

          {frame.planType === "individual" ? (
            <div className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4">
              <div>
                <h3 className="m-0 text-base font-black text-slate-950">Individuell plan</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Valgfritt grunnlag som AI kan bruke for å foreslå tilpasset progresjon.
                </p>
              </div>
              <Field label="Elev / deltaker">
                <Input
                  value={document.individualDetails.learnerName}
                  onChange={(event) => updateIndividualDetails("learnerName", event.target.value)}
                />
              </Field>
              <Field label="Utgangspunkt og behov">
                <Textarea
                  value={document.individualDetails.learnerContext}
                  onChange={(event) => updateIndividualDetails("learnerContext", event.target.value)}
                  rows={3}
                />
              </Field>
              <Field label="Tilrettelegging eller fokus">
                <Textarea
                  value={document.individualDetails.adaptations}
                  onChange={(event) => updateIndividualDetails("adaptations", event.target.value)}
                  rows={3}
                />
              </Field>
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button type="button" variant="primary" disabled={generating} onClick={() => void generateDraft()}>
              <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
              {generating ? "Lager forslag..." : "Generer førsteutkast"}
            </Button>
          </div>
        </section>

        <section className="grid gap-4 rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
          <div>
            <h2 className="m-0 text-lg font-extrabold text-slate-950">3. Rediger førsteutkast</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Alt her kan endres nå, og mer detaljert etter at planen er lagret.
            </p>
          </div>

          <Field label="Tittel">
            <Input value={document.title} onChange={(event) => updateDocument("title", event.target.value)} />
          </Field>
          <Field label="Beskrivelse">
            <Textarea value={document.description} onChange={(event) => updateDocument("description", event.target.value)} rows={4} />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Læringsmål">
              <Textarea value={document.learningGoals} onChange={(event) => updateDocument("learningGoals", event.target.value)} rows={5} />
            </Field>
            <Field label="Vurderingsformer">
              <Textarea value={document.assessmentForms} onChange={(event) => updateDocument("assessmentForms", event.target.value)} rows={5} />
            </Field>
          </div>
          {hasDraft ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
              Utkastet har {document.periods.length} perioder og {document.activities.length} aktivitetsforslag.
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
              Ingen AI-utkast ennå. Du kan også fylle inn tittel og tekst manuelt.
            </div>
          )}
        </section>

        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => router.push(`/${locale}/teacher/planner`)}>
            Avbryt
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            {saving ? "Lagrer..." : "Lagre plan"}
          </Button>
        </div>
      </form>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-800">
      <span>{label}</span>
      {children}
    </label>
  );
}
