import type { GrammarFocus,GrammarLevel,GrammarTask } from "./types";
export type GrammarTarget={frame:string;focus:GrammarTask["focus"];options:string[];correctAnswer:string};
const verbRows=[
  ["har ___","spist","spise","spiser"],["skal ___","lese","leser","leste"],["kan ___","skrive","skriver","skrevet"],
  ["å ___","kjøpe","kjøper","kjøpte"],["hadde ___","drukket","drikke","drikker"],["må ___","gå","går","gikk"],
  ["har ___","sett","se","ser"],["å ___","spille","spiller","spilt"],["vil ___","reise","reiser","reiste"],["har ___","vært","være","er"]
];
const advancedVerbs=[
  ["har ___","vurdert","vurdere","vurderer"],["skal ___","begrunne","begrunner","begrunnet"],["kan ___","forstå","forstår","forstod"],
  ["å ___","undersøke","undersøker","undersøkte"],["hadde ___","beskrevet","beskrive","beskriver"],["må ___","avklare","avklarer","avklart"],
  ["har ___","foreslått","foreslå","foreslår"],["å ___","drøfte","drøfter","drøftet"],["vil ___","gjennomføre","gjennomfører","gjennomførte"],["har ___","bidratt","bidra","bidrar"]
];
const nounRows=[
  ["to ___","biler","bil","bilen"],["denne ___","bussen","buss","busser"],["de nye ___","husene","hus","huset"],
  ["flere ___","bøker","bok","boken"],["mitt ___","eple","eplet","epler"],["disse ___","syklene","sykkel","sykler"],
  ["min ___","venn","vennen","venner"],["et ___","rom","rommet","rommene"],["mine ___","oppgaver","oppgave","oppgaven"],["dette ___","området","område","områder"]
];
const advancedNouns=[
  ["to ___","forslag","forslaget","forslagene"],["denne ___","vurderingen","vurdering","vurderinger"],["de nye ___","tiltakene","tiltak","tiltaket"],
  ["flere ___","begrunnelser","begrunnelse","begrunnelsen"],["mitt ___","standpunkt","standpunktet","standpunktene"],["disse ___","undersøkelsene","undersøkelse","undersøkelser"],
  ["min ___","erfaring","erfaringen","erfaringer"],["et ___","argument","argumentet","argumentene"],["mine ___","innvendinger","innvending","innvendingen"],["dette ___","perspektivet","perspektiv","perspektiver"]
];
const ogAaRows=[
  ["liker ___","å"],["leser ___ skriver","og"],["ønsker ___","å"],["foreldre ___ barn","og"],["prøver ___","å"],
  ["snakker ___ lytter","og"],["planlegger ___","å"],["kaffe ___ te","og"],["begynner ___","å"],["jobber ___ studerer","og"]
];
const denDetRows=[
  ["___ blå jakken","den"],["___ store huset","det"],["___ siste bussen","den"],["___ lille vinduet","det"],["___ nye boken","den"],
  ["___ røde eplet","det"],["___ grønne sykkelen","den"],["___ gamle bordet","det"],["___ første oppgaven","den"],["___ lyse rommet","det"]
];
/** Curated forms keep accepted variants and different lemmas out of the distractors. The model supplies context. */
export function grammarTargets(level:GrammarLevel,focus:GrammarFocus):GrammarTarget[]{
  const advanced=["B2","C1","C2"].includes(level);
  const words=(rows:string[][],kind:"og_aa"|"den_det")=>rows.map(([frame,correctAnswer])=>({frame,correctAnswer,focus:kind,options:kind==="og_aa"?["og","å"]:["den","det"]}));
  if(focus==="mixed_words")return [...words(ogAaRows.slice(0,5),"og_aa"),...words(denDetRows.slice(0,5),"den_det")];
  if(focus==="og_aa")return words(ogAaRows,"og_aa");if(focus==="den_det")return words(denDetRows,"den_det");
  return (focus==="verb"?advanced?advancedVerbs:verbRows:advanced?advancedNouns:nounRows).map(([frame,correctAnswer,...distractors])=>({frame,correctAnswer,options:[correctAnswer,...distractors],focus}));
}
