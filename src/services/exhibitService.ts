import {ref}from'vue';
import {exhibitions,artworks}from'../domain/seed';
import type {Exhibition}from'../domain/models';
import {parseImportText,planImport,type Catalog,type ImportResult}from'./importPlan';

const key='pottery-exhibit-studio-v1';
const saved=localStorage.getItem(key);
const state=ref<Catalog>(saved?JSON.parse(saved):{exhibitions:[...exhibitions],artworks:[...artworks]});
function persist(){localStorage.setItem(key,JSON.stringify(state.value))};

export function useExhibitService(){
  const create=(title:string)=>{
    if(!title.trim())throw Error('展览名称不能为空');
    const e:Exhibition={id:'e'+Date.now(),title:title.trim(),subtitle:'新的展览叙事',curator:'未署名',status:'草稿',opening:'2025-01-01',closing:'2025-03-01',pieces:[],description:'等待策展人补充展览说明。'};
    state.value.exhibitions.unshift(e);persist();return e
  };
  const release=(id:string)=>{
    const e=state.value.exhibitions.find((x)=>x.id===id);
    if(!e||!e.pieces.length)throw Error('至少编排一件作品后才能上线');
    e.status='已上线';persist()
  };
  const togglePiece=(id:string,art:string)=>{
    const e=state.value.exhibitions.find((x)=>x.id===id);
    if(!e)return;
    e.pieces=e.pieces.includes(art)?e.pieces.filter((x)=>x!==art):[...e.pieces,art];persist()
  };
  /** 批量导入：合法且无冲突的记录立即写入，非法或冲突的记录逐条返回原因，不影响其余记录 */
  const importText=(text:string):ImportResult=>{
    const parsed=parseImportText(text);
    if(!parsed.ok){
      return{ok:false,reason:parsed.reason,exhibitions:[],artworks:[],successes:[],failures:[{kind:'文件',ref:'',title:'',reason:parsed.reason}]}
    }
    const plan=planImport(parsed.data,state.value);
    // 仅提交通过校验的部分；任一写入异常都不会把坏数据留给界面
    state.value.artworks=[...plan.artworks,...state.value.artworks];
    state.value.exhibitions=[...plan.exhibitions,...state.value.exhibitions];
    persist();
    return plan
  };
  return{state,create,release,togglePiece,importText}
}
