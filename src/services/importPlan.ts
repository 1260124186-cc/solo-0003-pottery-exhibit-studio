import type { Artwork, Exhibition, ExhibitStatus } from '../domain/models';

export interface Catalog {
  exhibitions: Exhibition[];
  artworks: Artwork[];
}

export interface ImportFailure {
  /** 文件级错误（JSON 解析、顶层结构）归为“文件”，其余对应单条记录 */
  kind: '展览' | '作品' | '文件';
  /** 记录定位信息：编号或批次内序号 */
  ref: string;
  title: string;
  reason: string;
}

export interface ImportSuccess {
  kind: '展览' | '作品';
  id: string;
  title: string;
}

export interface ImportResult {
  /** false 表示整个文件无法解析，不会写入任何数据 */
  ok: boolean;
  reason: string;
  /** 本次实际可写入的展览（已通过校验且无冲突） */
  exhibitions: Exhibition[];
  /** 本次实际可写入的作品（已通过校验且无冲突） */
  artworks: Artwork[];
  successes: ImportSuccess[];
  failures: ImportFailure[];
}

const STATUSES: readonly ExhibitStatus[] = ['草稿', '预览中', '已上线'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 解析文件文本：JSON 语法与顶层结构错误直接判整文件失败 */
export function parseImportText(
  text: string,
): { ok: true; data: Record<string, unknown> } | { ok: false; reason: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: `文件不是合法 JSON：${(e as Error).message}` };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, reason: '文件顶层必须是对象，且包含 exhibitions 与 artworks 两个数组' };
  }
  const obj = data as Record<string, unknown>;
  if (!('exhibitions' in obj) || !('artworks' in obj)) {
    return { ok: false, reason: '文件缺少必要数据：exhibitions 与 artworks 均需提供' };
  }
  if (!Array.isArray(obj.exhibitions) || !Array.isArray(obj.artworks)) {
    const bad = !Array.isArray(obj.exhibitions) ? 'exhibitions' : 'artworks';
    return { ok: false, reason: `字段 ${bad} 类型错误，应为数组` };
  }
  return { ok: true, data: obj };
}

function typeName(v: unknown): string {
  if (Array.isArray(v)) return '数组';
  if (v === null) return 'null';
  return typeof v;
}

function needNonEmpty(o: Record<string, unknown>, field: string): string {
  if (!(field in o)) return `缺少字段 ${field}`;
  const v = o[field];
  if (typeof v !== 'string') return `字段 ${field} 类型错误，应为字符串（实际为${typeName(v)}）`;
  if (!v.trim()) return `字段 ${field} 不能为空`;
  return '';
}

function needString(o: Record<string, unknown>, field: string): string {
  if (!(field in o)) return `缺少字段 ${field}`;
  const v = o[field];
  return typeof v === 'string' ? '' : `字段 ${field} 类型错误，应为字符串（实际为${typeName(v)}）`;
}

function needYear(o: Record<string, unknown>): string {
  if (!('year' in o)) return '缺少字段 year';
  const v = o.year;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return `字段 year 类型错误，应为数字（实际为${typeName(v)}）`;
  }
  if (!Number.isInteger(v) || v <= 0) return '字段 year 必须是正整数';
  return '';
}

function validDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function needDate(o: Record<string, unknown>, field: string): string {
  const m = needString(o, field);
  if (m) return m;
  return validDate(o[field] as string) ? '' : `字段 ${field} 必须是 YYYY-MM-DD 格式的有效日期`;
}

function refOf(raw: unknown, index: number): string {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const id = (raw as Record<string, unknown>).id;
    if (typeof id === 'string' && id.trim()) return `id=${id.trim()}`;
  }
  return `第 ${index + 1} 条`;
}

function titleOf(raw: unknown): string {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const t = (raw as Record<string, unknown>).title;
    return typeof t === 'string' ? t.trim() : '';
  }
  return '';
}

function notObjectFailure(kind: '展览' | '作品', ref: string): ImportFailure {
  return { kind, ref, title: '', reason: '记录必须是对象' };
}

function validateArtwork(
  raw: unknown,
  index: number,
): { ok: true; value: Artwork } | { ok: false; failure: ImportFailure } {
  const ref = refOf(raw, index);
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, failure: notObjectFailure('作品', ref) };
  }
  const o = raw as Record<string, unknown>;
  const errors: string[] = [];
  for (const f of ['id', 'title'] as const) {
    const m = needNonEmpty(o, f);
    if (m) errors.push(m);
  }
  for (const f of ['artist', 'material', 'note', 'tone'] as const) {
    const m = needString(o, f);
    if (m) errors.push(m);
  }
  const yearMsg = needYear(o);
  if (yearMsg) errors.push(yearMsg);
  if (errors.length) {
    return { ok: false, failure: { kind: '作品', ref, title: titleOf(o), reason: errors.join('；') } };
  }
  return {
    ok: true,
    value: {
      id: (o.id as string).trim(),
      title: (o.title as string).trim(),
      artist: o.artist as string,
      material: o.material as string,
      year: o.year as number,
      note: o.note as string,
      tone: o.tone as string,
    },
  };
}

