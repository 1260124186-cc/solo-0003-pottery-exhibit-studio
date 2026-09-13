<script setup lang="ts">
import {useToast} from '../composables/useToast';
import type {ToastType} from '../composables/toastStore';

const {toasts,dismiss}=useToast();

const meta:Record<ToastType,{label:string;icon:string}>={
  success:{label:'成功',icon:'✓'},
  error:{label:'失败',icon:'!'},
  info:{label:'提醒',icon:'i'},
};
</script>

<template>
  <div class='toast-host' aria-live='polite'>
    <TransitionGroup name='toast'>
      <div
        v-for='t in toasts'
        :key='t.id'
        class='toast'
        :class='`toast--${t.type}`'
        :role='t.type==="error"?"alert":"status"'
      >
        <span class='toast-icon' aria-hidden='true'>{{meta[t.type].icon}}</span>
        <div class='toast-body'>
          <span class='toast-label'>{{meta[t.type].label}}</span>
          <span class='toast-msg'>{{t.message}}</span>
        </div>
        <button
          class='toast-close'
          type='button'
          aria-label='关闭提示'
          @click='dismiss(t.id)'
        >×</button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-host{position:fixed;right:24px;bottom:24px;z-index:1000;display:flex;flex-direction:column;align-items:flex-end;gap:10px;max-width:min(360px,calc(100vw - 32px))}
.toast{display:flex;align-items:flex-start;gap:10px;width:100%;padding:12px 14px;border-radius:6px;background:#fff;box-shadow:0 6px 24px rgba(46,57,52,.16);border-left:4px solid #8a8177}
.toast--success{border-left-color:#4e7a5d}
.toast--success .toast-icon{background:#4e7a5d}
.toast--error{border-left-color:#b04a36}
.toast--error .toast-icon{background:#b04a36}
.toast--info{border-left-color:#7a6a55}
.toast--info .toast-icon{background:#7a6a55}
.toast-icon{flex:0 0 22px;width:22px;height:22px;border-radius:50%;color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:1px}
.toast-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.toast-label{font-size:11px;letter-spacing:.12em;color:#9a9084}
.toast-msg{font-size:14px;color:#3a3631;line-height:1.45;word-break:break-word}
.toast-close{flex:0 0 auto;border:0;background:transparent;color:#9a9084;font-size:18px;line-height:1;cursor:pointer;padding:2px 4px;border-radius:4px}
.toast-close:hover{color:#3a3631;background:#f0ebe3}
.toast-enter-active,.toast-leave-active{transition:all .22s ease}
.toast-enter-from{opacity:0;transform:translateX(24px)}
.toast-leave-to{opacity:0;transform:translateX(24px)}
@media(prefers-reduced-motion:reduce){
  .toast{animation:none}
  .toast-enter-active,.toast-leave-active{transition:none}
}
</style>
