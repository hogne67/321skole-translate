"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, CheckCircle2 } from "lucide-react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { SearchableSelect } from "@/components/SearchableSelect";
import { NO_MUNICIPALITIES } from "@/lib/geo/noMunicipalities";
import {
  DEFAULT_CURRICULUM_SOURCE,
  DEFAULT_LOCAL_FRAMEWORK,
  DEFAULT_PLANNER_DOCUMENT,
  DEFAULT_PLANNER_FRAME,
  type PlannerFrame,
  type PlannerSchoolCalendar,
  type PlannerSchoolCalendarSource,
} from "@/lib/planner/types";
import type { OfficialCurriculumBasis } from "@/lib/planner/officialCurriculum";
import { useUserProfile } from "@/lib/useUserProfile";
import { OfficialBasisView } from "./OfficialBasisView";

const COUNTRIES = ["Norge", "England", "Brasil", "Egendefinert"];
const SCHOOL_TYPES = ["Barneskole", "Ungdomsskole", "Videregående", "Voksenopplæring"];
const LEVELS_BY_SCHOOL_TYPE: Record<string, string[]> = {
  Barneskole: ["1. trinn", "2. trinn", "3. trinn", "4. trinn", "5. trinn", "6. trinn", "7. trinn"],
  Ungdomsskole: ["8. trinn", "9. trinn", "10. trinn"],
  Videregående: ["Vg1", "Vg2", "Vg3", "Vg3 påbygg"],
  Voksenopplæring: ["FOV modul 1", "FOV modul 2", "FOV modul 3", "FOV modul 4", "FOV modul 4S", "FOV modul 4Y"],
};
const GENERAL_SUBJECT_OPTIONS = [
  { value: "Norsk", label: "Norsk" },
  { value: "Matematikk", label: "Matematikk" },
  { value: "Engelsk", label: "Engelsk" },
  { value: "Naturfag", label: "Naturfag" },
  { value: "Samfunnsfag", label: "Samfunnsfag" },
  { value: "KRLE", label: "KRLE" },
  { value: "Kroppsøving", label: "Kroppsøving" },
  { value: "Kunst og håndverk", label: "Kunst og håndverk" },
  { value: "Musikk", label: "Musikk" },
  { value: "Mat og helse", label: "Mat og helse" },
  { value: "Annet fag / yrkesfag", label: "Annet fag / yrkesfag" },
];
const FOV_SUBJECT_OPTIONS = [
  { value: "Norsk - FOV", label: "Norsk - FOV" },
  {
    value: "Norsk for språklige minoriteter - FOV",
    label: "Norsk for språklige minoriteter - FOV (norsk for innvandrere)",
  },
  { value: "Matematikk - FOV", label: "Matematikk - FOV" },
  { value: "Engelsk - FOV", label: "Engelsk - FOV" },
  { value: "Samfunnsfag - FOV", label: "Samfunnsfag - FOV" },
  { value: "Naturfag - FOV", label: "Naturfag - FOV" },
  { value: "Annet fag / yrkesfag", label: "Annet fag / yrkesfag" },
];
const PLAN_LANGUAGE_OPTIONS = [
  { value: "Norsk", label: "Norsk" },
  { value: "Engelsk", label: "Engelsk" },
  { value: "Portugisisk", label: "Portugisisk" },
  { value: "Spansk", label: "Spansk" },
  { value: "Arabisk", label: "Arabisk" },
  { value: "Somali", label: "Somali" },
  { value: "Ukrainsk", label: "Ukrainsk" },
];
const MUNICIPALITY_OPTIONS = NO_MUNICIPALITIES.map((municipality) => ({
  value: municipality.name,
  label: municipality.name,
}));

