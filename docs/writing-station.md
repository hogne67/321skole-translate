# Skrivestasjonen

## Formål

Skrivestasjonen er en egen modul for strukturert skriveopplæring. Eleven arbeider gjennom en skriveprosess med ide, planlegging, skriving, revisjon og ferdig tekst. KI er en begrenset støttespiller, ikke en tekstgenerator som overtar elevens arbeid.

Pedagogisk bakteppe er arbeidet med lese- og læringsstrategier fra "Teksten i bruk": eleven skal lære hvordan man nærmer seg en tekstoppgave før, under og etter skriving. Selv om skriveoppgaver ofte bygger på lest materiale, bilde eller fagstoff, er prosessen den samme: aktivere forkunnskap, organisere tanker, skrive, vurdere og forbedre.

## Hovedprinsipper

- Skrivestasjonen skal være helt egen og ikke blandes inn i eksisterende lesson-, quiz-, tavle- eller bildeoppgaver.
- Eleven eier teksten.
- Planlegging er en tydelig del av produktet, ikke et valgfritt lite felt.
- KI kan brukes som veileder, men med grenser.
- KI skal først og fremst stille spørsmål, gi ordhjelp, foreslå setningsstartere og sjekke kriterier.
- KI skal ikke skrive hele teksten for eleven.
- KI kan låses til eleven har tenkt eller skrevet selv, for eksempel minst 50 ord.
- Lærer skal kunne se elevens prosess, ikke bare ferdig tekst.
- Modulen må kunne kreve egen lisens eller egen feature-tilgang.

## Rom

Skrivestasjonen organiseres i rom. Rommene kan vises som faner eller steg i en venstremeny. Eleven kan gå fram og tilbake, men progresjon og KI kan ha pedagogiske porter.

### 1. Planleggingsrom

Her samler eleven ideer og struktur før selve teksten skrives.

For fortelling:

- Ide
- Hovedperson
- Ytre trekk
- Indre trekk
- Andre personer
- Miljø: hvor, når og sanser
- Handling
- Problem eller konflikt
- Løsning
- Starttype: in medias res, "Det var en gang", dialog eller beskrivelse

Planleggingsrommet skal kunne hentes fram mens eleven skriver.

### 2. Skriverom

Her skriver eleven teksten i deler.

For fortelling:

- Innledning
- Hoveddel
- Avslutning

Hver skriveseksjon kan vise relevant planlegging fra planleggingsrommet. Eksempel: innledning viser hovedperson, miljø og starttype.

### 3. Revisjonsrom

Her forbedrer eleven teksten.

For fortelling kan revisjonen sjekke:

- Har teksten en tydelig hovedperson?
- Kommer miljøt fram?
- Kommer problem eller konflikt fram?
- Henger handlingen sammen?
- Har teksten en løsning eller tydelig avslutning?
- Kan språket bli tydeligere eller mer levende?

### 4. Ferdig tekst

Her samles teksten i en helhet.

- Se hele teksten.
- Gjor siste sjekk.
- Lever til lærer.
- Senere: kopier, last ned eller skriv ut.

## Progresjon

Lærer kan velge progresjonsmodell.

- Fri flyt: eleven kan åpne alle rom og seksjoner.
- Veiledet flyt: eleven kan gå tilbake når som helst, men KI og levering krever minimumsarbeid.
- Låst steg-for-steg: eleven må fullføre ett steg før neste åpnes.

Anbefalt standard for MVP er veiledet flyt.

## KI-regler

KI-støtte styres både globalt for aktiviteten og lokalt per seksjon.

Eksempler på KI-handlinger:

- Still meg spørsmål.
- Gi meg hjelpeord.
- Gi meg setningsstartere.
- Sjekk om jeg har fått med kravene.
- Hjelp meg videre.
- Gi revisjonsråd.
- Foreslaa bedre ord.

Eksempler på låsing:

- KI i planlegging krever minst 2 utfylte planfelt.
- KI i skriverom krever minst 50 ord i seksjonen.
- KI i revisjon krever at eleven har et utkast.
- Levering krever minst ett utfylt skrivefelt.

Eksempel:

```text
Seksjon: Innledning
Fokus: Karakter og oppstart
Hjelpeord: Det var en gang..., I begynnelsen..., Hovedpersonen heter...
KI-grense: Maks 2 genereringer
KI låses opp etter: 50 ord eller utfylt hovedperson + miljø
KI-fokus: Sjekker om rammene for historien er satt: hvem, hvor og hva
```

