"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";

type Language = "nb" | "en" | "pt";
type Level = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
type TaskType = "describe" | "story" | "dialogue" | "reflection";
type ImageMode = "uploaded" | "ai_generated";
type PrintMode = "short" | "medium" | "long";
type TaskDefaultSet = { instruction: string; supportWords: string; successCriteria: string };

const levels: Level[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
const languages: Language[] = ["nb", "en", "pt"];

const copy = {
  nb: {
    taskTypes: {
      describe: "Beskriv bildet",
      story: "Skriv en historie",
      dialogue: "Skriv en dialog",
      reflection: "Reflekter",
    },
    defaults: {
      instruction: "Skriv 10 setninger eller en tekst på mellom 50 og 100 ord som passer til bildet.",
      supportWords: [
        "Jeg ser ...",
        "Det er ...",
        "Der er det ...",
        "Til venstre ser jeg ...",
        "Til høyre er det ...",
        "I bakgrunnen kan jeg se ...",
        "Foran / bak ... står det ...",
        "Personen ser ... ut.",
        "Jeg tror at ...",
        "Kanskje ...",
        "Bildet viser ...",
        "Det virker som ...",
        "Jeg synes at ...",
        "Dette minner meg om ...",
        "Kanskje personen føler seg ... fordi ...",
      ].join("\n"),
      successCriteria: [
        "Hva ser jeg på bildet, og hvor?",
        "Hva skjer på bildet?",
        "Har jeg skrevet både fakta og egne tanker?",
        "Hva synes du om bildet?",
      ].join("\n"),
    },
    ui: {
      pageTitle: "Skriv til bilde",
      pageIntro: "Første versjon lagrer én bildebasert skriveoppgave som vanlig innhold.",
      myContent: "Mitt innhold",
      videoTitle: "Instruksjonsvideo",
      videoPlaceholder: "Se hvordan du lager en skriveoppgave",
      closeVideo: "Lukk video",
      title: "Tittel",
      language: "Språk",
      level: "Nivå",
      taskType: "Oppgavetype",
      sectionTask: "1. Oppgave",
      sectionImage: "2. Bilde",
      sectionInstruction: "3. Elevinstruksjon",
      sectionSupport: "4. Hjelp og utskrift",
      editSuggestionsHint: "Forslagene kan redigeres. Ta bort eller legg til det som passer for elevene.",
      resetSuggestions: "Nullstill forslag",
      uploadMode: "Last opp / bilde-URL",
      aiMode: "AI-generert",
      uploadImage: "Last opp bilde",
      imageUrl: "Eller lim inn bilde-URL",
      imageUrlShort: "Bilde-URL",
      prompt: "Prompt til AI-bilde",
      promptPlaceholder: "Beskriv bildet du vil lage. Unngå tekst i selve bildet.",
      imagePrivacyHint: "Ikke bruk bilder eller navn på elever uten avklaring.",
      promptSuggestion: "Velg promptforslag",
      promptSuggestionPlaceholder: "Velg et forslag...",
      generate: "Generer bilde",
      generating: "Genererer...",
      storageHint: "Bildet lagres i Firebase Storage og kan brukes før oppgaven lagres.",
      aspectHint: "Standardformatet er 16:9. Bilder vises i denne rammen og kan bli beskåret.",
      imageDescription: "Bildebeskrivelse / imageDescription",
      imageDescriptionPlaceholder: "Beskriv motiv, personer, sted, handling og viktige detaljer som AI skal vurdere teksten mot.",
      imagePreviewTitle: "Valgt bilde",
      instruction: "Instruksjon til eleven",
      support: "Forslag til støtteord",
      criteria: "Forslag til suksesskriterier",
      printHelp: "Ekstra hjelp på utskrift",
      printShort: "Kort",
      printMedium: "Middels",
      printLong: "Lang",
      printShortHint: "Bilde, instruksjon og svarlinjer.",
      printMediumHint: "Legger også ved støtteord.",
      printLongHint: "Legger ved støtteord og suksesskriterier.",
      none: "Ingen",
      saveAndPreview: "Lagre og forhåndsvis",
      save: "Lagre til Mitt innhold",
      saveChanges: "Lagre endringer",
      savePanelTitle: "Klar til å lagre",
      editPanelTitle: "Klar til å lagre endringer",
      savePanelInfo: "Du sendes til Mitt innhold når du lagrer, og der kan du skrive ut oppgaven i PDF eller dele den digitalt til klasserom.",
      saving: "Lagrer...",
      openPreview: "Åpne/forhåndsvis",
      preview: "Forhåndsvisning",
      imagePlaceholder: "Bilde vises her",
      untitled: "Uten tittel",
      aiContext: "Bildekontekst for AI-feedback",
      imageAlt: "Bildeoppgave",
    },
    messages: {
      uploaded: "Bildet er lastet opp.",
      uploadFailed: "Opplasting feilet.",
      loginUpload: "Du må være innlogget for å laste opp bilde.",
      imageOnly: "Velg en bildefil.",
      tooLarge: "Filen er for stor. Maks 8 MB.",
      loginGenerate: "Du må være innlogget for å generere bilde.",
      promptRequired: "Skriv et prompt for AI-bildet først.",
      generateFailed: "Bildegenerering feilet.",
      noImage: "Bildegenerering ga ingen bilde-URL.",
      generated: "AI-bildet er generert. Husk å skrive bildebeskrivelse før lagring.",
      loginSave: "Du må være innlogget for å lagre.",
      missingRequired: "Fyll ut obligatoriske felt før du lagrer:",
      completeRequired: "Fyll ut obligatoriske felt før du lagrer.",
      saveFailed: "Lagring feilet.",
      saved: "Skriveoppgaven er lagret i Mitt innhold.",
      loadingEdit: "Laster skriveoppgaven...",
      editLoadFailed: "Kunne ikke åpne skriveoppgaven for redigering.",
      notFound: "Fant ikke skriveoppgaven.",
      notOwner: "Du kan bare redigere skriveoppgaver du eier.",
      unsupportedLesson: "Denne oppgaven kan ikke redigeres i 321School Studio.",
    },
  },
  en: {
    taskTypes: {
      describe: "Describe the picture",
      story: "Write a story",
      dialogue: "Write a dialogue",
      reflection: "Reflect",
    },
    defaults: {
      instruction: "Write 10 sentences or a text between 50 and 100 words that fits the picture.",
      supportWords: [
        "I can see ...",
        "There is ...",
        "There are ...",
        "On the left, I can see ...",
        "On the right, there is ...",
        "In the background, I can see ...",
        "In front of / behind ... there is ...",
        "The person looks ...",
        "I think that ...",
        "Maybe ...",
        "The picture shows ...",
        "It seems like ...",
        "I think ...",
        "This reminds me of ...",
        "Maybe the person feels ... because ...",
      ].join("\n"),
      successCriteria: [
        "What can I see in the picture, and where?",
        "What is happening in the picture?",
        "Have I written both facts and my own thoughts?",
        "What do I think about the picture?",
      ].join("\n"),
    },
    ui: {
      pageTitle: "Write to a Picture",
      pageIntro: "First version saves one image-based writing task as regular content.",
      myContent: "My content",
      videoTitle: "Instruction video",
      videoPlaceholder: "See how to create a writing task",
      closeVideo: "Close video",
      title: "Title",
      language: "Language",
      level: "Level",
      taskType: "Task type",
      sectionTask: "1. Task",
      sectionImage: "2. Image",
      sectionInstruction: "3. Student instruction",
      sectionSupport: "4. Support and printout",
      editSuggestionsHint: "You can edit the suggestions. Remove or add what fits your students.",
      resetSuggestions: "Reset suggestions",
      uploadMode: "Upload / image URL",
      aiMode: "AI-generated",
      uploadImage: "Upload image",
      imageUrl: "Or paste image URL",
      imageUrlShort: "Image URL",
      prompt: "AI image prompt",
      promptPlaceholder: "Describe the image you want to create. Avoid text inside the image.",
      imagePrivacyHint: "Do not use photos or names of students without clarification.",
      promptSuggestion: "Choose prompt suggestion",
      promptSuggestionPlaceholder: "Choose a suggestion...",
      generate: "Generate image",
      generating: "Generating...",
      storageHint: "The image is saved in Firebase Storage and can be used before the task is saved.",
      aspectHint: "The standard format is 16:9. Images are shown in this frame and may be cropped.",
      imageDescription: "Image description / imageDescription",
      imageDescriptionPlaceholder: "Describe the motif, people, place, action and important details AI should assess the text against.",
      imagePreviewTitle: "Selected image",
      instruction: "Instruction for the student",
      support: "Suggested support words",
      criteria: "Suggested success criteria",
      printHelp: "Extra help on printout",
      printShort: "Short",
      printMedium: "Medium",
      printLong: "Long",
      printShortHint: "Image, instruction and answer lines.",
      printMediumHint: "Also includes support words.",
      printLongHint: "Includes support words and success criteria.",
      none: "None",
      saveAndPreview: "Save and preview",
      save: "Save to My content",
      saveChanges: "Save changes",
      savePanelTitle: "Ready to save",
      editPanelTitle: "Ready to save changes",
      savePanelInfo: "You will be sent to My content when you save. From there you can print the task as PDF or share it digitally with a classroom.",
      saving: "Saving...",
      openPreview: "Open/preview",
      preview: "Preview",
      imagePlaceholder: "Image appears here",
      untitled: "Untitled",
      aiContext: "Image context for AI feedback",
      imageAlt: "Image task",
    },
    messages: {
      uploaded: "The image has been uploaded.",
      uploadFailed: "Upload failed.",
      loginUpload: "You must be logged in to upload an image.",
      imageOnly: "Choose an image file.",
      tooLarge: "The file is too large. Max 8 MB.",
      loginGenerate: "You must be logged in to generate an image.",
      promptRequired: "Write a prompt for the AI image first.",
      generateFailed: "Image generation failed.",
      noImage: "Image generation returned no image URL.",
      generated: "The AI image has been generated. Remember to write an image description before saving.",
      loginSave: "You must be logged in to save.",
      missingRequired: "Complete required fields before saving:",
      completeRequired: "Complete required fields before saving.",
      saveFailed: "Saving failed.",
      saved: "The writing task has been saved to My content.",
      loadingEdit: "Loading the writing task...",
      editLoadFailed: "Could not open the writing task for editing.",
      notFound: "Could not find the writing task.",
      notOwner: "You can only edit writing tasks you own.",
      unsupportedLesson: "This task cannot be edited in 321School Studio.",
    },
  },
  pt: {
    taskTypes: {
      describe: "Descrever a imagem",
      story: "Escrever uma história",
      dialogue: "Escrever um diálogo",
      reflection: "Refletir",
    },
    defaults: {
      instruction: "Escreva 10 frases ou um texto entre 50 e 100 palavras que combine com a imagem.",
      supportWords: [
        "Eu vejo ...",
        "Há ...",
        "Ali há ...",
        "À esquerda, eu vejo ...",
        "À direita, há ...",
        "No fundo, posso ver ...",
        "Na frente de / atrás de ... há ...",
        "A pessoa parece ...",
        "Eu acho que ...",
        "Talvez ...",
        "A imagem mostra ...",
        "Parece que ...",
        "Eu penso que ...",
        "Isto me lembra ...",
        "Talvez a pessoa se sinta ... porque ...",
      ].join("\n"),
      successCriteria: [
        "O que vejo na imagem, e onde?",
        "O que está acontecendo na imagem?",
        "Escrevi fatos e também minhas próprias ideias?",
        "O que eu acho da imagem?",
      ].join("\n"),
    },
    ui: {
      pageTitle: "Escrever a partir de imagem",
      pageIntro: "A primeira versão salva uma tarefa de escrita baseada em imagem como conteúdo normal.",
      myContent: "Meu conteúdo",
      videoTitle: "Vídeo de instrução",
      videoPlaceholder: "Veja como criar uma tarefa de escrita",
      closeVideo: "Fechar vídeo",
      title: "Título",
      language: "Idioma",
      level: "Nível",
      taskType: "Tipo de tarefa",
      sectionTask: "1. Tarefa",
      sectionImage: "2. Imagem",
      sectionInstruction: "3. Instrução para o estudante",
      sectionSupport: "4. Apoio e impressão",
      editSuggestionsHint: "Você pode editar as sugestões. Remova ou adicione o que combina com os estudantes.",
      resetSuggestions: "Redefinir sugestões",
      uploadMode: "Enviar / URL da imagem",
      aiMode: "Gerada por IA",
      uploadImage: "Enviar imagem",
      imageUrl: "Ou cole a URL da imagem",
      imageUrlShort: "URL da imagem",
      prompt: "Prompt da imagem de IA",
      promptPlaceholder: "Descreva a imagem que você quer criar. Evite texto dentro da imagem.",
      imagePrivacyHint: "Não use fotos ou nomes de alunos sem esclarecimento prévio.",
      promptSuggestion: "Escolher sugestao de prompt",
      promptSuggestionPlaceholder: "Escolha uma sugestao...",
      generate: "Gerar imagem",
      generating: "Gerando...",
      storageHint: "A imagem é salva no Firebase Storage e pode ser usada antes de salvar a tarefa.",
      aspectHint: "O formato padrao e 16:9. As imagens sao mostradas neste quadro e podem ser cortadas.",
      imageDescription: "Descrição da imagem / imageDescription",
      imageDescriptionPlaceholder: "Descreva o motivo, pessoas, lugar, ação e detalhes importantes que a IA deve usar para avaliar o texto.",
      imagePreviewTitle: "Imagem escolhida",
      instruction: "Instrução para o estudante",
      support: "Sugestões de palavras de apoio",
      criteria: "Sugestões de critérios de sucesso",
      printHelp: "Ajuda extra na impressão",
      printShort: "Curta",
      printMedium: "Média",
      printLong: "Longa",
      printShortHint: "Imagem, instrução e linhas de resposta.",
      printMediumHint: "Também inclui palavras de apoio.",
      printLongHint: "Inclui palavras de apoio e critérios de sucesso.",
      none: "Nenhuma",
      saveAndPreview: "Salvar e visualizar",
      save: "Salvar em Meu conteúdo",
      saveChanges: "Salvar alterações",
      savePanelTitle: "Pronto para salvar",
      editPanelTitle: "Pronto para salvar alterações",
      savePanelInfo: "Você será enviado para Meu conteúdo ao salvar. Lá você pode imprimir a tarefa em PDF ou compartilhá-la digitalmente com a turma.",
      saving: "Salvando...",
      openPreview: "Abrir/visualizar",
      preview: "Visualização",
      imagePlaceholder: "A imagem aparecerá aqui",
      untitled: "Sem título",
      aiContext: "Contexto da imagem para feedback de IA",
      imageAlt: "Tarefa com imagem",
    },
    messages: {
      uploaded: "A imagem foi enviada.",
      uploadFailed: "Falha ao enviar.",
      loginUpload: "Você precisa estar conectado para enviar uma imagem.",
      imageOnly: "Escolha um arquivo de imagem.",
      tooLarge: "O arquivo é grande demais. Máximo de 8 MB.",
      loginGenerate: "Você precisa estar conectado para gerar uma imagem.",
      promptRequired: "Escreva primeiro um prompt para a imagem de IA.",
      generateFailed: "A geração da imagem falhou.",
      noImage: "A geração da imagem não retornou uma URL.",
      generated: "A imagem de IA foi gerada. Lembre-se de escrever a descrição da imagem antes de salvar.",
      loginSave: "Você precisa estar conectado para salvar.",
      missingRequired: "Preencha os campos obrigatórios antes de salvar:",
      completeRequired: "Preencha os campos obrigatórios antes de salvar.",
      saveFailed: "Falha ao salvar.",
      saved: "A tarefa de escrita foi salva em Meu conteúdo.",
      loadingEdit: "Carregando a tarefa de escrita...",
      editLoadFailed: "Não foi possível abrir a tarefa para edição.",
      notFound: "Não foi possível encontrar a tarefa.",
      notOwner: "Você só pode editar tarefas que pertencem a você.",
      unsupportedLesson: "Esta tarefa não pode ser editada no 321School Studio.",
    },
  },
} satisfies Record<Language, {
  taskTypes: Record<TaskType, string>;
  defaults: { instruction: string; supportWords: string; successCriteria: string };
  ui: Record<string, string>;
  messages: Record<string, string>;
}>;

const promptSuggestions: Record<Language, string[]> = {
  nb: [
    "Lag et bilde med en mor, far og to barn, en jente og en gutt, som er i butikken. De har epler, bananer og poteter i handlekurven.",
    "Lag et bilde av en elev som sitter ved et vindu og skriver i en bok mens det regner ute.",
    "Lag et bilde av tre venner som spiller fotball på en skolegård en solrik dag.",
    "Lag et bilde av en familie som lager middag sammen på kjøkkenet.",
    "Lag et bilde av en person som venter på bussen med en ryggsekk og en kopp varm drikke.",
    "Lag et bilde av en klasse som besøker et bibliotek og leter etter bøker.",
    "Lag et bilde av en gutt og en jente som finner en gammel nøkkel i en park.",
    "Lag et bilde av en rolig norsk fjord med fjell, små hus og en person som går langs vannet.",
    "Lag et bilde av en elev som hjelper en ny klassekamerat i friminuttet.",
    "Lag et bilde av et marked med frukt, grønnsaker, mennesker og mange små detaljer.",
  ],
  en: [
    "Create an image of a mother, father and two children, a girl and a boy, in a grocery store. They have apples, bananas and potatoes in the shopping cart.",
    "Create an image of a student sitting by a window and writing in a notebook while it rains outside.",
    "Create an image of three friends playing football in a schoolyard on a sunny day.",
    "Create an image of a family cooking dinner together in the kitchen.",
    "Create an image of a person waiting for the bus with a backpack and a cup of hot drink.",
    "Create an image of a class visiting a library and looking for books.",
    "Create an image of a boy and a girl finding an old key in a park.",
    "Create an image of a calm Norwegian fjord with mountains, small houses and a person walking by the water.",
    "Create an image of a student helping a new classmate during recess.",
    "Create an image of a market with fruit, vegetables, people and many small details.",
  ],
  pt: [
    "Crie uma imagem de uma mae, um pai e duas criancas, uma menina e um menino, em uma loja. Eles tem macas, bananas e batatas no carrinho.",
    "Crie uma imagem de um estudante sentado perto de uma janela escrevendo em um caderno enquanto chove la fora.",
    "Crie uma imagem de tres amigos jogando futebol no patio da escola em um dia ensolarado.",
    "Crie uma imagem de uma familia preparando o jantar junta na cozinha.",
    "Crie uma imagem de uma pessoa esperando o onibus com uma mochila e um copo de bebida quente.",
    "Crie uma imagem de uma turma visitando uma biblioteca e procurando livros.",
    "Crie uma imagem de um menino e uma menina encontrando uma chave antiga em um parque.",
    "Crie uma imagem de um fiorde noruegues calmo com montanhas, casas pequenas e uma pessoa caminhando perto da agua.",
    "Crie uma imagem de um estudante ajudando um novo colega durante o intervalo.",
    "Crie uma imagem de um mercado com frutas, verduras, pessoas e muitos pequenos detalhes.",
  ],
};

const taskDefaults: Record<Language, Record<TaskType, TaskDefaultSet>> = {
  nb: {
    describe: copy.nb.defaults,
    story: {
      instruction: "Skriv en kort historie på 80 til 150 ord som passer til bildet. Historien skal ha en begynnelse, en midtdel og en avslutning.",
      supportWords: [
        "En dag ...",
        "Plutselig ...",
        "Etterpå ...",
        "Personen oppdaget ...",
        "Problemet var ...",
        "Heldigvis ...",
        "Til slutt ...",
        "Historien ender med ...",
      ].join("\n"),
      successCriteria: [
        "Har historien en tydelig begynnelse, midtdel og slutt?",
        "Passer historien til bildet?",
        "Har jeg med personer, sted og handling?",
        "Har jeg brukt detaljer som gjør historien levende?",
      ].join("\n"),
    },
    dialogue: {
      instruction: "Skriv en dialog mellom to eller flere personer som kan passe til bildet. Bruk replikker og vis hvem som snakker.",
      supportWords: [
        "Person A: ...",
        "Person B: ...",
        "Hei, ...",
        "Hva gjør du?",
        "Jeg tror ...",
        "Hvorfor ...?",
        "Det høres ut som ...",
        "Til slutt sier ...",
      ].join("\n"),
      successCriteria: [
        "Er det tydelig hvem som snakker?",
        "Passer dialogen til bildet?",
        "Har dialogen minst fire replikker?",
        "Viser dialogen tanker, følelser eller handling?",
      ].join("\n"),
    },
    reflection: {
      instruction: "Skriv en refleksjon om bildet. Forklar hva du legger merke til, hva du tror skjer, og hvilke tanker bildet gir deg.",
      supportWords: [
        "Jeg legger merke til ...",
        "Jeg tror ... fordi ...",
        "Dette kan bety ...",
        "Bildet får meg til å tenke på ...",
        "På den ene siden ...",
        "På den andre siden ...",
        "Jeg lurer på ...",
        "Min mening er ...",
      ].join("\n"),
      successCriteria: [
        "Har jeg forklart hva jeg ser og hva jeg tenker?",
        "Har jeg begrunnet meningene mine?",
        "Har jeg brukt detaljer fra bildet?",
        "Har jeg stilt spørsmål eller vist undring?",
      ].join("\n"),
    },
  },
  en: {
    describe: copy.en.defaults,
    story: {
      instruction: "Write a short story of 80 to 150 words that fits the picture. The story should have a beginning, middle, and ending.",
      supportWords: [
        "One day ...",
        "Suddenly ...",
        "After that ...",
        "The person discovered ...",
        "The problem was ...",
        "Luckily ...",
        "In the end ...",
        "The story ends with ...",
      ].join("\n"),
      successCriteria: [
        "Does the story have a clear beginning, middle, and ending?",
        "Does the story fit the picture?",
        "Have I included people, place, and action?",
        "Have I used details that make the story vivid?",
      ].join("\n"),
    },
    dialogue: {
      instruction: "Write a dialogue between two or more people that could fit the picture. Use speech lines and show who is speaking.",
      supportWords: [
        "Person A: ...",
        "Person B: ...",
        "Hi, ...",
        "What are you doing?",
        "I think ...",
        "Why ...?",
        "That sounds like ...",
        "In the end, ... says ...",
      ].join("\n"),
      successCriteria: [
        "Is it clear who is speaking?",
        "Does the dialogue fit the picture?",
        "Does the dialogue have at least four speech lines?",
        "Does the dialogue show thoughts, feelings, or action?",
      ].join("\n"),
    },
    reflection: {
      instruction: "Write a reflection about the picture. Explain what you notice, what you think is happening, and what thoughts the picture gives you.",
      supportWords: [
        "I notice ...",
        "I think ... because ...",
        "This could mean ...",
        "The picture makes me think of ...",
        "On one hand ...",
        "On the other hand ...",
        "I wonder ...",
        "My opinion is ...",
      ].join("\n"),
      successCriteria: [
        "Have I explained what I see and what I think?",
        "Have I given reasons for my opinions?",
        "Have I used details from the picture?",
        "Have I asked questions or shown curiosity?",
      ].join("\n"),
    },
  },
  pt: {
    describe: copy.pt.defaults,
    story: {
      instruction: "Escreva uma história curta de 80 a 150 palavras que combine com a imagem. A história deve ter começo, meio e fim.",
      supportWords: [
        "Um dia ...",
        "De repente ...",
        "Depois disso ...",
        "A pessoa descobriu ...",
        "O problema era ...",
        "Felizmente ...",
        "No final ...",
        "A história termina com ...",
      ].join("\n"),
      successCriteria: [
        "A história tem começo, meio e fim claros?",
        "A história combina com a imagem?",
        "Incluí pessoas, lugar e ação?",
        "Usei detalhes que deixam a história mais viva?",
      ].join("\n"),
    },
    dialogue: {
      instruction: "Escreva um diálogo entre duas ou mais pessoas que combine com a imagem. Use falas e mostre quem está falando.",
      supportWords: [
        "Pessoa A: ...",
        "Pessoa B: ...",
        "Olá, ...",
        "O que você está fazendo?",
        "Eu acho que ...",
        "Por que ...?",
        "Isso parece ...",
        "No final, ... diz ...",
      ].join("\n"),
      successCriteria: [
        "Está claro quem está falando?",
        "O diálogo combina com a imagem?",
        "O diálogo tem pelo menos quatro falas?",
        "O diálogo mostra pensamentos, sentimentos ou ação?",
      ].join("\n"),
    },
    reflection: {
      instruction: "Escreva uma reflexão sobre a imagem. Explique o que você observa, o que acha que está acontecendo e que pensamentos a imagem provoca.",
      supportWords: [
        "Eu observo ...",
        "Eu acho que ... porque ...",
        "Isso pode significar ...",
        "A imagem me faz pensar em ...",
        "Por um lado ...",
        "Por outro lado ...",
        "Eu me pergunto ...",
        "Minha opinião é ...",
      ].join("\n"),
      successCriteria: [
        "Expliquei o que vejo e o que penso?",
        "Justifiquei minhas opiniões?",
        "Usei detalhes da imagem?",
        "Fiz perguntas ou mostrei curiosidade?",
      ].join("\n"),
    },
  },
};

const taskTypeDescriptions: Record<Language, Record<TaskType, string>> = {
  nb: {
    describe: "Eleven beskriver motiv, detaljer og egne observasjoner.",
    story: "Eleven bruker bildet som startpunkt for en fortelling.",
    dialogue: "Eleven skriver replikker mellom personer i eller rundt bildet.",
    reflection: "Eleven forklarer tanker, tolkninger og spørsmål bildet vekker.",
  },
  en: {
    describe: "The student describes the motif, details, and observations.",
    story: "The student uses the picture as a starting point for a story.",
    dialogue: "The student writes speech lines between people in or around the picture.",
    reflection: "The student explains thoughts, interpretations, and questions prompted by the picture.",
  },
  pt: {
    describe: "O estudante descreve o motivo, os detalhes e suas observações.",
    story: "O estudante usa a imagem como ponto de partida para uma história.",
    dialogue: "O estudante escreve falas entre pessoas na imagem ou ao redor dela.",
    reflection: "O estudante explica pensamentos, interpretações e perguntas que a imagem provoca.",
  },
};

function isDefaultValue(value: string, key: keyof typeof copy.nb.defaults) {
  return languages.some((lang) =>
    (Object.keys(taskDefaults[lang]) as TaskType[]).some(
      (type) => value.trim() === taskDefaults[lang][type][key].trim()
    )
  );
}

function getTaskDefaults(language: Language, taskType: TaskType): TaskDefaultSet {
  return taskDefaults[language][taskType];
}

function newId() {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function splitLines(value: string) {
  const lines = value
    .split(/\r?\n/g)
    .map((item) => item.trim())
    .filter(Boolean);

  if (lines.length > 1) return lines;

  return value
    .split(/,/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function stringListValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => stringValue(item).trim()).filter(Boolean).join("\n");
  }
  return stringValue(value);
}

function pickLanguageValue(value: unknown, fallback: Language): Language {
  return value === "en" || value === "pt" || value === "nb" ? value : fallback;
}

function pickLevelValue(value: unknown): Level {
  return value === "A1" ||
    value === "A2" ||
    value === "B1" ||
    value === "B2" ||
    value === "C1" ||
    value === "C2"
    ? value
    : "A2";
}

function pickTaskTypeValue(value: unknown): TaskType {
  return value === "story" || value === "dialogue" || value === "reflection" || value === "describe"
    ? value
    : "describe";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fieldLabel(text: string, required = false) {
  return (
    <div style={{ fontSize: 13, fontWeight: 850, color: "#334155" }}>
      {text}
      {required ? <span style={{ color: "#b91c1c" }}> *</span> : null}
    </div>
  );
}

function languageFromLocale(locale: string): Language {
  if (locale === "en" || locale === "pt") return locale;
  return "nb";
}

export default function ImageWritingProducerPage() {
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const uiLanguage = languageFromLocale(locale);
  const editLessonId = searchParams.get("edit")?.trim() || "";
  const isEditMode = Boolean(editLessonId);

  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState<Language>(() => uiLanguage);
  const [level, setLevel] = useState<Level>("A2");
  const [taskType, setTaskType] = useState<TaskType>("describe");
  const [imageMode, setImageMode] = useState<ImageMode>("uploaded");
  const [imageUrl, setImageUrl] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageDescription, setImageDescription] = useState("");
  const [instruction, setInstruction] = useState(() => getTaskDefaults(uiLanguage, "describe").instruction);
  const [supportWords, setSupportWords] = useState(() => getTaskDefaults(uiLanguage, "describe").supportWords);
  const [successCriteria, setSuccessCriteria] = useState(() => getTaskDefaults(uiLanguage, "describe").successCriteria);
  const [printMode, setPrintMode] = useState<PrintMode>("medium");
  const [imageTaskId, setImageTaskId] = useState(() => newId());

  const [uploading, setUploading] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [draftImageLessonId] = useState(
    () => `image-writing-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const ui = copy[uiLanguage].ui;
  const messages = copy[uiLanguage].messages;
  const taskTypeLabels = copy[uiLanguage].taskTypes;
  const taskTypeDescription = taskTypeDescriptions[uiLanguage][taskType];

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 720);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!videoOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setVideoOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [videoOpen]);

  useEffect(() => {
    if (!editLessonId) return;

    let cancelled = false;
    setLoadingEdit(true);
    setError(null);
    setMessage(null);

    const unsubscribe = onAuthStateChanged(getAuth(), async (user) => {
      if (!user) {
        if (!cancelled) {
          setError(messages.loginSave);
          setLoadingEdit(false);
        }
        return;
      }

      try {
        const snap = await getDoc(doc(db, "lessons", editLessonId));
        if (!snap.exists()) throw new Error(messages.notFound);

        const data = snap.data() as Record<string, unknown>;
        const ownerId = stringValue(data.ownerId) || stringValue(data.uid);
        if (ownerId && ownerId !== user.uid) throw new Error(messages.notOwner);

        const lessonType = String(data.lessonType ?? data.textType ?? data.texttype ?? "").trim().toLowerCase();
        if (lessonType !== "image_writing") throw new Error(messages.unsupportedLesson);

        const imageTasks = Array.isArray(data.imageTasks) ? data.imageTasks : [];
        const firstTask = isRecord(imageTasks[0]) ? imageTasks[0] : {};
        const nextLanguage = pickLanguageValue(data.language, uiLanguage);
        const nextTaskType = pickTaskTypeValue(firstTask.taskType ?? data.taskType);

        if (cancelled) return;

        setTitle(stringValue(data.title));
        setLanguage(nextLanguage);
        setLevel(pickLevelValue(data.level));
        setTaskType(nextTaskType);
        setImageTaskId(stringValue(firstTask.id) || newId());
        setImageMode(firstTask.imageSource === "ai_generated" ? "ai_generated" : "uploaded");
        setImageUrl(stringValue(firstTask.imageUrl) || stringValue(data.coverImageUrl));
        setImagePrompt(stringValue(firstTask.imagePrompt));
        setImageDescription(stringValue(firstTask.imageDescription));
        setInstruction(stringValue(firstTask.instruction) || getTaskDefaults(nextLanguage, nextTaskType).instruction);
        setSupportWords(stringListValue(firstTask.supportWords) || getTaskDefaults(nextLanguage, nextTaskType).supportWords);
        setSuccessCriteria(
          stringListValue(firstTask.successCriteria) || getTaskDefaults(nextLanguage, nextTaskType).successCriteria
        );
        setPrintMode(firstTask.printSuccessCriteria === true ? "long" : firstTask.printSupportWords === true ? "medium" : "short");
        setLoadingEdit(false);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : messages.editLoadFailed);
          setLoadingEdit(false);
        }
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [editLessonId, messages.editLoadFailed, messages.loginSave, messages.notFound, messages.notOwner, messages.unsupportedLesson, uiLanguage]);

  function changeLanguage(next: Language) {
    setLanguage(next);
    const nextDefaults = getTaskDefaults(next, taskType);
    if (isDefaultValue(instruction, "instruction")) {
      setInstruction(nextDefaults.instruction);
    }
    if (isDefaultValue(supportWords, "supportWords")) {
      setSupportWords(nextDefaults.supportWords);
    }
    if (isDefaultValue(successCriteria, "successCriteria")) {
      setSuccessCriteria(nextDefaults.successCriteria);
    }
  }

  function changeTaskType(next: TaskType) {
    setTaskType(next);
    const nextDefaults = getTaskDefaults(language, next);
    if (isDefaultValue(instruction, "instruction")) {
      setInstruction(nextDefaults.instruction);
    }
    if (isDefaultValue(supportWords, "supportWords")) {
      setSupportWords(nextDefaults.supportWords);
    }
    if (isDefaultValue(successCriteria, "successCriteria")) {
      setSuccessCriteria(nextDefaults.successCriteria);
    }
  }

  function resetSuggestions() {
    const defaults = getTaskDefaults(language, taskType);
    setInstruction(defaults.instruction);
    setSupportWords(defaults.supportWords);
    setSuccessCriteria(defaults.successCriteria);
  }

  const canSave = useMemo(
    () =>
      title.trim() &&
      imageUrl.trim() &&
      imageDescription.trim() &&
      instruction.trim() &&
      (imageMode !== "ai_generated" || imagePrompt.trim()),
    [title, imageUrl, imageDescription, instruction, imageMode, imagePrompt]
  );

  const pageShellStyle: React.CSSProperties = {
    ...pageShell,
    ...(isMobile
      ? {
          padding: "14px 10px 150px",
        }
      : {}),
  };

  const heroHeaderStyle: React.CSSProperties = {
    ...heroHeader,
    ...(isMobile
      ? {
          borderRadius: 22,
          padding: 18,
          gap: 14,
        }
      : {}),
  };

  const heroTitleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: isMobile ? 30 : 34,
    lineHeight: 1.08,
    color: "#0f172a",
  };

  const heroIntroStyle: React.CSSProperties = {
    margin: "10px 0 0",
    color: "#475569",
    lineHeight: 1.5,
    maxWidth: 620,
    fontSize: isMobile ? 16 : undefined,
  };

  const videoLinkStyle: React.CSSProperties = {
    ...videoLink,
    ...(isMobile
      ? {
          width: "100%",
          minWidth: 0,
          flex: "1 1 100%",
          borderRadius: 18,
        }
      : {}),
  };

  const videoThumbStyle: React.CSSProperties = {
    ...videoThumb,
    ...(isMobile
      ? {
          width: 104,
        }
      : {}),
  };

  const layoutStyle: React.CSSProperties = {
    ...layout,
    ...(isMobile ? { marginTop: 14 } : {}),
  };

  const formPanelStyle: React.CSSProperties = {
    ...panel,
    ...(isMobile ? { padding: 14, borderRadius: 20 } : {}),
  };

  const gridTwoStyle: React.CSSProperties = {
    ...gridTwo,
    ...(isMobile ? { gridTemplateColumns: "1fr" } : {}),
  };

  const taskTypeGridStyle: React.CSSProperties = {
    ...taskTypeGrid,
    ...(isMobile ? { gridTemplateColumns: "1fr" } : {}),
  };

  const printModeGridStyle: React.CSSProperties = {
    ...printModeGrid,
    ...(isMobile ? { gridTemplateColumns: "1fr" } : {}),
  };

  function missingRequiredFields() {
    const missing: string[] = [];
    if (!title.trim()) missing.push(ui.title);
    if (!imageUrl.trim()) missing.push(imageMode === "ai_generated" ? ui.imageUrlShort : ui.imageUrl);
    if (imageMode === "ai_generated" && !imagePrompt.trim()) missing.push(ui.prompt);
    if (!imageDescription.trim()) missing.push(ui.imageDescription);
    if (!instruction.trim()) missing.push(ui.instruction);
    return missing;
  }

  async function uploadImage(file: File) {
    setError(null);
    setMessage(null);
    setUploading(true);

    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error(messages.loginUpload);
      if (!file.type.startsWith("image/")) throw new Error(messages.imageOnly);
      if (file.size > 8 * 1024 * 1024) throw new Error(messages.tooLarge);

      const safeName = file.name.replace(/[^\w.-]+/g, "_");
      const path = `covers/${user.uid}/${draftImageLessonId}/${Date.now()}-${safeName}`;
      const fileRef = ref(storage, path);

      await uploadBytes(fileRef, file, {
        contentType: file.type,
        cacheControl: "public,max-age=31536000",
      });

      const url = await getDownloadURL(fileRef);
      setImageUrl(url);
      setImageMode("uploaded");
      setMessage(messages.uploaded);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : messages.uploadFailed);
    } finally {
      setUploading(false);
    }
  }

  async function generateAiImage() {
    setError(null);
    setMessage(null);
    setGeneratingImage(true);

    try {
      const user = getAuth().currentUser;
      if (!user || user.isAnonymous) {
        throw new Error(messages.loginGenerate);
      }
      if (!imagePrompt.trim()) {
        throw new Error(messages.promptRequired);
      }

      const token = await user.getIdToken();
      const res = await fetch("/api/images/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          lessonId: draftImageLessonId,
          format: "16:9",
          style: "illustration",
          promptMode: "custom",
          customPrompt: imagePrompt.trim(),
          title: title.trim() || ui.pageTitle,
          level,
          language,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        imageUrl?: string;
        error?: string;
      };

      if (!res.ok) throw new Error(data.error || messages.generateFailed);
      if (!data.imageUrl) throw new Error(messages.noImage);

      setImageUrl(data.imageUrl);
      setImageMode("ai_generated");
      setMessage(messages.generated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : messages.generateFailed);
    } finally {
      setGeneratingImage(false);
    }
  }

  async function saveLesson(destination: "content" | "preview" = "content") {
    setError(null);
    setMessage(null);

    const missing = missingRequiredFields();
    if (missing.length) {
      setError(`${messages.missingRequired} ${missing.join(", ")}`);
      return;
    }

    setSaving(true);

    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error(messages.loginSave);
      const taskId = imageTaskId || newId();
      const supportWordList = splitLines(supportWords);
      const successCriteriaList = splitLines(successCriteria);
      const imageTask = {
        id: taskId,
        taskType,
        imageUrl,
        imageSource: imageMode,
        ...(imageMode === "ai_generated" ? { imagePrompt } : {}),
        imageDescription,
        instruction,
        supportWords: supportWordList,
        successCriteria: successCriteriaList,
        printSupportWords: printMode === "medium" || printMode === "long",
        printSuccessCriteria: printMode === "long",
      };

      if (isEditMode) {
        const sourceText = [
          `${ui.taskType}: ${taskTypeLabels[taskType]}`,
          "",
          instruction,
          "",
          `${ui.imageDescription}:`,
          imageDescription,
          supportWordList.length ? `${ui.support}: ${supportWordList.join(", ")}` : "",
          successCriteriaList.length ? `${ui.criteria}: ${successCriteriaList.join("; ")}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        await updateDoc(doc(db, "lessons", editLessonId), {
          title: title.trim(),
          language,
          level,
          taskType,
          lessonType: "image_writing",
          textType: "image_writing",
          sourceText,
          text: sourceText,
          coverImageUrl: imageUrl,
          imageTasks: [imageTask],
          tasks: [
            {
              id: taskId,
              order: 1,
              type: "open",
              prompt: instruction,
              supportWords: supportWordList,
              successCriteria: successCriteriaList,
              printSupportWords: printMode === "medium" || printMode === "long",
              printSuccessCriteria: printMode === "long",
              imageDescription,
              imageUrl,
              taskType,
            },
          ],
          updatedAt: serverTimestamp(),
        });

        setMessage(messages.saved);
        router.push(destination === "preview" ? `/${locale}/producer/image-writing/${editLessonId}/preview` : `/${locale}/content`);
        return;
      }

      const token = await user.getIdToken();

      const res = await fetch("/api/producer/save-image-writing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          language,
          level,
          taskType,
          imageTasks: [imageTask],
        }),
      });

      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error || messages.saveFailed);

      setMessage(messages.saved);
      router.push(destination === "preview" && data.id ? `/${locale}/producer/image-writing/${data.id}/preview` : `/${locale}/content`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : messages.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  if (loadingEdit) {
    return (
      <main style={pageShellStyle}>
        <section style={heroHeaderStyle}>
          <div style={{ fontWeight: 900, color: "#0f172a" }}>{messages.loadingEdit}</div>
        </section>
      </main>
    );
  }

  return (
    <main style={pageShellStyle}>
      <header style={heroHeaderStyle}>
        <div style={{ minWidth: 0, flex: "1 1 520px" }}>
          <div style={eyebrow}>321School Studio</div>
          <h1 style={heroTitleStyle}>{ui.pageTitle}</h1>
          <p style={heroIntroStyle}>
            {ui.pageIntro}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setVideoOpen(true)}
          style={videoLinkStyle}
          aria-label={ui.videoTitle}
        >
          <div style={videoThumbStyle}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://img.youtube.com/vi/CmAMXZr3y5g/mqdefault.jpg"
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            <div style={playCircle} aria-hidden="true">
              <span style={playTriangle} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#0f172a" }}>{ui.videoTitle}</div>
            <div style={{ marginTop: 3, fontSize: 13, color: "#64748b" }}>{ui.videoPlaceholder}</div>
          </div>
        </button>
      </header>

      {videoOpen ? (
        <div style={videoOverlay} role="dialog" aria-modal="true" aria-label={ui.videoTitle} onClick={() => setVideoOpen(false)}>
          <div style={videoModal} onClick={(event) => event.stopPropagation()}>
            <div style={videoModalHeader}>
              <div style={{ fontSize: 18, fontWeight: 950, color: "#0f172a" }}>{ui.videoTitle}</div>
              <button type="button" onClick={() => setVideoOpen(false)} style={closeVideoButton} aria-label={ui.closeVideo}>
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>
            <div style={videoFrameShell}>
              <iframe
                src="https://www.youtube-nocookie.com/embed/CmAMXZr3y5g?autoplay=1&rel=0&modestbranding=1"
                title={ui.videoTitle}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                style={videoFrame}
              />
            </div>
          </div>
        </div>
      ) : null}

      {error ? <div style={alertError}>{error}</div> : null}
      {message ? <div style={alertOk}>{message}</div> : null}

      <section style={layoutStyle}>
        <div style={formPanelStyle}>
          <div style={sectionBlock}>
            <div style={sectionTitle}>{ui.sectionTask}</div>
            <div style={gridTwoStyle}>
              <label style={field}>
                {fieldLabel(ui.title, true)}
                <input value={title} onChange={(e) => setTitle(e.target.value)} style={input} />
              </label>

              <label style={field}>
                {fieldLabel(ui.language)}
                <select value={language} onChange={(e) => changeLanguage(e.target.value as Language)} style={input}>
                  {languages.map((item) => (
                    <option key={item} value={item}>
                      {item.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>

              <label style={field}>
                {fieldLabel(ui.level)}
                <select value={level} onChange={(e) => setLevel(e.target.value as Level)} style={input}>
                  {levels.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ marginTop: 14 }}>
              {fieldLabel(ui.taskType)}
              <div style={taskTypeGridStyle}>
                {(Object.keys(taskTypeLabels) as TaskType[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => changeTaskType(value)}
                    style={taskType === value ? taskTypeCardActive : taskTypeCard}
                  >
                    {taskTypeLabels[value]}
                  </button>
                ))}
              </div>
              <p style={{ ...helperText, margin: "8px 0 0" }}>{taskTypeDescription}</p>
            </div>
          </div>

          <div style={sectionBlock}>
            <div style={sectionTitle}>{ui.sectionImage}</div>
            <div style={segmentedRow}>
              <button
                type="button"
                onClick={() => setImageMode("uploaded")}
                style={imageMode === "uploaded" ? selectedButton : button}
              >
                {ui.uploadMode}
              </button>
              <button
                type="button"
                onClick={() => setImageMode("ai_generated")}
                style={imageMode === "ai_generated" ? selectedButton : button}
              >
                {ui.aiMode}
              </button>
            </div>
            <p style={{ ...helperText, margin: "8px 0 0" }}>{ui.imagePrivacyHint}</p>

            {imageMode === "uploaded" ? (
              <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                <label style={field}>
                  {fieldLabel(ui.uploadImage)}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploading}
                    onChange={(e) => {
                      const file = e.currentTarget.files?.[0];
                      if (file) void uploadImage(file);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                <label style={field}>
                  {fieldLabel(ui.imageUrl, true)}
                  <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} style={input} />
                </label>
              </div>
            ) : (
              <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                <label style={field}>
                  {fieldLabel(ui.prompt, true)}
                  <textarea
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    rows={3}
                    style={textarea}
                    placeholder={ui.promptPlaceholder}
                  />
                </label>
                <label style={field}>
                  {fieldLabel(ui.promptSuggestion)}
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) setImagePrompt(e.target.value);
                    }}
                    style={input}
                  >
                    <option value="">{ui.promptSuggestionPlaceholder}</option>
                    {promptSuggestions[uiLanguage].map((suggestion, index) => (
                      <option key={suggestion} value={suggestion}>
                        {index + 1}. {suggestion}
                      </option>
                    ))}
                  </select>
                </label>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={generateAiImage}
                    disabled={generatingImage || !imagePrompt.trim()}
                    style={primaryButton}
                  >
                    {generatingImage ? ui.generating : ui.generate}
                  </button>
                  <span style={{ color: "#64748b", fontSize: 13 }}>
                    {ui.storageHint}
                  </span>
                </div>
                <label style={field}>
                  {fieldLabel(ui.imageUrlShort, true)}
                  <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} style={input} />
                </label>
              </div>
            )}

            <div style={imageWorkPreviewCard}>
              <div style={{ ...sectionTitle, marginBottom: 6 }}>{ui.imagePreviewTitle}</div>
              <p style={{ ...helperText, margin: "0 0 10px" }}>{ui.aspectHint}</p>
              <div style={imageWorkPreview}>
                {imageUrl.trim() ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl.trim()} alt={title || ui.imageAlt} style={imageWorkPreviewImg} />
                ) : (
                  <span style={{ color: "#64748b", fontWeight: 700 }}>{ui.imagePlaceholder}</span>
                )}
              </div>
            </div>

            <label style={{ ...field, marginTop: 14 }}>
              {fieldLabel(ui.imageDescription, true)}
              <textarea
                value={imageDescription}
                onChange={(e) => setImageDescription(e.target.value)}
                rows={4}
                style={textarea}
                placeholder={ui.imageDescriptionPlaceholder}
              />
            </label>
          </div>

          <div style={sectionBlock}>
            <div style={sectionTitle}>{ui.sectionInstruction}</div>
            <label style={field}>
              {fieldLabel(ui.instruction, true)}
              <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={3} style={textarea} />
            </label>
          </div>

          <div style={sectionBlock}>
            <div style={sectionHeaderRow}>
              <div>
                <div style={{ ...sectionTitle, marginBottom: 4 }}>{ui.sectionSupport}</div>
                <p style={{ ...helperText, margin: 0 }}>{ui.editSuggestionsHint}</p>
              </div>
              <button type="button" onClick={resetSuggestions} style={smallButton}>
                {ui.resetSuggestions}
              </button>
            </div>
            <div style={{ ...gridTwoStyle, marginTop: 12 }}>
              <label style={field}>
                {fieldLabel(ui.support)}
                <textarea value={supportWords} onChange={(e) => setSupportWords(e.target.value)} rows={4} style={textarea} />
              </label>
              <label style={field}>
                {fieldLabel(ui.criteria)}
                <textarea value={successCriteria} onChange={(e) => setSuccessCriteria(e.target.value)} rows={4} style={textarea} />
              </label>
            </div>

            <div style={{ marginTop: 14 }}>
              {fieldLabel(ui.printHelp)}
              <div style={printModeGridStyle}>
                {([
                  ["short", ui.printShort, ui.printShortHint],
                  ["medium", ui.printMedium, ui.printMediumHint],
                  ["long", ui.printLong, ui.printLongHint],
                ] as Array<[PrintMode, string, string]>).map(([value, label, hint]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPrintMode(value)}
                    style={printMode === value ? printChoiceActive : printChoice}
                  >
                    <span style={{ fontWeight: 900 }}>{label}</span>
                    <span style={{ ...helperText, color: printMode === value ? "#1e40af" : "#64748b" }}>{hint}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

        </div>
      </section>

      <div style={stickyBottomShell}>
        <div style={stickyBottomInner}>
          <div style={{ minWidth: 280, flex: "1 1 520px" }}>
            <div style={{ fontWeight: 900, color: "#0f172a" }}>
              {isEditMode ? ui.editPanelTitle : ui.savePanelTitle}
            </div>
            <div style={{ marginTop: 3, color: "#475569", fontSize: 13, fontWeight: 700, lineHeight: 1.35 }}>
              {ui.savePanelInfo}
            </div>
          </div>

          <div style={stickyActionGroup}>
            <button
              type="button"
              onClick={() => saveLesson("preview")}
              disabled={saving || loadingEdit}
              title={!canSave ? messages.completeRequired : undefined}
              style={{ ...stickySecondaryButton, opacity: canSave || saving ? 1 : 0.72 }}
            >
              {ui.saveAndPreview}
            </button>

            <button
              type="button"
              onClick={() => saveLesson("content")}
              disabled={saving || loadingEdit}
              title={!canSave ? messages.completeRequired : undefined}
              style={{ ...stickyPrimaryButton, opacity: canSave || saving ? 1 : 0.72 }}
            >
              {saving ? ui.saving : isEditMode ? ui.saveChanges : ui.save}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

const layout: React.CSSProperties = {
  marginTop: 20,
  display: "block",
};

const pageShell: React.CSSProperties = {
  width: "100%",
  maxWidth: 1040,
  margin: "0 auto",
  padding: "20px 14px 132px",
};

const heroHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "stretch",
  gap: 16,
  flexWrap: "wrap",
  border: "1px solid #dbeafe",
  borderRadius: 24,
  background: "linear-gradient(135deg, #ffffff 0%, #f8fbff 56%, #eef6ff 100%)",
  padding: 22,
  boxShadow: "0 18px 45px rgba(15,23,42,0.07)",
};

const eyebrow: React.CSSProperties = {
  marginBottom: 7,
  color: "#0f766e",
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const videoLink: React.CSSProperties = {
  minWidth: 250,
  flex: "0 1 320px",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#bfdbfe",
  borderRadius: 20,
  background: "rgba(255,255,255,0.88)",
  padding: 10,
  display: "flex",
  alignItems: "center",
  gap: 12,
  color: "inherit",
  boxShadow: "0 10px 24px rgba(37,99,235,0.09)",
  cursor: "pointer",
  textAlign: "left",
};

const videoThumb: React.CSSProperties = {
  position: "relative",
  width: 92,
  aspectRatio: "16 / 9",
  borderRadius: 14,
  overflow: "hidden",
  background: "#dbeafe",
  flex: "0 0 auto",
};

const playCircle: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "50%",
  transform: "translate(-50%, -50%)",
  width: 36,
  height: 36,
  borderRadius: 999,
  background: "#2563eb",
  display: "grid",
  placeItems: "center",
  boxShadow: "0 8px 18px rgba(37,99,235,0.22)",
};

const playTriangle: React.CSSProperties = {
  width: 0,
  height: 0,
  borderTop: "8px solid transparent",
  borderBottom: "8px solid transparent",
  borderLeft: "12px solid #ffffff",
  marginLeft: 3,
};

const videoOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 50,
  display: "grid",
  placeItems: "center",
  background: "rgba(15,23,42,0.72)",
  padding: 16,
};

