<script setup lang="ts">
import{ref,computed}from 'vue';
import{useExhibitionFlow}from'../composables/useExhibitionFlow';
import type{Exhibition,ExhibitionTemplate,TemplateContent}from'../domain/models';

const{state,create,release,togglePiece,saveTemplate,updateTemplate,deleteTemplate,createFromTemplate,duplicateExhibit,exhibitLineage}=useExhibitionFlow();

type View='studio'|'templates';
const view=ref<View>('studio');

const selected=ref<string>(state.value.exhibitions[0]?.id||'');
const current=computed(()=>state.value.exhibitions.find(e=>e.id===selected.value));
const currentChecks=computed(()=>current.value?exhibitLineage(current.value):[]);
const copyParentTitle=computed(()=>current.value?.lineage.derivedFromExhibitId?state.value.exhibitions.find(x=>x.id===current.value!.lineage.derivedFromExhibitId)?.title??'已删除草稿':'');
const notice=ref('');
const newTitle=ref('');

function notify(msg:string){notice.value=msg;setTimeout(()=>{if(notice.value===msg)notice.value=''},2600)}

function add(){
  try{const e=create(newTitle.value);selected.value=e.id;newTitle.value='';notify('已创建空白草稿')}
  catch(err:any){notify(err.message)}
}
function pub(){
  if(!current.value)return;
  try{release(current.value.id);notify('展览已上线')}catch(err:any){notify(err.message)}
}
function duplicate(){
  if(!current.value)return;
  const e=duplicateExhibit(current.value.id);selected.value=e.id;notify('已生成副本（独立草稿，血缘已记录）');
}

/* ---------- 模板库 ---------- */

function emptyContent():TemplateContent{return{subtitle:'',curator:'',opening:'2025-01-01',closing:'2025-03-01',description:'',pieces:[]}}
const editingId=ref<string|null>(null);
const tplTitle=ref('');
const tplContent=ref<TemplateContent>(emptyContent());
const savingAsNew=ref(false);
const confirmDeleteId=ref<string|null>(null);

const editingTemplate=computed(()=>state.value.templates.find(t=>t.id===editingId.value)||null);

function newTemplate(){
  savingAsNew.value=true;editingId.value='__new__';tplTitle.value='';tplContent.value=emptyContent();
}
function editTemplate(t:ExhibitionTemplate){
  savingAsNew.value=false;editingId.value=t.id;tplTitle.value=t.title;tplContent.value=JSON.parse(JSON.stringify(t.content));
}
function cancelEdit(){editingId.value=null;confirmDeleteId.value=null}
function saveTpl(){
  try{
    if(savingAsNew.value){
      const t=saveTemplate(tplTitle.value,tplContent.value);
      editingId.value=t.id;savingAsNew.value=false;
      notify('模板已保存');
    }else if(editingId.value){
      updateTemplate(editingId.value,{title:tplTitle.value,...tplContent.value});
      notify('模板已更新并生成新版本（既有草稿不受影响）');
    }
  }catch(err:any){notify(err.message)}
}
function askDelete(t:ExhibitionTemplate){confirmDeleteId.value=t.id}
function reallyDelete(){
  if(!confirmDeleteId.value)return;
  deleteTemplate(confirmDeleteId.value);
  if(editingId.value===confirmDeleteId.value)editingId.value=null;
  confirmDeleteId.value=null;
  notify('模板已删除，由它创建的草稿保持不变');
}
function useTemplate(t:ExhibitionTemplate){
  const e=createFromTemplate(t.id);
  selected.value=e.id;view.value='studio';
  notify('已从模板创建全新草稿');
}
function toggleTplPiece(id:string){
  const p=tplContent.value.pieces;
  tplContent.value.pieces=p.includes(id)?p.filter(x=>x!==id):[...p,id];
}

/* 从已有展览“另存为模板” */
const saveAsTplTitle=ref('');
function saveCurrentAsTemplate(){
  if(!current.value)return;
  const e:Exhibition=current.value;
  try{
    const t=saveTemplate(saveAsTplTitle.value||e.title+' 模板',{
      subtitle:e.subtitle,curator:e.curator,opening:e.opening,closing:e.closing,description:e.description,pieces:[...e.pieces]
    });
    saveAsTplTitle.value='';
    notify(`模板“${t.title}”已保存，可在模板库管理`);
  }catch(err:any){notify(err.message)}
}

