/* global require, __dirname */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const ts=require('typescript');
const {NextResponse}=require('next/server');
const inventory=JSON.parse(fs.readFileSync(path.resolve(root,'../planner-selection.json'),'utf8'));
const baseline={copied:Object.entries(JSON.parse(fs.readFileSync(path.resolve(root,'../baseline.json'),'utf8'))).map(([path,sha256])=>({path,sha256}))};
const roles=['unauthenticated','teacher','student','school-administrator','partner-administrator','platform-administrator','tester'];
const methods=['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'];
const locales=['nb','en','pt'];
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function load(rel,seen=new Set()){
  const p=path.join(root,rel),source=fs.readFileSync(p,'utf8');seen.add(rel);
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
  const module={exports:{}};
  const restrictedRequire=name=>{
    if(name==='server-only')return {};
    if(name==='next/server')return {NextResponse};
    if(name==='next/navigation')return {notFound(){throw Error('SYNTHETIC_NOT_FOUND');}};
    if(name==='@/lib/planner/pause.server')return load('lib/planner/pause.server.ts',seen);
    if(name==='@/lib/planner/pausedPage.server')return load('lib/planner/pausedPage.server.ts',seen);
    throw Error('Forbidden dependency before pause: '+name);
  };
  vm.runInNewContext(output,{module,exports:module.exports,require:restrictedRequire},{filename:p});
  return module.exports;
}
for(const route of inventory.routes){
  test('all roles/methods deny before imports or request access: '+route,async()=>{
    const seen=new Set(),api=load(route,seen);
    assert.equal(api.dynamic,'force-dynamic');assert.equal(api.runtime,'nodejs');
    for(const role of roles)for(const method of methods){
      const sentinel=new Proxy({},{get(){throw Error('Request/body/auth/data access before pause');}});
      const context=new Proxy({},{get(){throw Error('Params access before pause');}});
      const response=await api[method](sentinel,context);
      assert.equal(response.status,410,role+'/'+method);
      assert.equal(response.headers.get('cache-control'),'private, no-store');
      assert.equal(JSON.stringify(await response.json()),'{"error":"planner_paused"}');
    }
    assert.deepEqual([...seen].sort(),[route,'lib/planner/pause.server.ts'].sort());
  });
}
for(const page of inventory.pages){
  test('page cannot import legacy client or read any role/locale: '+page,()=>{
    const seen=new Set(),entry=load(page,seen);
    for(const role of roles)for(const locale of locales){
      const props=new Proxy({},{get(){throw Error('Page params/data accessed');}});
      assert.throws(()=>entry.default(props),/SYNTHETIC_NOT_FOUND/,role+'/'+locale);
    }
    assert.deepEqual([...seen].sort(),[page,'lib/planner/pausedPage.server.ts'].sort());
  });
}
function ast(rel){return ts.createSourceFile(rel,fs.readFileSync(path.join(root,rel),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);}
function find(node,predicate){if(predicate(node))return node;return ts.forEachChild(node,child=>find(child,predicate));}
function evaluate(expression,context){const js=ts.transpileModule('module.exports = ('+expression+');',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;const module={exports:null};vm.runInNewContext(js,{...context,module});return module.exports;}
test('navigation predicates hide Planner in every tested role and locale, retaining every other tool',()=>{
  const paused=load('lib/planner/availability.ts').PLANNER_PAUSED;assert.equal(paused,true);
  const teacher=ast('app/[locale]/(app)/teacher/page.tsx');
  const condition=find(teacher,n=>ts.isConditionalExpression(n)&&n.whenTrue.getText(teacher).includes('href={isAnon ? plannerLoginHref'));
  assert.ok(condition,'Planner teacher section located');
  const tools=ast('app/[locale]/(app)/tools/page.tsx');
  const premium=find(tools,n=>ts.isVariableDeclaration(n)&&n.name.getText(tools)==='premiumTools');
  const visible=find(tools,n=>ts.isVariableDeclaration(n)&&n.name.getText(tools)==='visiblePremiumTools');
  const otherTools=evaluate(premium.initializer.getText(tools),{});assert.equal(otherTools.length,9);
  const school=ast('app/[locale]/skoler/page.tsx');
  const schoolGuard=find(school,n=>ts.isBinaryExpression(n)&&n.getText(school).includes('&& <YearPlansSection'));
  assert.ok(schoolGuard);
  for(const role of roles)for(const locale of locales){
    const context={PLANNER_PAUSED:paused,locale,role,premiumTools:otherTools};
    assert.equal(evaluate(condition.condition.getText(teacher),context),false);
    assert.equal(evaluate(schoolGuard.left.getText(school),context),false);
    const result=evaluate(visible.initializer.getText(tools),context);
    assert.deepEqual(JSON.parse(JSON.stringify(result)),JSON.parse(JSON.stringify(otherTools)));
    assert.ok(!result.some(x=>x.href.includes('/planner')));
  }
});
test('all original page/handler bytes preserved in dormant files',()=>{
  assert.equal(inventory.dormant.length,13);
  for(const rel of [...inventory.routes,...inventory.pages]){
    const dormant=rel.endsWith('route.ts')?rel.replace(/route\.ts$/,'plannerHandlers.paused.ts'):rel.replace(/page\.tsx$/,'PlannerPage.paused.tsx');
    const original=inventory.dormant.find(x=>x.entry===rel&&x.file===dormant);
    assert.ok(original,rel);
    assert.equal(sha(path.join(root,dormant)),original.sha256,rel);
  }
});
test('only documented approval-flow changes differ from the reviewed S05 baseline',()=>{
  const allowed=new Set([
    'app/api/spaces/join/route.ts',
    'app/[locale]/(public)/join/JoinClient.tsx',
    'lib/security/f203/memberStatus.integration.test.ts',
    'lib/security/s05Binding/flow.integration.test.ts',
    'messages/nb/join.json', 'messages/en/join.json', 'messages/pt/join.json',
    'tests/planner-final/pause.test.cjs',
  ]);
  assert.equal(allowed.size,8);
  for(const file of baseline.copied){
    if(allowed.has(file.path))continue;
    if(sha(path.join(root,file.path))===file.sha256)continue;
    if(file.path==='next-env.d.ts'){
      const generated=fs.readFileSync(path.join(root,file.path),'utf8');
      const original=generated.replace('import "./.next/types/routes.d.ts";','import "./.next/dev/types/routes.d.ts";');
      assert.equal(crypto.createHash('sha256').update(original).digest('hex'),file.sha256,'only the standard Next production type-path update is permitted');
      continue;
    }
    assert.equal(sha(path.join(root,file.path)),file.sha256,file.path);
  }
});
test('route/page inventory is exhaustive and dormant implementations stay unreachable from entries',()=>{
  function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
  const paths=walk(root+'/app').map(x=>path.relative(root,x).replaceAll('\\','/'));
  assert.deepEqual(paths.filter(x=>/^app\/api\/teacher\/planner\/.*\/route\.ts$/.test(x)||x==='app/api/teacher/planner/route.ts').sort(),[...inventory.routes].sort());
  assert.deepEqual(paths.filter(x=>x.startsWith('app/[locale]/(app)/teacher/planner/')&&x.endsWith('/page.tsx')).sort(),[...inventory.pages].sort());
});
function readClause(marker){
  const rules=fs.readFileSync(root+'/firestore.rules','utf8');
  const start=rules.indexOf(marker);assert.ok(start>=0);const brace=start+marker.length-1;let depth=0,block;
  for(let i=brace;i<rules.length;i++){if(rules[i]==='{')depth++;if(rules[i]==='}'&&--depth===0){block=rules.slice(brace+1,i);break;}}
  assert.ok(block);return block.match(/allow read(?:, write)?:\s*if\s*([\s\S]*?);/)[1];
}
test('Planner original read clause is unconditionally denied, independent of role',()=>{
  const expression=readClause('match /planners/{plannerId} {');
  assert.equal(vm.runInNewContext(expression,{accountEnabled:()=>true,isAdmin:()=>false,isPlannerOwner:()=>true}),false);
  assert.doesNotMatch(expression,/plannerPaused|PLANNER_PAUSED/);
});
test('Accepted scope: historical Spaces assignment remains readable to its pupil member',()=>{
  const expression=readClause('match /spaces/{spaceId}/lessons/{assignmentId} {');
  assert.equal(vm.runInNewContext(expression,{accountEnabled:()=>true,canTeachInSpace:()=>false,isSpaceMember:()=>true,spaceId:'synthetic-space'}),true);
  assert.doesNotMatch(expression,/planner|sourceType|lessonType|contentType/i);
});
test('Accepted scope: ordinary Spaces reads remain independent of the Planner API',()=>{
  const student=ast('app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/page.tsx');
  assert.ok(find(student,n=>ts.isCallExpression(n)&&n.expression.getText(student)==='getDoc'&&n.arguments[0]?.getText(student)==='doc(db, "spaces", spaceId, "lessons", assignmentId)'));
  assert.match(fs.readFileSync(root+'/app/[locale]/(app)/teacher/spaces/[spaceId]/page.tsx','utf8'),/collection\(db, "spaces", spaceId, "lessons"\)/);
});
test('Accepted scope: archived sharing handler confirms historical snapshots are independent',()=>{
  const source=ast('app/api/teacher/planner/[plannerId]/share-space/plannerHandlers.paused.ts');
  const call=find(source,n=>ts.isCallExpression(n)&&n.expression.getText(source)==='tx.set'&&n.arguments[0]?.getText(source)==='assignmentRef');
  assert.ok(call);const body=call.arguments[1].getText(source);
  for(const key of ['sourceType','lessonType','taskType','contentType'])assert.match(body,new RegExp(key+': "planner"'));
  assert.match(body,/weekPlans/);assert.match(body,/planner\.document/);
});
