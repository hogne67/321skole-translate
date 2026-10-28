import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { importSchoolCalendarFromUrl } from '../../planner/schoolCalendarImport';
test('original calendar importer fetches IPv6 loopback and follows redirect to IPv4 localhost',async()=>{
 assert.equal(process.env.GOOGLE_CLOUD_PROJECT,'demo-phase2-local');
 assert.ok(process.env.PHASE2_RESULT_DIR?.includes('security-calendar-ssrf-local'));
 const hits:string[]=[];
 const ipv4=createServer((req,res)=>{hits.push(`ipv4:${req.url}`);res.writeHead(200,{'Content-Type':'text/html'});res.end('<title>Syntetisk skolerute</title><p>Skoleåret 2026/2027</p><p>Første skoledag 17. august 2026</p><p>Siste skoledag 18. juni 2027</p>');});
 await new Promise<void>(r=>ipv4.listen(0,'127.0.0.1',r));const a=ipv4.address();assert.ok(a&&typeof a!=='string');
 const ipv6=createServer((req,res)=>{hits.push(`ipv6:${req.url}`);res.writeHead(302,{Location:`http://127.0.0.1:${a.port}/calendar`});res.end();});
 await new Promise<void>(r=>ipv6.listen(0,'::1',r));const b=ipv6.address();assert.ok(b&&typeof b!=='string');
 try{const result=await importSchoolCalendarFromUrl({url:`http://[::1]:${b.port}/redirect`,schoolYear:'2026/2027'});assert.deepEqual(hits,['ipv6:/redirect','ipv4:/calendar']);assert.equal(result.sourceTitle,'Syntetisk skolerute');
 await writeFile(path.join(process.env.PHASE2_RESULT_DIR!,'reproduction.json'),JSON.stringify({syntheticOnly:true,externalConnections:0,hits,firstSchoolDay:result.firstSchoolDay,weaknesses:['IPv6 loopback allowed','HTTP allowed','redirect target not revalidated']},null,2),{flag:'wx'});
 }finally{for(const server of [ipv4,ipv6]){server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}}
});
