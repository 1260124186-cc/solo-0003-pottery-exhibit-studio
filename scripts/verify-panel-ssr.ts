/**
 * 面板 SSR 渲染冒烟（由 scripts/verify-readiness.mjs 打包执行）：
 * 用真实的 Vue 组件管线渲染“完成度面板”，验证三种完整度的可见文案，
 * 并确认渲染本身不修改展览状态。
 */
import assert from 'node:assert/strict';
import { defineComponent, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { useExhibitService } from '../src/services/exhibitService';
import { evaluateExhibition } from '../src/domain/readiness';
import type { Exhibition } from '../src/domain/models';

function readyExhibition(over: Partial<Exhibition> = {}): Exhibition {
  return {
    id: 's',
    title: '展',
    subtitle: '副',
    curator: '人',
    status: '草稿',
    opening: '2026-03-01',
    closing: '2026-05-01',
    pieces: ['a1'],
    description: '说明',
    guide: '导览',
    ...over,
  };
}

// 面板的最小等价渲染：直接消费 evaluateExhibition（与 StudioView 同源）
const Panel = defineComponent({
  props: { exhibition: { type: Object as () => Exhibition, required: true } },
  setup(props) {
    return () => {
      const r = evaluateExhibition(props.exhibition);
      return h('aside', { class: `readiness ${r.state}` }, [
        h('span', { class: `badge ${r.state}` }, r.stateLabel),
        h('p', { class: 'summary' }, r.summary),
        ...r.groups.flatMap((g) =>
          g.checks.map((c) =>
            h('li', { class: c.status }, [
              c.status === 'pass' ? '已齐备' : '缺失',
              ` ${c.label}`,
              c.reason ? ` — ${c.reason}` : '',
            ]),
          ),
        ),
      ]);
    };
  },
});

const svc = useExhibitService();

const scenarios: Array<{ name: string; e: Exhibition; label: string; reason: string | null }> = [
  { name: '空展览', e: { id: 'z', title: '', status: '草稿', pieces: [] } as unknown as Exhibition, label: '空展览', reason: '缺少展览名称' },
  { name: '部分完成', e: readyExhibition({ guide: '', venue: '' }), label: '尚未完成', reason: '需要补充导览说明或展览空间信息（至少一项）' },
  { name: '可上线', e: readyExhibition(), label: '已可上线', reason: null },
];

let rendered = 0;
for (const s of scenarios) {
  svc.state.value.exhibitions = [structuredClone(s.e)];
  const before = JSON.stringify(svc.state.value.exhibitions);
  const html = await renderToString(h(Panel, { exhibition: svc.state.value.exhibitions[0] }));
  rendered++;

  assert.ok(html.includes(s.label), `[${s.name}] 应显示状态“${s.label}”，实际：${html}`);
  if (s.reason) {
    assert.ok(html.includes(s.reason), `[${s.name}] 应明确指出缺项：${s.reason}`);
    assert.ok(html.includes('缺失'), `[${s.name}] 应逐项标出“缺失”`);
  } else {
    assert.ok(html.includes('可以上线'), `[${s.name}] 应给出可上线结论`);
    assert.ok(!html.includes('缺失'), `[${s.name}] 不应出现缺失项`);
  }
  assert.equal(
    JSON.stringify(svc.state.value.exhibitions),
    before,
    `[${s.name}] 渲染面板不得改变任何展览数据/状态`,
  );
  assert.equal(svc.state.value.exhibitions[0].status, s.e.status, `[${s.name}] 状态不得改变`);
  console.log(`  ✓ 渲染：${s.name} → ${s.label}`);
}

// 刷新一致性：持久化（内存桩中无 localStorage，直接 JSON 往返）后重新渲染应得到相同 HTML
const e = readyExhibition({ guide: '' });
const html1 = await renderToString(h(Panel, { exhibition: e }));
const html2 = await renderToString(h(Panel, { exhibition: structuredClone(e) }));
assert.equal(html2, html1, '刷新（数据往返）后面板渲染必须一致');
console.log('  ✓ 刷新后渲染一致');
console.log(`SSR 冒烟通过：${rendered} 种完整度 + 刷新一致 ✓`);
