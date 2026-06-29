"use client";

import { FormEvent, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { AcademyGate } from "../AcademyGate";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { DEFAULT_COURSE_FORM, normalizeCoursePlan, type CourseFormValues, type CoursePlanSession } from "@/lib/courses/types";
import { useUserProfile } from "@/lib/useUserProfile";

type PracticalInfo = {
  subject: string;
  subtopic: string;
  additionalDescription: string;
  level: string;
  audience: string;
  language: string;
  numberOfSessions: number;
  durationMinutes: number;
};

type Proposal = Pick<
  CourseFormValues,
  "title" | "description" | "learningGoals" | "targetAudience" | "language" | "level" | "priceText"
>;

const SUBJECTS = [
  { value: "norsk", label: "Norsk og språk" },
  { value: "samfunnsfag", label: "Samfunnsfag" },
  { value: "naturfag", label: "Naturfag" },
  { value: "matte", label: "Matte" },
  { value: "arbeidsrelatert", label: "Arbeidsrelatert" },
  { value: "annet", label: "Annet" },
];

const SUBTOPICS: Record<string, Array<{ value: string; label: string }>> = {
  norsk: [
    { value: "grammatikk", label: "Grammatikk" },
    { value: "muntlig kommunikasjon", label: "Muntlig kommunikasjon" },
    { value: "lesing og skriving", label: "Lesing og skriving" },
    { value: "arbeidslivsspråk", label: "Arbeidslivsspråk" },
    { value: "annet", label: "Annet" },
  ],
  samfunnsfag: [
    { value: "skole og utdanning", label: "Skole og utdanning" },
    { value: "helse og velferd", label: "Helse og velferd" },
    { value: "demokrati og medborgerskap", label: "Demokrati og medborgerskap" },
    { value: "arbeid og økonomi", label: "Arbeid og økonomi" },
    { value: "familie og hverdagsliv", label: "Familie og hverdagsliv" },
    { value: "annet", label: "Annet" },
  ],
  naturfag: [
    { value: "kropp og helse", label: "Kropp og helse" },
    { value: "klima og miljø", label: "Klima og miljø" },
    { value: "teknologi og energi", label: "Teknologi og energi" },
    { value: "annet", label: "Annet" },
  ],
  matte: [
    { value: "tall og regning", label: "Tall og regning" },
    { value: "økonomi i hverdagen", label: "Økonomi i hverdagen" },
    { value: "måling og geometri", label: "Måling og geometri" },
    { value: "annet", label: "Annet" },
  ],
  arbeidsrelatert: [
    { value: "jobbsøking", label: "Jobbsøking" },
    { value: "HMS", label: "HMS" },
    { value: "kommunikasjon på jobb", label: "Kommunikasjon på jobb" },
    { value: "annet", label: "Annet" },
  ],
  annet: [{ value: "annet", label: "Annet" }],
};

const LEVELS = ["A1 Start", "A1", "A2", "B1", "B2", "C1", "C2"];
const AUDIENCES = ["Barn", "Ungdom", "Studenter", "Voksne"];
const LANGUAGES = ["Norsk", "Engelsk", "Portugisisk", "Spansk", "Arabisk", "Somali", "Ukrainsk"];

const DEFAULT_PRACTICAL_INFO: PracticalInfo = {
  subject: "norsk",
  subtopic: "grammatikk",
  additionalDescription: "",
  level: "A2",
  audience: "Voksne",
  language: "Norsk",
  numberOfSessions: 6,
  durationMinutes: 120,
};

function proposalFromDefaults(info: PracticalInfo): Proposal {
  return {
    title: "",
    description: "",
    learningGoals: "",
    targetAudience: "",
    language: info.language,
    level: info.level,
    priceText: "",
  };
}

export default function GenerateCoursePage() {
  return (
    <AcademyGate>
      <GenerateCourseContent />
    </AcademyGate>
  );
}

function GenerateCourseContent() {
  const locale = useLocale();
  const router = useRouter();
  const { user } = useUserProfile();
  const [info, setInfo] = useState<PracticalInfo>(DEFAULT_PRACTICAL_INFO);
  const [proposal, setProposal] = useState<Proposal>(() => proposalFromDefaults(DEFAULT_PRACTICAL_INFO));
  const [coursePlan, setCoursePlan] = useState<CoursePlanSession[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function updateInfo<K extends keyof PracticalInfo>(key: K, value: PracticalInfo[K]) {
    setInfo((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "subject") {
        const subject = String(value);
        next.subtopic = SUBTOPICS[subject]?.[0]?.value ?? "annet";
      }
      if (key === "language" || key === "level") {
        setProposal((current) => ({
          ...current,
          ...(key === "language" ? { language: String(value) } : {}),
          ...(key === "level" ? { level: String(value) } : {}),
        }));
      }
      return next;
    });
  }

  function updateProposal<K extends keyof Proposal>(key: K, value: Proposal[K]) {
    setProposal((prev) => ({ ...prev, [key]: value }));
  }

  function updateSession<K extends keyof Omit<CoursePlanSession, "sessionNumber">>(
    index: number,
    key: K,
    value: CoursePlanSession[K]
  ) {
    setCoursePlan((prev) =>
      prev.map((session, sessionIndex) =>
        sessionIndex === index ? { ...session, [key]: value } : session
      )
    );
  }

  async function generateProposal() {
    if (!user || generating) return;

    try {
      setGenerating(true);
      setError("");
      const token = await user.getIdToken();
      const res = await fetch("/api/teacher/courses/generate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(info),
      });
      const data = (await res.json().catch(() => ({}))) as {
        proposal?: Partial<Proposal>;
        error?: string;
      };

      if (!res.ok || !data.proposal) throw new Error(data.error || "Could not generate course");

      setProposal({
        title: data.proposal.title ?? "",
        description: data.proposal.description ?? "",
        learningGoals: data.proposal.learningGoals ?? "",
        targetAudience: data.proposal.targetAudience ?? "",
        language: data.proposal.language ?? info.language,
        level: data.proposal.level ?? info.level,
        priceText: data.proposal.priceText ?? "",
      });
    } catch (err) {
      console.error("Failed to generate course proposal", err);
      setError(err instanceof Error ? err.message : "Kunne ikke generere kursforslag akkurat nå.");
    } finally {
      setGenerating(false);
    }
  }

  async function saveCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || saving) return;

    const title = proposal.title.trim();
    if (!title) {
      setError("Tittel må fylles ut før kurset kan lagres.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      const token = await user.getIdToken();
      const res = await fetch("/api/teacher/courses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...DEFAULT_COURSE_FORM,
          ...proposal,
          maxParticipants: DEFAULT_COURSE_FORM.maxParticipants,
          numberOfSessions: info.numberOfSessions,
          numberOfWeeks: info.numberOfSessions,
          sessionDurationMinutes: info.durationMinutes,
          coursePlan: normalizeCoursePlan(coursePlan),
          status: "draft",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { courseId?: string; error?: string };
      if (!res.ok || !data.courseId) throw new Error(data.error || "Could not save course");

      router.push(`/${locale}/teacher/courses/${data.courseId}`);
    } catch (err) {
      console.error("Failed to save generated course", err);
      setError("Kurset kunne ikke lagres akkurat nå.");
      setSaving(false);
    }
  }

  async function generateCoursePlan() {
    if (!user || generatingPlan) return;

    if (!proposal.title.trim() || !proposal.description.trim()) {
      setError("Generer eller fyll inn kursnavn og beskrivelse før du lager kursplan.");
      return;
    }

    try {
      setGeneratingPlan(true);
      setError("");
      const token = await user.getIdToken();
      const res = await fetch("/api/teacher/courses/generate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...info,
          kind: "coursePlan",
          title: proposal.title,
          description: proposal.description,
          learningGoals: proposal.learningGoals,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        coursePlan?: CoursePlanSession[];
        error?: string;
      };

      if (!res.ok || !data.coursePlan) throw new Error(data.error || "Could not generate course plan");

      setCoursePlan(normalizeCoursePlan(data.coursePlan));
    } catch (err) {
      console.error("Failed to generate course plan", err);
      setError(err instanceof Error ? err.message : "Kunne ikke generere kursplan akkurat nå.");
    } finally {
      setGeneratingPlan(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl">
      <form onSubmit={saveCourse} className="grid gap-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-800">
                321Academy Beta
              </div>
              <h1 className="m-0 mt-3 text-2xl font-black text-slate-950">
                Generate course
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Første steg lager den administrative kursrammen. Innhold per kursdag bygger vi
                videre på etter at denne flyten sitter godt.
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={() => router.push(`/${locale}/teacher/courses`)}>
              Back to courses
            </Button>
          </div>
        </section>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="m-0 text-lg font-extrabold text-slate-950">1. Praktisk info</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Velg rammene først. KI bruker dette til å foreslå navn, beskrivelse og læringsmål.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Fag / tema">
              <Select value={info.subject} onChange={(event) => updateInfo("subject", event.target.value)}>
                {SUBJECTS.map((subject) => (
                  <option key={subject.value} value={subject.value}>
                    {subject.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Undertema">
              <Select value={info.subtopic} onChange={(event) => updateInfo("subtopic", event.target.value)}>
                {(SUBTOPICS[info.subject] ?? SUBTOPICS.annet).map((subtopic) => (
                  <option key={subtopic.value} value={subtopic.value}>
                    {subtopic.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Nivå">
              <Select value={info.level} onChange={(event) => updateInfo("level", event.target.value)}>
                {LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Gruppe">
              <Select value={info.audience} onChange={(event) => updateInfo("audience", event.target.value)}>
                {AUDIENCES.map((audience) => (
                  <option key={audience} value={audience}>
                    {audience}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Språk for kurset">
              <Select value={info.language} onChange={(event) => updateInfo("language", event.target.value)}>
                {LANGUAGES.map((language) => (
                  <option key={language} value={language}>
                    {language}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Antall samlinger">
              <Input
                type="number"
                min={1}
                max={30}
                value={info.numberOfSessions}
                onChange={(event) => updateInfo("numberOfSessions", Number(event.target.value))}
              />
            </Field>

            <Field label="Tid per samling">
              <Select
                value={String(info.durationMinutes)}
                onChange={(event) => updateInfo("durationMinutes", Number(event.target.value))}
              >
                <option value="45">45 minutter</option>
                <option value="60">60 minutter</option>
                <option value="90">90 minutter</option>
                <option value="120">120 minutter</option>
                <option value="180">180 minutter</option>
              </Select>
            </Field>
          </div>

          <Field label="Fortell KI hva kurset skal handle om">
            <Textarea
              value={info.additionalDescription}
              onChange={(event) => updateInfo("additionalDescription", event.target.value)}
              rows={4}
              maxLength={1200}
              placeholder="F.eks. mer om verb i preteritum, hverdagsdialoger på jobb, eller hvordan man snakker med skolen og helsetjenesten."
            />
          </Field>

          <div className="flex justify-end">
            <Button type="button" variant="primary" disabled={generating} onClick={() => void generateProposal()}>
              {generating ? "Generating..." : "Generate administrative plan"}
            </Button>
          </div>
        </section>

        <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="m-0 text-lg font-extrabold text-slate-950">2. Administrativt forslag</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Rediger forslaget før du lagrer. Kurset lagres som draft.
            </p>
          </div>

          <Field label="Kursnavn">
            <Input value={proposal.title} onChange={(event) => updateProposal("title", event.target.value)} />
          </Field>

          <Field label="Kursbeskrivelse">
            <Textarea
              value={proposal.description}
              onChange={(event) => updateProposal("description", event.target.value)}
              rows={4}
            />
          </Field>

          <Field label="Læringsmål">
            <Textarea
              value={proposal.learningGoals}
              onChange={(event) => updateProposal("learningGoals", event.target.value)}
              rows={5}
            />
          </Field>

          <Field label="Målgruppe">
            <Textarea
              value={proposal.targetAudience}
              onChange={(event) => updateProposal("targetAudience", event.target.value)}
              rows={3}
            />
          </Field>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Språk">
              <Input value={proposal.language} onChange={(event) => updateProposal("language", event.target.value)} />
            </Field>
            <Field label="Nivå">
              <Input value={proposal.level} onChange={(event) => updateProposal("level", event.target.value)} />
            </Field>
            <Field label="Pris/kort tekst">
              <Input
                value={proposal.priceText}
                onChange={(event) => updateProposal("priceText", event.target.value)}
                placeholder="F.eks. Gratis pilot"
              />
            </Field>
          </div>
        </section>

        <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="m-0 text-lg font-extrabold text-slate-950">3. Forslag til kursdager</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Lag en enkel retning for hver samling. Dette er bare forslag, ikke ferdige oppgaver
              eller genererte lessons.
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="primary"
              disabled={generatingPlan}
              onClick={() => void generateCoursePlan()}
            >
              {generatingPlan ? "Generating..." : "Generate session suggestions"}
            </Button>
          </div>

          {coursePlan.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
              Ingen kursdager er foreslått ennå.
            </div>
          ) : (
            <div className="grid gap-4">
              {coursePlan.map((session, index) => (
                <div key={session.sessionNumber} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                    Samling {session.sessionNumber}
                  </div>
                  <Field label="Tittel">
                    <Input value={session.title} onChange={(event) => updateSession(index, "title", event.target.value)} />
                  </Field>
                  <Field label="Kort beskrivelse">
                    <Textarea
                      value={session.description}
                      onChange={(event) => updateSession(index, "description", event.target.value)}
                      rows={3}
                    />
                  </Field>
                  <Field label="Forslag til innholdstyper">
                    <Textarea
                      value={session.contentSuggestions}
                      onChange={(event) => updateSession(index, "contentSuggestions", event.target.value)}
                      rows={3}
                      placeholder="F.eks. kort lesetekst, dialog, begrepsarbeid, samtaleøvelse."
                    />
                  </Field>
                  <Field label="Lett hjemmeforslag">
                    <Textarea
                      value={session.homework}
                      onChange={(event) => updateSession(index, "homework", event.target.value)}
                      rows={2}
                    />
                  </Field>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => router.push(`/${locale}/teacher/courses/new`)}>
            Manual create
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Saving..." : "Save draft course"}
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
