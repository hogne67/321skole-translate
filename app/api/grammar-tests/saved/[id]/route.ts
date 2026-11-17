import { grammarAccount,grammarFailure,loadGrammar } from "@/lib/grammarTests/saved.server";
export const runtime="nodejs";
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){try{const user=await grammarAccount(req),{id}=await ctx.params;return Response.json(await loadGrammar(user.uid,id),{headers:{"Cache-Control":"private,no-store"}});}catch(error){return grammarFailure(error);}}
