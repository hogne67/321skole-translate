/* global require, __dirname, module, Request, Response, Headers, URL, URLSearchParams, Buffer, AbortController, setTimeout, clearTimeout, TextEncoder, TextDecoder */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..'),req=createRequire(path.join(root,'package.json')),ts=req('typescript');
const OpenAI=req('openai').default;
function walk(dir,result=[]){for(const e of fs.readdirSync(dir,{withFileTypes:true})){
 if(e.isSymbolicLink()||['node_modules','.next','.git','.vercel'].includes(e.name))continue;
 const p=path.join(dir,e.name);if(e.isDirectory())walk(p,result);else if(/\.[cm]?[jt]sx?$/.test(e.name)&&!e.name.includes('.test.')&&!e.name.includes('.integration.'))result.push(p);
}return result;}
function scan(sourceRoot=root){const calls=[],unsupported=[],states=[];
 for(const folder of ['app','lib','components','scripts','tools']){if(!fs.existsSync(path.join(sourceRoot,folder)))continue;
  for(const p of walk(path.join(sourceRoot,folder))){if(p.includes(path.sep+'security'+path.sep)||path.basename(p).startsWith('security-'))continue;
   const file=path.relative(sourceRoot,p).replaceAll('\\','/'),source=fs.readFileSync(p,'utf8');
   const sf=ts.createSourceFile(p,source,ts.ScriptTarget.Latest,true);
   function visit(n){if(ts.isCallExpression(n)){
    const expr=n.expression.getText(sf);let body;
    if(/\.(responses|chat\.completions)\.create$/.test(expr))body=n.arguments[0];
    else if(expr==='fetch'&&n.arguments[0]?.getText(sf).includes('api.openai.com/v1/responses')){
     const options=n.arguments[1];const prop=options?.properties?.find(p=>p.name?.getText(sf)==='body');body=prop?.initializer?.arguments?.[0];
    }else if(/\.(audio\.(speech|transcriptions|translations)|images|files)\.(create|generate|delete)$/.test(expr))unsupported.push({file,line:sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1,body:n.arguments[0],sf});
    if(body){if(!ts.isObjectLiteralExpression(body))throw Error('Unsupported request expression '+file);
     calls.push({file,line:sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1,expression:expr,body:body.getText(sf),properties:body.properties,kind:expr==='fetch'?'fetch':expr.includes('chat.completions')?'chat':'responses',sf});}
    if(/\.(responses\.(retrieve|list)|conversations\.|beta\.(threads|assistants)\.|batches\.)/.test(expr))states.push({file,expression:expr});
   }
   if(ts.isPropertyAssignment(n)&&['previous_response_id','conversation'].includes(n.name.getText(sf)))states.push({file,field:n.name.getText(sf)});
   ts.forEachChild(n,visit);}visit(sf);
  }
 }return {calls,unsupported,states};}
function response(text,options={}){return {id:'resp_synthetic',object:'response',status:'completed',output:[...(options.search?[{type:'web_search_call',status:'completed',id:'search_synthetic'}]:[]),{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:options.annotations||[]}]}]};}
function transport(queue=['synthetic response']){const requests=[];const fetch=async(input,init)=>{
 const body=JSON.parse(init.body);const url=String(input);requests.push({url,body});
 if(!/\/(responses|chat\/completions)$/.test(new URL(url).pathname))throw Error('Unexpected fake transport path');
 if(!queue.length)throw Error('Fake response queue exhausted');const next=queue.shift();
 if(next instanceof Error)throw next;
 if(next?.errorStatus)return new Response(JSON.stringify({error:{type:'synthetic_error',message:'Synthetic upstream failure'}}),{status:next.errorStatus,headers:{'Content-Type':'application/json','x-should-retry':'false'}});
 const value=typeof next==='string'?url.endsWith('/chat/completions')?{id:'chatcmpl_synthetic',object:'chat.completion',choices:[{message:{role:'assistant',content:next},finish_reason:'stop',index:0}]}:response(next):next;
 return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json','x-request-id':'req_synthetic'}});
 };return {fetch,requests};}
