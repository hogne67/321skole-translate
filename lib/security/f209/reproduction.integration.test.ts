import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=','base64');
test('Captured original PDF routes fetch unauthenticated arbitrary URL and redirect chain',async()=>{
 assert.equal(process.env.GOOGLE_CLOUD_PROJECT,'demo-phase2-local');
 assert.ok(process.env.PHASE2_RESULT_DIR?.includes('security-f209-local'));
 const hits:string[]=[];const server=createServer((req,res)=>{hits.push(req.url!);if(req.url?.startsWith('/redirect')){res.writeHead(302,{Location:'/image.png'});res.end();}else{res.writeHead(200,{'Content-Type':'image/png'});res.end(png);}});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 try {
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const url=`http://127.0.0.1:${address.port}/redirect`;
  const board=await import('../../../app/api/pdf/board-image/route');
  const lesson=await import('../../../app/api/pdf/lesson/route');
  const results=[];
  for(const [name,post,body] of [
   ['board',board.POST,{data:{title:'Synthetic',subtitle:'Synthetic',prompt:'Synthetic',generatedAt:'2026-10-17',responseCount:0,labels:{},sentences:[],imageUrl:url}}],
   ['lesson',lesson.POST,{lesson:{title:'Synthetic',tasks:[],coverImageUrl:url,logoUrl:`data:image/png;base64,${png.toString('base64')}`}}],
  ] as const){hits.length=0;const response=await post(new Request('http://127.0.0.1/api/pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
   assert.deepEqual(hits,['/redirect','/image.png']);assert.equal(response.status,200);assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0,4).toString(),'%PDF');results.push({route:name,status:response.status,hits:[...hits],authenticated:false});
  }
  await writeFile(path.join(process.env.PHASE2_RESULT_DIR!,'reproduction.json'),JSON.stringify({syntheticOnly:true,externalConnections:0,results},null,2),{flag:'wx'});
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
