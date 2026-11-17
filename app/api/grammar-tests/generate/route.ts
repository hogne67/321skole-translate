import "server-only";
import OpenAI from "openai";
import { randomInt } from "node:crypto";
import { grammarTargets } from "@/lib/grammarTests/targets";
import { getRequestUserContext } from "@/lib/readingTests/generate.server";
import { accountErrorStatus } from "@/lib/security/accountAccess.server";
import { emailVerificationRequiredWebResponse } from "@/lib/emailVerificationGuard";
import { getFeatureStatusAdmin,consumeFeatureAdmin } from "@/lib/featureGuardAdmin";
import { GRAMMAR_FOCUSES,GRAMMAR_LEVELS,type GrammarFocus,type GrammarLevel } from "@/lib/grammarTests/types";
import { GENERATION_SCHEMA,GENERATION_INSTRUCTIONS,LEVEL_GUIDANCE,REVIEW_SCHEMA,REVIEW_INSTRUCTIONS,parseGenerated,reviewAccepted } from "@/lib/grammarTests/generation";
export const runtime="nodejs";
export const maxDuration=120;
export async function POST(req:Request){
  let deadline:AbortSignal|undefined;
  try{
    const user=await getRequestUserContext(req);if(!user)return Response.json({error:"Logg inn for å lage en prøve."},{status:401});
    if(!(await getFeatureStatusAdmin({...user,feature:"producer_create_reading_test"})).allowed)return Response.json({error:"Prøvegeneratoren er ikke tilgjengelig for kontoen nå."},{status:403});
    const raw=await req.text();if(raw.length>8000)return Response.json({error:"For lang forespørsel."},{status:413});
    let body;try{body=JSON.parse(raw);}catch{return Response.json({error:"Ugyldig forespørsel."},{status:400});}
    if(!body||!GRAMMAR_LEVELS.includes(body.level)||!GRAMMAR_FOCUSES.includes(body.focus)||typeof body.topic!=="string"||body.topic.length>1500)return Response.json({error:"Velg nivå og oppgavetype."},{status:400});
    const level=body.level as GrammarLevel,focus=body.focus as GrammarFocus,topic=body.topic.trim();
    if(!process.env.OPENAI_API_KEY)return Response.json({error:"Generatoren er midlertidig utilgjengelig."},{status:503});
    deadline=AbortSignal.timeout(110_000);const signal=AbortSignal.any([req.signal,deadline]),client=new OpenAI({maxRetries:0});
    let correction="",previousDraft:unknown=null;
    for(let attempt=0;attempt<2;attempt++){
      const generated=await client.responses.create({store:false,model:"gpt-5-mini",reasoning:{effort:"low"},max_output_tokens:6500,text:{format:{type:"json_schema",name:"grammar_test",strict:true,schema:GENERATION_SCHEMA}},input:[{role:"system",content:GENERATION_INSTRUCTIONS},{role:"user",content:JSON.stringify({level,levelGuidance:LEVEL_GUIDANCE[level],focus,topic,targets:grammarTargets(level,focus),previousDraft,correction})}]},{signal,timeout:45_000,maxRetries:0});
      let packet;try{packet=JSON.parse(generated.output_text);}catch{correction="Return complete valid JSON.";continue;}
      previousDraft=packet;
      const test=parseGenerated(packet,level,focus,topic);if(!test){correction="Copy each exact supplied frame into its matching sentence, including the ___ gap. Return ten distinct complete sentences in target order.";continue;}
      const reviewed=await client.responses.create({store:false,model:"gpt-5-mini",reasoning:{effort:"low"},max_output_tokens:8500,text:{format:{type:"json_schema",name:"grammar_review",strict:true,schema:REVIEW_SCHEMA}},input:[{role:"system",content:REVIEW_INSTRUCTIONS},{role:"user",content:JSON.stringify({test,levelGuidance:LEVEL_GUIDANCE[level]})}]},{signal,timeout:55_000,maxRetries:0});
      let audit;try{audit=JSON.parse(reviewed.output_text);}catch{audit=null;}
      if(!reviewAccepted(audit,test.tasks.map(task=>task.id))){correction=`Fix every problem found by the independent reviewer: ${reviewed.output_text}`;continue;}
      signal.throwIfAborted();await consumeFeatureAdmin({uid:user.uid,feature:"producer_create_reading_test"});
      for(const task of test.tasks){for(let i=task.options.length-1;i>0;i--){const j=randomInt(i+1);[task.options[i],task.options[j]]=[task.options[j],task.options[i]];}}
      return Response.json({test},{headers:{"Cache-Control":"private,no-store"}});
    }
    return Response.json({error:"Prøven bestod ikke innholdskontrollen. Prøv igjen med et enklere tema."},{status:422});
  }catch(error){
    if(error instanceof Error&&error.message==="EMAIL_VERIFICATION_REQUIRED")return emailVerificationRequiredWebResponse();
    return Response.json({error:"Kunne ikke lage prøven. Prøv igjen."},{status:req.signal.aborted?499:deadline?.aborted?504:accountErrorStatus(error)??(error instanceof OpenAI.APIConnectionTimeoutError?504:500)});
  }
}
