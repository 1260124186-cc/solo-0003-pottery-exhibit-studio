/**
 * 只读分享场景下的剪贴板封装：
 * - 优先使用 navigator.clipboard（安全上下文）
 * - 不支持时降级到 execCommand('copy')
 * - 均不可用时明确返回 unsupported，由界面给出手动复制提示
 */
export type CopyResult = 'success' | 'failure' | 'unsupported';

export async function copyShareText(text: string): Promise<CopyResult> {
  if (typeof navigator === 'undefined') return 'unsupported';

  const nav = navigator as Navigator & {
    clipboard?: { writeText?: (t: string) => Promise<void> };
  };

  if (nav.clipboard && typeof nav.clipboard.writeText === 'function') {
    try {
      await nav.clipboard.writeText(text);
      return 'success';
    } catch {
      return 'failure';
    }
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok ? 'success' : 'failure';
  } catch {
    return 'unsupported';
  }
}
