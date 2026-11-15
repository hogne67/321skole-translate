import { cancelListeningSave, finishListeningSave, listeningAccount, listeningSaveFailure, ListeningSaveError, loadListeningTest } from "@/lib/listeningTests/saved.server";
export const runtime="nodejs";
export const maxDuration=60;
type Context={params:Promise<{id:string}>};
export async function GET(req:Request,context:Context){
  try{const account=await listeningAccount(req),{id}=await context.params;return Response.json(await loadListeningTest(account.uid,id),{headers:{"Cache-Control":"private,no-store"}});}
  catch(error){return listeningSaveFailure(error);}
}
export async function POST(req:Request,context:Context){
  try{
    const account=await listeningAccount(req),{id}=await context.params,raw=await req.text();
    if(raw.length>1000)throw new ListeningSaveError(413,"Request too large");
    const value=JSON.parse(raw);return Response.json(await finishListeningSave(account,id,value?.saveId),{headers:{"Cache-Control":"private,no-store"}});
  }catch(error){return listeningSaveFailure(error);}
}
export async function DELETE(req:Request,context:Context){
  try{const account=await listeningAccount(req),{id}=await context.params;await cancelListeningSave(account.uid,id,new URL(req.url).searchParams.get("saveId")??"");return Response.json({ok:true});}
  catch(error){return listeningSaveFailure(error);}
}
