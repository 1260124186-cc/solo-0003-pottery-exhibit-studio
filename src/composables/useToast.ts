import {createToastStore,type ToastStore} from './toastStore';

// 全应用单例：任意视图调用 useToast() 操作的是同一组提示
let store:ToastStore|null=null;

export function useToast():ToastStore{
  if(!store)store=createToastStore();
  return store;
}
