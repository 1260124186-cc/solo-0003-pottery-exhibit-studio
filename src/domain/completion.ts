import type { Exhibition } from './models';

/**
 * 必要信息判定：上线校验与完成度面板共用同一套规则，
 * 任何一处对同一份展览数据的结论都必须来自这里。
 */
export interface CompletionItem {
  key: 'title' | 'subtitle' | 'curator' | 'description' | 'dates' | 'closingAfterOpening' | 'pieces';
  label: string;
  ok: boolean;
  /** 不满足时的具体原因，逐项可区分 */
  reason: string;
}

export interface CompletionReport {
  items: CompletionItem[];
  ok: boolean;
  percent: number;
}

/** 必要信息总项数（顺序项仅在日期有效时展示，但分母恒定，保证百分比可比） */
const TOTAL_ITEMS = 7;

/** 新建草稿时写入的占位内容，不算“已填写” */
const PLACEHOLDERS = new Set(['新的展览叙事', '未署名', '等待策展人补充展览说明。']);

function filled(value: string): boolean {
  const text = value.trim();
  return text.length > 0 && !PLACEHOLDERS.has(text);
}

function toDate(value: string): Date | null {
  const text = (value || '').trim();
  if (!text) return null;
  const date = new Date(`${text}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function evaluateCompletion(e: Exhibition): CompletionReport {
  const titleOk = filled(e.title);
  const subtitleOk = filled(e.subtitle);
  const curatorOk = filled(e.curator);
  const descriptionOk = filled(e.description);

  const opening = toDate(e.opening);
  const closing = toDate(e.closing);
  const datesOk = !!opening && !!closing;
  const closingAfterOpeningOk = datesOk && closing!.getTime() >= opening!.getTime();
  const piecesOk = e.pieces.length > 0;

  const items: CompletionItem[] = [
    {
      key: 'title',
      label: '展览标题',
      ok: titleOk,
      reason: titleOk ? '' : '展览标题未填写',
    },
    {
      key: 'subtitle',
      label: '副标题',
      ok: subtitleOk,
      reason: subtitleOk ? '' : '副标题未填写',
    },
    {
      key: 'curator',
      label: '策展人',
      ok: curatorOk,
      reason: curatorOk ? '' : '策展人未填写',
    },
    {
      key: 'description',
      label: '展览说明',
      ok: descriptionOk,
      reason: descriptionOk ? '' : '展览说明未填写',
    },
    {
      key: 'dates',
      label: '开放与结束日期',
      ok: datesOk,
      reason: datesOk
        ? ''
        : !opening && !closing
          ? '开放日期与结束日期均未填写'
          : !opening
            ? '开放日期未填写或日期格式无效'
            : '结束日期未填写或日期格式无效',
    },
  ];

  // 日期先后顺序仅在两个日期本身都有效时才展示，避免与日期缺失重复报错；
  // 但它始终是必要项，日期无效时整体结论必为不通过。
  if (datesOk) {
    items.push({
      key: 'closingAfterOpening',
      label: '日期先后顺序',
      ok: closingAfterOpeningOk,
      reason: closingAfterOpeningOk ? '' : '结束日期不能早于开放日期',
    });
  }

  items.push({
    key: 'pieces',
    label: '展览作品',
    ok: piecesOk,
    reason: piecesOk ? '' : '至少需要编排一件作品',
  });

  // 顺序项未展示时计为未通过，百分比分母恒定为 TOTAL_ITEMS
  const percent = Math.round((items.filter((i) => i.ok).length / TOTAL_ITEMS) * 100);
  return {
    items,
    ok: titleOk && subtitleOk && curatorOk && descriptionOk && datesOk && closingAfterOpeningOk && piecesOk,
    percent,
  };
}

/** 上线校验：返回所有未满足项的具体原因；通过时返回 null */
export function releaseBlockers(e: Exhibition | undefined): string[] | null {
  if (!e) return ['未找到该展览'];
  const report = evaluateCompletion(e);
  if (report.ok) return null;
  return report.items.filter((i) => !i.ok).map((i) => i.reason);
}
