import {ref} from 'vue';
import {exhibitions,artworks} from '../domain/seed';
import type {Exhibition,ExhibitionTemplate,Lineage,LineageCheck,TemplateContent} from '../domain/models';

const key='pottery-exhibit-studio-v1';

/** 结构化深拷贝：跨模板/草稿/副本边界的数据一律经此函数，杜绝共享引用 */
function clone<T>(v:T):T{return JSON.parse(JSON.stringify(v))}

/** 内容指纹：同一字段顺序下的稳定 JSON 经 FNV-1a 哈希，任何内容改动都会改变指纹 */
function fingerprint(v:unknown):string{
  const s=JSON.stringify(v);
  let h=0x811c9dc5;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)}
  return ('0000000'+(h>>>0).toString(16)).slice(-8);
}

function contentOf(e:Exhibition):TemplateContent{
  const {subtitle,curator,opening,closing,description,pieces}=e;
  return {subtitle,curator,opening,closing,description,pieces:[...pieces]};
}

interface StudioState{exhibitions:Exhibition[];templates:ExhibitionTemplate[];artworks:typeof artworks}

function load():StudioState{
  const saved=localStorage.getItem(key);
  if(saved){
    const data=JSON.parse(saved);
    // 旧版本数据迁移：补齐模板与血缘字段
    return{
      exhibitions:(data.exhibitions||[]).map((e:Exhibition)=>({
        ...e,
        pieces:[...(e.pieces||[])],
        lineage:e.lineage??{kind:'blank',sourceTemplateId:null,sourceVersion:null,sourceTitle:'',snapshot:'',derivedFromExhibitId:null}
      })),
      templates:data.templates||[],
      artworks:data.artworks?data.artworks:clone(artworks)
    };
  }
  return{exhibitions:clone(exhibitions),templates:[],artworks:clone(artworks)};
}

const state=ref<StudioState>(load());
function persist(){localStorage.setItem(key,JSON.stringify(state.value))}
function uid(prefix:string){return prefix+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}

