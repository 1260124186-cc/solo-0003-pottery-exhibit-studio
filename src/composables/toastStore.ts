import {reactive} from 'vue';

/**
 * 提示类型：
 * - success：操作成功
 * - error：校验失败 / 业务错误（文案由服务层抛出，原样展示）
 * - info：普通提醒
 */
export type ToastType='success'|'error'|'info';

export interface Toast{
  id:number;
  type:ToastType;
  message:string;
  createdAt:number;
}

export interface ToastDurations{
  success:number;
  error:number;
  info:number;
}

export interface CreateToastStoreOptions{
  /** 当前时间，测试可注入虚拟时钟 */
  now?:()=>number;
  /**
   * 定时调度器：在 delay 毫秒后执行 fn，返回取消函数。
   * 生产环境绑定 setTimeout / clearTimeout，测试可注入虚拟时钟。
   */
  schedule?:(fn:()=>void,delay:number)=>()=>void;
  durations?:Partial<ToastDurations>;
  /** 同屏最多保留的提示条数 */
  max?:number;
}

/**
 * 提示替换规则（确定、可复现）：
 *
 * 1. 同屏最多保留 max（默认 3）条，按到达时间从旧到新排列，新提示从底部进入。
 * 2. 新提示到达且未满：直接入栈。
 * 3. 新提示到达且已满：淘汰最早一条（FIFO），同时取消它的自动关闭定时器，
 *    其余提示（包括各自的倒计时）不受影响。
 * 4. 每条提示持有自己的定时器：success/info 默认 3000ms，error 默认 5000ms，
 *    从该条入栈时刻起计时。
 * 5. 自动关闭与手动关闭都只按 id 操作：定时器触发时若该 id 已不在栈中
 *    （被手动关闭或被新提示淘汰），则什么都不做——旧定时器永远不会关掉新提示。
 * 6. 关闭操作幂等：重复关闭、关闭不存在的 id 都不会影响其他提示。
 */
export function createToastStore(options:CreateToastStoreOptions={}){
  const now=options.now??Date.now;
  const schedule=options.schedule??((fn:()=>void,delay:number)=>{
    const handle=setTimeout(fn,delay);
    return ()=>clearTimeout(handle);
  });
  const durations:ToastDurations={
    success:3000,
    error:5000,
    info:3000,
    ...options.durations,
  };
  const max=options.max??3;

  const toasts=reactive<Toast[]>([]);
  /** id -> 该条提示的定时器取消函数 */
  const timers=new Map<number,()=>void>();
  let seq=0;

  function dismiss(id:number){
    const index=toasts.findIndex((t)=>t.id===id);
    if(index===-1)return; // 已被关闭或淘汰：幂等，不影响其他提示
    toasts.splice(index,1);
    const cancel=timers.get(id);
    if(cancel){
      cancel();
      timers.delete(id);
    }
  }

  function push(type:ToastType,message:string):number{
    const id=++seq;
    toasts.push({id,type,message,createdAt:now()});

    // 超出容量：淘汰最早一条（连同它的定时器一起清理）
    while(toasts.length>max){
      const oldest=toasts[0];
      dismiss(oldest.id);
    }

    // 注意：回调只捕获本条 id，绝不按位置/索引关闭，避免误关新提示
    const cancel=schedule(()=>{
      timers.delete(id);
      dismiss(id);
    },durations[type]);
    timers.set(id,cancel);

    return id;
  }

  return {
    toasts,
    push,
    success:(message:string)=>push('success',message),
    error:(message:string)=>push('error',message),
    info:(message:string)=>push('info',message),
    dismiss,
  };
}

export type ToastStore=ReturnType<typeof createToastStore>;
