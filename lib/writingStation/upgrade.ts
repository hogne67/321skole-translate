import type { WritingActivity, WritingSectionTemplate } from "./types";

function titleSection(existingPolicy?: WritingSectionTemplate["aiPolicy"]): WritingSectionTemplate {
  return {
    id: "title",
    title: "Overskrift",
    prompt: "Skriv en kort tittel. Du kan endre den senere.",
    supportWords: ["Da alt stoppet", "Knut og maskinene", "En stille morgen", "Hvem bestemmer?"],
    fields: [
      {
        id: "story_title",
        label: "Overskrift",
        kind: "short_text",
        placeholder: "For eksempel: Da alt stoppet",
        required: true,
      },
    ],
    aiPolicy: existingPolicy
      ? {
          ...existingPolicy,
          unlockRequirement: { type: "min_fields", value: 1 },
          focus: "Hjelper eleven å finne en kort overskrift som passer til ideen.",
        }
      : undefined,
  };
}

function otherCharactersSection(existing?: WritingSectionTemplate): WritingSectionTemplate {
  return {
    id: "other_characters",
    title: existing?.title ?? "Andre personer",
    prompt: existing?.prompt ?? "Hvem andre er med i fortellingen?",
    supportWords: existing?.supportWords,
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
    aiPolicy: existing?.aiPolicy,
  };
}

function contentCheckSection(existing?: WritingSectionTemplate): WritingSectionTemplate {
  return {
    id: "content_check",
    title: existing?.title ?? "Innholdssjekk",
    prompt: "Velg noen få ting du faktisk har kontrollert i teksten.",
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
        placeholder: "For eksempel: Problemet starter tydelig, men miljøet kan bli klarere.",
      },
      {
        id: "content_revision_notes",
        label: "Dette endret jeg eller vil forbedre",
        kind: "long_text",
        placeholder: "For eksempel: Jeg la til mer om hvor historien skjer.",
      },
    ],
    aiPolicy: existing?.aiPolicy,
  };
}

function languageCheckSection(existing?: WritingSectionTemplate): WritingSectionTemplate {
  return {
    id: "language_check",
    title: existing?.title ?? "Språksjekk",
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
        placeholder: "Skriv en setning du leste ekstra nøye.",
      },
      {
        id: "language_revision_notes",
        label: "Dette endret jeg",
        kind: "long_text",
        placeholder: "For eksempel: Jeg vil dele opp noen lange setninger.",
      },
    ],
    aiPolicy: existing?.aiPolicy,
  };
}

function selfAssessmentSection(existingPolicy?: WritingSectionTemplate["aiPolicy"]): WritingSectionTemplate {
  return {
    id: "self_assessment",
    title: "Egenvurdering",
    prompt: "Tenk kort over arbeidet ditt før du leverer.",
    supportWords: ["jeg lærte", "jeg forbedret", "jeg er fornøyd med", "jeg trenger hjelp med"],
    fields: [
      {
        id: "self_assessment_proud",
        label: "Dette er jeg fornøyd med",
        kind: "long_text",
        placeholder: "Skriv kort hva du synes fungerer godt i teksten.",
      },
      {
        id: "self_assessment_learned",
        label: "Dette vil jeg øve mer på",
        kind: "long_text",
        placeholder: "Skriv kort hva du vil bli bedre på neste gang.",
      },
      {
        id: "self_assessment_ready",
        label: "Jeg har lest gjennom teksten før levering",
        kind: "chips",
        options: ["ja, jeg har lest gjennom teksten"],
      },
    ],
    aiPolicy: existingPolicy,
  };
}

export function upgradeWritingActivityForRuntime(activity: WritingActivity): WritingActivity {
  const rooms = activity.rooms ?? [];
  const revisionRoom = rooms.find((room) => room.phase === "revision");
  const draftingRoom = rooms.find((room) => room.phase === "drafting");
  const planningRoom = rooms.find((room) => room.phase === "planning");
  if (!revisionRoom && !draftingRoom && !planningRoom) return activity;

  const content = revisionRoom?.sections.find((section) => section.id === "content_check");
  const language = revisionRoom?.sections.find((section) => section.id === "language_check");
  const self = revisionRoom?.sections.find((section) => section.id === "self_assessment");
  const otherCharacters = planningRoom?.sections.find((section) => section.id === "other_characters");
  const hasTitle = draftingRoom?.sections.some((section) => section.id === "title");
  const planningUpgraded = otherCharacters?.fields.some((field) => field.id === "other_character_1_name") ?? true;
  const revisionUpgraded =
    content?.fields.some((field) => field.id === "content_found") &&
    language?.fields.some((field) => field.id === "language_sentence") &&
    self?.fields.some((field) => field.id === "self_assessment_ready");

  if (hasTitle && planningUpgraded && revisionUpgraded) return activity;

  return {
    ...activity,
    rooms: rooms.map((room) => {
      if (room.phase === "drafting") {
        if (room.sections.some((section) => section.id === "title")) return room;
        const policy = room.sections[0]?.aiPolicy;
        return {
          ...room,
          sections: [titleSection(policy), ...room.sections],
        };
      }

      if (room.phase === "planning") {
        return {
          ...room,
          sections: room.sections.map((section) =>
            section.id === "other_characters" && !section.fields.some((field) => field.id === "other_character_1_name")
              ? otherCharactersSection(section)
              : section
          ),
        };
      }

      if (room.phase !== "revision") return room;
      const policy = content?.aiPolicy ?? language?.aiPolicy;
      return {
        ...room,
        title: room.title === "Revisjonsrom" ? "Kontrollrom" : room.title,
        sections: [
          contentCheckSection(content),
          languageCheckSection(language),
          self?.fields.some((field) => field.id === "self_assessment_ready") ? self : selfAssessmentSection(policy),
        ],
      };
    }),
  };
}
