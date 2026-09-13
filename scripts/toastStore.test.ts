/**
 * toastStore 的确定性规则测试：使用虚拟时钟与虚拟调度器，
 * 不依赖真实定时器，所有边界行为可稳定复现。
 */
import {createToastStore,type ToastType} from '../src/composables/toastStore';

interface Timer{id:number;fireAt:number;fn:()=>void;cancelled:boolean}

function setup(){
  let now=0;
  let seq=0;
  const timers:Timer[]=[];
  const store=createToastStore({
    now:()=>now,
    durations:{success:3000,error:5000,info:3000},
    max:3,
    schedule:(fn:()=>void,delay:number)=>{
      const t:Timer={id:++seq,fireAt:now+delay,fn,cancelled:false};
      timers.push(t);
      return ()=>{t.cancelled=true;};
    },
  });
  /** 推进虚拟时间，触发所有已到期且未取消的定时器（按时间顺序） */
  function advance(ms:number){
    const target=now+ms;
    for(;;){
      const due=timers
        .filter((t:Timer)=>!t.cancelled&&t.fireAt<=target)
        .sort((a:Timer,b:Timer)=>a.fireAt-b.fireAt)[0];
      if(!due)break;
      due.cancelled=true;
      now=due.fireAt;
      due.fn();
    }
    now=target;
  }
  const ids=()=>store.toasts.map((t)=>t.id);
  const rows=()=>store.toasts.map((t)=>`${t.id}:${t.type}:${t.message}`);
  const activeTimerCount=()=>timers.filter((t)=>!t.cancelled).length;
  function push(type:ToastType,message:string,time?:number){
    if(time!==undefined)now=time;
    store.push(type,message);
  }
  return {store,advance,ids,rows,activeTimerCount,push};
}

let passed=0;
let failed=0;
function assert(cond:boolean,name:string,extra?:string){
  if(cond){
    passed++;
    console.log(`  ✓ ${name}`);
  }else{
    failed++;
    console.error(`  ✗ ${name}${extra?` — ${extra}`:''}`);
  }
}
function eq<T>(actual:T,expected:T,name:string){
  assert(JSON.stringify(actual)===JSON.stringify(expected),name,`期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
}

// 场景 1：成功与校验失败，类型、时长与文案透传
console.log('场景 1：成功 / 校验失败提示，错误文案原样透传');
{
  const {store,advance,ids,rows}=setup();
  store.success('已创建展览草稿');
  store.error('展览名称不能为空'); // 服务层原始文案
  eq(rows(),['1:success:已创建展览草稿','2:error:展览名称不能为空'],'两条提示同时存在，不叠加覆盖');
  advance(3000);
  eq(ids(),[2],'3000ms 后 success 自动消失，error 仍保留（5000ms）');
  advance(2000);
  eq(ids(),[],'5000ms 时 error 自动消失');
}

// 场景 2：连续操作超过上限，FIFO 淘汰，且被淘汰者的定时器被取消
console.log('场景 2：连续操作 —— 超出容量时最早提示被淘汰');
{
  const {store,advance,ids,rows,activeTimerCount}=setup();
  store.success('已创建展览草稿');
  store.success('展览已上线');
  store.error('至少编排一件作品后才能上线');
  store.info('普通提醒'); // 触发淘汰
  eq(rows(),['2:success:展览已上线','3:error:至少编排一件作品后才能上线','4:info:普通提醒'],'最早的 #1 被淘汰，#2/#3/#4 保留');
  eq(activeTimerCount(),3,'被淘汰提示的定时器一并取消，无悬挂定时器');
  advance(3000);
  eq(ids(),[3],'t=3000：#2 与 #4 各自到期消失，#3（error 5000ms）保留');
  advance(3000);
  eq(ids(),[],'t=6000：#3 到期消失');
}

// 场景 3：自动关闭绝不误关新提示 —— 被淘汰提示的旧定时器到期是空操作
console.log('场景 3：旧定时器到期不会关掉新提示');
{
  const {store,advance,ids}=setup();
  store.success('s1'); // #1
  store.success('s2'); // #2
  store.success('s3'); // #3
  store.error('e4');   // #4 淘汰 #1（#1 的 3000ms 定时器被取消）
  eq(ids(),[2,3,4],'淘汰后栈为 #2 #3 #4');
  // 即便 #1 的旧定时器漏网（取消逻辑失效的极端情形），它按 id 关闭也只能找到自己
  advance(3000); // #2 #3 到期；#1 本也该此时到期
  eq(ids(),[4],'新提示 #4 未被任何旧定时器误关');
  advance(2000);
  eq(ids(),[],'#4 于自身 5000ms 到期');
}

// 场景 4：手动关闭与自动消失交错
console.log('场景 4：手动关闭 × 自动消失交错');
{
  const {store,advance,ids,activeTimerCount}=setup();
  store.success('s1');          // #1，t 到期 3000
  store.error('e2');            // #2，t 到期 5000
  store.success('s3');          // #3，t 到期 3000
  store.dismiss(2);             // 提前手动关闭 #2
  eq(ids(),[1,3],'手动关闭 #2 后其余提示不受影响');
  eq(activeTimerCount(),2,'#2 的定时器已取消');
  store.dismiss(2);             // 重复关闭
  store.dismiss(999);           // 不存在的 id
  eq(ids(),[1,3],'重复关闭 / 关闭不存在的 id 均为幂等空操作');
  advance(1000);
  store.info('i4');             // t=1000 插入新提示，到期 4000
  eq(ids(),[1,3,4],'自动消失窗口期内插入的新提示正常保留');
  advance(2000);                // 到达 t=3000
  eq(ids(),[4],'t=3000：#1 #3 自动消失，#4 还有自己的 1000ms');
  advance(2000);                // 到达 t=5000，#2 的旧定时器本应在此时到期
  eq(ids(),[],'#2 已被手动关闭，其旧定时器到期为空操作；#4 在 t=4000 正常自动消失');
  eq(activeTimerCount(),0,'无悬挂定时器');
}

// 场景 5：新提示在栈将空时到达，旧定时器不影响新提示
console.log('场景 5：自动消失后立刻来新提示');
{
  const {store,advance,ids}=setup();
  store.success('s1');
  advance(3000);
  eq(ids(),[],'#1 已消失');
  store.error('e2');
  eq(ids(),[2],'新提示正常入栈');
  advance(3000);
  eq(ids(),[2],'新提示按自身时长计时，3000ms 未到 error 的 5000ms');
  advance(2000);
  eq(ids(),[],'#2 于 5000ms 消失');
}

console.log(`\n结果：${passed} 通过，${failed} 失败`);
if(failed>0)process.exit(1);
