import { WRITING_AI_MIN_WORDS_BY_LEVEL } from "../levels";
import type { WritingActivityTemplate, WritingAiPolicy } from "../types";

const planningAiPolicy: WritingAiPolicy = {
  enabled: true,
  maxUses: 2,
  allowedActions: ["ask_questions", "suggest_words", "check_requirements"],
  unlockRequirement: { type: "min_fields", value: 1 },
  focus: "Stotter eleven med sporsmal, begreper og struktur uten a finne pa fakta.",
};

const draftingAiPolicy: WritingAiPolicy = {
  enabled: true,
  maxUses: 2,
  allowedActions: ["sentence_starters", "continue_guidance", "suggest_words", "check_requirements"],
  unlockRequirement: { type: "min_words", value: WRITING_AI_MIN_WORDS_BY_LEVEL.A2 },
  minWordsByLevel: WRITING_AI_MIN_WORDS_BY_LEVEL,
  focus: "Gir skrivehjelp etter at eleven har skrevet selv, og minner om a sjekke fakta.",
};

const revisionAiPolicy: WritingAiPolicy = {
  enabled: true,
  maxUses: 2,
  allowedActions: ["revision_feedback", "check_requirements", "suggest_words"],
  unlockRequirement: { type: "min_words", value: WRITING_AI_MIN_WORDS_BY_LEVEL.A2 },
  minWordsByLevel: WRITING_AI_MIN_WORDS_BY_LEVEL,
  focus: "Hjelper eleven a kontrollere innhold, struktur, fakta, kilder og sprak.",
};

