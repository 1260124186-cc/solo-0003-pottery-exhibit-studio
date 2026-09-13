import type { Artwork, Exhibition } from './models';

/**
 * 展览顺序的唯一事实来源是 Exhibition.pieces 这个有序数组。
 * 本模块只负责对该数组做纯函数运算，不读取任何状态，
 * 网格、详情、导览预览、导出全部经由这里派生顺序。
 */

export function movePiece(pieces: string[], id: string, dir: -1 | 1): string[] {
  const from = pieces.indexOf(id);
  if (from < 0) return pieces;
  const to = from + dir;
  if (to < 0 || to >= pieces.length) return pieces;
  const next = [...pieces];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** 把 id 从当前位置移动到目标位置；目标越界或作品不在编排中时原样返回，保证操作幂等稳定。 */
export function reorderPieces(pieces: string[], id: string, target: number): string[] {
  const from = pieces.indexOf(id);
  if (from < 0) return pieces;
  if (target < 0 || target >= pieces.length || target === from) return pieces;
  const next = [...pieces];
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved);
  return next;
}

/** 网格渲染行：已编排作品严格按 pieces 顺序在前，未编排在后（档案顺序，稳定）。 */
export interface GridRow {
  artwork: Artwork;
  chosen: boolean;
  index: number; // 在展览顺序中的序号，未编排为 -1
}

export function buildGridRows(artworks: Artwork[], pieces: string[]): GridRow[] {
  const byId = new Map(artworks.map((a) => [a.id, a]));
  const chosen: GridRow[] = [];
  pieces.forEach((id, index) => {
    const artwork = byId.get(id);
    if (artwork) chosen.push({ artwork, chosen: true, index });
  });
  const chosenIds = new Set(pieces);
  const rest: GridRow[] = artworks
    .filter((a) => !chosenIds.has(a.id))
    .map((artwork) => ({ artwork, chosen: false, index: -1 }));
  return [...chosen, ...rest];
}

/** 展览顺序对应的作品实体列表（详情 / 导览 / 导出共用）。 */
export function orderedArtworks(artworks: Artwork[], pieces: string[]): Artwork[] {
  const byId = new Map(artworks.map((a) => [a.id, a]));
  return pieces.map((id) => byId.get(id)).filter((a): a is Artwork => Boolean(a));
}

/** 各入口共用的顺序指纹：同一份 pieces 必然得到同一串指纹，错一处立刻可见。 */
export function orderFingerprint(pieces: string[]): string {
  return pieces.join('›');
}

export interface OrderIssue {
  code: 'duplicate' | 'unknown-piece' | 'artwork-count-mismatch';
  message: string;
}

/** 顺序一致性校验：网格行数、详情、导览、导出都依赖这里的结果。 */
export function inspectOrder(exhibition: Exhibition, artworks: Artwork[]): OrderIssue[] {
  const issues: OrderIssue[] = [];
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  for (const id of exhibition.pieces) {
    if (seen.has(id)) duplicate.add(id);
    seen.add(id);
  }
  if (duplicate.size) {
    issues.push({ code: 'duplicate', message: `顺序数据出现重复作品：${[...duplicate].join('、')}` });
  }
  const known = new Set(artworks.map((a) => a.id));
  const unknown = exhibition.pieces.filter((id) => !known.has(id));
  if (unknown.length) {
    issues.push({ code: 'unknown-piece', message: `顺序数据引用了不存在的作品：${unknown.join('、')}` });
  }
  return issues;
}

/** 后续导出读到的数据：顺序直接来自 pieces，作品字段不做任何改动。 */
export interface ExportedPiece {
  order: number;
  id: string;
  title: string;
  artist: string;
  material: string;
  year: number;
}

export interface ExportedExhibition {
  id: string;
  title: string;
  curator: string;
  status: string;
  pieceCount: number;
  orderFingerprint: string;
  pieces: ExportedPiece[];
}

export function buildExport(exhibition: Exhibition, artworks: Artwork[]): ExportedExhibition {
  return {
    id: exhibition.id,
    title: exhibition.title,
    curator: exhibition.curator,
    status: exhibition.status,
    pieceCount: exhibition.pieces.length,
    orderFingerprint: orderFingerprint(exhibition.pieces),
    pieces: orderedArtworks(artworks, exhibition.pieces).map((a, i) => ({
      order: i + 1,
      id: a.id,
      title: a.title,
      artist: a.artist,
      material: a.material,
      year: a.year,
    })),
  };
}
