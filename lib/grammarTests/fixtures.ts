import type { GrammarFocus,GrammarTest } from "./types";
const words:[string,string,string,"og_aa"|"den_det"][]=[
  ["Jeg liker ___ lese bøker.","å","Å står foran verbet i infinitiv.","og_aa"],
  ["Vi spiser brød ___ ost.","og","Og binder sammen brød og ost.","og_aa"],
  ["Du må huske ___ ta med nøkkelen.","å","Etter huske bruker vi her å og infinitiv.","og_aa"],
  ["Anna ___ Ali venter på bussen.","og","Og binder sammen de to navnene.","og_aa"],
  ["Han øver på ___ svømme.","å","Etter på følger her å og infinitiv.","og_aa"],
  ["Kan du gi meg ___ røde jakken?","den","Jakken er hankjønn i denne formen, så vi bruker den.","den_det"],
  ["Vi kjøpte ___ store huset ved sjøen.","det","Huset er intetkjønn, så vi bruker det.","den_det"],
  ["Jeg finner ikke ___ blå koppen.","den","Koppen er hankjønn, så vi bruker den.","den_det"],
  ["Hun åpnet ___ lille vinduet.","det","Vinduet er intetkjønn, så vi bruker det.","den_det"],
  ["De venter på ___ siste bussen.","den","Bussen er hankjønn, så vi bruker den.","den_det"],
];
export function grammarFixture(focus:GrammarFocus="mixed_words"):GrammarTest{
  const selected=focus==="mixed_words"?words:focus==="og_aa"||focus==="den_det"?Array.from({length:10},(_,index)=>{const item=words.filter(row=>row[3]===focus)[index%5];return [`${index<5?"I dag: ":"I morgen: "}${item[0]}`,...item.slice(1)] as typeof words[number];}):null;
  return {version:1,language:"nb",audioEnabled:false,title:"Ordvalg i hverdagen",level:"A2",focus,topic:"Hverdag",tasks:Array.from({length:10},(_,index)=>{
    const row=selected?.[index],verb=focus==="verb";
    return {id:`grammar-${index+1}`,order:index+1,type:"mcq",focus:row?.[3]??(verb?"verb":"noun"),
      prompt:row?.[0]??(verb?`Oppgave ${index+1}: Vi skal ___ en bok.`:`Oppgave ${index+1}: Jeg ser to ___.`),
      options:row?row[3]==="og_aa"?["og","å"]:["den","det"]:verb?["lese","leser","leste"]:["biler","bil","bilen"],correctAnswer:row?.[1]??(verb?"lese":"biler"),explanation:row?.[2]??(verb?"Etter skal bruker vi infinitiv uten å.":"Etter to bruker vi ubestemt flertall.")};
  })};
}
