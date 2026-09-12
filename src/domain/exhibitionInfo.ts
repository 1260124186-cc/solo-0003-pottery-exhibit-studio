// 展览信息（副标题、策展人、开放日期、结束日期、说明）的纯校验逻辑。
// 与 Vue / localStorage 无关，便于单独验证；校验通过才返回清洗后的数据。

export interface ExhibitionInfoInput {
  subtitle: string;
  curator: string;
  opening: string;
  closing: string;
  description: string;
}

export type ExhibitionInfo = ExhibitionInfoInput;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: string, label: string): Date {
  if (!DATE_RE.test(value)) {
    throw Error(`${label}格式应为 YYYY-MM-DD`);
  }
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  // 拒绝 2025-02-31 这类被 Date 自动进位的伪日期
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    throw Error(`${label}不是有效的日期`);
  }
  return date;
}

/** 校验五项展览信息，全部通过后返回去除首尾空白的新对象；任一失败抛出中文原因。 */
export function validateExhibitionInfo(input: ExhibitionInfoInput): ExhibitionInfo {
  const subtitle = input.subtitle.trim();
  const curator = input.curator.trim();
  const opening = input.opening.trim();
  const closing = input.closing.trim();
  const description = input.description.trim();

  if (!subtitle) throw Error('副标题不能为空');
  if (!curator) throw Error('策展人不能为空');
  if (!opening) throw Error('开放日期不能为空');
  if (!closing) throw Error('结束日期不能为空');
  if (!description) throw Error('说明不能为空');

  const start = parseDate(opening, '开放日期');
  const end = parseDate(closing, '结束日期');
  if (end.getTime() < start.getTime()) {
    throw Error('结束日期不能早于开放日期');
  }

  return { subtitle, curator, opening, closing, description };
}
