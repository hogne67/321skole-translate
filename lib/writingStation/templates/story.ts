import { WRITING_AI_MIN_WORDS_BY_LEVEL } from "../levels";
import type { WritingActivityTemplate, WritingAiPolicy } from "../types";

const planningAiPolicy: WritingAiPolicy = {
  enabled: true,
  maxUses: 2,
  allowedActions: ["ask_questions", "suggest_words", "check_requirements"],
  unlockRequirement: { type: "min_fields", value: 1 },
  focus: "Støtter eleven med spørsmål og ord uten å lage hele planen.",
};

const draftingAiPolicy: WritingAiPolicy = {
  enabled: true,
  maxUses: 2,
  allowedActions: [
    "sentence_starters",
    "continue_guidance",
    "suggest_words",
    "check_requirements",
  ],
  unlockRequirement: {
    type: "min_words",
    value: WRITING_AI_MIN_WORDS_BY_LEVEL.A2,
  },
  minWordsByLevel: WRITING_AI_MIN_WORDS_BY_LEVEL,
  focus: "Gir skrivehjelp etter at eleven har skrevet selv.",
};

const revisionAiPolicy: WritingAiPolicy = {
  enabled: true,
  maxUses: 2,
  allowedActions: ["revision_feedback", "check_requirements", "suggest_words"],
  unlockRequirement: {
    type: "min_words",
    value: WRITING_AI_MIN_WORDS_BY_LEVEL.A2,
  },
  minWordsByLevel: WRITING_AI_MIN_WORDS_BY_LEVEL,
  focus: "Hjelper eleven å kontrollere egen tekst med korte spørsmål og konkrete sjekkpunkter.",
};

