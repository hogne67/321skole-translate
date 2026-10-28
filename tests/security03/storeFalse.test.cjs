/* global require, process, structuredClone, Response */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {root,ts,scan,response,transport,client,evaluateBody,load,request,authOverrides}=require('./helpers.cjs');
const baseline=process.env.S03_BASELINE_DIR;
const inventory=scan();
const beforeInventory=baseline?scan(baseline):null;
const normalize=value=>JSON.parse(JSON.stringify(value));
const baselineFile=file=>file.replace(/plannerHandlers\.paused\.ts$/, 'route.ts');
test('exhaustive source audit: 36 text calls, literal store:false, no stateful dependency or unsupported API parameter',()=>{
 assert.equal(inventory.calls.length,36);assert.deepEqual(inventory.states,[]);assert.equal(inventory.unsupported.length,7);
 for(const call of inventory.calls){const properties=call.properties.filter(p=>p.name?.getText(call.sf)==='store');assert.equal(properties.length,1,call.file);assert.equal(properties[0].initializer.kind,ts.SyntaxKind.FalseKeyword,call.file);assert.equal(call.properties.some(ts.isSpreadAssignment),false,'A spread must not override store');}
 for(const call of inventory.unsupported)if(call.body&&ts.isObjectLiteralExpression(call.body))assert.equal(call.body.properties.some(p=>p.name?.getText(call.sf)==='store'),false,call.file);
});
for(const call of inventory.calls)test('serialized request has store:false: '+call.file+':'+call.line,async()=>{
 const body=evaluateBody(call),wire=transport(['Synthetic answer']);
 let result;if(call.kind==='fetch'){result=await wire.fetch('https://api.openai.com/v1/responses',{method:'POST',body:JSON.stringify(body)});assert.equal(result.status,200);}
 else result=call.kind==='chat'?await client(wire).chat.completions.create(body):await client(wire).responses.create(body);
 assert.equal(wire.requests.length,1);assert.equal(wire.requests[0].body.store,false);
 if(call.kind==='responses')assert.equal(result.output_text,'Synthetic answer');
 if(call.kind==='chat')assert.equal(result.choices[0].message.content,'Synthetic answer');
 if(baseline){const before=beforeInventory.calls.filter(c=>c.file===baselineFile(call.file));const index=inventory.calls.filter(c=>c.file===call.file).indexOf(call);const previous=evaluateBody(before[index]);assert.equal(Object.hasOwn(previous,'store'),false);const rest=normalize(body);delete rest.store;assert.deepEqual(rest,normalize(previous));}
});
test('only store additions in the 27 source files; existing logging, prompts and local writes unchanged',()=>{
 assert.ok(baseline,'Run with S03_BASELINE_DIR to compare original behavior');
 const files=[...new Set(inventory.calls.map(c=>c.file))];assert.equal(files.length,27);
 for(const file of files){const actual=fs.readFileSync(path.join(root,file),'utf8');const restored=actual.replace(/store: false,\r?\n[ \t]*/g,'').replace(/store: false, /g,'');assert.equal(restored,fs.readFileSync(path.join(baseline,baselineFile(file)),'utf8'),file);}
});
const lesson={title:'Synthetic lesson',sourceText:'A synthetic classroom text.',tasks:[{id:'one',type:'truefalse',prompt:'Synthetic question',correctAnswer:true}]};
const cases=[
 ['lesson generation','app/api/generate-lesson/route.ts',{topic:'Synthetic',language:'en'},[JSON.stringify(lesson)],200],
 ['lesson invalid JSON','app/api/generate-lesson/route.ts',{topic:'Synthetic'},['bad json'],500],
 ['lesson empty output','app/api/generate-lesson/route.ts',{topic:'Synthetic'},[''],500],
 ['lesson upstream failure','app/api/generate-lesson/route.ts',{topic:'Synthetic'},[{errorStatus:400}],500],
 ['student feedback','app/api/feedback/route.ts',{lesetekst:'Synthetic source',oppgave:'Synthetic task',svar:'SYNTHETIC-PERSON-MARKER',level:'A2'},['Synthetic helpful feedback'],200],
 ['feedback missing input','app/api/feedback/route.ts',{},[],400],
 ['feedback upstream failure','app/api/feedback/route.ts',{lesetekst:'Synthetic source',oppgave:'Synthetic task',svar:'SYNTHETIC-PERSON-MARKER'},[{errorStatus:400}],500],
 ['parent guidance chat','app/api/parent-support/route.ts',{assignmentTitle:'Synthetic',answersSummary:'Synthetic answer'},[JSON.stringify({parentMessage:'Synthetic parent',childMessage:'Synthetic child',nextStep:'Synthetic next'})],200],
 ['direct fetch success','app/api/ai/share-text/route.ts',{title:'Synthetic lesson',locale:'nb'},[JSON.stringify({variants:['Synthetic A','Synthetic B','Synthetic C','Synthetic D']})],200],
 ['direct fetch upstream fallback','app/api/ai/share-text/route.ts',{title:'Synthetic lesson',locale:'nb'},[{errorStatus:500}],200],
 ['direct fetch invalid JSON fallback','app/api/ai/share-text/route.ts',{title:'Synthetic lesson',locale:'nb'},['bad json'],200],
 ['direct fetch transport failure fallback','app/api/ai/share-text/route.ts',{title:'Synthetic lesson',locale:'nb'},[new Error('Synthetic transport failure')],200],
 ['translation','app/api/translate/route.ts',{text:'Synthetic source',targetLang:'en'},['Synthetic translation'],200],
];
for(const [name,file,body,queue,status]of cases)test('real route baseline comparison: '+name,async()=>{
 const results=[];
 for(const sourceRoot of [baseline,root]){const wire=transport(structuredClone(queue)),mod=load(file,wire,{sourceRoot});const res=await mod.exports.POST(request(body));const json=await res.json();results.push({status:res.status,json,logs:normalize(mod.logs),requests:wire.requests});}
 const [before,after]=results;assert.equal(after.status,status);assert.deepEqual(after.json,before.json);assert.deepEqual(after.logs,before.logs);assert.equal(after.requests.length,before.requests.length);
 assert.equal(JSON.stringify(after.logs).includes('SYNTHETIC-PERSON-MARKER'),false);
 for(let i=0;i<after.requests.length;i++){assert.equal(after.requests[i].body.store,false);const rest={...after.requests[i].body};delete rest.store;assert.deepEqual(rest,before.requests[i].body);}
});
for(const mode of ['success','repair','repair failure','upstream failure'])test('real generate-text route: '+mode,async()=>{
 const expected={title:'Synthetic title',text:'Synthetic generated text'};
 const queue=mode==='success'?[JSON.stringify(expected)]:mode==='repair'?['invalid json',JSON.stringify(expected)]:mode==='repair failure'?['invalid json','still invalid']:[{errorStatus:400}];
 const results=[];
 for(const sourceRoot of [baseline,root]){const wire=transport(structuredClone(queue)),mod=load('app/api/producer/generate-text/route.ts',wire,{sourceRoot,overrides:authOverrides()});const res=await mod.exports.POST(request({level:'A2',language:'en',topic:'Synthetic story',textType:'Story'},{Authorization:'Bearer synthetic-token'}));results.push({status:res.status,json:await res.json(),logs:normalize(mod.logs),requests:wire.requests});}
 const [before,after]=results;assert.equal(after.status,['success','repair'].includes(mode)?200:500);assert.deepEqual(after.json,before.json);assert.deepEqual(after.logs,before.logs);
 assert.equal(after.requests.length,queue.length);for(const r of after.requests)assert.equal(r.body.store,false);
 if(mode==='repair')assert.match(after.requests[1].body.input[1].content,/invalid json/);
});
for(const mode of ['complete','research incomplete','assessment incomplete','upstream failure'])test('actual two-step fact-check: '+mode,async()=>{
 const annotation={type:'url_citation',url:'https://synthetic.invalid/source',title:'Synthetic source',start_index:0,end_index:10};
 const research=response('Synthetic research',{search:true,annotations:[annotation]});
 const assessment=response('Synthetic report [source](https://synthetic.invalid/source)');
 const queue=mode==='complete'?[research,assessment]:mode==='research incomplete'?[{...research,status:'incomplete'}]:mode==='assessment incomplete'?[research,{...assessment,status:'incomplete'}]:[{errorStatus:400}];
 const results=[];
 for(const sourceRoot of [baseline,root]){const wire=transport(structuredClone(queue)),mod=load('lib/lessons/server/generateFactCheckReport.ts',wire,{sourceRoot});try{results.push({ok:true,value:normalize(await mod.exports.generateFactCheckReport(JSON.stringify(lesson),'English')),logs:normalize(mod.logs),requests:wire.requests});}catch(e){results.push({ok:false,value:e.message,logs:normalize(mod.logs),requests:wire.requests});}}
 const [before,after]=results;assert.equal(after.ok,mode==='complete');assert.deepEqual(after.value,before.value);assert.deepEqual(after.logs,before.logs);assert.equal(after.requests.length,queue.length);for(const r of after.requests)assert.equal(r.body.store,false);
 if(mode==='complete'){assert.equal(after.value.report,'Synthetic report [source](https://synthetic.invalid/source)');assert.equal(after.value.sources[0].url,'https://synthetic.invalid/source');assert.match(after.requests[1].body.input[2].content,/Synthetic research/);}
});
test('SDK retry serializes store:false again; no fallback without the parameter',async()=>{
 const requests=[];const c=client({fetch:async(_url,init)=>{requests.push(JSON.parse(init.body));return requests.length===1?new Response(JSON.stringify({error:{message:'Synthetic retry',type:'server_error'}}),{status:500,headers:{'Content-Type':'application/json','retry-after-ms':'1'}}):new Response(JSON.stringify(response('Synthetic recovered')),{headers:{'Content-Type':'application/json'}});}},{maxRetries:1});
 const result=await c.responses.create({model:'gpt-4o-mini',store:false,input:'Synthetic retry'});assert.equal(result.output_text,'Synthetic recovered');assert.equal(requests.length,2);assert.ok(requests.every(r=>r.store===false));
});
