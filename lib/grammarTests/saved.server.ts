import "server-only";
import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";
import { getAdmin } from "@/lib/firebaseAdmin";
import { assertActiveProfile,accountErrorStatus } from "@/lib/security/accountAccess.server";
import { listeningAccount } from "@/lib/listeningTests/saved.server";
import { parseGrammarTest,validGrammarId } from "./types";
export const grammarAccount=listeningAccount;
export class GrammarSaveError extends Error { constructor(public status:number,message:string){super(message);} }
function owned(data:Record<string,unknown>|undefined,uid:string){
  if(!data||data.ownerId!==uid||data.lessonType!=="grammar_test"||data.deletedAt)throw new GrammarSaveError(404,"Prøven finnes ikke.");return data;
}
export function grammarFailure(error:unknown){return Response.json({error:error instanceof GrammarSaveError?error.message:"Kunne ikke åpne eller lagre prøven."},{status:error instanceof GrammarSaveError?error.status:accountErrorStatus(error)??((error as {status?:number})?.status===401?401:(error as {status?:number})?.status===403?403:503),headers:{"Cache-Control":"private,no-store"}});}
export async function loadGrammar(uid:string,id:string){
  if(!validGrammarId(id))throw new GrammarSaveError(400,"Ugyldig prøve.");
  const data=owned((await getAdmin().db.doc(`lessons/${id}`).get()).data(),uid),test=parseGrammarTest(data.grammarTest);
  if(!test||!validGrammarId(data.grammarRevision))throw new GrammarSaveError(503,"Ugyldig lagret prøve.");
  return {id,revision:data.grammarRevision,test};
}
export async function saveGrammar(decoded:DecodedIdToken,body:unknown){
  const uid=decoded.uid;
  if(!body||typeof body!=="object")throw new GrammarSaveError(400,"Ugyldig prøve.");
  const value=body as Record<string,unknown>,test=parseGrammarTest(value.test);
  if(!test||value.id!=null&&!validGrammarId(value.id))throw new GrammarSaveError(400,"Kontroller setninger, alternativer og fasit. Prøven skal ha 10 setninger.");
  const {db}=getAdmin(),id=value.id as string|undefined??db.collection("lessons").doc().id,revision=randomUUID();
  await db.runTransaction(async tx=>{
    const ref=db.doc(`lessons/${id}`),[lesson,profile]=await tx.getAll(ref,db.doc(`users/${uid}`));
    assertActiveProfile(profile.data(),decoded);
    if(value.id!=null){const previous=owned(lesson.data(),uid);if(value.revision!==previous.grammarRevision)throw new GrammarSaveError(409,"Prøven er endret. Åpne den på nytt før du lagrer.");}
    else if(lesson.exists)throw new GrammarSaveError(409,"Prøven finnes allerede.");
    tx.set(ref,{ownerId:uid,title:test.title,language:test.language,level:test.level,topic:test.topic,lessonType:"grammar_test",textType:"grammar_test",source:"grammar-test-generator",beta:true,
      tasks:test.tasks,sourceText:"",description:"Velg riktig ord eller form i hver setning.",grammarTest:test,grammarRevision:revision,grammarAudioEnabled:test.audioEnabled,
      status:"draft",visibility:"private",publishVisibility:"private",showInLibrary:false,published:false,deletedAt:null,activePublishedId:null,
      createdAt:lesson.data()?.createdAt??FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  });
  return {id,revision};
}
