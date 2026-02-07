// app/page.tsx
import Link from "next/link";
import Image from "next/image";

const brand = {
  name: "321skole",
  tagline: "AI-støttet språklæring – bygget for lærere, elsket av studenter",
};

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <TopBar />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-sky-200/40 blur-3xl" />
          <div className="absolute -bottom-40 -right-40 h-[520px] w-[520px] rounded-full bg-emerald-200/40 blur-3xl" />
        </div>

        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-16 md:grid-cols-2 md:py-20">
          <div className="flex flex-col justify-center">
            <p className="inline-flex w-fit items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Gratis for både studenter, lærere og foreldre!
            </p>

            <h1 className="mt-5 text-4xl font-semibold tracking-tight md:text-5xl">
              Undervisning. Forsterket med AI.
            </h1>

            <p className="mt-4 text-lg text-slate-700">
              Generer egne undervisningsopplegg på alle språk med oversettelse og lyd, og del med studenter som får umiddelbar, pedagogisk feedback – på riktig nivå.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/registrer"
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
              >
                Registrer deg i dag
              </Link>

              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
              >
                Logg inn
              </Link>
            </div>

            <p className="mt-4 text-sm text-slate-600">
              Gjestebrukere kommer inn via delingslenker til oppgaver/Spaces.
            </p>

            <div className="mt-7 grid grid-cols-2 gap-4 text-sm text-slate-700">
              <MiniStat title="Språk" value="Alle" hint="Tekst + oppgaver + feedback" />
              <MiniStat title="Nivå" value="CEFR A1–C1" hint="Forenkle, forbedre, variere" />
              <MiniStat title="Lyd" value="Justerbar" hint="Tekst + oversettelse" />
              <MiniStat title="PDF" value="Eksport" hint="Opplegg klart til bruk" />
            </div>
          </div>

          <div className="relative">
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-slate-100">
                <Image
                  src="/landing/hero.png"
                  alt="Illustrasjon av lærer og student som bruker 321skole"
                  fill
                  className="object-cover"
                  priority
                />
              </div>

              <div className="mt-3 grid grid-cols-3 gap-3">
                <MockCard title="Tekst" subtitle="Nivåtilpass" />
                <MockCard title="Oppgaver" subtitle="Varier" />
                <MockCard title="Feedback" subtitle="Umiddelbar" />
              </div>
            </div>

            <div className="pointer-events-none absolute -bottom-6 -left-6 hidden rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur md:block">
              <p className="text-sm font-semibold">Pedagogisk AI</p>
              <p className="mt-1 text-sm text-slate-700">Læreren styrer · AI hjelper</p>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST (plassholder) */}
      <section className="border-y border-slate-100 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <p className="text-center text-sm text-slate-600">
            Klar for skoler, kurs og voksenopplæring – uten tung LMS-friksjon.
          </p>
        </div>
      </section>

      {/* FOR LÆRERE */}
      <FeatureSection
        eyebrow="For lærere"
        title="Lag mer – med mindre stress"
        description="Et arbeidsverktøy som hjelper deg å produsere, tilpasse og dele undervisningsinnhold – uten å miste kontroll over kvalitet og nivå."
        image={{
          src: "/landing/teacher.png",
          alt: "Lærer som planlegger undervisning på laptop",
        }}
        bullets={[
          "Lag tekster på alle språk (skriv, lim inn eller generer).",
          "Juster tekst automatisk til CEFR-nivå (A1–C1).",
          "Generer og rediger mange oppgavetyper (flervalg, åpne svar, skriveoppgaver).",
          "Del med studenter via Spaces – og samle innleveringer.",
          "Eksporter ferdige opplegg som PDF.",
        ]}
        cta={{ href: "/registrer", label: "Registrer deg i dag" }}
        flip={false}
      />

      {/* FOR STUDENTER */}
      <FeatureSection
        eyebrow="For studenter"
        title="Forstå mer. Lær tryggere."
        description="Studentene får støtte akkurat der det trengs mest: forståelse, tempo og trygg tilbakemelding – på undervisningsspråket og valgfritt på morsmål."
        image={{
          src: "/landing/student.png",
          alt: "Student som lærer språk med hodetelefoner",
        }}
        bullets={[
          "Oversett tekst og oppgaver til valgfritt språk.",
          "Justerbar lydhastighet – både på tekstspråk og oversettelse.",
          "Umiddelbar feedback på egne tekster (tekstspråk + valgfritt andrespråk).",
          "Forklaringer som hjelper deg videre – ikke bare riktig/feil.",
          "Gratis tilgang for studenter.",
        ]}
        cta={{ href: "/login", label: "Logg inn" }}
        flip={true}
      />

      {/* SPACES */}
      <section id="spaces" className="bg-slate-50">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold text-slate-600">Spaces</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              Ett rom for alt som skjer i undervisningen
            </h2>
            <p className="mt-4 text-lg text-slate-700">
              Del opplegg, samle innleveringer, og følg progresjon – for klasserom, kurs og voksenopplæring.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
            <InfoCard
              title="Del på sekunder"
              text="Gi studentene en lenke eller kode. De kommer rett inn i opplegget."
            />
            <InfoCard
              title="Anonym eller innlogget"
              text="Støtter lav terskel i starten – og trygg innlogging når dere vil."
            />
            <InfoCard
              title="Oversikt og flyt"
              text="Alt samlet: tekster, oppgaver, svar og feedback – tydelig og ryddig."
            />
          </div>

          <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="relative aspect-[16/6] overflow-hidden rounded-xl bg-slate-100">
              <Image
                src="/landing/spaces.png"
                alt="Mockup av Spaces i 321skole"
                fill
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* WHY AI */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-slate-600">Hvorfor AI?</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
                AI som assistent. Ikke fasit.
              </h2>
              <p className="mt-4 text-lg text-slate-700">
                Dette er pedagogisk AI: læreren bestemmer innholdet, og AI hjelper med språk, nivå og variasjon.
                Studentene får forklaringer – ikke snarveier.
              </p>

              <div className="mt-6 grid grid-cols-1 gap-4">
                <CheckRow text="Læreren har kontroll: alt kan redigeres og justeres." />
                <CheckRow text="Trygg støtte: fokus på læring, forståelse og progresjon." />
                <CheckRow text="Flerspråklig fra bunnen av: tekst, oppgaver, lyd og feedback." />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <p className="text-sm font-semibold text-slate-700">Eksempel på flyt</p>
              <ol className="mt-4 space-y-3 text-sm text-slate-700">
                <li className="rounded-xl border border-slate-200 bg-white p-4">
                  <span className="font-semibold">1)</span> Lærer velger tema og nivå
                </li>
                <li className="rounded-xl border border-slate-200 bg-white p-4">
                  <span className="font-semibold">2)</span> Tekst lages/tilpasses på minutter
                </li>
                <li className="rounded-xl border border-slate-200 bg-white p-4">
                  <span className="font-semibold">3)</span> Oppgaver genereres og redigeres
                </li>
                <li className="rounded-xl border border-slate-200 bg-white p-4">
                  <span className="font-semibold">4)</span> Del i Space → studenter jobber
                </li>
                <li className="rounded-xl border border-slate-200 bg-white p-4">
                  <span className="font-semibold">5)</span> Umiddelbar feedback + eksport som PDF
                </li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* PRIS / ROLLER */}
