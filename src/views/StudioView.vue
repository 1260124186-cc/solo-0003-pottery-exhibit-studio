<script setup lang='ts'>
import{ref,computed}from'vue';
import{useExhibitionFlow}from'../composables/useExhibitionFlow';
import type{ImportResult}from'../services/importPlan';

const{state,create,release,togglePiece,importText}=useExhibitionFlow();
const selected=ref(state.value.exhibitions[0]?.id||'');
const current=computed(()=>state.value.exhibitions.find((x)=>x.id===selected.value));
const notice=ref('');
const newTitle=ref('');
const importReport=ref<ImportResult|null>(null);
const importBusy=ref(false);

function add(){try{const e=create(newTitle.value);selected.value=e.id;newTitle.value='';notice.value='已创建展览草稿'}catch(e:any){notice.value=e.message}}
function pub(){try{release(selected.value);notice.value='展览已上线'}catch(e:any){notice.value=e.message}}

function onFile(ev:Event){
  const file=(ev.target as HTMLInputElement).files?.[0];
  if(!file)return;
  importBusy.value=true;
  const reader=new FileReader();
  reader.onload=()=>{
    const report=importText(String(reader.result));
    importReport.value=report;
    if(report.ok&&report.exhibitions.length){selected.value=report.exhibitions[0].id}
    notice.value=report.ok
      ?`导入完成：成功 ${report.successes.length} 条，失败 ${report.failures.length} 条`
      :'文件无法导入，现有数据未改动';
    importBusy.value=false;
  };
  reader.onerror=()=>{notice.value='读取文件失败，请重试';importBusy.value=false};
  reader.readAsText(file);
  // 允许再次选择同一个文件
  (ev.target as HTMLInputElement).value='';
}
</script>
<template>
<div class='studio'>
  <header>
    <div>
      <p class='eyebrow'>CLAY / CURATION LAB</p>
      <h1>陶艺展览策划台</h1>
      <p class='intro'>把每件作品放进属于它的光线与距离里。</p>
    </div>
    <div class='header-note'>{{state.exhibitions.length}} 场展览 · {{state.artworks.length}} 件作品</div>
  </header>
  <main>
    <section class='rail'>
      <div class='new-box'><input v-model='newTitle' placeholder='新展览名称' @keyup.enter='add'><button @click='add'>创建草稿</button></div>
      <div class='import-box'>
        <label class='import-label'>从导出文件恢复展览与作品</label>
        <input type='file' accept='.json,application/json' :disabled='importBusy' @change='onFile'>
        <small>需为包含 exhibitions 与 artworks 的 JSON；重名或编号冲突的记录会跳过。</small>
      </div>
      <div v-if='importReport' class='import-report'>
        <template v-if='importReport.ok'>
          <p class='report-summary'>
            本次成功 <b>{{importReport.successes.length}}</b> 条，失败 <b>{{importReport.failures.length}}</b> 条
          </p>
          <p v-for='(s,i) in importReport.successes' :key="'ok'+i" class='report-ok'>✓ {{s.kind}}「{{s.title||s.id}}」已导入</p>
          <p v-for='(f,i) in importReport.failures' :key="'bad'+i" class='report-bad'>✕ {{f.kind}}{{f.title? '「'+f.title+'」':f.ref}}：{{f.reason}}</p>
        </template>
        <p v-else class='report-bad'>✕ 文件：{{importReport.reason}}（未写入任何数据）</p>
      </div>
      <div v-for='e in state.exhibitions' :key='e.id' class='exhibit-row' :class='{active:e.id===selected}' @click='selected=e.id'>
        <div><span>{{e.status}}</span><h3>{{e.title}}</h3><p>{{e.subtitle}}</p></div><b>{{e.pieces.length}} 件</b>
      </div>
    </section>
    <section class='canvas' v-if='current'>
      <div class='canvas-top'>
        <div><p class='eyebrow'>策展工作面</p><h2>{{current.title}}</h2><p>{{current.description}}</p></div>
        <button class='release' @click='pub'>上线展览</button>
      </div>
      <div class='meta'><span>策展人 · {{current.curator}}</span><span>{{current.opening}} — {{current.closing}}</span><span class='status'>{{current.status}}</span></div>
      <div class='piece-grid'>
        <div class='piece' v-for='a in state.artworks' :key='a.id' :class='{chosen:current.pieces.includes(a.id)}' @click='togglePiece(current.id,a.id)'>
          <div class='piece-art' :style='{background:a.tone}'><span>{{a.year}}</span></div>
          <div><h3>{{a.title}}</h3><p>{{a.artist}} · {{a.material}}</p><small>{{a.note}}</small></div>
          <button>{{current.pieces.includes(a.id)?'已编排':'加入展览'}}</button>
        </div>
      </div>
      <div class='notice' v-if='notice'>{{notice}}</div>
    </section>
  </main>
</div>
</template>