const videoModal: React.CSSProperties = {
  width: "min(960px, 100%)",
  overflow: "hidden",
  borderRadius: 22,
  background: "#ffffff",
  boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
};

const videoModalHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  borderBottomWidth: 1,
  borderBottomStyle: "solid",
  borderBottomColor: "#e2e8f0",
  padding: "16px 18px",
};

const closeVideoButton: React.CSSProperties = {
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#cbd5e1",
  borderRadius: 12,
  background: "#ffffff",
  color: "#334155",
  width: 38,
  height: 38,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
};

const videoFrameShell: React.CSSProperties = {
  aspectRatio: "16 / 9",
  background: "#000000",
};

const videoFrame: React.CSSProperties = {
  width: "100%",
  height: "100%",
  border: 0,
};

const panel: React.CSSProperties = {
  border: "1px solid #dbeafe",
  borderRadius: 22,
  background: "#f8fbff",
  padding: 18,
  boxShadow: "0 14px 34px rgba(15,23,42,0.06)",
};

const sectionBlock: React.CSSProperties = {
  border: "1px solid #cfe0f3",
  borderRadius: 18,
  background: "#eaf6fb",
  padding: 18,
  marginBottom: 16,
};

const sectionHeaderRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 12,
};

const sectionTitle: React.CSSProperties = {
  marginBottom: 12,
  color: "#0f172a",
  fontSize: 15,
  fontWeight: 950,
};

