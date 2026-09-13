import {ref} from 'vue';
import {exhibitions,artworks} from '../domain/seed';
import type {Artwork,Exhibition} from '../domain/models';

const key='pottery-exhibit-studio-v1';

interface StudioState{exhibitions:Exhibition[];artworks:Artwork[]}

const saved=localStorage.getItem(key);
const state=ref<StudioState>(saved?JSON.parse(saved):{exhibitions:[...exhibitions],artworks:[...artworks]});
function persist(){localStorage.setItem(key,JSON.stringify(state.value))};
export function useExhibitService(){const create=(title:string)=>{if(!title.trim())throw Error('展览名称不能为空');const e:Exhibition={id:'e'+Date.now(),title:title.trim(),subtitle:'新的展览叙事',curator:'未署名',status:'草稿',opening:'2025-01-01',closing:'2025-03-01',pieces:[],description:'等待策展人补充展览说明。'};state.value.exhibitions.unshift(e);persist();return e};const release=(id:string)=>{const e=state.value.exhibitions.find((x)=>x.id===id);if(!e||!e.pieces.length)throw Error('至少编排一件作品后才能上线');e.status='已上线';persist()};
// 切换作品加入状态。移出后再加入时按作品档案顺序原位插回，
// 保证“误点恢复”不会改变展览里已保存的作品顺序。
const togglePiece=(id:string,art:string)=>{const e=state.value.exhibitions.find((x)=>x.id===id);if(!e)return;
if(e.pieces.includes(art)){e.pieces=e.pieces.filter((x)=>x!==art)}
else{const order=state.value.artworks.map((a)=>a.id);const insertAt=e.pieces.findIndex((x)=>order.indexOf(x)>order.indexOf(art));e.pieces=insertAt===-1?[...e.pieces,art]:[...e.pieces.slice(0,insertAt),art,...e.pieces.slice(insertAt)]}
persist()};
return{state,create,release,togglePiece}}