function fmtDate(iso:string){return iso?iso.slice(0,10):''}
const levelLabel:Record<string,string>={ok:'正常',info:'提示',missing:'来源缺失',broken:'血缘损坏'};
</script>

<template>
  <div class='studio'>
    <header>
      <div>
        <p class='eyebrow'>CLAY / CURATION LAB</p>
        <h1>陶艺展览策划台</h1>
        <p class='intro'>把每件作品放进属于它的光线与距离里。</p>
      </div>
      <div class='header-side'>
        <nav class='tabs'>
          <button :class='{on:view==="studio"}' @click='view="studio"'>策展工作面</button>
          <button :class='{on:view==="templates"}' @click='view="templates"'>模板库 · {{state.templates.length}}</button>
        </nav>
        <div class='header-note'>{{state.exhibitions.length}} 场展览 · {{state.artworks.length}} 件作品</div>
      </div>
    </header>

    <!-- ========== 策展工作面 ========== -->
    <main v-if='view==="studio"'>
      <section class='rail'>
        <div class='new-box'>
          <input v-model='newTitle' placeholder='新展览名称' @keyup.enter='add'>
          <button @click='add'>创建草稿</button>
        </div>
        <p class='rail-hint'>或从模板创建：</p>
        <div class='tpl-quick'>
          <button v-for='t in state.templates' :key='t.id' class='tpl-chip' @click='useTemplate(t)' :title='`从模板“${t.title}” v${t.version} 创建草稿`'>
            📋 {{t.title}} <small>v{{t.version}}</small>
          </button>
          <p v-if='!state.templates.length' class='rail-hint'>模板库为空，可先在下方工作面把展览另存为模板。</p>
        </div>
        <div v-for='e in state.exhibitions' :key='e.id' class='exhibit-row' :class='{active:e.id===selected}' @click='selected=e.id'>
          <div>
            <span>{{e.status}}</span>
            <h3>{{e.title}}</h3>
            <p>{{e.subtitle}}</p>
          </div>
          <b>{{e.pieces.length}} 件</b>
        </div>
      </section>

      <section class='canvas' v-if='current'>
        <div class='canvas-top'>
          <div>
            <p class='eyebrow'>策展工作面</p>
            <h2>{{current.title}}</h2>
            <p>{{current.description}}</p>
          </div>
          <div class='actions'>
            <button class='ghost' @click='duplicate'>创建副本</button>
            <button class='release' @click='pub'>上线展览</button>
          </div>
        </div>
        <div class='meta'>
          <span>策展人 · {{current.curator}}</span>
          <span>{{current.opening}} — {{current.closing}}</span>
          <span class='status'>{{current.status}}</span>
        </div>

        <!-- 血缘面板：模板 → 草稿 → 副本 的关系与校验 -->
        <div class='lineage'>
          <p class='eyebrow'>血缘关系 · 可验证</p>
          <div class='lineage-chain'>
            <template v-if='current.lineage.kind==="blank"'>
              <span class='node'>空白草稿</span>
            </template>
            <template v-else>
              <span class='node node-tpl'>模板：{{current.lineage.sourceTitle}} v{{current.lineage.sourceVersion}}</span>
              <span class='arrow'>→</span>
              <span class='node node-draft' :class='{copy:current.lineage.kind==="copy"}'>
                {{current.lineage.kind==="copy"?"副本草稿（源自“"+copyParentTitle+"”）":"模板草稿"}}
              </span>
            </template>
          </div>
          <ul class='checks'>
            <li v-for='(c,i) in currentChecks' :key='i' :class='c.level'>
              <b>{{levelLabel[c.level]}}</b> {{c.text}}
            </li>
          </ul>
        </div>

        <div class='save-as'>
          <input v-model='saveAsTplTitle' :placeholder='`把“${current.title}”另存为模板`'>
          <button class='ghost' @click='saveCurrentAsTemplate'>保存为模板</button>
        </div>

        <div class='piece-grid'>
          <div class='piece' v-for='a in state.artworks' :key='a.id' :class='{chosen:current.pieces.includes(a.id)}' @click='togglePiece(current.id,a.id)'>
            <div class='piece-art' :style='{background:a.tone}'><span>{{a.year}}</span></div>
            <div>
              <h3>{{a.title}}</h3>
              <p>{{a.artist}} · {{a.material}}</p>
              <small>{{a.note}}</small>
            </div>
            <button>{{current.pieces.includes(a.id)?'已编排':'加入展览'}}</button>
          </div>
        </div>
        <div class='notice' v-if='notice'>{{notice}}</div>
      </section>
    </main>

    <!-- ========== 模板库 ========== -->
    <main v-else class='tpl-view'>
      <section class='rail'>
        <div class='new-box'>
          <button @click='newTemplate'>＋ 新建空白模板</button>
        </div>
        <div v-for='t in state.templates' :key='t.id' class='exhibit-row' :class='{active:editingId===t.id}' @click='editTemplate(t)'>
          <div>
            <span>模板 v{{t.version}} · {{t.content.pieces.length}} 件作品</span>
            <h3>{{t.title}}</h3>
            <p>{{t.content.subtitle}}</p>
          </div>
        </div>
        <p v-if='!state.templates.length' class='rail-hint'>还没有模板。在策展工作面打开一场展览，可将其副标题、说明与作品编排另存为模板。</p>
      </section>

      <section class='canvas' v-if='editingTemplate||editingId==="__new__"'>
        <div class='canvas-top'>
          <div>
            <p class='eyebrow'>{{savingAsNew?'新建模板':'编辑模板'}}</p>
            <h2><input class='title-input' v-model='tplTitle' placeholder='模板名称'></h2>
            <p v-if='editingTemplate' class='rail-hint'>当前版本 v{{editingTemplate.version}} · 更新于 {{fmtDate(editingTemplate.updatedAt)}}；保存修改会生成新版本，已创建的草稿保持旧版本不变。</p>
          </div>
          <div class='actions'>
            <button class='ghost' @click='cancelEdit'>取消</button>
            <button class='danger ghost' v-if='!savingAsNew' @click='askDelete(editingTemplate!)'>删除模板</button>
            <button class='release' @click='useTemplate(editingTemplate!)' v-if='!savingAsNew'>用此模板创建草稿</button>
            <button class='release' @click='saveTpl'>保存模板</button>
          </div>
        </div>

        <div class='tpl-form'>
          <label>副标题<input v-model='tplContent.subtitle' placeholder='例如：当泥土记住每一次触碰'></label>
          <label>策展人<input v-model='tplContent.curator'></label>
          <div class='form-row'>
            <label>开展<input type='date' v-model='tplContent.opening'></label>
            <label>闭幕<input type='date' v-model='tplContent.closing'></label>
          </div>
          <label>展览说明<textarea v-model='tplContent.description' rows='3'></textarea></label>
        </div>

        <p class='eyebrow' style='margin-top:24px'>作品编排（模板自带）</p>
        <div class='piece-grid'>
          <div class='piece' v-for='a in state.artworks' :key='a.id' :class='{chosen:tplContent.pieces.includes(a.id)}' @click='toggleTplPiece(a.id)'>
            <div class='piece-art' :style='{background:a.tone}'><span>{{a.year}}</span></div>
            <div>
              <h3>{{a.title}}</h3>
              <p>{{a.artist}} · {{a.material}}</p>
              <small>{{a.note}}</small>
            </div>
            <button>{{tplContent.pieces.includes(a.id)?'已编入模板':'加入模板'}}</button>
          </div>
        </div>
      </section>

      <section class='canvas tpl-empty' v-else>
        <p class='eyebrow'>TEMPLATE LIBRARY</p>
        <h2>选择或新建一个模板</h2>
        <p class='intro'>模板独立保存副标题、说明与作品编排。从模板创建的每场展览都是全新草稿，与模板没有共享引用；模板修改或删除都不会影响已创建的草稿。</p>
      </section>
    </main>

    <!-- 删除确认弹层 -->
    <div class='modal-mask' v-if='confirmDeleteId' @click.self='confirmDeleteId=null'>
      <div class='modal'>
        <h3>确认删除模板？</h3>
        <p>模板“{{state.templates.find(t=>t.id===confirmDeleteId)?.title}}”将被永久删除。<br>已经由它创建的草稿<strong>不受影响</strong>，会完整保留创建时的内容快照与血缘记录。此操作不可撤销。</p>
        <div class='modal-actions'>
          <button class='ghost' @click='confirmDeleteId=null'>取消</button>
          <button class='release danger-btn' @click='reallyDelete'>确认删除</button>
        </div>
      </div>
    </div>

    <div class='notice' v-if='notice'>{{notice}}</div>
  </div>
</template>