const gridTwo: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const field: React.CSSProperties = { display: "grid", gap: 6 };

const helperText: React.CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.35,
};

const segmentedRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 8,
};

const taskTypeGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
  gap: 10,
  marginTop: 8,
};

const taskTypeCard: React.CSSProperties = {
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#cbd5e1",
  borderRadius: 16,
  padding: "12px 11px",
  background: "#f8fafc",
  color: "#0f172a",
  fontWeight: 900,
  textAlign: "left",
  cursor: "pointer",
  minHeight: 58,
};

const taskTypeCardActive: React.CSSProperties = {
  ...taskTypeCard,
  borderColor: "#2563eb",
  background: "#eff6ff",
  color: "#1d4ed8",
  boxShadow: "0 0 0 3px rgba(37,99,235,0.12)",
};

const input: React.CSSProperties = {
  width: "100%",
  border: "1px solid #cbd5e1",
  borderRadius: 12,
  padding: "10px 11px",
  boxSizing: "border-box",
  background: "#ffffff",
  boxShadow: "inset 0 1px 2px rgba(15,23,42,0.03)",
};

const textarea: React.CSSProperties = {
  ...input,
  resize: "vertical",
  lineHeight: 1.45,
};

const button: React.CSSProperties = {
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#cbd5e1",
  borderRadius: 12,
  padding: "10px 12px",
  background: "white",
  fontWeight: 800,
  cursor: "pointer",
};

