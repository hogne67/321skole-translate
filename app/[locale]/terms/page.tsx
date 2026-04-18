// app/[locale]/terms/page.tsx
export default function TermsPage() {
    return (
        <main className="mx-auto max-w-3xl px-4 py-10">
            <h1 className="text-3xl font-semibold">Vilkår</h1>
            <div className="mt-6 space-y-4 text-sm leading-7 text-gray-700">
                <p>
                    Ved å bruke 321skole godtar du å bruke tjenesten i tråd med gjeldende lover,
                    skolens regler og plattformens formål.
                </p>
                <p>
                    Brukeren er ansvarlig for at innhold som lastes opp eller deles, ikke bryter med
                    lovverk, opphavsrett eller andres personvern.
                </p>
                <p>
                    Kontoer er personlige og skal ikke deles med andre uten uttrykkelig tillatelse.
                </p>
                <p>
                    Vi kan oppdatere funksjoner, sikkerhet og vilkår ved behov. Vesentlige endringer
                    bør kommuniseres tydelig i tjenesten.
                </p>
            </div>
        </main>
    );
}