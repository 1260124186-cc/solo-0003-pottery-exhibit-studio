/**
 * 使用真实 setTimeout 的集成冒烟测试：验证组件实际运行时
 * （单例 store + 真实定时器）的自动消失、手动关闭、连续操作。
 */
import {createToastStore,type ToastStore} from '../src/composables/toastStore';

const sleep=(ms:number)=>new Promise((r)=>setTimeout(r,ms));

async function main(){
  // 缩短时长以便快速验证
  const store:ToastStore=createToastStore({durations:{success:120,error:260,info:120},max:3});
  /** 经函数取值，避免 TS 把 reactive 数组 length 窄化成字面量类型 */
  const count=():number=>store.toasts.length;
  const log=(label:string)=>
    console.log(`  [${label}] 当前提示:`,JSON.stringify(store.toasts.map((t)=>`${t.type}:${t.message}`)));

  // 成功 + 校验失败
  store.success('已创建展览草稿');
  store.error('展览名称不能为空');
  log('成功+失败并存');

  // 连续操作：连续 4 条触发 FIFO
  store.success('展览已上线');
  store.error('至少编排一件作品后才能上线');
  log('连续操作后（最早一条应被淘汰）');
  if(count()!==3)throw new Error('容量上限失效');
  if(store.toasts[0].message!=='展览名称不能为空')throw new Error('FIFO 淘汰规则错误');

  // 手动关闭一条
  const manualId=store.toasts[1].id;
  store.dismiss(manualId);
  log('手动关闭一条后');
  if(store.toasts.some((t)=>t.id===manualId))throw new Error('手动关闭失效');
  store.dismiss(manualId); // 幂等

  // 自动消失（真实定时器）
  await sleep(150);
  log('150ms 后（success 应消失，error 保留）');
  if(store.toasts.some((t)=>t.type!=='error'))throw new Error('success/info 未按 120ms 自动消失');

  await sleep(150);
  log('300ms 后（全部应消失）');
  if(count()!==0)throw new Error('error 未按 260ms 自动消失');

  // 消失后再来新提示，确认可重新工作
  store.info('普通提醒');
  if(count()!==1)throw new Error('清空后新提示无法出现');
  await sleep(150);
  if(count()!==0)throw new Error('新提示未自动消失');
  console.log('  全部真实定时器路径通过 ✓');
}

main().catch((e)=>{console.error(e);process.exit(1);});