## Roller

### Lærer

- Oppretter skriveaktivitet.
- Velger sjanger, nivå, språk og tema.
- Velger progresjonsmodell.
- Velger om KI er aktivert.
- Setter KI-grenser.
- Tildeler aktiviteten.
- Ser elevens plan, utkast, ferdig tekst og KI-bruk.

### Elev

- Åpner skriveaktivitet.
- Jobber i rom og seksjoner.
- Går tilbake til planlegging ved behov.
- Bruker KI innenfor lærerens grenser.
- Leverer ferdig tekst.

### Admin/skole

- Kan aktivere Skrivestasjonen som lisensiert modul.
- Kan styre om KI-støtte er tilgjengelig.

## MVP

Første versjon bør være liten, men arkitektonisk riktig.

- Egen toppnivå-modul: Skrivestasjon.
- Første sjanger: Fortelling.
- Lærer kan lage skriveaktivitet.
- Aktiviteten tildeles rett i Space i MVP.
- Elev kan jobbe gjennom planleggingsrom, skriverom, revisjonsrom og ferdig tekst.
- KI-støtte er begrenset per seksjon.
- KI kan låses opp etter elevens egen innsats.
- Elevens arbeid lagres fortløpende.
- Lærer kan lese plan og tekst.
- Feature flag eller lisenssjekk rundt modulen.
- Planleggingsrommet bygges først som strukturerte kort.

Utenfor MVP:

- Flere sjangre.
- Enkelt tankekart som alternativ visning.
- Visuelt tankekart med drag-and-drop.
- Bilde inne i artikkel.
- Bibliotek/publisering av skriveopplegg.
- Avansert sammenligning av tekst før og etter KI.
- Eksport til PDF.
- Egen inngang for betalende elever og foreldre.

## Første Sjangermal: Fortelling

```ts
type WritingGenre = "story";

type WritingActivityTemplate = {
  genre: WritingGenre;
  title: string;
  rooms: WritingRoomTemplate[];
};

type WritingRoomTemplate = {
  id: string;
  title: string;
  phase: "planning" | "drafting" | "revision" | "final";
  sections: WritingSectionTemplate[];
};

type WritingSectionTemplate = {
  id: string;
  title: string;
  prompt: string;
  fields: WritingFieldTemplate[];
  supportWords?: string[];
  aiPolicy?: WritingAiPolicy;
  gate?: WritingSectionGate;
};

type WritingFieldTemplate = {
  id: string;
  label: string;
  kind: "short_text" | "long_text" | "choice" | "chips";
  placeholder?: string;
  required?: boolean;
  options?: string[];
};

type WritingAiPolicy = {
  enabled: boolean;
  maxUses: number;
  allowedActions: WritingAiAction[];
  unlockRequirement?: WritingUnlockRequirement;
  focus: string;
  minWordsByLevel?: Partial<Record<WritingLevel, number>>;
};

type WritingLevel = "A1" | "A2" | "B1" | "B2" | "C1";

type WritingAiAction =
  | "ask_questions"
  | "suggest_words"
  | "sentence_starters"
  | "check_requirements"
  | "continue_guidance"
  | "revision_feedback";

type WritingUnlockRequirement =
  | { type: "min_words"; value: number }
  | { type: "min_fields"; value: number }
  | { type: "required_sections"; sectionIds: string[] };

type WritingSectionGate = {
  minWords?: number;
  minFieldsCompleted?: number;
  requiredSectionIds?: string[];
};
```

### Fortelling: Rom og seksjoner

#### Planleggingsrom

1. Ide
   - Hva handler fortellingen om?
   - Hva vil du at leseren skal lure på?

2. Hovedperson
   - Hvem er hovedpersonen?
   - Ytre trekk
   - Indre trekk
   - Hva vil hovedpersonen?

3. Andre personer
   - Hvem andre er med?
   - Er de venner, hjelpere eller motstandere?

4. Miljø
   - Hvor skjer det?
   - Når skjer det?
   - Hva kan man se, høre, lukte eller kjenne?

5. Problem eller konflikt
   - Hva går galt?
   - Hva står i veien for hovedpersonen?

6. Løsning
   - Hvordan kan problemet løses?
   - Hva har forandret seg til slutt?

