import type { ListeningTest } from "./types";
import { listeningScript } from "./types";

export const exampleListeningTest:ListeningTest={
  version:1,title:"En endret avtale",level:"A2",language:"nb",plays:2,playback:"individual",aiVoice:true,
  script:"Hei! Det er Nora som ringer. Vi skulle møtes på biblioteket torsdag klokka fem, men jeg må jobbe lenger den dagen. Kan vi heller møtes fredag? Biblioteket stenger tidlig på fredager, så jeg foreslår kafeen ved busstoppet. Der kan vi sitte og planlegge turen vår.\n\nTa gjerne med kartet du kjøpte. Jeg tar med en liste over det vi trenger. Bussen min kommer fram litt før seks, og jeg går rett til kafeen. Hvis du er der først, kan du finne et bord ved vinduet. Ring meg hvis fredag ikke passer. Da finner vi en annen dag sammen.",
  tasks:[
    {id:"information",type:"mcq",prompt:"Hva skal de ta med til planleggingen?",options:["Et kart og en liste","Mat og drikke","En bok og en billett"],correctAnswer:"Et kart og en liste"},
    {id:"reason",type:"mcq",prompt:"Hvorfor må avtalen på torsdag endres?",options:["Nora må jobbe lenger","Biblioteket er stengt hele dagen","Bussen går ikke"],correctAnswer:"Nora må jobbe lenger"},
    {id:"connection",type:"mcq",prompt:"Hvorfor passer kafeen bedre enn biblioteket på fredag?",options:["Nora kommer etter at biblioteket stenger tidlig","De vil kjøpe et nytt kart på kafeen","De trenger å møte kollegene til Nora"],correctAnswer:"Nora kommer etter at biblioteket stenger tidlig"},
    {id:"true",type:"true_false",prompt:"Nora ber den andre ringe hvis fredag ikke passer.",correctAnswer:true},
    {id:"false",type:"true_false",prompt:"Nora ber den andre finne et bord ute.",correctAnswer:false},
    {id:"summary",type:"best_summary",prompt:"Hvilken oppsummering passer best?",options:["Nora foreslår en ny dag og et nytt sted for å planlegge en tur","Nora skal ta med en liste over det de trenger","Den andre har kjøpt et kart til turen"],correctAnswer:"Nora foreslår en ny dag og et nytt sted for å planlegge en tur"},
  ],
};

const startClips=[
  {taskId:"start-1",script:"Hei! Jeg har bursdag på lørdag. Vi skal feire hjemme hos meg. Du er velkommen!"},
  {taskId:"start-2",script:"I bursdagen skal vi spise pizza sammen. Etter maten får alle et stykke kake."},
  {taskId:"start-3",script:"Bursdagen min begynner klokken fem. Du kan komme litt før, hvis du vil."},
  {taskId:"start-4",script:"Ta med varme klær til bursdagen. Vi skal være litt ute i hagen etter maten."},
];
export const exampleStartListeningTest:ListeningTest={version:1,title:"En bursdag",level:"A1Start",language:"nb",plays:2,playback:"individual",script:listeningScript(startClips),clips:startClips,tasks:[
  {id:"start-1",type:"mcq",prompt:"Hvor skal de feire bursdagen?",options:["Hjemme","På skolen","I parken"],correctAnswer:"Hjemme"},
  {id:"start-2",type:"mcq",prompt:"Hva skal de spise først?",options:["Kake","Pizza","Fisk"],correctAnswer:"Pizza"},
  {id:"start-3",type:"mcq",prompt:"Når begynner bursdagen?",options:["Klokken fire","Klokken seks","Klokken fem"],correctAnswer:"Klokken fem"},
  {id:"start-4",type:"mcq",prompt:"Hva skal de ta med?",options:["Varme klær","En bok","En stol"],correctAnswer:"Varme klær"},
]};