function validateExhibition(
  raw: unknown,
  index: number,
  knownArtIds: ReadonlySet<string>,
): { ok: true; value: Exhibition } | { ok: false; failure: ImportFailure } {
  const ref = refOf(raw, index);
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, failure: notObjectFailure('展览', ref) };
  }
  const o = raw as Record<string, unknown>;
  const errors: string[] = [];
  for (const f of ['id', 'title'] as const) {
    const m = needNonEmpty(o, f);
    if (m) errors.push(m);
  }
  for (const f of ['subtitle', 'curator', 'description'] as const) {
    const m = needString(o, f);
    if (m) errors.push(m);
  }
  if (!('status' in o)) {
    errors.push('缺少字段 status');
  } else if (typeof o.status !== 'string') {
    errors.push(`字段 status 类型错误，应为字符串（实际为${typeName(o.status)}）`);
  } else if (!STATUSES.includes(o.status as ExhibitStatus)) {
    errors.push('字段 status 只能是 草稿 / 预览中 / 已上线');
  }
  const openingMsg = needDate(o, 'opening');
  const closingMsg = needDate(o, 'closing');
  if (openingMsg) errors.push(openingMsg);
  if (closingMsg) errors.push(closingMsg);

  let pieces: string[] = [];
  if (!('pieces' in o)) {
    errors.push('缺少字段 pieces');
  } else if (!Array.isArray(o.pieces)) {
    errors.push(`字段 pieces 类型错误，应为数组（实际为${typeName(o.pieces)}）`);
  } else {
    const badTypes: string[] = [];
    o.pieces.forEach((p, i) => {
      if (typeof p !== 'string') badTypes.push(`#${i + 1}(${typeName(p)})`);
    });
    if (badTypes.length) {
      errors.push(`字段 pieces 中存在非字符串元素：${badTypes.join('、')}`);
    } else {
      pieces = [...new Set((o.pieces as string[]).map((p) => p.trim()).filter((p) => p))];
      const unknown = pieces.filter((p) => !knownArtIds.has(p));
      if (unknown.length) {
        errors.push(`pieces 引用了不存在的作品编号：${unknown.join('、')}`);
      }
    }
  }

  if (!openingMsg && !closingMsg && (o.opening as string) > (o.closing as string)) {
    errors.push('字段 opening 不能晚于 closing');
  }

  if (errors.length) {
    return { ok: false, failure: { kind: '展览', ref, title: titleOf(o), reason: errors.join('；') } };
  }
  return {
    ok: true,
    value: {
      id: (o.id as string).trim(),
      title: (o.title as string).trim(),
      subtitle: o.subtitle as string,
      curator: o.curator as string,
      status: o.status as ExhibitStatus,
      opening: o.opening as string,
      closing: o.closing as string,
      pieces,
      description: o.description as string,
    },
  };
}

/**
 * 对一批数据逐条校验并检测冲突，只规划不写入。
 * 冲突一律跳过（绝不静默覆盖）；批次内合法的其他记录照常生效。
 */
export function planImport(data: Record<string, unknown>, current: Catalog): ImportResult {
  const result: ImportResult = {
    ok: true,
    reason: '',
    exhibitions: [],
    artworks: [],
    successes: [],
    failures: [],
  };

  // 先处理作品：展览的 pieces 需要引用最终可用的作品编号集合
  const knownArtIds = new Set(current.artworks.map((a) => a.id));
  const batchArtIds = new Set<string>();
  for (const [i, raw] of (data.artworks as unknown[]).entries()) {
    const checked = validateArtwork(raw, i);
    if (!checked.ok) {
      result.failures.push(checked.failure);
      continue;
    }
    const a = checked.value;
    const existing = current.artworks.find((x) => x.id === a.id);
    if (existing) {
      result.failures.push({
        kind: '作品',
        ref: `id=${a.id}`,
        title: a.title,
        reason: `作品编号 ${a.id} 已被现有作品「${existing.title}」占用，为避免覆盖已有内容，该条已跳过`,
      });
      continue;
    }
    if (batchArtIds.has(a.id)) {
      result.failures.push({
        kind: '作品',
        ref: `id=${a.id}`,
        title: a.title,
        reason: `作品编号 ${a.id} 在本批次中重复，该条已跳过`,
      });
      continue;
    }
    batchArtIds.add(a.id);
    knownArtIds.add(a.id);
    result.artworks.push(a);
    result.successes.push({ kind: '作品', id: a.id, title: a.title });
  }

  const batchExIds = new Set<string>();
  const batchExTitles = new Set<string>();
  for (const [i, raw] of (data.exhibitions as unknown[]).entries()) {
    const checked = validateExhibition(raw, i, knownArtIds);
    if (!checked.ok) {
      result.failures.push(checked.failure);
      continue;
    }
    const e = checked.value;
    const clash: string[] = [];
    const sameId = current.exhibitions.find((x) => x.id === e.id);
    const sameTitle = current.exhibitions.find((x) => x.title.trim() === e.title);
    if (sameId) {
      clash.push(`展览编号 ${e.id} 已被现有展览「${sameId.title}」占用`);
    } else if (batchExIds.has(e.id)) {
      clash.push(`展览编号 ${e.id} 在本批次中重复`);
    }
    if (sameTitle) {
      clash.push(`展览名称「${e.title}」与现有展览（编号 ${sameTitle.id}）重名`);
    } else if (batchExTitles.has(e.title)) {
      clash.push(`展览名称「${e.title}」在本批次中与另一条展览重名`);
    }
    if (clash.length) {
      result.failures.push({
        kind: '展览',
        ref: `id=${e.id}`,
        title: e.title,
        reason: `${clash.join('；')}，为避免静默覆盖已有内容，该条已跳过`,
      });
      continue;
    }
    batchExIds.add(e.id);
    batchExTitles.add(e.title);
    result.exhibitions.push(e);
    result.successes.push({ kind: '展览', id: e.id, title: e.title });
  }

  return result;
}