const env={OPENAI_API_KEY:'synthetic-local-no-network'};
function client(wire,options={}){return new OpenAI({apiKey:env.OPENAI_API_KEY,baseURL:'https://openai.invalid/v1',fetch:wire.fetch,logLevel:'off',maxRetries:0,...options});}
function fixture(){return {process:{env},model:'gpt-4o-mini',temperature:.3,systemPrompt:'Synthetic system',userContent:'Synthetic student answer',prompt:'Synthetic prompt',userPrompt:'Synthetic task',system:'Synthetic system',languageName:'English',isA1Start:false,error:new Error('Synthetic parse failure'),out:'synthetic invalid JSON',retryInstruction:'',assignment:{language:'nb'},source:{language:'nb',title:'Synthetic',text:'Synthetic'},activity:{language:'nb',genre:'factual'},section:{id:'synthetic'},submission:{},phase:'planning',settings:{},uploadedFile:{id:'file_synthetic'},uploaded:{id:'file_synthetic'},sourceHasDocument:true,content:'Synthetic fact-check source',language:'English',research:{output_text:'Synthetic research'},evidenceSources:[],safeString:v=>typeof v==='string'?v:'',buildSystemPrompt:()=>'Synthetic system',buildPrompt:()=>'Synthetic section',buildOverallPrompt:()=>'Synthetic final',posterGoalPrompt:()=>'Synthetic goal',factCheckInput:v=>v};}
function evaluateBody(call,overrides={}){
 const context={...fixture(),user:'Synthetic user prompt',langName:()=> 'English',WRITE_FACT_PROMPT:'Synthetic fact prompt',level:'A2',topic:'Synthetic topic',textType:'Story',textLength:200,mcq:2,trueFalse:2,facts:1,reflection:1,numberOfSessions:2,title:'Synthetic title',description:'Synthetic description',learningGoals:'Synthetic goal',subject:'Synthetic subject',subtopic:'Synthetic subtopic',additionalDescription:'Synthetic extra',courseType:'course',audience:'Synthetic group',durationMinutes:60,course:{title:'Synthetic course'},marketing:{},languageInstruction:'Write in English.',kind:'annual',frame:{country:'Norge'},curriculum:{},document:{individualDetails:{learnerName:'Synthetic learner',supportNeeds:'Synthetic support'}},sourceTitle:'Synthetic file',sourceUrl:'https://synthetic.invalid/file',schoolYear:'2026/2027',compactText:'Synthetic school dates',input:{schoolYear:'2026/2027'},targetLanguageName:'English',targetLang:'en',extraHardLock:'',text:'Synthetic text',count:10,keys:['label','caption','explanation','quote','visualPrompt'],...overrides};
 return vm.runInNewContext('('+call.body+')',context,{timeout:2000});
}
function load(file,wire,{sourceRoot=root,overrides={}}={}){
 const cache=new Map(),logs=[];
 class FakeOpenAI extends OpenAI{constructor(options){super({...options,apiKey:env.OPENAI_API_KEY,organization:null,project:null,baseURL:'https://openai.invalid/v1',fetch:wire.fetch,maxRetries:0,logLevel:'off'});}}
 const log=(level,...args)=>logs.push({level,args:args.map(x=>x instanceof Error?{name:x.name,message:x.message}:x)});
 function moduleAt(abs){if(cache.has(abs))return cache.get(abs).exports;
  const source=fs.readFileSync(abs,'utf8');const result=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}});
  const mod={exports:{}};cache.set(abs,mod);
  const resolve=name=>{if(Object.hasOwn(overrides,name))return overrides[name];if(name==='server-only')return {};
   if(name==='openai')return {__esModule:true,default:FakeOpenAI,toFile:req('openai').toFile};
   if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?path.join(sourceRoot,name.slice(2)):path.resolve(path.dirname(abs),name);const target=['.ts','.tsx','/index.ts'].map(ext=>base+ext).find(fs.existsSync);if(!target)throw Error('Unresolved local test module '+name);return moduleAt(target);}
   return req(name);
  };
  const context={module:mod,exports:mod.exports,require:resolve,process:{env},console:{error:(...a)=>log('error',...a),warn:(...a)=>log('warn',...a),info:(...a)=>log('info',...a),log:(...a)=>log('log',...a)},fetch:wire.fetch,Request,Response,Headers,URL,URLSearchParams,Buffer,Error,Date,AbortController,setTimeout,clearTimeout,TextEncoder,TextDecoder};
  vm.runInNewContext(result.outputText,context,{filename:abs,timeout:5000});return mod.exports;
 }
 return {exports:moduleAt(path.join(sourceRoot,file)),logs};
}
function request(body,headers={}){return new Request('http://synthetic.invalid/api',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});}
function authOverrides(){return {
 '@/lib/firebaseAdmin':{getAdmin:()=>({auth:{verifyIdToken:async()=>({uid:'synthetic-teacher',email_verified:true})},db:{collection:()=>({doc:()=>({get:async()=>({exists:true,data:()=>({role:'teacher',plan:'pro'})})})})}})},
 '@/lib/featureGuardAdmin':{getFeatureStatusAdmin:async()=>({allowed:true})},
 '@/lib/security/accountAccess.server':{accountErrorStatus:()=>undefined},
 '@/lib/emailVerificationGuard':{needsEmailVerification:()=>false,emailVerificationRequiredResponse:()=>Response.json({error:'synthetic verification'},{status:403})},
 };}
module.exports={root,ts,scan,response,transport,client,evaluateBody,load,request,authOverrides};
