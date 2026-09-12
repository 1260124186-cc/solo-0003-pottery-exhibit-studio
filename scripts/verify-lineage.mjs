/**
 * 血缘端到端验证（不依赖浏览器，Node >= 18）：
 *   node scripts/verify-lineage.mjs
 * 覆盖：保存模板 → 从模板创建草稿 → 草稿副本 → 修改模板不影响旧草稿
 *       → 删除模板不影响草稿 → 修改草稿不影响模板 → 刷新恢复 → 损坏可观察
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,resolve} from 'node:path';
import {createRequire} from 'node:module';
import vm from 'node:vm';

const require=createRequire(import.meta.url);
const ts=require('typescript');
const here=dirname(fileURLToPath(import.meta.url));
const src=(p)=>resolve(here,'..',p);

/* ---- 极简 localStorage ---- */
class MemoryStorage{
  constructor(){this.m=new Map()}
  getItem(k){return this.m.has(k)?this.m.get(k):null}
  setItem(k,v){this.m.set(k,String(v))}
  removeItem(k){this.m.delete(k)}
  clear(){this.m.clear()}
  get size(){return this.m.size}
}
const ls=new MemoryStorage();
globalThis.localStorage=ls;

/* ---- TS 应用源码加载器（按文件 transpile 为 CJS，缓存模块以模拟单例） ---- */
const cache=new Map();
function loadTs(file){
  const url=pathToFileURL(file).href;
  if(cache.has(url))return cache.get(url).exports;
  const raw=readFileSync(file,'utf8');
  const js=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const module={exports:{}};
  cache.set(url,module.exports);
  const localRequire=(spec)=>{
    if(spec==='vue')return{ref:(v)=>({value:v}),computed:(fn)=>fn};
    if(!spec.startsWith('.'))throw new Error('unexpected import '+spec);
    const base=resolve(dirname(file),spec);
    for(const cand of [base,base+'.ts',base+'.js',resolve(base,'index.ts')]){
      try{if(readFileSync(cand))return loadTs(cand)}catch{}
    }
    throw new Error('cannot resolve import '+spec);
  };
  const wrapper=vm.compileFunction(js,['exports','require','module'],{filename:file});
  wrapper(module.exports,localRequire,module);
  cache.set(url,module.exports);
  return module.exports;
}

/* ---- 断言工具 ---- */
let failures=0;
function check(name,cond,detail=''){
  console.log(`${cond?'  ✅':'  ❌'} ${name}${detail&&!cond?` — ${detail}`:''}`);
  if(!cond)failures++;
}
function fingerprintJson(v){
  const s=JSON.stringify(v);let h=0x811c9dc5;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)}
  return ('0000000'+(h>>>0).toString(16)).slice(-8);
}

/* ============ 场景开始 ============ */
console.log('\n① 保存模板（独立持久化）');
let svc=loadTs(src('src/services/exhibitService.ts')).useExhibitService();
const content={subtitle:'副标题-模板版',curator:'模板策展人',opening:'2026-01-01',closing:'2026-03-01',description:'模板说明',pieces:['a1','a2']};
const tpl=svc.saveTemplate('年度陶艺邀请展',content);
check('模板已保存且版本为 v1',tpl.version===1);
check('模板与入参不共享 pieces 引用',tpl.content.pieces!==content.pieces);
content.pieces.push('a4'); // 篡改入参
check('入参后续变化不回写模板（深拷贝）',JSON.stringify(tpl.content.pieces)===JSON.stringify(['a1','a2']));

console.log('\n② 从模板创建全新草稿');
const d1=svc.createFromTemplate(tpl.id);
check('草稿为全新 id',d1.id!==tpl.id);
check('草稿状态为“草稿”',d1.status==='草稿');
check('草稿内容来自模板',d1.subtitle==='副标题-模板版'&&d1.pieces.length===2);
check('草稿 pieces 与模板 pieces 不是同一数组',d1.pieces!==svc.state.value.templates.find(t=>t.id===tpl.id).content.pieces);
const blood1=svc.exhibitLineage(d1);
check('血缘：来源模板存在且快照一致（无 broken/missing）',blood1.every(c=>c.level!=='broken'&&c.level!=='missing'),JSON.stringify(blood1));
check('血缘记录含模板 id/版本/快照指纹',d1.lineage.sourceTemplateId===tpl.id&&d1.lineage.sourceVersion===1&&d1.lineage.snapshot.length===8);

