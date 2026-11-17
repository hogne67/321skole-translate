import { grammarAccount,grammarFailure,GrammarSaveError,saveGrammar } from "@/lib/grammarTests/saved.server";
export const runtime="nodejs";
export async function POST(req:Request){try{const user=await grammarAccount(req),raw=await req.text();if(raw.length>64_000)throw new GrammarSaveError(413,"Prøven er for stor.");return Response.json(await saveGrammar(user,JSON.parse(raw)),{headers:{"Cache-Control":"private,no-store"}});}catch(error){return grammarFailure(error);}}
