<script setup lang='ts'>
import {computed,ref,watch} from 'vue';
import {useExhibitionFlow} from '../composables/useExhibitionFlow';
const props=defineProps<{exhibitId:string}>();
const {state,movePiece,savePlacements}=useExhibitionFlow();
const exhibit=computed(()=>state.value.exhibitions.find((e:any)=>e.id===props.exhibitId));
const artOf=(pid:string)=>state.value.artworks.find((a:any)=>a.id===pid);
const rows=computed(():{pid:string;art:any;first:boolean;last:boolean}[]=>{const e=exhibit.value;if(!e)return[];return e.pieces.map((pid:string,i:number)=>({pid,art:artOf(pid),first:i===0,last:i===e.pieces.length-1}))});
const drafts=ref<Record<string,{hall:string;wall:string;minutes:string}>>({});
const error=ref('');
const saved=ref('');
function rebuild(){const d:Record<string,{hall:string;wall:string;minutes:string}>={};const e=exhibit.value;if(e)for(const pid of e.pieces){const p=e.placements?.[pid];d[pid]={hall:p?.hall??'',wall:p?.wall??'',minutes:String(p?.minutes??'')}}drafts.value=d;error.value='';saved.value=''}
watch(()=>props.exhibitId+'|'+[...(exhibit.value?.pieces??[])].sort().join(','),rebuild,{immediate:true});
function move(pid:string,dir:number){if(!exhibit.value)return;error.value='';saved.value='';movePiece(exhibit.value.id,pid,dir)}
function save(){error.value='';saved.value='';const e=exhibit.value;if(!e)return;const next:Record<string,{hall:string;wall:string;minutes:number}>={};for(const pid of e.pieces){const d=drafts.value[pid];next[pid]={hall:d.hall,wall:d.wall,minutes:Number(d.minutes)}}try{savePlacements(e.id,next);saved.value='空间编排已保存'}catch(err:any){error.value=err.message}}
</script>
<template>
<section class='spatial' v-if='exhibit'>
  <div class='spatial-head'>
    <div><p class='eyebrow'>空间编排</p><h3>展厅 · 墙面位置 · 建议停留</h3></div>
    <button class='save' @click='save' :disabled='!rows.length'>保存空间编排</button>
  </div>
  <p class='empty' v-if='!rows.length'>当前展览还没有编排作品，请先在「作品编排」中加入作品。</p>
  <div class='spatial-row' v-for='(r,i) in rows' :key='r.pid'>
    <div class='order'>
      <button @click='move(r.pid,-1)' :disabled='r.first' title='上移'>↑</button>
      <span>{{i+1}}</span>
      <button @click='move(r.pid,1)' :disabled='r.last' title='下移'>↓</button>
    </div>
    <div class='who'><h4>{{r.art?.title}}</h4><p>{{r.art?.artist}} · {{r.art?.material}}</p></div>
    <label>展厅<input v-model='drafts[r.pid].hall' placeholder='如：一号厅'></label>
    <label>墙面位置<input v-model='drafts[r.pid].wall' placeholder='如：东墙 1 号位'></label>
    <label>停留分钟<input v-model='drafts[r.pid].minutes' inputmode='decimal' placeholder='如：8'></label>
  </div>
  <p class='error' v-if='error'>{{error}}</p>
  <p class='ok' v-if='saved'>{{saved}}</p>
</section>
</template>