export function useExhibitService(){
  const create=(title:string):Exhibition=>{
    if(!title.trim())throw Error('展览名称不能为空');
    const e:Exhibition={id:uid('e'),title:title.trim(),subtitle:'新的展览叙事',curator:'未署名',status:'草稿',opening:'2025-01-01',closing:'2025-03-01',pieces:[],description:'等待策展人补充展览说明。',lineage:{kind:'blank',sourceTemplateId:null,sourceVersion:null,sourceTitle:'',snapshot:'',derivedFromExhibitId:null}};
    state.value.exhibitions.unshift(e);persist();return e;
  };

  const release=(id:string)=>{
    const e=state.value.exhibitions.find(x=>x.id===id);
    if(!e||!e.pieces.length)throw Error('至少编排一件作品后才能上线');
    e.status='已上线';persist();
  };

  const togglePiece=(id:string,art:string)=>{
    const e=state.value.exhibitions.find(x=>x.id===id);
    if(!e)return;
    e.pieces=e.pieces.includes(art)?e.pieces.filter(x=>x!==art):[...e.pieces,art];
    persist();
  };

  /* ---------- 模板：独立的保存与管理入口 ---------- */

  const saveTemplate=(title:string,content:TemplateContent):ExhibitionTemplate=>{
    if(!title.trim())throw Error('模板名称不能为空');
    const body=clone(content);
    const now=new Date().toISOString();
    const tpl:ExhibitionTemplate={
      id:uid('t'),title:title.trim(),content:body,version:1,createdAt:now,updatedAt:now,
      history:[{version:1,fingerprint:fingerprint(body),at:now}]
    };
    state.value.templates.unshift(tpl);persist();return tpl;
  };

  const updateTemplate=(id:string,patch:Partial<Pick<ExhibitionTemplate,'title'>>&Partial<TemplateContent>)=>{
    const tpl=state.value.templates.find(t=>t.id===id);
    if(!tpl)return;
    if(patch.title!==undefined){if(!patch.title.trim())throw Error('模板名称不能为空');tpl.title=patch.title.trim()}
    const next:TemplateContent={...tpl.content,...Object.fromEntries(['subtitle','curator','opening','closing','description','pieces'].map(k=>[k,(patch as any)[k]]).filter(([,v])=>v!==undefined))};
    tpl.content=clone(next);
    tpl.version+=1;
    tpl.updatedAt=new Date().toISOString();
    tpl.history.push({version:tpl.version,fingerprint:fingerprint(tpl.content),at:tpl.updatedAt});
    persist();
  };

  const deleteTemplate=(id:string)=>{
    state.value.templates=state.value.templates.filter(t=>t.id!==id);
    persist();
  };

  /* ---------- 从模板创建：全新草稿，无任何共享引用 ---------- */

  const createFromTemplate=(templateId:string,titleOverride?:string):Exhibition=>{
    const tpl=state.value.templates.find(t=>t.id===templateId);
    if(!tpl)throw Error('模板不存在或已被删除');
    const title=(titleOverride??tpl.title).trim();
    if(!title)throw Error('展览名称不能为空');
    const lineage:Lineage={
      kind:'template',
      sourceTemplateId:tpl.id,
      sourceVersion:tpl.version,
      sourceTitle:tpl.title,
      snapshot:tpl.history[tpl.history.length-1].fingerprint,
      derivedFromExhibitId:null
    };
    const e:Exhibition={id:uid('e'),title,status:'草稿',...clone(tpl.content),lineage};
    state.value.exhibitions.unshift(e);persist();return e;
  };

  /* ---------- 草稿的副本：血缘继续向上追溯模板 ---------- */

  const duplicateExhibit=(id:string):Exhibition=>{
    const src=state.value.exhibitions.find(x=>x.id===id);
    if(!src)throw Error('展览不存在');
    const lineage:Lineage={...clone(src.lineage),kind:'copy',derivedFromExhibitId:src.id};
    const e:Exhibition={...clone(src),id:uid('e'),title:src.title+' · 副本',status:'草稿',lineage};
    state.value.exhibitions.unshift(e);persist();return e;
  };

  /* ---------- 血缘校验：任何一环被改坏都可被观察 ---------- */

  function exhibitLineage(e:Exhibition):LineageCheck[]{
    const checks:LineageCheck[]=[];
    if(e.lineage.kind==='blank'){
      checks.push({level:'ok',text:'空白草稿，无模板血缘'});
      return checks;
    }
    const tpl=state.value.templates.find(t=>t.id===e.lineage.sourceTemplateId);
    const v=e.lineage.sourceVersion??0;
    if(!tpl){
      // 模板删除不影响草稿：快照指纹留存即可验证创建时的内容
      checks.push({level:'info',text:`来源模板已删除（创建自“${e.lineage.sourceTitle}” v${v}），草稿独立保留`});
    }else if(!tpl.history.some(h=>h.version===v)){
      checks.push({level:'broken',text:`血缘损坏：模板“${tpl.title}”缺少 v${v} 的版本记录`});
    }else if(v!==tpl.version){
      checks.push({level:'info',text:`模板已更新到 v${tpl.version}，本草稿保持创建时的 v${v} 不变`});
    }else{
      checks.push({level:'ok',text:`来源模板“${tpl.title}” v${v} 存在`});
    }

    const snap=tpl?.history.find(h=>h.version===v)?.fingerprint;
    if(snap){
      if(fingerprint(contentOf(e))===snap){
        checks.push({level:'ok',text:'当前内容与创建时快照一致'});
      }else{
        checks.push({level:'info',text:'内容已独立改编（脱离快照，属正常编辑，不影响模板）'});
      }
    }else{
      // 模板已删除时无法比对快照，提示该事实而非报错
      checks.push({level:'info',text:'来源模板已删除，快照仅留存于本草稿'});
    }

    if(e.lineage.kind==='copy'){
      const parent=state.value.exhibitions.find(x=>x.id===e.lineage.derivedFromExhibitId);
      if(parent){
        checks.push({level:'ok',text:`副本来源草稿 ${parent.id} 存在（“${parent.title}”）`});
      }else{
        checks.push({level:'missing',text:`副本来源草稿 ${e.lineage.derivedFromExhibitId} 已被删除`});
      }
    }

    // 引用共享检测：深拷贝若被破坏（pieces 数组与模板或父草稿同引用）即可观察
    if(tpl&&e.pieces===tpl.content.pieces){
      checks.push({level:'broken',text:'引用损坏：与模板共享作品数组，修改会互相串改'});
    }
    if(e.lineage.kind==='copy'){
      const parent=state.value.exhibitions.find(x=>x.id===e.lineage.derivedFromExhibitId);
      if(parent&&e.pieces===parent.pieces){
        checks.push({level:'broken',text:'引用损坏：与来源草稿共享作品数组，修改会互相串改'});
      }
    }
    return checks;
  }

  const verifyLineage=():{checks:{exhibitId:string;title:string;checks:LineageCheck[]}[];broken:boolean}=>{
    const checks=state.value.exhibitions.map(e=>({exhibitId:e.id,title:e.title,checks:exhibitLineage(e)}));
    return{checks,broken:checks.some(c=>c.checks.some(k=>k.level==='broken'||k.level==='missing'))};
  };

  return{state,create,release,togglePiece,saveTemplate,updateTemplate,deleteTemplate,createFromTemplate,duplicateExhibit,exhibitLineage,verifyLineage};
}
