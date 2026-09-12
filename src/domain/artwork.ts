import type{Artwork}from'./models';

export interface ArtworkInput{title:string;artist:string;material:string;year:string|number;note:string;tone:string}

export function isArtworkActive(a:Artwork):boolean{return a.status!=='停用'}

export function validateArtwork(input:ArtworkInput):Record<string,string>{
  const errors:Record<string,string>={};
  if(!String(input.title??'').trim())errors.title='请填写作品标题';
  if(!String(input.artist??'').trim())errors.artist='请填写作者';
  if(!String(input.material??'').trim())errors.material='请填写材质';
  const raw=String(input.year??'').trim();
  if(!raw)errors.year='请填写年份';
  else if(!/^\d+$/.test(raw))errors.year='年份需为整数';
  else{const y=Number(raw);const now=new Date().getFullYear();if(y<1000||y>now)errors.year=`年份需在 1000 至 ${now} 之间`}
  if(!String(input.note??'').trim())errors.note='请填写作品说明';
  if(!/^#[0-9a-fA-F]{6}$/.test(String(input.tone??'').trim()))errors.tone='请选择主色';
  return errors;
}