console.log('\n③ 修改草稿不影响模板');
svc.togglePiece(d1.id,'a1'); // 移除 a1
svc.togglePiece(d1.id,'a3'); // 加入 a3
d1.subtitle='副标题-草稿改编';
const tplAfter=svc.state.value.templates.find(t=>t.id===tpl.id);
check('模板作品编排未被动过',JSON.stringify(tplAfter.content.pieces)===JSON.stringify(['a1','a2']));
check('模板副标题未被草稿改动',tplAfter.content.subtitle==='副标题-模板版');
check('血缘可观察到草稿已独立改编（info，非损坏）',svc.exhibitLineage(d1).some(c=>c.text.includes('独立改编')));

console.log('\n④ 草稿的副本：三方血缘（模板 → 草稿 → 副本）');
const c1=svc.duplicateExhibit(d1.id);
check('副本是新对象新 id',c1.id!==d1.id);
check('副本与草稿不共享 pieces',c1.pieces!==d1.pieces);
check('副本内容复制自改编后的草稿',c1.pieces.includes('a3')&&!c1.pieces.includes('a1'));
check('副本 kind=copy 且指回父草稿与同一模板',c1.lineage.kind==='copy'&&c1.lineage.derivedFromExhibitId===d1.id&&c1.lineage.sourceTemplateId===tpl.id);
const c1Checks=svc.exhibitLineage(c1);
check('副本血缘三环节全部正常',c1Checks.some(c=>c.text.includes('来源模板'))&&c1Checks.some(c=>c.text.includes('副本来源草稿')),c1Checks.map(c=>c.text).join(' | '));
svc.togglePiece(c1.id,'a4');
check('修改副本不影响父草稿',d1.pieces.includes('a4')===false);

console.log('\n⑤ 模板创建草稿后再被修改 → 旧草稿/副本保持创建时版本');
svc.updateTemplate(tpl.id,{subtitle:'副标题-模板v2',pieces:['a3','a4']});
check('模板版本升到 v2，历史保留 v1',svc.state.value.templates.find(t=>t.id===tpl.id).version===2&&tplAfter.history.length===2);
const d1again=svc.state.value.exhibitions.find(e=>e.id===d1.id);
check('旧草稿仍记录 v1',d1again.lineage.sourceVersion===1);
check('旧草稿内容不随模板变化',d1again.subtitle==='副标题-草稿改编'&&!d1again.pieces.includes('a4'));
check('血缘可观察“模板已更新到 v2，本草稿保持 v1”',svc.exhibitLineage(d1again).some(c=>c.text.includes('模板已更新到 v2')));
check('v1 指纹仍在模板历史中可验证',tplAfter.history.some(h=>h.version===1&&h.fingerprint===d1again.lineage.snapshot));

console.log('\n⑥ 用更新后的模板再创建草稿 → 新草稿拿 v2，与旧草稿互不影响');
const d2=svc.createFromTemplate(tpl.id);
check('新草稿记录 v2 且内容为 v2',d2.lineage.sourceVersion===2&&d2.subtitle==='副标题-模板v2'&&JSON.stringify(d2.pieces)===JSON.stringify(['a3','a4']));
check('新老草稿 pieces 不共享',d2.pieces!==d1again.pieces);

console.log('\n⑦ 删除模板（删除前由 UI 弹层确认）→ 草稿与副本不受影响');
svc.deleteTemplate(tpl.id);
check('模板已删除',svc.state.value.templates.length===0);
const d1AfterDel=svc.state.value.exhibitions.find(e=>e.id===d1.id);
const c1AfterDel=svc.state.value.exhibitions.find(e=>e.id===c1.id);
check('旧草稿内容仍在',d1AfterDel.subtitle==='副标题-草稿改编'&&d1AfterDel.pieces.includes('a3'));
check('副本内容仍在且仍指回父草稿',c1AfterDel.lineage.derivedFromExhibitId===d1.id);
const delChecks=svc.exhibitLineage(d1AfterDel);
check('血缘明确提示“来源模板已删除，草稿独立保留”',delChecks.some(c=>c.text.includes('来源模板已删除')),delChecks.map(c=>c.text).join(' | '));
check('删除模板不构成血缘损坏（broken）',!delChecks.some(c=>c.level==='broken'));
check('副本仍能验证到父草稿',svc.exhibitLineage(c1AfterDel).some(c=>c.text.includes('副本来源草稿')));