const selectedButton: React.CSSProperties = {
  ...button,
  borderWidth: 2,
  borderColor: "#2563eb",
  padding: "9px 11px",
  background: "#eff6ff",
  color: "#1d4ed8",
  boxShadow: "0 0 0 3px rgba(37,99,235,0.12)",
};

const primaryButton: React.CSSProperties = {
  ...button,
  background: "#0f766e",
  borderColor: "#0f766e",
  color: "#ffffff",
  boxShadow: "0 8px 18px rgba(15,118,110,0.16)",
};

const imageWorkPreviewCard: React.CSSProperties = {
  marginTop: 16,
  border: "1px solid #cfe0f3",
  borderRadius: 16,
  background: "rgba(255,255,255,0.72)",
  padding: 12,
};

const imageWorkPreview: React.CSSProperties = {
  width: "100%",
  aspectRatio: "16 / 9",
  border: "1px solid #cbd5e1",
  borderRadius: 14,
  background: "linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)",
  display: "grid",
  placeItems: "center",
  overflow: "hidden",
};

const imageWorkPreviewImg: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const smallButton: React.CSSProperties = {
  ...button,
  borderRadius: 999,
  padding: "7px 10px",
  fontSize: 12,
};

const stickyBottomShell: React.CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 60,
  padding: "10px 12px calc(10px + env(safe-area-inset-bottom))",
  borderTop: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.96)",
  boxShadow: "0 -10px 30px rgba(15,23,42,0.10)",
  backdropFilter: "blur(8px)",
};

