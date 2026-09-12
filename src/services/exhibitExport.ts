import type {Artwork,Exhibition} from '../domain/models';

// 导出文件采用 JSON：中文键名方便同事直接阅读，同时保留 ID 与结构化日期，便于程序解析后再次导入。
export interface ExportPiece{顺序:number;作品ID:string;作品:string;作者:string;材质:string;年份:number|null;备注:string}
export interface ExportPayload{文件类型:string;格式版本:number;导出时间:string;展览:{展览ID:string;名称:string;副标题:string;策展人:string;状态:string;开放时间:string;开始日期:string;结束日期:string;展览说明:string;作品数:number;作品清单:ExportPiece[]}}

const text=(v:unknown):string=>typeof v==='string'?v:'';

// 纯函数：只读取入参，不修改展览、作品数据，也不触碰 localStorage。
export function buildExhibitionExport(exhibition:Exhibition,artworks:Artwork[],now:Date=new Date()):ExportPayload{
  const byId=new Map(artworks.map(a=>[a.id,a]));
  const source=Array.isArray(exhibition.pieces)?exhibition.pieces:[];
  const pieces=source.map((id,i):ExportPiece=>{
    const a=byId.get(id);
    if(!a)return{顺序:i+1,作品ID:text(id)||String(id),作品:'（未知作品）',作者:'',材质:'',年份:null,备注:'该作品 ID 不在作品档案中，可能已被移除'};
    return{顺序:i+1,作品ID:a.id,作品:text(a.title),作者:text(a.artist),材质:text(a.material),年份:typeof a.year==='number'?a.year:null,备注:text(a.note)};
  });
  const opening=text(exhibition.opening),closing=text(exhibition.closing);
  return{
    文件类型:'pottery-exhibit-studio-export',
    格式版本:1,
    导出时间:now.toISOString(),
    展览:{
      展览ID:text(exhibition.id),
      名称:text(exhibition.title),
      副标题:text(exhibition.subtitle),
      策展人:text(exhibition.curator),
      状态:text(exhibition.status),
      开放时间:`${opening} — ${closing}`,
      开始日期:opening,
      结束日期:closing,
      展览说明:text(exhibition.description),
      作品数:pieces.length,
      作品清单:pieces
    }
  };
}

export function toExportJson(payload:ExportPayload):string{
  return JSON.stringify(payload,null,2)+'\n';
}

export function exportFileName(exhibition:Pick<Exhibition,'title'>,now:Date=new Date()):string{
  const safe=(text(exhibition.title).trim()||'未命名展览').replace(/[\\/:*?"<>|\s]+/g,'-');
  const p=(n:number)=>String(n).padStart(2,'0');
  return `展览导出-${safe}-${now.getFullYear()}${p(now.getMonth()+1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`;
}