export const storyWritingTemplate: WritingActivityTemplate = {
  genre: "story",
  title: "Fortelling",
  description:
    "Eleven planlegger hovedperson, miljø, konflikt og løsning før teksten skrives og revideres.",
  templateVersion: 1,
  defaultProgression: "guided",
  rooms: [
    {
      id: "planning",
      title: "Planleggingsrom",
      phase: "planning",
      sections: [
        {
          id: "idea",
          title: "Ide",
          prompt: "Hva skal fortellingen handle om?",
          fields: [
            {
              id: "idea_summary",
              label: "Ide",
              kind: "long_text",
              placeholder: "Skriv kort hva fortellingen skal handle om.",
              required: true,
            },
            {
              id: "reader_question",
              label: "Hva skal leseren lure på?",
              kind: "short_text",
              placeholder: "For eksempel: Hva skjer med hovedpersonen?",
            },
          ],
          aiPolicy: planningAiPolicy,
        },
        {
          id: "main_character",
          title: "Hovedperson",
          prompt: "Hvem er hovedpersonen?",
          fields: [
            {
              id: "main_character_name",
              label: "Navn eller beskrivelse",
              kind: "short_text",
              required: true,
            },
            {
              id: "main_character_outer",
              label: "Ytre trekk",
              kind: "long_text",
              placeholder: "Alder, utseende, klær, kroppsspråk.",
            },
            {
              id: "main_character_inner",
              label: "Indre trekk",
              kind: "long_text",
              placeholder: "Følelser, ønsker, frykt eller hemmeligheter.",
            },
            {
              id: "main_character_wants",
              label: "Hva vil hovedpersonen?",
              kind: "short_text",
            },
          ],
          aiPolicy: planningAiPolicy,
        },
        {
          id: "other_characters",
          title: "Andre personer",
          prompt: "Hvem andre er med i fortellingen?",
          fields: [
            {
              id: "other_character_1_name",
              label: "Navn eller hvem",
              kind: "short_text",
              placeholder: "For eksempel: Nora",
            },
            {
              id: "other_character_1_role",
              label: "Rolle",
              kind: "choice",
              options: ["venn", "hjelper", "motstander", "familie", "ukjent"],
            },
            {
              id: "other_character_1_description",
              label: "Kort beskrivelse",
              kind: "long_text",
              placeholder: "Hva gjør personen i fortellingen?",
            },
          ],
          aiPolicy: planningAiPolicy,
        },
        {
          id: "setting",
          title: "Miljø",
          prompt: "Hvor og når skjer fortellingen?",
          fields: [
            {
              id: "setting_place",
              label: "Hvor?",
              kind: "short_text",
              required: true,
            },
            {
              id: "setting_time",
              label: "Når?",
              kind: "short_text",
            },
            {
              id: "setting_senses",
              label: "Sanser",
              kind: "long_text",
              placeholder: "Hva kan man se, høre, lukte eller kjenne?",
            },
          ],
          aiPolicy: planningAiPolicy,
        },
        {
          id: "conflict",
          title: "Problem eller konflikt",
          prompt: "Hva går galt?",
          fields: [
            {
              id: "conflict_problem",
              label: "Problem",
              kind: "long_text",
              required: true,
            },
            {
              id: "conflict_obstacle",
              label: "Hva står i veien?",
              kind: "short_text",
            },
          ],
          aiPolicy: planningAiPolicy,
        },
        {
          id: "solution",
          title: "Løsning",
          prompt: "Hvordan kan problemet løses?",
          fields: [
            {
              id: "solution_how",
              label: "Løsning",
              kind: "long_text",
              required: true,
            },
            {
              id: "solution_change",
              label: "Hva forandrer seg til slutt?",
              kind: "short_text",
            },
          ],
          aiPolicy: planningAiPolicy,
        },
        {
          id: "opening_type",
          title: "Starttype",
          prompt: "Hvordan vil du starte fortellingen?",
          fields: [
            {
              id: "opening_type_choice",
              label: "Starttype",
              kind: "choice",
              options: [
                "In medias res",
                "Det var en gang",
                "Dialog",
                "Beskrivelse",
              ],
              required: true,
            },
          ],
          aiPolicy: planningAiPolicy,
        },
      ],
    },
    {
      id: "drafting",
      title: "Skriverom",
      phase: "drafting",
      sections: [
        {
          id: "title",
          title: "Overskrift",
          prompt: "Skriv en kort tittel. Du kan endre den senere.",
          supportWords: [
            "Da alt stoppet",
            "Knut og maskinene",
            "En stille morgen",
            "Hvem bestemmer?",
          ],
          fields: [
            {
              id: "story_title",
              label: "Overskrift",
              kind: "short_text",
              placeholder: "For eksempel: Da alt stoppet",
              required: true,
            },
          ],
          aiPolicy: {
            ...draftingAiPolicy,
            unlockRequirement: { type: "min_fields", value: 1 },
            focus:
              "Hjelper eleven å finne en kort overskrift som passer til ideen.",
          },
        },
        {
          id: "introduction",
          title: "Innledning",
          prompt: "Skriv starten på fortellingen.",
          supportWords: [
            "Det var en gang",
            "I begynnelsen",
            "Plutselig",
            "Hovedpersonen heter",
          ],
          fields: [
            {
              id: "introduction_draft",
              label: "Innledning",
              kind: "long_text",
              required: true,
            },
          ],
          gate: { requiredSectionIds: ["main_character", "setting"] },
          aiPolicy: {
            ...draftingAiPolicy,
            focus:
              "Sjekker om innledningen har hvem, hvor og hva som starter fortellingen.",
          },
        },
        {
          id: "main_part",
          title: "Hoveddel",
          prompt: "Skriv hva som skjer, og vis problemet eller konflikten.",
          fields: [
            {
              id: "main_part_draft",
              label: "Hoveddel",
              kind: "long_text",
              required: true,
            },
          ],
          gate: { requiredSectionIds: ["conflict"] },
          aiPolicy: {
            ...draftingAiPolicy,
            focus:
              "Hjelper eleven videre med handling, konflikt og sammenheng.",
          },
        },
        {
          id: "ending",
          title: "Avslutning",
          prompt: "Skriv hvordan fortellingen slutter.",
          fields: [
            {
              id: "ending_draft",
              label: "Avslutning",
              kind: "long_text",
              required: true,
            },
          ],
          gate: { requiredSectionIds: ["solution"] },
          aiPolicy: {
            ...draftingAiPolicy,
            focus:
              "Sjekker om slutten henger sammen med problemet og løsningen.",
          },
        },
      ],
    },
    {
      id: "revision",
      title: "Kontrollrom",
      phase: "revision",
      sections: [
        {
          id: "content_check",
          title: "Innholdssjekk",
          prompt:
            "Velg noen få ting du faktisk har kontrollert i teksten.",
          supportWords: [
            "Jeg ser at...",
            "Jeg vil gjøre ... tydeligere.",
            "Leseren forstår...",
            "Dette henger sammen fordi...",
            "Jeg må sjekke om...",
          ],
          fields: [
            {
              id: "content_checklist",
              label: "Velg 2-3 ting du har kontrollert",
              kind: "chips",
              options: [
                "rød tråd",
                "overskriften passer",
                "hovedperson",
                "miljø",
                "problem/konflikt",
                "innledning",
                "avslutning",
              ],
            },
            {
              id: "content_found",
              label: "Dette fant jeg",
              kind: "long_text",
              placeholder:
                "For eksempel: Problemet starter tydelig, men miljøet kan bli klarere.",
            },
            {
              id: "content_revision_notes",
              label: "Dette endret jeg eller vil forbedre",
              kind: "long_text",
              placeholder:
                "For eksempel: Jeg la til mer om hvor historien skjer.",
            },
          ],
          aiPolicy: revisionAiPolicy,
        },
        {
          id: "language_check",
          title: "Språksjekk",
          prompt: "Velg noen få språkting du faktisk har kontrollert.",
          supportWords: [
            "Jeg leser setningen høyt.",
            "Jeg sjekker om setningen starter med stor bokstav.",
            "Jeg setter punktum der tanken er ferdig.",
            "Jeg bytter ut ord som gjentas.",
            "Jeg ser etter og/å.",
          ],
          fields: [
            {
              id: "language_checklist",
              label: "Velg 2-3 ting du har kontrollert",
              kind: "chips",
              options: [
                "stor bokstav",
                "punktum",
                "komma",
                "og/å",
                "gjentatte ord",
                "lange setninger",
                "jeg har lest teksten høyt",
              ],
            },
            {
              id: "language_sentence",
              label: "En setning jeg sjekket",
              kind: "long_text",
              placeholder:
                "Skriv en setning du leste ekstra nøye.",
            },
            {
              id: "language_revision_notes",
              label: "Dette endret jeg",
              kind: "long_text",
              placeholder:
                "For eksempel: Jeg vil dele opp noen lange setninger.",
            },
          ],
          aiPolicy: revisionAiPolicy,
        },
        {
          id: "self_assessment",
          title: "Egenvurdering",
          prompt: "Tenk kort over arbeidet ditt før du leverer.",
          supportWords: [
            "jeg lærte",
            "jeg forbedret",
            "jeg er fornøyd med",
            "jeg trenger hjelp med",
          ],
          fields: [
            {
              id: "self_assessment_proud",
              label: "Dette er jeg fornøyd med",
              kind: "long_text",
              placeholder:
                "Skriv kort hva du synes fungerer godt i teksten.",
            },
            {
              id: "self_assessment_learned",
              label: "Dette vil jeg øve mer på",
              kind: "long_text",
              placeholder:
                "Skriv kort hva du vil bli bedre på neste gang.",
            },
            {
              id: "self_assessment_ready",
              label: "Jeg har lest gjennom teksten før levering",
              kind: "chips",
              options: [
                "ja, jeg har lest gjennom teksten",
              ],
            },
          ],
          aiPolicy: revisionAiPolicy,
        },
      ],
    },
    {
      id: "final",
      title: "Ferdig tekst",
      phase: "final",
      sections: [
        {
          id: "final_text",
          title: "Samlet tekst",
          prompt: "Les gjennom hele teksten før du leverer.",
          fields: [
            {
              id: "final_text",
              label: "Ferdig tekst",
              kind: "long_text",
              required: true,
            },
          ],
          gate: {
            requiredSectionIds: ["title", "introduction", "main_part", "ending"],
          },
        },
      ],
    },
  ],
};