function currentSchoolYear() {
  const now = new Date();
  const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}/${startYear + 1}`;
}

function profileCountry(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "no" || normalized === "norway" || normalized === "norge") return "Norge";
  if (normalized === "gb" || normalized === "england" || normalized === "uk") return "England";
  if (normalized === "br" || normalized === "brazil" || normalized === "brasil") return "Brasil";
  return value.trim() || "Norge";
}

export default function NewPlannerPage() {
  const locale = useLocale();
  const router = useRouter();
  const { user, profile, loading: profileLoading } = useUserProfile();
  const profileApplied = useRef(false);
  const [frame, setFrame] = useState<PlannerFrame>(() => ({
    ...DEFAULT_PLANNER_FRAME,
    schoolYear: currentSchoolYear(),
    schoolType: "",
    subject: "",
    level: "",
    language: "Norsk",
  }));
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [subjectChoice, setSubjectChoice] = useState("");
  const [error, setError] = useState("");
  const [officialBasis, setOfficialBasis] = useState<OfficialCurriculumBasis | null>(null);
  const [officialFetchFailed, setOfficialFetchFailed] = useState(false);
  const [fetchingOfficialBasis, setFetchingOfficialBasis] = useState(false);
  const [creatingGroundPlan, setCreatingGroundPlan] = useState(false);

  useEffect(() => {
    if (profileLoading || profileApplied.current) return;
    profileApplied.current = true;

    const country = profileCountry(profile?.org?.country || "Norge");
    const municipality = profile?.org?.municipality || profile?.municipality || "";
    const teacherName = profile?.displayName || user?.displayName || "";
    const municipalityMatch = NO_MUNICIPALITIES.find(
      (item) => item.name.toLocaleLowerCase("nb-NO") === municipality.toLocaleLowerCase("nb-NO")
    );

    setFrame((prev) => ({
      ...prev,
      country,
      municipality,
      teacherName,
      schoolCalendar: {
        ...prev.schoolCalendar,
        municipalityCode: municipalityMatch?.code || "",
      },
    }));
  }, [profile, profileLoading, user]);

  function updateFrame<K extends keyof PlannerFrame>(key: K, value: PlannerFrame[K]) {
    setFrame((prev) => ({ ...prev, [key]: value }));
  }

  function updateMunicipality(municipality: string) {
    const match = NO_MUNICIPALITIES.find(
      (item) => item.name.toLocaleLowerCase("nb-NO") === municipality.toLocaleLowerCase("nb-NO")
    );
    setFrame((prev) => ({
      ...prev,
      municipality,
      schoolCalendar: {
        ...prev.schoolCalendar,
        municipalityCode: match?.code || "",
      },
    }));
  }

  function updateCalendar<K extends keyof PlannerSchoolCalendar>(
    key: K,
    value: PlannerSchoolCalendar[K]
  ) {
    setFrame((prev) => ({
      ...prev,
      schoolCalendar: {
        ...prev.schoolCalendar,
        [key]: value,
      },
    }));
  }

  const issues = [
    !frame.country.trim() ? "Velg land" : "",
    !frame.municipality.trim() ? "Fyll ut kommune" : "",
    !frame.schoolName.trim() ? "Fyll ut navn på skole" : "",
    !frame.teacherName.trim() ? "Fyll ut navn på lærer" : "",
    !frame.schoolYear.trim() ? "Fyll ut skoleår" : "",
    frame.schoolCalendar.source === "manual" && !frame.schoolCalendar.firstSchoolDay
      ? "Fyll ut første skoledag"
      : "",
    frame.schoolCalendar.source === "manual" && !frame.schoolCalendar.lastSchoolDay
      ? "Fyll ut siste skoledag"
      : "",
  ].filter(Boolean);

  function reviewStep(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (issues.length > 0) {
      setError(`Kontroller dette først: ${issues.join(", ")}.`);
      return;
    }
    setError("");
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const curriculumIssues = [
    !frame.schoolType.trim() ? "Velg skoleslag" : "",
    !frame.level.trim() ? "Velg trinn eller nivå" : "",
    !frame.subject.trim() ? "Velg eller skriv fag" : "",
  ].filter(Boolean);

  function reviewCurriculumSelection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (curriculumIssues.length > 0) {
      setError(`Kontroller dette først: ${curriculumIssues.join(", ")}.`);
      return;
    }
    setError("");
    setStep(3);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function fetchOfficialBasis() {
    if (!user || fetchingOfficialBasis) return;
    try {
      setFetchingOfficialBasis(true);
      setError("");
      setOfficialFetchFailed(false);
      const token = await user.getIdToken();
      const response = await fetch("/api/teacher/planner/official-basis", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          country: frame.country,
          subject: frame.subject,
          level: frame.level,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        basis?: OfficialCurriculumBasis;
        error?: string;
      };
      if (!response.ok || !data.basis) {
        throw new Error(data.error || "Det offisielle læreplangrunnlaget kunne ikke hentes.");
      }
      setOfficialBasis(data.basis);
      setOfficialFetchFailed(false);
    } catch (fetchError) {
      setOfficialBasis(null);
      setOfficialFetchFailed(true);
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Det offisielle læreplangrunnlaget kunne ikke hentes."
      );
    } finally {
      setFetchingOfficialBasis(false);
    }
  }

  async function createGroundPlan() {
    if (!user || !officialBasis || creatingGroundPlan) return;
    try {
      setCreatingGroundPlan(true);
      setError("");
      const token = await user.getIdToken();
      const response = await fetch("/api/teacher/planner", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "draft",
          frame,
          curriculum: {
            ...DEFAULT_CURRICULUM_SOURCE,
            framework: `${officialBasis.source.title} (${officialBasis.source.planCode})`,
          },
          officialBasis,
          localFramework: DEFAULT_LOCAL_FRAMEWORK,
          document: {
            ...DEFAULT_PLANNER_DOCUMENT,
            title: `${frame.subject} ${frame.level} – ${frame.schoolYear}`,
            description: `Offisiell grunnplan for ${frame.subject}, ${frame.level}, ${frame.schoolYear}.`,
            subjectRelevance: `${officialBasis.source.title}. Planen bygger på verifisert læreplangrunnlag fra Utdanningsdirektoratet, hentet ${formatDateTime(officialBasis.source.fetchedAt)}.`,
            coreValues: "Rediger lokale verdier og prioriteringer her dersom skolen har egne føringer.",
            coreElements: formatCurriculumSectionsForDocument(officialBasis.coreElements),
            interdisciplinaryThemes: formatCurriculumSectionsForDocument(officialBasis.interdisciplinaryThemes),
            basicSkills: formatCurriculumSectionsForDocument(officialBasis.basicSkills),
            learningGoals: `Kompetansemålene ligger kontrollert under Offisielt grunnlag og fordeles videre i periodeplanene. Valgt målsett: ${officialBasis.competenceLevel}.`,
            assessmentForms: "Fyll inn vurderingsformer etter lokale føringer og periodenes mål.",
            workMethods: "Fyll inn arbeidsmåter etter lokale rammer, elevgruppe og periodenes innhold.",
            annualOverview: "Årsoversikten bygges videre når perioder opprettes og mål fordeles.",
            reflection: "Bruk refleksjonsfanen gjennom året, og oppsummer erfaringer før planen kopieres til neste skoleår.",
          },
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { plannerId?: string; error?: string };
      if (!response.ok || !data.plannerId) {
        throw new Error(data.error || "Grunnplanen kunne ikke opprettes.");
      }
      router.push(`/${locale}/teacher/planner/${data.plannerId}?section=Lokalt%20grunnlag`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Grunnplanen kunne ikke opprettes.");
      setCreatingGroundPlan(false);
    }
  }

  async function createManualGroundPlan() {
    if (!user || creatingGroundPlan) return;
    try {
      setCreatingGroundPlan(true);
      setError("");
      const token = await user.getIdToken();
      const response = await fetch("/api/teacher/planner", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "draft",
          frame,
          curriculum: {
            ...DEFAULT_CURRICULUM_SOURCE,
            type: "custom",
            framework: "Manuelt grunnlag - ikke hentet fra Udir",
            customText: "",
          },
          officialBasis: null,
          localFramework: DEFAULT_LOCAL_FRAMEWORK,
          document: {
            ...DEFAULT_PLANNER_DOCUMENT,
            title: `${frame.subject} ${frame.level} – ${frame.schoolYear}`,
            description: `Manuell grunnplan for ${frame.subject}, ${frame.level}, ${frame.schoolYear}.`,
            subjectRelevance:
              "Offisielt læreplangrunnlag er ikke hentet. Lærer må lime inn eller fylle ut korrekt grunnlag før perioder og mål fordeles.",
            coreValues: "Fyll inn relevante verdier og lokale føringer.",
            coreElements: "Fyll inn kjerneelementer eller tilsvarende grunnlag manuelt.",
            interdisciplinaryThemes: "Fyll inn tverrfaglige temaer eller lokale satsinger manuelt.",
            basicSkills: "Fyll inn grunnleggende ferdigheter eller tilsvarende ferdighetsområder manuelt.",
            learningGoals: "Fyll inn kompetansemål/læringsmål manuelt før de fordeles i perioder.",
            assessmentForms: "Fyll inn vurderingsformer etter lokale føringer.",
            workMethods: "Fyll inn arbeidsmåter etter lokale rammer og elevgruppe.",
            annualOverview: "Årsoversikten bygges videre når grunnlaget og periodene er klare.",
            reflection: "Bruk refleksjonsfanen gjennom året, og oppsummer erfaringer før planen kopieres til neste skoleår.",
          },
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { plannerId?: string; error?: string };
      if (!response.ok || !data.plannerId) {
        throw new Error(data.error || "Grunnplanen kunne ikke opprettes.");
      }
      router.push(`/${locale}/teacher/planner/${data.plannerId}?section=Offisielt%20grunnlag`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Grunnplanen kunne ikke opprettes.");
      setCreatingGroundPlan(false);
    }
  }

  if (step === 3) {
    return (
      <main className="mx-auto grid max-w-4xl gap-5">
        <header className="rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" aria-hidden="true" />
            <div>
              <p className="m-0 text-xs font-black uppercase text-emerald-800">Steg 1 er klart</p>
              <h1 className="m-0 mt-1 text-2xl font-black text-slate-950">Grunnopplysninger og skolerute</h1>
              <p className="mb-0 mt-2 text-sm leading-6 text-slate-600">
                Ingen læreplantekst eller pedagogiske forslag er generert. Opplysningene er nå klare for et kontrollert oppslag mot offisiell læreplan.
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-5">
          <SummaryRow label="Land" value={frame.country} />
          <SummaryRow label="Kommune" value={frame.municipality} />
          <SummaryRow label="Skole" value={frame.schoolName} />
          <SummaryRow label="Lærer" value={frame.teacherName} />
          <SummaryRow label="Skoleår" value={frame.schoolYear} />
          <SummaryRow label="Skoleslag" value={frame.schoolType} />
          <SummaryRow label="Trinn / nivå" value={frame.level} />
          <SummaryRow label="Fag" value={frame.subject} />
          <SummaryRow label="Planspråk" value={frame.language} />
          <SummaryRow
            label="Skolerute"
            value={
              frame.schoolCalendar.source === "manual"
                ? "Fylt ut manuelt"
                : `Ikke hentet ennå. Fyll ut manuelt hvis datoene skal brukes.`
            }
          />
          {frame.schoolCalendar.source === "manual" ? (
            <>
              <SummaryRow label="Første skoledag" value={frame.schoolCalendar.firstSchoolDay} />
              <SummaryRow label="Siste skoledag" value={frame.schoolCalendar.lastSchoolDay} />
            </>
          ) : null}
        </section>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
            {error}
          </div>
        ) : null}

        {officialBasis ? <OfficialBasisView basis={officialBasis} selectedLevel={frame.level} /> : null}

        {officialBasis ? (
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="m-0 max-w-2xl text-sm font-semibold leading-6 text-emerald-950">
              Bekreft grunnlaget for å lagre Udir-kilden og åpne den lokale årsrammen. Det opprettes fortsatt ingen perioder eller aktiviteter.
            </p>
            <Button
              type="button"
              variant="primary"
              disabled={creatingGroundPlan}
              onClick={() => void createGroundPlan()}
            >
              {creatingGroundPlan ? "Oppretter grunnplan..." : "Bekreft og opprett grunnplan"}
            </Button>
          </section>
        ) : null}

        {!officialBasis && officialFetchFailed ? (
          <section className="grid gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="m-0 text-sm font-semibold leading-6 text-amber-950">
              Du kan opprette planen uten hentet Udir-grunnlag, men den blir merket som manuelt grunnlag.
              Læreren må lime inn eller fylle ut korrekt offisiell informasjon før mål fordeles.
            </p>
            <div>
              <Button
                type="button"
                variant="secondary"
                disabled={creatingGroundPlan}
                onClick={() => void createManualGroundPlan()}
              >
                {creatingGroundPlan ? "Oppretter plan..." : "Opprett plan med manuelt grunnlag"}
              </Button>
            </div>
          </section>
        ) : null}

        <div className="flex flex-wrap justify-between gap-3">
          <Button type="button" variant="secondary" onClick={() => { setError(""); setOfficialBasis(null); setStep(2); }}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Endre fag og trinn
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={fetchingOfficialBasis}
            onClick={() => void fetchOfficialBasis()}
          >
            {fetchingOfficialBasis
              ? "Henter og kontrollerer..."
              : officialBasis
                ? "Hent på nytt fra Udir"
                : "Hent offisielt læreplangrunnlag"}
          </Button>
        </div>
      </main>
    );
  }

  if (step === 2) {
    const levelOptions = LEVELS_BY_SCHOOL_TYPE[frame.schoolType] || [];
    const subjectOptions = frame.schoolType === "Voksenopplæring" ? FOV_SUBJECT_OPTIONS : GENERAL_SUBJECT_OPTIONS;
    return (
      <main className="mx-auto max-w-4xl">
        <form onSubmit={reviewCurriculumSelection} className="grid gap-5">
          <header className="rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="m-0 text-xs font-black uppercase text-emerald-800">Steg 2 av 3</p>
                <h1 className="m-0 mt-2 text-2xl font-black text-slate-950">Finn riktig læreplan</h1>
                <p className="mb-0 mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Skoleslag, trinn og fag brukes bare til å identifisere riktig offisiell læreplan og riktig timetall.
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={() => { setError(""); setStep(1); }}>
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                Tilbake
              </Button>
            </div>
          </header>

          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
              {error}
            </div>
          ) : null}

          <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Skoleslag">
                <Select
                  value={frame.schoolType}
                  onChange={(event) => {
                    updateFrame("schoolType", event.target.value);
                    updateFrame("level", "");
                    updateFrame("subject", "");
                    setSubjectChoice("");
                    setOfficialBasis(null);
                  }}
                >
                  <option value="">Velg skoleslag</option>
                  {SCHOOL_TYPES.map((schoolType) => (
                    <option key={schoolType} value={schoolType}>{schoolType}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Trinn eller nivå">
                <Select
                  value={frame.level}
                  onChange={(event) => {
                    updateFrame("level", event.target.value);
                    setOfficialBasis(null);
                  }}
                  disabled={!frame.schoolType}
                >
                  <option value="">{frame.schoolType ? "Velg trinn eller nivå" : "Velg skoleslag først"}</option>
                  {levelOptions.map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Fag">
                <Select
                  value={subjectChoice}
                  onChange={(event) => {
                    const choice = event.target.value;
                    setSubjectChoice(choice);
                    updateFrame("subject", choice === "Annet fag / yrkesfag" ? "" : choice);
                    setOfficialBasis(null);
                  }}
                >
                  <option value="">Velg fag</option>
                  {subjectOptions.map((subject) => (
                    <option key={subject.value} value={subject.value}>{subject.label}</option>
                  ))}
                </Select>
              </Field>

              {subjectChoice === "Annet fag / yrkesfag" ? (
                <Field label="Navn på fag eller programfag">
                  <Input
                    value={frame.subject}
                    onChange={(event) => updateFrame("subject", event.target.value)}
                    placeholder="Skriv offisielt fagnavn"
                  />
                </Field>
              ) : null}

              <Field label="Planspråk">
                <Select value={frame.language} onChange={(event) => updateFrame("language", event.target.value)}>
                  {PLAN_LANGUAGE_OPTIONS.map((language) => (
                    <option key={language.value} value={language.value}>{language.label}</option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">
              Offisielle Udir-mål hentes og vises på norsk. Planspråket brukes bare til lokale/genererte felt som periodemål, arbeidsmåter, vurdering og ukeplaner.
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-sm font-semibold text-slate-600">
              {curriculumIssues.length === 0
                ? "Klar til å kontrollere valget."
                : `${curriculumIssues.length} opplysninger gjenstår.`}
            </p>
            <Button type="submit" variant="primary">Kontroller valget</Button>
          </div>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl">
      <form onSubmit={reviewStep} className="grid gap-5">
        <header className="rounded-lg border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="m-0 text-xs font-black uppercase text-emerald-800">Steg 1 av 3</p>
              <h1 className="m-0 mt-2 text-2xl font-black text-slate-950">Grunnopplysninger og skolerute</h1>
              <p className="mb-0 mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Først registrerer vi bare sikre opplysninger om skolen og skoleåret. Læreplan og faglig innhold kommer i neste steg.
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={() => router.push(`/${locale}/teacher/planner`)}>
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Tilbake
            </Button>
          </div>
        </header>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Land">
              <Select value={frame.country} onChange={(event) => updateFrame("country", event.target.value)}>
                {COUNTRIES.map((country) => (
                  <option key={country} value={country}>{country}</option>
                ))}
              </Select>
            </Field>

            {frame.country === "Norge" ? (
              <FieldGroup label="Kommune">
                <SearchableSelect
                  value={frame.municipality}
                  options={MUNICIPALITY_OPTIONS}
                  placeholder="Søk etter kommune"
                  onChange={updateMunicipality}
                  fullWidth
                  resultLabel="kommuner"
                  showOptionValue={false}
                />
              </FieldGroup>
            ) : (
              <Field label="Kommune eller område">
                <Input
                  value={frame.municipality}
                  onChange={(event) => updateMunicipality(event.target.value)}
                  placeholder="Skriv kommune eller område"
                />
              </Field>
            )}

            <Field label="Navn på skole">
              <Input
                value={frame.schoolName}
                onChange={(event) => updateFrame("schoolName", event.target.value)}
                placeholder="Skriv skolens navn"
              />
            </Field>

            <Field label="Navn på lærer">
              <Input
                value={frame.teacherName}
                onChange={(event) => updateFrame("teacherName", event.target.value)}
                placeholder={profileLoading ? "Henter fra profil..." : "Skriv lærerens navn"}
              />
            </Field>

            <Field label="Skoleår">
              <Input
                value={frame.schoolYear}
                onChange={(event) => updateFrame("schoolYear", event.target.value)}
                placeholder="2026/2027"
              />
            </Field>

            <Field label="Skolerute">
              <Select
                value={frame.schoolCalendar.source}
                onChange={(event) =>
                  updateCalendar("source", event.target.value as PlannerSchoolCalendarSource)
                }
              >
                <option value="municipality">
                  {frame.municipality
                    ? `Kommunal skolerute for ${frame.municipality} - ikke hentet ennå`
                    : "Kommunal skolerute - ikke hentet ennå"}
                </option>
                <option value="manual">Fyll ut selv</option>
              </Select>
            </Field>
          </div>

          {frame.schoolCalendar.source === "municipality" ? (
            <div className="flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">
              <CalendarDays className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <p className="m-0">
                Skoleruten hentes ikke automatisk ennå. Velg «Fyll ut selv» hvis perioder skal følge faktiske datoer.
              </p>
            </div>
          ) : (
            <ManualSchoolCalendar calendar={frame.schoolCalendar} onChange={updateCalendar} />
          )}
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 text-sm font-semibold text-slate-600">
            {issues.length === 0 ? "Alle grunnopplysninger er fylt ut." : `${issues.length} opplysninger gjenstår.`}
          </p>
          <Button type="submit" variant="primary">
            Kontroller og fortsett
          </Button>
        </div>
      </form>
    </main>
  );
}

function formatCurriculumSectionsForDocument(sections: OfficialCurriculumBasis["coreElements"]) {
  return sections
    .map((section) => [section.title, section.text].filter(Boolean).join(": "))
    .filter(Boolean)
    .join("\n\n");
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function ManualSchoolCalendar({
  calendar,
  onChange,
}: {
  calendar: PlannerSchoolCalendar;
  onChange: <K extends keyof PlannerSchoolCalendar>(key: K, value: PlannerSchoolCalendar[K]) => void;
}) {
  return (
    <section className="grid gap-4 border-t border-slate-200 pt-4">
      <div>
        <h2 className="m-0 text-base font-black text-slate-950">Fyll ut skoleruten</h2>
        <p className="mb-0 mt-1 text-sm leading-6 text-slate-600">
          Første og siste skoledag er obligatorisk. Ferier og fridager kan fylles ut når de er kjent.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <DateField
          label="Første skoledag"
          value={calendar.firstSchoolDay}
          onChange={(value) => onChange("firstSchoolDay", value)}
        />
        <DateField
          label="Siste skoledag"
          value={calendar.lastSchoolDay}
          onChange={(value) => onChange("lastSchoolDay", value)}
        />
        <DateRange
          label="Høstferie"
          start={calendar.autumnBreakStart}
          end={calendar.autumnBreakEnd}
          onStart={(value) => onChange("autumnBreakStart", value)}
          onEnd={(value) => onChange("autumnBreakEnd", value)}
        />
        <DateRange
          label="Juleferie"
          start={calendar.christmasBreakStart}
          end={calendar.christmasBreakEnd}
          onStart={(value) => onChange("christmasBreakStart", value)}
          onEnd={(value) => onChange("christmasBreakEnd", value)}
        />
        <DateRange
          label="Vinterferie"
          start={calendar.winterBreakStart}
          end={calendar.winterBreakEnd}
          onStart={(value) => onChange("winterBreakStart", value)}
          onEnd={(value) => onChange("winterBreakEnd", value)}
        />
        <DateRange
          label="Påskeferie"
          start={calendar.easterBreakStart}
          end={calendar.easterBreakEnd}
          onStart={(value) => onChange("easterBreakStart", value)}
          onEnd={(value) => onChange("easterBreakEnd", value)}
        />
        <DateField label="1. mai" value={calendar.mayDay} onChange={(value) => onChange("mayDay", value)} />
        <DateField
          label="17. mai"
          value={calendar.constitutionDay}
          onChange={(value) => onChange("constitutionDay", value)}
        />
        <DateField
          label="Kristi himmelfartsdag"
          value={calendar.ascensionDay}
          onChange={(value) => onChange("ascensionDay", value)}
        />
        <DateField label="Pinse" value={calendar.whitMonday} onChange={(value) => onChange("whitMonday", value)} />
      </div>

      <Field label="Planleggingsdager / fridager">
        <Textarea
          value={calendar.planningDays}
          onChange={(event) => onChange("planningDays", event.target.value)}
          rows={4}
          placeholder="Skriv én dato eller periode per linje"
        />
      </Field>
      <Field label="Andre dager">
        <Textarea
          value={calendar.otherDays}
          onChange={(event) => onChange("otherDays", event.target.value)}
          rows={4}
          placeholder="Legg til andre lokale fridager, halve dager eller merkedager"
        />
      </Field>
    </section>
  );
}

function DateRange({
  label,
  start,
  end,
  onStart,
  onEnd,
}: {
  label: string;
  start: string;
  end: string;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
}) {
  return (
    <fieldset className="grid gap-2 rounded-lg border border-slate-200 p-3">
      <legend className="px-1 text-sm font-black text-slate-800">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        <DateField label="Fra" value={start} onChange={onStart} />
        <DateField label="Til og med" value={end} onChange={onEnd} />
      </div>
    </fieldset>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <Input type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
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

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 text-sm font-bold text-slate-800">
      <span>{label}</span>
      {children}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-slate-100 pb-3 last:border-0 last:pb-0 sm:grid-cols-[180px_1fr]">
      <span className="text-sm font-bold text-slate-500">{label}</span>
      <span className="text-sm font-bold text-slate-950">{value || "Ikke fylt ut"}</span>
    </div>
  );
}
