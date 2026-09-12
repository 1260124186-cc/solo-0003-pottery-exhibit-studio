export type ExhibitStatus='草稿'|'预览中'|'已上线';
export interface Artwork{id:string;title:string;artist:string;material:string;year:number;note:string;tone:string}
/** 可被模板带走的展览内容（不含名称与状态，确保每次创建都是全新草稿） */
export interface TemplateContent{subtitle:string;curator:string;opening:string;closing:string;description:string;pieces:string[]}
/** 血缘记录：模板、由模板创建的草稿、草稿的副本三者之间的可验证引用 */
export interface Lineage{
  kind:'blank'|'template'|'copy';
  /** 来源模板 id；模板被删除后保留该引用，血缘显示为“来源已删除但快照留存” */
  sourceTemplateId:string|null;
  /** 创建草稿时模板的版本号，模板后续升级不影响本草稿 */
  sourceVersion:number|null;
  sourceTitle:string;
  /** 来源模板版本内容的指纹，用于校验血缘是否被改坏 */
  snapshot:string;
  /** 副本来源草稿 id（仅 kind==='copy'） */
  derivedFromExhibitId:string|null;
}
export interface Exhibition{id:string;title:string;subtitle:string;curator:string;status:ExhibitStatus;opening:string;closing:string;pieces:string[];description:string;lineage:Lineage}
export interface TemplateVersion{version:number;fingerprint:string;at:string}
export interface ExhibitionTemplate{id:string;title:string;content:TemplateContent;version:number;createdAt:string;updatedAt:string;history:TemplateVersion[]}
export interface LineageCheck{level:'ok'|'info'|'missing'|'broken';text:string}
