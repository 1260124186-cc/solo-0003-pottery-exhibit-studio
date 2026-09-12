// 空间编排烟囱验证：通过 Vite SSR 加载真实 exhibitService，localStorage 用内存实现。
// 覆盖：设置空间信息 / 非法输入阻止保存 / 上移下移 / 刷新恢复 / 加入移出作品一致性 / 旧数据兼容与既有流程回归。
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const KEY='pottery-exhibit-studio-v1';
const store=new Map();
globalThis.localStorage={
  getItem:k=>(store.has(k)?store.get(k):null),
  setItem:(k,v)=>store.set(k,String(v)),
  removeItem:k=>store.delete(k),
  clear:()=>store.clear(),
};

let pass=0,fail=0;
const ok=(cond,msg)=>{if(cond){pass++;console.log('  ✓ '+msg)}else{fail++;console.error('  ✗ '+msg)}};
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const ex=(state,id)=>state.value.exhibitions.find(e=>e.id===id);
const persisted=()=>JSON.parse(store.get(KEY));

async function boot(){
  const server=await createServer({root,logLevel:'silent',server:{middlewareMode:true}});
  const mod=await server.ssrLoadModule('/src/services/exhibitService.ts');
  const svc=mod.useExhibitService();
  return{svc,close:()=>server.close()};
}
const consistent=e=>eq([...e.pieces].sort(),Object.keys(e.placements).sort());

// ---- 会话 1：设置空间信息、非法输入、调整顺序 ----
const s1=await boot();
const {svc}=s1;
const e1=()=>ex(svc.state,'e1');

console.log('[1] 设置空间信息');
ok(eq(e1().pieces,['a1','a3']),'初始作品顺序为 a1,a3');
ok(consistent(e1()),'初始空间信息与作品集合一致');
svc.savePlacements('e1',{a1:{hall:'一号厅',wall:'东墙 1 号位',minutes:12},a3:{hall:'  二号厅 ',wall:'西墙 3 号位',minutes:8}});
ok(e1().placements.a1.minutes===12&&e1().placements.a1.hall==='一号厅','停留时间与展厅已写入状态');
ok(e1().placements.a3.hall==='二号厅','保存时去除展厅名首尾空格');
ok(persisted().exhibitions.find(e=>e.id==='e1').placements.a1.wall==='东墙 1 号位','空间信息已持久化到 localStorage');

console.log('[2] 非法停留时间阻止保存');
for(const[label,bad]of[['零',0],['负数',-5],['非数字',Number('abc')],['无穷',Infinity]]){
  const before=store.get(KEY);
  let msg='';
  try{svc.savePlacements('e1',{a1:{hall:'一号厅',wall:'东墙 1 号位',minutes:bad},a3:{hall:'二号厅',wall:'西墙 3 号位',minutes:8}})}catch(err){msg=err.message}
  ok(msg.includes('停留时间必须是正数')&&msg.includes('潮汐之后'),`停留时间为${label}时阻止保存并说明原因（${msg||'未报错'}）`);
  ok(store.get(KEY)===before&&e1().placements.a1.minutes===12,`非法输入（${label}）后状态与本地数据保持不变`);
}

console.log('[3] 上移下移调整呈现顺序');
svc.movePiece('e1','a3',-1);
ok(eq(e1().pieces,['a3','a1']),'a3 上移后顺序为 a3,a1');
svc.movePiece('e1','a3',-1);
ok(eq(e1().pieces,['a3','a1']),'已在首位时上移为无操作');
svc.movePiece('e1','a3',1);
ok(eq(e1().pieces,['a1','a3']),'a3 下移后回到 a1,a3');
svc.movePiece('e1','a3',1);
ok(eq(e1().pieces,['a1','a3']),'已在末位时下移为无操作');
svc.movePiece('e1','a3',-1);
ok(eq(persisted().exhibitions.find(e=>e.id==='e1').pieces,['a3','a1']),'顺序调整已持久化（当前 a3,a1）');
ok(consistent(e1()),'调整后空间信息仍与作品集合一致');
await s1.close();

// ---- 会话 2：模拟刷新，验证原样恢复 ----
console.log('[4] 刷新后原样恢复');
const s2=await boot();
const svc2=s2.svc;
const r1=ex(svc2.state,'e1');
ok(eq(r1.pieces,['a3','a1']),'刷新后作品顺序恢复为 a3,a1');
ok(r1.placements.a1.minutes===12&&r1.placements.a1.wall==='东墙 1 号位'&&r1.placements.a3.hall==='二号厅','刷新后展厅/墙面/停留时间原样恢复');
ok(consistent(r1),'恢复后空间信息与作品集合一致');

console.log('[5] 加入/移出作品后空间信息保持一致');
svc2.togglePiece('e1','a2');
ok(eq(r1.pieces,['a3','a1','a2']),'加入 a2 后进入作品列表末尾');
ok(r1.placements.a2&&r1.placements.a2.minutes===10,'加入的作品自动获得默认空间设置');
svc2.savePlacements('e1',{a3:{hall:'一号厅',wall:'东墙 2 号位',minutes:8},a1:{hall:'一号厅',wall:'东墙 1 号位',minutes:12},a2:{hall:'三号厅',wall:'北墙 1 号位',minutes:5}});
svc2.togglePiece('e1','a1');
ok(!r1.pieces.includes('a1')&&!( 'a1' in r1.placements),'移出 a1 后其空间信息一并移除');
ok(consistent(r1),'移出后空间信息与作品集合一致');
ok(r1.placements.a2.hall==='三号厅','其余作品的空间设置不受移出影响');
ok(consistent(persisted().exhibitions.find(e=>e.id==='e1')),'持久化数据中空间信息与作品集合一致');

console.log('[6] 既有流程回归（创建/编排/上线）');
let m1='';try{svc2.create('   ')}catch(e){m1=e.message}
ok(m1==='展览名称不能为空','空名称创建仍被阻止');
const draft=svc2.create('回转之间');
ok(draft.pieces.length===0&&consistent(ex(svc2.state,draft.id)),'新展览自带空而一致的空间信息');
let m2='';try{svc2.release(draft.id)}catch(e){m2=e.message}
ok(m2==='至少编排一件作品后才能上线','无作品展览仍不能上线');
svc2.togglePiece(draft.id,'a4');
svc2.release(draft.id);
ok(ex(svc2.state,draft.id).status==='已上线','编排作品后可正常上线');
await s2.close();

// ---- 会话 3：旧版本地数据（无 placements）兼容 ----
console.log('[7] 旧版本地存储数据兼容');
// 旧格式数据：exhibitions 没有 placements 字段，artworks 复用当前作品表
store.set(KEY,JSON.stringify({exhibitions:[{id:'e9',title:'旧展',subtitle:'旧数据',curator:'旧人',status:'草稿',opening:'2024-01-01',closing:'2024-02-01',pieces:['a1','a4'],description:'无空间信息的旧数据。'}],artworks:svc2.state.value.artworks}));
const s3=await boot();
const svc3=s3.svc;
const e9=ex(svc3.state,'e9');
ok(eq(e9.pieces,['a1','a4']),'旧数据的编排顺序不受影响');
ok(consistent(e9)&&e9.placements.a1.minutes===10,'旧数据加载后自动补齐默认空间信息');
svc3.togglePiece('e9','a1');
ok(consistent(ex(svc3.state,'e9')),'旧数据上移出作品后空间信息保持一致');
await s3.close();

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail?1:0);