export const factualWritingTemplate: WritingActivityTemplate = {
  genre: "factual",
  title: "Faktatekst",
  description: "Eleven planlegger tema, formål, fakta, struktur og kilder før teksten skrives og kontrolleres.",
  templateVersion: 1,
  defaultProgression: "guided",
  rooms: [
    {
      id: "planning",
      title: "Planleggingsrom",
      phase: "planning",
      sections: [
        {
          id: "topic",
          title: "Tema",
          prompt: "Hva skal faktateksten handle om?",
          supportWords: ["temaet er", "jeg skal forklare", "jeg skal informere om", "viktig fordi"],
          fields: [
            { id: "topic_summary", label: "Tema", kind: "long_text", required: true },
            { id: "topic_question", label: "Hovedspørsmål", kind: "short_text", placeholder: "Hva skal leseren forstå?" },
          ],
          aiPolicy: planningAiPolicy,
        },
        {
          id: "purpose_audience",
          title: "Formål og mottaker",
          prompt: "Hvorfor skriver du teksten, og hvem skal lese den?",
          supportWords: ["informere", "forklare", "overbevise", "leseren trenger", "målet er"],
          fields: [
            { id: "purpose", label: "Formål", kind: "short_text", required: true },
            { id: "audience", label: "Mottaker", kind: "short_text", placeholder: "For eksempel: klassen, foreldre, nye elever" },
          ],
          aiPolicy: planningAiPolicy,
        },
        {
          id: "key_terms",
          title: "Nøkkelord",
          prompt: "Hvilke ord og begreper er viktige?",
          supportWords: ["begrep", "forklaring", "betyr", "eksempel", "viktig ord"],
          fields: [
            { id: "key_terms_list", label: "Nøkkelord", kind: "long_text", placeholder: "Skriv ett ord eller begrep per linje.", required: true },
            { id: "key_terms_explain", label: "Forklar vanskelige ord", kind: "long_text" },
          ],
          aiPolicy: planningAiPolicy,
        },
        {
          id: "facts_examples",
          title: "Fakta og eksempler",
          prompt: "Hvilke fakta og eksempler skal være med?",
          supportWords: ["et viktig faktum er", "for eksempel", "dette viser at", "jeg må sjekke", "årsaken er"],
          fields: [
            { id: "facts", label: "Fakta", kind: "long_text", required: true },
            { id: "examples", label: "Eksempler", kind: "long_text" },
          ],
          aiPolicy: planningAiPolicy,
        },
        {
          id: "discussion",
          title: "Drøfting og diskusjon",
          prompt: "Finnes det ulike sider, meninger eller forklaringer?",
          supportWords: ["på den ene siden", "på den andre siden", "noen mener", "andre mener", "fordi", "likevel"],
          fields: [
            { id: "discussion_sides", label: "Ulike sider", kind: "long_text", placeholder: "Skriv ulike synspunkt eller forklaringer." },
            { id: "discussion_own", label: "Egen vurdering", kind: "long_text", placeholder: "Hva virker viktigst, og hvorfor?" },
          ],
          aiPolicy: planningAiPolicy,
        },
        {
          id: "structure",
          title: "Struktur",
          prompt: "Hvordan skal teksten bygges opp?",
          supportWords: ["først", "deretter", "videre", "til slutt", "avsnittet handler om", "konklusjonen er"],
          fields: [
            { id: "structure_plan", label: "Avsnittsplan", kind: "long_text", required: true },
            { id: "structure_order", label: "Rekkefølge", kind: "short_text" },
          ],
          aiPolicy: planningAiPolicy,
        },
        {
          id: "sources",
          title: "Kilder",
          prompt: "Hvor kommer informasjonen fra?",
          supportWords: ["kilde", "nettsted", "bok", "jeg fant", "jeg må sjekke", "pålitelige kilder"],
          fields: [
            { id: "sources_list", label: "Kilder", kind: "long_text", placeholder: "Skriv kilder eller hvor fakta er hentet fra." },
            { id: "sources_check", label: "Hva må sjekkes?", kind: "long_text" },
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
          prompt: "Skriv en presis overskrift.",
          supportWords: ["Hva er", "Slik fungerer", "Derfor", "En forklaring på"],
          fields: [{ id: "factual_title", label: "Overskrift", kind: "short_text", required: true }],
          aiPolicy: { ...draftingAiPolicy, unlockRequirement: { type: "min_fields", value: 1 } },
        },
        {
          id: "introduction",
          title: "Innledning",
          prompt: "Skriv en innledning som presenterer tema og formål.",
          supportWords: ["Denne teksten handler om", "Målet er å forklare", "Mange lurer på", "Først skal vi se på"],
          fields: [{ id: "introduction_draft", label: "Innledning", kind: "long_text", required: true }],
          gate: { requiredSectionIds: ["topic", "purpose_audience"] },
          aiPolicy: draftingAiPolicy,
        },
        {
          id: "main_part",
          title: "Hoveddel",
          prompt: "Skriv hoveddelen med fakta, forklaringer og eksempler.",
          supportWords: ["for det første", "for eksempel", "dette betyr", "en årsak er", "en konsekvens er"],
          fields: [{ id: "main_part_draft", label: "Hoveddel", kind: "long_text", required: true }],
          gate: { requiredSectionIds: ["facts_examples", "structure"] },
          aiPolicy: draftingAiPolicy,
        },
        {
          id: "ending",
          title: "Avslutning",
          prompt: "Skriv en avslutning som samler hovedpoengene.",
          supportWords: ["til slutt", "kort sagt", "det viktigste er", "vi kan derfor si", "konklusjonen er"],
          fields: [{ id: "ending_draft", label: "Avslutning", kind: "long_text", required: true }],
          gate: { requiredSectionIds: ["main_part"] },
          aiPolicy: draftingAiPolicy,
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
          prompt: "Kontroller at teksten svarer på oppgaven.",
          supportWords: ["teksten forklarer", "leseren forstår", "jeg har med", "jeg mangler", "dette bør bli tydeligere"],
          fields: [
            { id: "content_checklist", label: "Velg ting du har kontrollert", kind: "chips", options: ["tema", "formål", "fakta", "eksempler", "forklaring", "avslutning"] },
            { id: "content_found", label: "Dette fant jeg", kind: "long_text" },
          ],
          aiPolicy: revisionAiPolicy,
        },
        {
          id: "structure_check",
          title: "Struktursjekk",
          prompt: "Kontroller avsnitt og rekkefølge.",
          supportWords: ["innledningen", "hoveddelen", "avsnitt", "rekkefølge", "overgang", "avslutningen"],
          fields: [
            { id: "structure_checklist", label: "Velg ting du har kontrollert", kind: "chips", options: ["innledning", "avsnitt", "rekkefølge", "overganger", "avslutning"] },
            { id: "structure_notes", label: "Dette vil jeg forbedre", kind: "long_text" },
          ],
          aiPolicy: revisionAiPolicy,
        },
        {
          id: "fact_check",
          title: "Faktasjekk",
          prompt: "Kontroller fakta og kilder.",
          supportWords: ["jeg har sjekket", "kilden sier", "dette må kontrolleres", "jeg er usikker på", "fakta stemmer fordi"],
          fields: [
            { id: "fact_checklist", label: "Velg ting du har kontrollert", kind: "chips", options: ["fakta", "begreper", "eksempler", "kilder", "påstander"] },
            { id: "fact_notes", label: "Dette må sjekkes eller forklares bedre", kind: "long_text" },
          ],
          aiPolicy: revisionAiPolicy,
        },
        {
          id: "language_check",
          title: "Språksjekk",
          prompt: "Kontroller språk, tegnsetting og fagord.",
          supportWords: ["jeg forklarer begrepet", "setningen er tydelig", "jeg bruker punktum", "jeg varierer språket", "jeg leser høyt"],
          fields: [
            { id: "language_checklist", label: "Velg ting du har kontrollert", kind: "chips", options: ["fagord", "forklaringer", "stor bokstav", "punktum", "varierte setninger"] },
            { id: "language_revision_notes", label: "Dette endret jeg", kind: "long_text" },
          ],
          aiPolicy: revisionAiPolicy,
        },
        {
          id: "self_assessment",
          title: "Egenvurdering",
          prompt: "Tenk kort over arbeidet ditt før du leverer.",
          supportWords: ["jeg lærte", "jeg forklarte", "jeg sjekket", "jeg er fornøyd med", "neste gang vil jeg"],
          fields: [
            { id: "self_assessment_proud", label: "Dette er jeg fornøyd med", kind: "long_text" },
            { id: "self_assessment_learned", label: "Dette vil jeg øve mer på", kind: "long_text" },
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