const stickyBottomInner: React.CSSProperties = {
  width: "100%",
  maxWidth: 1040,
  margin: "0 auto",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  flexWrap: "wrap",
};

const stickyActionGroup: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 10,
  flexWrap: "wrap",
};

const stickyPrimaryButton: React.CSSProperties = {
  ...button,
  borderColor: "#0f172a",
  background: "#0f172a",
  color: "#ffffff",
  borderRadius: 12,
  padding: "11px 16px",
  boxShadow: "0 8px 18px rgba(15,23,42,0.16)",
  whiteSpace: "nowrap",
};

const stickySecondaryButton: React.CSSProperties = {
  ...button,
  borderColor: "#cbd5e1",
  background: "#ffffff",
  color: "#0f172a",
  borderRadius: 12,
  padding: "11px 16px",
  whiteSpace: "nowrap",
};

const alertError: React.CSSProperties = {
  marginTop: 14,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
  borderRadius: 14,
  padding: 12,
};

const alertOk: React.CSSProperties = {
  marginTop: 14,
  border: "1px solid #bbf7d0",
  background: "#f0fdf4",
  color: "#166534",
  borderRadius: 14,
  padding: 12,
};

const printModeGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
  marginTop: 8,
};

const printChoice: React.CSSProperties = {
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#cbd5e1",
  borderRadius: 14,
  padding: "9px 10px",
  background: "#f8fafc",
  color: "#0f172a",
  display: "grid",
  gap: 3,
  textAlign: "left",
  cursor: "pointer",
  minWidth: 0,
};

const printChoiceActive: React.CSSProperties = {
  ...printChoice,
  borderColor: "#2563eb",
  background: "#eff6ff",
  boxShadow: "0 0 0 3px rgba(37,99,235,0.12)",
};
