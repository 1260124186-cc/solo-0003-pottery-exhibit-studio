import type { Artwork, Exhibition } from './models';

function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  return `${m[1]} 年 ${Number(m[2])} 月 ${Number(m[3])} 日`;
}

/** 由已上线展览与其作品档案生成适合转发的纯文本分享内容。只读，不修改任何数据。 */
export function buildShareText(exhibition: Exhibition, artworks: Artwork[]): string {
  const lines: string[] = [];
  lines.push(`【展览分享】${exhibition.title}`);
  if (exhibition.subtitle) lines.push(exhibition.subtitle);
  lines.push(`开放时间：${formatDate(exhibition.opening)} — ${formatDate(exhibition.closing)}`);
  lines.push(`策展人：${exhibition.curator}`);
  const pieces = exhibition.pieces
    .map((id) => artworks.find((a) => a.id === id))
    .filter((a): a is Artwork => Boolean(a));
  lines.push(`作品清单（共 ${pieces.length} 件）：`);
  pieces.forEach((a, i) => {
    lines.push(`${i + 1}. ${a.title}｜${a.artist}｜${a.material}｜${a.year}`);
  });
  return lines.join('\n');
}
