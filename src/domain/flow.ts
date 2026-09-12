import type {Exhibition, ExhibitStatus} from './models';

/**
 * 展览状态流转的唯一规则源。
 * 完成度面板、进入预览校验、上线校验、回退确认全部共用本文件，
 * 避免出现“面板说可以但状态却改不了”的矛盾。
 *
 * 状态顺序：草稿 < 预览中 < 已上线
 * 合法流转（仅相邻一级，不允许跨级）：
 *   草稿  → 预览中   前进，需满足完成度全部条件
 *   预览中 → 已上线   前进，需满足完成度全部条件（即上线校验）
 *   预览中 → 草稿     回退，必须显式确认
 *   已上线 → 预览中   回退，必须显式确认
 */

export const STATUSES: ExhibitStatus[] = ['草稿', '预览中', '已上线'];

const RANK: Record<ExhibitStatus, number> = {'草稿': 0, '预览中': 1, '已上线': 2};

const NEXT_STATUS: Record<ExhibitStatus, ExhibitStatus | null> = {
  '草稿': '预览中',
  '预览中': '已上线',
  '已上线': null,
};

const PREV_STATUS: Record<ExhibitStatus, ExhibitStatus | null> = {
  '草稿': null,
  '预览中': '草稿',
  '已上线': '预览中',
};

export interface ChecklistItem {
  key: 'pieces' | 'subtitle' | 'curator' | 'description' | 'dates';
  label: string;
  ok: boolean;
}

type ExhibitionInfo = Pick<
  Exhibition,
  'status' | 'pieces' | 'subtitle' | 'curator' | 'description' | 'opening' | 'closing'
>;

function filled(value: string): boolean {
  return value.trim().length > 0;
}

/**
 * 完成度清单：进入预览与上线共用的同一套条件。
 * 1) 至少一件作品；2) 副标题；3) 策展人；4) 展览说明；5) 展期有效。
 */
export function completionChecklist(e: ExhibitionInfo): ChecklistItem[] {
  const datesOk =
    filled(e.opening) && filled(e.closing) && e.opening <= e.closing;
  return [
    {key: 'pieces', label: '至少编排一件作品', ok: e.pieces.length > 0},
    {key: 'subtitle', label: '填写展览副标题', ok: filled(e.subtitle)},
    {key: 'curator', label: '填写策展人', ok: filled(e.curator)},
    {key: 'description', label: '填写展览说明', ok: filled(e.description)},
    {key: 'dates', label: '展期有效（开幕日期不晚于闭幕日期）', ok: datesOk},
  ];
}

export function missingConditions(e: ExhibitionInfo): string[] {
  return completionChecklist(e).filter((item) => !item.ok).map((item) => item.label);
}

/** 完成度是否全部满足；进入预览与上线校验共用此判定。 */
export function isReady(e: ExhibitionInfo): boolean {
  return missingConditions(e).length === 0;
}

export const canPreview = isReady;
export const canPublish = isReady;

export function nextStatus(from: ExhibitStatus): ExhibitStatus | null {
  return NEXT_STATUS[from];
}

export function prevStatus(from: ExhibitStatus): ExhibitStatus | null {
  return PREV_STATUS[from];
}

/** 当前状态允许流转到的相邻状态（不含条件，仅方向）。 */
export function legalTargets(from: ExhibitStatus): ExhibitStatus[] {
  return [NEXT_STATUS[from], PREV_STATUS[from]].filter(
    (s): s is ExhibitStatus => s !== null,
  );
}

export function isAdvance(from: ExhibitStatus, to: ExhibitStatus): boolean {
  return RANK[to] > RANK[from];
}

export function isRollback(from: ExhibitStatus, to: ExhibitStatus): boolean {
  return RANK[to] < RANK[from];
}

export interface TransitionOptions {
  /** 回退必须显式传 true，否则拒绝。 */
  confirmed?: boolean;
}

/**
 * 校验一次状态流转，不合法时抛错（调用方不得修改原状态）。
 * 错误信息同时也是界面提示语。
 */
export function validateTransition(
  e: ExhibitionInfo,
  target: ExhibitStatus,
  options: TransitionOptions = {},
): void {
  const from = e.status;

  if (!(STATUSES as string[]).includes(target)) {
    throw new Error(`未知的展览状态：${target}`);
  }
  if (from === target) {
    throw new Error(`「${from}」→「${target}」不是有效的状态变更`);
  }
  if (!legalTargets(from).includes(target)) {
    throw new Error(`不允许从「${from}」直接流转到「${target}」，只能在相邻状态间流转`);
  }

  if (isRollback(from, target) && !options.confirmed) {
    throw new Error(`回退到「${target}」必须经过明确确认`);
  }

  if (isAdvance(from, target) && !isReady(e)) {
    const action = target === '预览中' ? '进入预览' : '上线';
    throw new Error(`${action}条件未满足：${missingConditions(e).join('；')}`);
  }
}
