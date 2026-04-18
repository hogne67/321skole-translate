// app/[locale]/privacy/page.tsx
export default function PrivacyPage() {
    return (
        <main className="mx-auto max-w-3xl px-4 py-10">
            <h1 className="text-3xl font-semibold">Personvern</h1>
            <div className="mt-6 space-y-4 text-sm leading-7 text-gray-700">
                <p>
                    321skole behandler personopplysninger for å levere innlogging,
                    læringsinnhold, elevtilknytning, kommunikasjon og nødvendig drift av tjenesten.
                </p>
                <p>
                    Vi lagrer opplysninger som navn, e-postadresse, rolle, tilknytning til klasserom
                    og brukeraktivitet som er nødvendig for å levere tjenesten.
                </p>
                <p>
                    Opplysningene brukes ikke til andre formål enn drift, sikkerhet, forbedring av tjenesten
                    og funksjoner brukeren selv tar i bruk.
                </p>
                <p>
                    Du kan kontakte oss dersom du ønsker innsyn, retting eller sletting, så langt det er
                    forenlig med lovpålagte krav og skolens bruk av plattformen.
                </p>
            </div>
        </main>
    );
}