<section className="bg-slate-50">
  <div className="mx-auto max-w-6xl px-6 py-16">
    <div className="mx-auto max-w-3xl text-center">
      <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
        Gratis å starte. Enkelt å oppgradere.
      </h2>
      <p className="mt-4 text-lg text-slate-700">
        Lag din første oppgave med en gang. Registrer deg gratis når du vil publisere og dele.
      </p>
    </div>

    <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-4">
      <RoleCard
        title="Student"
        free={[
          "Alt fra lærer (ubegrenset)",
          "Les, lytt og få feedback",
          "Library: 4 oppgaver / mnd",
        ]}
        paidTitle="Student Full"
        price="49 kr/mnd"
        paid={[
          "Ubegrenset library",
          "Full lese- og lydtilgang",
        ]}
        cta="Start gratis"
      />

      <RoleCard
        title="Teacher"
        highlight
        free={[
          "Lag og test oppgaver",
          "2 publiseringer / mnd",
          "Test Spaces",
        ]}
        paidTitle="Teacher Full"
        price="99 kr/mnd"
        paid={[
          "Ubegrenset generering",
          "Full AI + feedback",
          "Spaces og PDF-eksport",
        ]}
        cta="Lag første oppgave"
      />

      <RoleCard
        title="Parent"
        free={[
          "Følg barnets oppgaver",
          "Les, lytt og oversett",
        ]}
        paidTitle="Parent Full"
        price="89 kr/mnd"
        paid={[
          "Full library",
          "Lag egne oppgaver",
          "Flere barn",
        ]}
        cta="Hjelp barnet i gang"
      />

      <RoleCard
        title="Creator"
        free={[
          "Test generering",
          "Private oppgaver",
        ]}
        paidTitle="Creator Full"
        price="79 kr/mnd"
        paid={[
          "Full generering",
          "Publiser innhold",
        ]}
        cta="Utforsk som creator"
      />
    </div>
  </div>
