<script setup lang='ts'>
import{ref,computed}from'vue';
import{useExhibitService}from'../services/exhibitService';
import{validateArtwork,isArtworkActive}from'../domain/artwork';
const emit=defineEmits(['exit','created']);
const{state,saveArtwork,retireArtwork}=useExhibitService();
const blank=()=>({title:'',artist:'',material:'',year:'',note:'',tone:''});
const form=ref(blank());
const editingId=ref('');
const showForm=ref(false);
const errors=ref<Record<string,string>>({});
const notice=ref('');
const retiredCount=computed(()=>state.value.artworks.filter((a:any)=>!isArtworkActive(a)).length);
function startNew(){editingId.value='';form.value=blank();errors.value={};showForm.value=true}
function startEdit(a:any){editingId.value=a.id;form.value={title:a.title,artist:a.artist,material:a.material,year:String(a.year),note:a.note,tone:a.tone};errors.value={};showForm.value=true}
function cancel(){showForm.value=false;errors.value={}}
function save(){
  errors.value=validateArtwork(form.value);
  if(Object.keys(errors.value).length)return;
  try{
    if(editingId.value){saveArtwork(form.value,editingId.value);notice.value='作品已更新';showForm.value=false}
    else{const a=saveArtwork(form.value);showForm.value=false;emit('created',a.id)}
  }catch(e:any){notice.value=e.message}
}
function retire(a:any){if(!window.confirm(`停用后《${a.title}》不再进入新的编排，确定停用？`))return;retireArtwork(a.id);notice.value=`《${a.title}》已停用，历史编排记录保持不变`}
</script>
<template>
<div class='studio'>
  <header>
    <div>
      <p class='eyebrow'>ARTWORK ARCHIVE</p>
      <h1>作品档案</h1>
      <p class='intro'>维护作品集：新增、修订与停用，停用后不再进入新的编排。</p>
    </div>
    <div class='header-side'>
      <button class='archive-entry' @click="emit('exit')">返回策展台</button>
      <div class='header-note'>{{state.artworks.length}} 件作品 · {{retiredCount}} 件已停用</div>
    </div>
  </header>
  <div class='archive-main'>
    <section>
      <div class='archive-toolbar'>
        <h2>全部作品</h2>
        <button class='add-btn' @click='startNew'>新增作品</button>
      </div>
      <div v-for='a in state.artworks' :key='a.id' class='art-row' :class='{retired:!isArtworkActive(a)}'>
        <div class='swatch' :style='{background:a.tone}'><span>{{a.year}}</span></div>
        <div class='art-info'>
          <h3>{{a.title}}<b v-if='!isArtworkActive(a)' class='badge'>已停用</b></h3>
          <p>{{a.artist}} · {{a.material}} · {{a.year}}</p>
          <small>{{a.note}}</small>
        </div>
        <div class='art-actions'>
          <button @click='startEdit(a)'>编辑</button>
          <button v-if='isArtworkActive(a)' class='danger' @click='retire(a)'>停用</button>
        </div>
      </div>
    </section>
    <section class='form-panel' v-if='showForm'>
      <h2>{{editingId?'编辑作品':'新增作品'}}</h2>
      <div class='field'>
        <label>标题</label>
        <input v-model='form.title' placeholder='作品标题'>
        <p class='field-error' v-if='errors.title'>{{errors.title}}</p>
      </div>
      <div class='field'>
        <label>作者</label>
        <input v-model='form.artist' placeholder='作者姓名'>
        <p class='field-error' v-if='errors.artist'>{{errors.artist}}</p>
      </div>
      <div class='field'>
        <label>材质</label>
        <input v-model='form.material' placeholder='如 白瓷·盐釉'>
        <p class='field-error' v-if='errors.material'>{{errors.material}}</p>
      </div>
      <div class='field'>
        <label>年份</label>
        <input v-model='form.year' inputmode='numeric' placeholder='如 2024'>
        <p class='field-error' v-if='errors.year'>{{errors.year}}</p>
      </div>
      <div class='field'>
        <label>说明</label>
        <textarea v-model='form.note' placeholder='作品说明'></textarea>
        <p class='field-error' v-if='errors.note'>{{errors.note}}</p>
      </div>
      <div class='field'>
        <label>主色</label>
        <div class='tone-field'>
          <input type='color' class='tone-picker' v-model='form.tone'>
          <input class='tone-text' v-model='form.tone' placeholder='#c9795d'>
        </div>
        <p class='field-error' v-if='errors.tone'>{{errors.tone}}</p>
      </div>
      <div class='form-actions'>
        <button @click='save'>{{editingId?'保存修改':'保存并加入当前展览'}}</button>
        <button class='ghost' @click='cancel'>取消</button>
      </div>
      <p class='hint' v-if='!editingId'>保存后将回到策展台，并自动加入当前展览。</p>
    </section>
  </div>
  <div class='notice' v-if='notice'>{{notice}}</div>
</div>
</template>
