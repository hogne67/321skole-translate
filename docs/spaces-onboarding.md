# Elevinngang i Spaces

En elev identifiseres med `(spaceId, participantId)`. Navnet tilhører denne elevregistreringen i rommet, ikke innloggingskontoen. Personlig elevkode gjelder bare sammen med romkoden. Ulike rom kan ha ulike navn og koder for samme person.

- Lærer oppretter elever under Administrer medlemmer. Bare lærer/admin endrer navn.
- Lærerens opprinnelige elevregistrering er navnekilden også etter at den er merket som koblet til en tilgang. Navneendringer oppdaterer denne registreringen og alle aktive tilganger. Nye innmeldinger henter navnet herfra og synkroniserer gamle tilgangsnavn.
- Personlig elevlenke/QR og manuell romkode + elevkode går gjennom samme serverkontroll.
- Personlige lenker/QR med begge kodene sjekkes automatisk ved åpning. Manuell inngang bruker knappen Sjekk elevkode. Begge viser Fortsett som med lærerens registrerte navn før innmelding bekreftes.
- Første steg viser registrert elevnavn og rom uten å opprette eller endre medlemskap. Eleven bekrefter før tilgang knyttes til innloggingskontoen eller gjestebrukeren.
- En eksisterende innlogget konto kan knyttes til eleven med personlig kode. Vanlig kontoinnlogging alene beviser ikke hvilken elevregistrering i et rom som skal brukes.
- En annen elevkode i samme rom gir en tydelig advarsel. Ved bekreftet elevbytte logges nettleseren ut og får en ny gjestetilgang. Tidligere medlemskap og besvarelser endres ikke. Kontotilgangen til den forrige eleven brukes aldri for den neste eleven.
- Elever kan åpne samme kode i flere nettlesere og kontoer. Dette er flere tilganger, men én elev. UID-antall er ikke et mål på antall fysiske enheter.
- Logg ut av delt PC avslutter Firebase-økten i nettleseren, fjerner sist brukte rom og laster kodeinngangen på nytt med tomme kodefelt. Besvarelser og medlemskap bevares. Bytt elev avslutter også økten, men tar med romkoden for neste elev. Autofullføring er slått av på skjema og kodefelt; nettleseren kan overstyre dette, og tidligere lagrede forslag må eventuelt fjernes i nettleseren.
- Innmelding med bare romkode og selvvalgt navn støttes ikke, heller ikke hvis eldre rom har `allowRoomCodeOnly=true`.
- Den gamle `isOpen`-innmeldingsbryteren styrer ikke personlig elevkode. En kjent elev kan bruke sin kode fra en ny nettleser. Arkiverte rom avviser innmelding; fjernede/deaktiverte elevregistreringer er ikke gyldige kodetreff.
- Fornyet elevkode erstatter koden på aktive tilganger. Den gamle koden avvises ved ny innmelding. Dette logger ikke automatisk ut allerede aktive tilganger. Fjern elev fra rommet deaktiverer elevens medlemskap og bevarer besvarelsene.
- Klienten kan ikke opprette eller endre egne medlemsdokumenter. Validerte serverendepunkter oppretter koblingene atomisk. Motstridende elevidentiteter på samme kode avvises og må undersøkes av admin.

## Elevplasser hos lærer

`teacherStudentId` er en egen elevidentitet for lisens og læreroversikt. Den gjenbrukes på tvers av lærerens rom. `participantId`, elevkode, navn og besvarelser er fortsatt romlokale. Eksisterende medlemskap uten det nye feltet telles med sin tidligere `participantId`/UID til læreren velger en kobling; navn og innlogging gir ingen automatisk sammenslåing.

Under Administrer medlemmer kan lærer hente eksisterende elever fra egne rom, én eller flere samtidig. I et åpent elevkort kan lærer bekrefte en kobling til en elev i et annet rom. Dette oppdaterer bare læreridentiteten på registreringer og tilganger, med revisjonslogg av tidligere verdier. Ingen besvarelser flyttes. En elev må være aktiv i minst ett rom for å telle. Andre læreres elevplasser holdes adskilt, også i skoleoversikten.

Nye elever kontrolleres mot lærerens effektive lisensgrense på serveren. En transaksjon og en lås per lærer hindrer samtidige opprettelser i å overskride grensen. Gjenbruk og kobling av eksisterende elever er tillatt når grensen er nådd. Direkte klientendring av `teacherStudentId` er ikke tillatt.

## Tester

`lib/spaceJoinPolicy.test.ts` tester identitetsvalg og konfliktregler. `lib/spaceOnboarding.integration.test.ts` tester innmeldings-API og databaseregler mot lokal emulator, inkludert delt PC, konto/gjest, romlokale navn og tilgang til besvarelser.

Start Firestore-emulatoren på `127.0.0.1:8188`, og kjør:

```powershell
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8188'
node --conditions=react-server --import tsx --test lib/spaceOnboarding.integration.test.ts lib/spaceJoinPolicy.test.ts
```
