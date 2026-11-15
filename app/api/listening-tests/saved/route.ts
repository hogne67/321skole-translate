import { beginListeningSave, listeningAccount, listeningSaveFailure, ListeningSaveError } from "@/lib/listeningTests/saved.server";
export const runtime="nodejs";
export async function POST(req:Request){
  try{
    const account=await listeningAccount(req),raw=await req.text();
    if(raw.length>64_000)throw new ListeningSaveError(413,"Request too large");
    return Response.json(await beginListeningSave(account,JSON.parse(raw),req.headers.get("origin")||undefined),{headers:{"Cache-Control":"private,no-store"}});
  }catch(error){return listeningSaveFailure(error);}
}