</section>

      {/* PRISING */}
      <section className="bg-slate-900 text-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:items-center">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Kom i gang – helt uten risiko
              </h2>
              <p className="mt-4 text-lg text-white/80">
                Gratis for alle).
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/registrer"
                  className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-white/90"
                >
                  Registrer deg i dag
                </Link>

                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-transparent px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
                >
                  Logg inn
                </Link>
              </div>

              <p className="mt-4 text-sm text-white/70">
                Ingen binding. Test i ekte undervisning. Avslutt når som helst.
              </p>
            </div>

            <div className="rounded-2xl bg-white/10 p-6">
              <p className="text-sm font-semibold">Dette får du fra dag 1</p>
              <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-white/85">
                <CheckRow dark text="Tekster og oppgaver på alle språk" />
                <CheckRow dark text="CEFR-nivåtilpasning (A1–C1)" />
                <CheckRow dark text="TTS med justerbar hastighet" />
                <CheckRow dark text="Umiddelbar feedback på tekst" />
                <CheckRow dark text="Spaces for deling og innlevering" />
                <CheckRow dark text="PDF-eksport av opplegg" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-white">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold">{brand.name}</p>
              <p className="mt-1 text-sm text-slate-600">{brand.tagline}</p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link className="text-slate-700 hover:text-slate-900" href="/about">
                Om
              </Link>
              <Link className="text-slate-700 hover:text-slate-900" href="/privacy">
                Personvern
              </Link>
              <Link className="text-slate-700 hover:text-slate-900" href="/contact">
                Kontakt
              </Link>
            </div>
          </div>
          <p className="mt-6 text-xs text-slate-500">
            © {new Date().getFullYear()} {brand.name}. Alle rettigheter reservert.
          </p>
        </div>
      </footer>
    </main>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold text-white">
            321
          </span>
          <span className="text-sm font-semibold">321skole</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-slate-700 md:flex">
          <a className="hover:text-slate-900" href="#for-larere">
            For lærere
          </a>
          <a className="hover:text-slate-900" href="#for-studenter">
            For studenter
          </a>
          <a className="hover:text-slate-900" href="#spaces">
            Spaces
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          >
            Logg inn
          </Link>

          <Link
            href="/registrer"
            className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Registrer
          </Link>
        </div>
      </div>
    </header>
  );
}

function MiniStat(props: { title: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs font-semibold text-slate-600">{props.title}</div>
      <div className="mt-1 text-sm font-semibold">{props.value}</div>
      <div className="mt-1 text-xs text-slate-600">{props.hint}</div>
    </div>
  );
}

function MockCard(props: { title: string; subtitle: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs font-semibold text-slate-700">{props.title}</div>
      <div className="mt-1 text-xs text-slate-500">{props.subtitle}</div>
    </div>
  );
}

function FeatureSection(props: {
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  cta: { href: string; label: string };
  image: { src: string; alt: string };
  flip: boolean;
}) {
  const id =
    props.eyebrow === "For lærere"
      ? "for-larere"
      : props.eyebrow === "For studenter"
        ? "for-studenter"
        : undefined;

  return (
    <section id={id} className="bg-white">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div
          className={`grid grid-cols-1 items-center gap-10 md:grid-cols-2 ${
            props.flip ? "md:[&>*:first-child]:order-2" : ""
          }`}
        >
          <div>
            <p className="text-sm font-semibold text-slate-600">{props.eyebrow}</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              {props.title}
            </h2>
            <p className="mt-4 text-lg text-slate-700">{props.description}</p>

            <ul className="mt-6 space-y-3 text-sm text-slate-700">
              {props.bullets.map((b) => (
                <li key={b} className="flex gap-3">
                  <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    ✓
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            <div className="mt-7">
              <Link
                href={props.cta.href}
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
              >
                {props.cta.label}
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-slate-100">
              <Image src={props.image.src} alt={props.image.alt} fill className="object-cover" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function InfoCard(props: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold">{props.title}</p>
      <p className="mt-2 text-sm text-slate-700">{props.text}</p>
    </div>
  );
}

function CheckRow(props: { text: string; dark?: boolean }) {
  return (
    <div className={`flex gap-3 ${props.dark ? "text-white/85" : "text-slate-700"}`}>
      <span
        className={`mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full ${
          props.dark ? "bg-white/15 text-white" : "bg-emerald-100 text-emerald-700"
        }`}
      >
        ✓
      </span>
      <span className="text-sm">{props.text}</span>
    </div>
  );
}

function RoleCard(props: {
  title: string;
  free: string[];
  paidTitle: string;
  price: string;
  paid: string[];
  cta: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-6 shadow-sm ${
        props.highlight ? "border-slate-900" : "border-slate-200"
      }`}
    >
      <h3 className="text-lg font-semibold">{props.title}</h3>

      <p className="mt-4 text-sm font-semibold text-slate-600">Gratis</p>
      <ul className="mt-2 space-y-2 text-sm text-slate-700">
        {props.free.map((f) => (
          <li key={f}>• {f}</li>
        ))}
      </ul>

      <div className="mt-4 rounded-xl bg-slate-50 p-3">
        <p className="text-sm font-semibold">
          {props.paidTitle} · {props.price}
        </p>
        <ul className="mt-2 space-y-2 text-sm text-slate-700">
          {props.paid.map((p) => (
            <li key={p}>✓ {p}</li>
          ))}
        </ul>
      </div>

      <button className="mt-6 w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
        {props.cta}
      </button>
    </div>
  );
}