console.log('\n⑧ 刷新恢复（模块全部重新初始化，仅靠 localStorage 恢复）');
cache.clear();
const persistedKeys=ls.size;
svc=loadTs(src('src/services/exhibitService.ts')).useExhibitService();
check('localStorage 中有持久化数据',persistedKeys>0);
const d1r=svc.state.value.exhibitions.find(e=>e.id===d1.id);
const c1r=svc.state.value.exhibitions.find(e=>e.id===c1.id);
const d2r=svc.state.value.exhibitions.find(e=>e.id===d2.id);
check('刷新后草稿/副本全部恢复且血缘字段完整',!!d1r&&!!c1r&&!!d2r&&d1r.lineage.sourceVersion===1&&d2r.lineage.sourceVersion===2);
check('刷新后删除状态保持（模板不复活）',svc.state.value.templates.length===0);
check('刷新后血缘整体校验无 broken/missing',svc.verifyLineage().broken===false);

console.log('\n⑨ 任何一环改坏都要能被观察');
// 版本记录被删/篡改：放回一个缺少 v2 版本记录的模板，应直接 broken
const d2fresh=svc.state.value.exhibitions.find(e=>e.id===d2r.id);
d2fresh.lineage.snapshot=fingerprintJson({subtitle:'伪造快照'});
const tamperedTpl={id:d2fresh.lineage.sourceTemplateId,title:'年度陶艺邀请展',version:9,content:{pieces:[]},history:[{version:9,fingerprint:'deadbeef',at:'x'}]};
svc.state.value.templates.push(tamperedTpl);
const brokenChecks=svc.exhibitLineage(d2fresh);
check('版本记录缺失被识别为血缘损坏 broken',brokenChecks.some(c=>c.level==='broken'&&c.text.includes('缺少 v2 的版本记录')),brokenChecks.map(c=>c.text).join(' | '));
svc.state.value.templates=[];
// 父草稿被删除后，副本血缘应报 missing
const d1Idx=svc.state.value.exhibitions.findIndex(e=>e.id===d1r.id);
const removedParent=svc.state.value.exhibitions[d1Idx];
svc.state.value.exhibitions.splice(d1Idx,1);
const orphanCopy=svc.state.value.exhibitions.find(e=>e.id===c1r.id);
const orphanChecks=svc.exhibitLineage(orphanCopy);
check('父草稿删除后，副本血缘报 missing 可观察',orphanChecks.some(c=>c.level==='missing'&&c.text.includes('已被删除')),orphanChecks.map(c=>c.text).join(' | '));
check('verifyLineage 汇总标记整体存在问题',svc.verifyLineage().broken===true);
svc.state.value.exhibitions.unshift(removedParent);

console.log('\n⑩ 旧版本数据（无 templates/lineage 字段）可迁移');
ls.clear();cache.clear();
ls.setItem('pottery-exhibit-studio-v1',JSON.stringify({exhibitions:[{id:'old1',title:'旧展览',subtitle:'s',curator:'c',status:'草稿',opening:'2024-01-01',closing:'2024-02-01',pieces:['a1'],description:'d'}],artworks:[]}));
svc=loadTs(src('src/services/exhibitService.ts')).useExhibitService();
const old=svc.state.value.exhibitions.find(e=>e.id==='old1');
check('旧数据自动补齐空白血缘',!!old.lineage&&old.lineage.kind==='blank');
check('迁移后旧展览血缘校验正常',svc.exhibitLineage(old).every(c=>c.level==='ok'));
check('模板集合初始化为空数组',Array.isArray(svc.state.value.templates)&&svc.state.value.templates.length===0);

console.log(failures===0?'\n🎉 全部血缘验证通过\n':'\n❌ 存在失败的断言：'+failures+'\n');
process.exit(failures===0?0:1);
