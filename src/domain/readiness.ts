import type { Exhibition } from './models';

/**
 * 展览完成度规则 —— 全项目唯一的上线判定事实来源。
 *
 * 完成度面板（StudioView）与上线动作（exhibitService.release）
 * 都必须消费本模块：
 *   - 面板说 canRelease=true  ⇔ release 必定放行
 *   - 面板说 canRelease=false ⇔ release 必定拒绝
 * 任何一处都不允许再自行编写校验，避免两种呈现发生矛盾。
 *
 * 规则为纯函数：不读取时间、不读取外部状态、不修改入参，
 * 同一份展览数据无论何时计算都得到同样结果。
 * 字段缺失（空展览、旧版本持久化数据）一律视为未完成，绝不抛错。
 */

export type CheckGroupId = 'basic' | 'pieces' | 'guide';
export type CheckStatus = 'pass' | 'missing';

export interface ReadinessCheck {
  /** 稳定标识，便于测试与定位 */
  readonly id: string;
  readonly label: string;
  readonly status: CheckStatus;
  /** status 为 missing 时给出可执行的原因；pass 时为 null */
  readonly reason: string | null;
}

export interface ReadinessGroup {
  readonly id: CheckGroupId;
  readonly label: string;
  readonly checks: readonly ReadinessCheck[];
  readonly pass: boolean;
}

/**
 * empty   —— 空展览（没有作品且名称之外的基础信息也全部缺失）
 * partial —— 已开始筹备但尚有必要项缺失
 * ready   —— 全部通过，可以上线
 */
export type ReadinessState = 'empty' | 'partial' | 'ready';

export interface ExhibitionReadiness {
  readonly state: ReadinessState;
  readonly stateLabel: string;
  readonly groups: readonly ReadinessGroup[];
  /** 全部检查项拍平后的列表，顺序固定（确定性的一部分） */
  readonly checks: readonly ReadinessCheck[];
  /** 上线判定：true 当且仅当所有检查通过 */
  readonly canRelease: boolean;
  /** 阻止上线的原因，按检查项固定顺序排列；canRelease 为 true 时为空 */
  readonly blockers: readonly string[];
  readonly passedChecks: number;
  readonly totalChecks: number;
  readonly percent: number;
  /** 面板与上线动作共用的一句话结论 */
  readonly summary: string;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function check(id: string, label: string, ok: boolean, missingReason: string): ReadinessCheck {
  return { id, label, status: ok ? 'pass' : 'missing', reason: ok ? null : missingReason };
}

/**
 * 统一的作品列表读取：pieces 缺失、不是数组或含空白 id（旧版本持久化数据）
 * 都兜底为干净的字符串数组，任何 UI/计数/操作入口都必须经此访问，
 * 杜绝 “Cannot read properties of undefined (reading 'length'/'includes')”。
 * 纯函数，不修改入参。
 */
export function piecesOf(e: Partial<Exhibition> | null | undefined): string[] {
  const raw = e?.pieces;
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
}

/** 日期必须是 yyyy-mm-dd 且为真实存在的日期；纯字符串比较，不依赖运行环境时区 */
function isIsoDate(value: unknown): boolean {
  const s = text(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return d <= daysInMonth;
}

/**
 * 计算展览完成度。
 * 入参允许为 null/undefined 或任何残缺对象（旧 localStorage 数据），
 * 缺失字段一律按“未完成”处理，不抛异常。
 */
export function evaluateExhibition(input: Partial<Exhibition> | null | undefined): ExhibitionReadiness {
  const e = (input ?? {}) as Partial<Exhibition>;

  const title = text(e.title);
  const opening = text(e.opening);
  const closing = text(e.closing);

  // 1) 基础信息
  const basicChecks: ReadinessCheck[] = [
    check('title', '展览名称', title.length > 0, '缺少展览名称'),
    check('subtitle', '展览副标题', text(e.subtitle).length > 0, '缺少展览副标题'),
    check('curator', '策展人署名', text(e.curator).length > 0, '缺少策展人署名'),
    check(
      'dates',
      '开展与闭幕日期',
      isIsoDate(opening) && isIsoDate(closing) && opening <= closing,
      !isIsoDate(opening) || !isIsoDate(closing)
        ? '缺少有效的开展/闭幕日期'
        : '闭幕日期不能早于开展日期',
    ),
    check('description', '展览说明', text(e.description).length > 0, '缺少展览说明'),
  ];

  // 2) 至少一件作品
  const pieces = piecesOf(e);
  const piecesChecks: ReadinessCheck[] = [
    check('hasPiece', '至少编排一件作品', pieces.length > 0, '至少编排一件作品后才能上线'),
  ];

  // 3) 必要的导览或空间信息：二者齐备其一即可
  const hasGuide = text(e.guide).length > 0;
  const hasVenue = text(e.venue).length > 0;
  const guideChecks: ReadinessCheck[] = [
    check(
      'guideOrVenue',
      '导览说明或空间信息',
      hasGuide || hasVenue,
      '需要补充导览说明或展览空间信息（至少一项）',
    ),
  ];

  const groupDefs: ReadonlyArray<{ id: CheckGroupId; label: string; checks: ReadinessCheck[] }> = [
    { id: 'basic', label: '基础信息', checks: basicChecks },
    { id: 'pieces', label: '作品编排', checks: piecesChecks },
    { id: 'guide', label: '导览 / 空间', checks: guideChecks },
  ];

  const groups: ReadinessGroup[] = groupDefs.map((g) => {
    const checks = g.checks;
    return { id: g.id, label: g.label, checks, pass: checks.every((c) => c.status === 'pass') };
  });

  const checks = groups.flatMap((g) => g.checks);
  const blockers = checks.filter((c) => c.reason !== null).map((c) => c.reason as string);
  const passedChecks = checks.length - blockers.length;
  const canRelease = blockers.length === 0;

  // 空展览：没有作品，且除可能存在的名称外其余基础信息全缺
  const basicInfoBeyondTitle = basicChecks
    .filter((c) => c.id !== 'title')
    .some((c) => c.status === 'pass');
  const state: ReadinessState = canRelease
    ? 'ready'
    : pieces.length === 0 && !basicInfoBeyondTitle
      ? 'empty'
      : 'partial';

  const stateLabel = canRelease
    ? '已可上线'
    : state === 'empty'
      ? '空展览'
      : '尚未完成';

  const summary = canRelease
    ? '完成度检查全部通过，可以上线。'
    : state === 'empty'
      ? '这是一个空展览，请先完善基础信息并编排作品。'
      : `距上线还差 ${blockers.length} 项。`;

  return {
    state,
    stateLabel,
    groups,
    checks,
    canRelease,
    blockers,
    passedChecks,
    totalChecks: checks.length,
    percent: Math.round((passedChecks / checks.length) * 100),
    summary,
  };
}

/**
 * 上线动作唯一入口的决策结果。release() 必须严格按它执行：
 * canRelease=true 才允许把状态转为“已上线”，否则抛出 blockers 中的原因。
 */
export function releaseDecision(e: Exhibition | null | undefined): {
  canRelease: boolean;
  blockers: readonly string[];
} {
  const r = evaluateExhibition(e);
  return { canRelease: r.canRelease, blockers: r.blockers };
}
