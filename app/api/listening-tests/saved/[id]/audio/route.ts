import { listeningAccount, listeningSaveFailure, readListeningAudio } from "@/lib/listeningTests/saved.server";
export const runtime="nodejs";
export async function GET(req:Request,context:{params:Promise<{id:string}>}){
  try{const account=await listeningAccount(req),{id}=await context.params;return await readListeningAudio(account.uid,id,req);}
  catch(error){return listeningSaveFailure(error);}
}