7. Starttype
   - In medias res
   - Det var en gang
   - Dialog
   - Beskrivelse

#### Skriverom

1. Innledning
   - Presenter hovedperson, miljø og start.
   - KI kan sjekke hvem, hvor og hva.

2. Hoveddel
   - Bygg opp handlingen.
   - Vis problem eller konflikt.
   - KI kan gi spørsmål og setningsstartere.

3. Avslutning
   - Vis løsningen.
   - Avslutt fortellingen tydelig.
   - KI kan sjekke om slutten henger sammen med problemet.

#### Revisjonsrom

1. Innholdssjekk
   - Har teksten med hovedperson, miljø, problem og løsning?

2. Språksjekk
   - Kan noen ord bli mer presise?
   - Kan noen setninger bli tydeligere?

3. Lesersjekk
   - Vil leseren forstå hva som skjer?
   - Er det noe som mangler?

#### Ferdig tekst

1. Samlet tekst
   - Innledning + hoveddel + avslutning vises samlet.

2. Levering
   - Eleven leverer teksten.
   - Lærer ser plan, tekst og KI-logg.

## Dataobjekter

### WritingActivity

```ts
type WritingActivity = {
  id: string;
  ownerUid: string;
  title: string;
  genre: "story" | "factual" | "poem" | "article" | "message";
  language: string;
  level: string;
  theme?: string;
  imageUrl?: string;
  spaceId: string;
  templateVersion: number;
  rooms: WritingRoom[];
  progression: "free" | "guided" | "locked";
  aiPolicy: {
    enabled: boolean;
    maxUsesTotal: number;
    licenseRequired: boolean;
  };
  status: "draft" | "assigned" | "archived";
  createdAt: unknown;
  updatedAt: unknown;
};
```

### WritingSubmission

```ts
type WritingSubmission = {
  id: string;
  activityId: string;
  studentUid: string;
  spaceId?: string;
  answersByFieldId: Record<string, string>;
  sectionDrafts: Record<string, string>;
  finalText?: string;
  aiUsage: WritingAiUsageLog[];
  status: "draft" | "submitted" | "reviewed" | "needs_work";
  createdAt: unknown;
  updatedAt: unknown;
  submittedAt?: unknown;
};
```

### WritingAiUsageLog

```ts
type WritingAiUsageLog = {
  id: string;
  sectionId: string;
  action: WritingAiAction;
  prompt: string;
  response: string;
  promptSummary?: string;
  responseSummary?: string;
  createdAt: unknown;
};
```

## Lisens og tilgang

MVP bygges som lærerstyrt aktivitet i Space. Lærer oppretter skriveaktivitet, tildeler til elever og følger innleveringer.

Senere bør samme modul også kunne åpnes for betalende elever og foreldre:

- Betalende elev kan starte egen skriveaktivitet.
- Forelder kan opprette eller tildele skriveaktivitet til barn.
- KI-grenser og lisenssjekk må fortsatt gjelde.
- Disse flytene planlegges i datamodell og tilgangskontroll, men bygges ikke først.

## Nivåstyrte KI-krav

Kravet for å låse opp KI bør variere etter nivå. 50 ord er for strengt for alle nivåer.

Foreløpig standard:

- A1: 5 ord
- A2: 10 ord
- B1: 25 ord
- B2: 40 ord
- C1: 60 ord

Dette skal være konfigurerbart senere, både per sjanger, aktivitet og seksjon.

## Første byggesteg

1. Legg til feature flag/lisenssjekk for Skrivestasjonen.
2. Lag datatyper i `lib/writingStation/types.ts`.
3. Lag fortelling-template i `lib/writingStation/templates/story.ts`.
4. Lag lærerside for ny skriveaktivitet i Space.
5. Lag elevside for skriveaktivitet fra Space.
6. Lag lagring av kladd.
7. Legg inn KI-endepunkt med seksjonsbaserte grenser og nivåstyrt opplåsing.
8. Lag lærervisning av innlevering med plan, tekst og full KI-logg.

## Beslutninger

- MVP tildeles rett i Space.
- Første flyt er lærerstyrt.
- Betalende elever og foreldre skal planlegges for, men kan komme senere.
- KI-loggen lagrer full respons.
- Minstekrav for KI varierer etter nivå.
- Planleggingsrommet bygges først som strukturerte kort.
- Enkelt tankekart kan komme som alternativ visning og bygges ut senere.

