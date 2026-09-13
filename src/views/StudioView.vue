<script setup lang='ts'>
import { ref, computed } from 'vue';
import { useExhibitionFlow } from '../composables/useExhibitionFlow';
import type { Exhibition } from '../domain/models';
import {
  buildGridRows,
  orderedArtworks,
  buildExport,
  inspectOrder,
  orderFingerprint,
} from '../domain/ordering';

const { state, create, release, togglePiece, movePiece, reorderPiece } = useExhibitionFlow();
const selected = ref(state.value.exhibitions[0]?.id || '');
const current = computed<Exhibition | undefined>(() =>
  state.value.exhibitions.find((x) => x.id === selected.value),
);
const notice = ref('');
const newTitle = ref('');

// 单一事实：所有入口的顺序都来自 current.pieces，经由同一组纯函数派生。
const gridRows = computed(() => (current.value ? buildGridRows(state.value.artworks, current.value.pieces) : []));
const orderedPieces = computed(() => (current.value ? orderedArtworks(state.value.artworks, current.value.pieces) : []));
const fingerprint = computed(() => (current.value ? orderFingerprint(current.value.pieces) : ''));
const orderIssues = computed(() => (current.value ? inspectOrder(current.value, state.value.artworks) : []));
const exported = computed(() => (current.value ? buildExport(current.value, state.value.artworks) : null));
const exportText = computed(() => (exported.value ? JSON.stringify(exported.value, null, 2) : ''));

// 拖拽排序状态
const draggingId = ref('');
const dragOverIndex = ref(-1);

function add() {
  try {
    const e = create(newTitle.value);
    selected.value = e.id;
    newTitle.value = '';
    notice.value = '已创建展览草稿';
  } catch (e: any) {
    notice.value = e.message;
  }
}
function pub() {
  try {
    release(selected.value);
    notice.value = '展览已上线';
  } catch (e: any) {
    notice.value = e.message;
  }
}
function onToggle(id: string) {
  togglePiece(current.value!.id, id);
}
function onMove(id: string, dir: -1 | 1) {
  movePiece(current.value!.id, id, dir);
  notice.value = '展示顺序已实时保存';
}
function onDragStart(id: string, ev: DragEvent) {
  draggingId.value = id;
  ev.dataTransfer?.setData('text/plain', id);
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
}
function onDragOver(index: number, ev: DragEvent) {
  if (!draggingId.value) return; // 未加入展览的作品不参与排序
  ev.preventDefault();
  dragOverIndex.value = index;
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
}
function onDrop(index: number) {
  if (draggingId.value) {
    reorderPiece(current.value!.id, draggingId.value, index);
    notice.value = '展示顺序已实时保存';
  }
  draggingId.value = '';
  dragOverIndex.value = -1;
}
function onDragEnd() {
  draggingId.value = '';
  dragOverIndex.value = -1;
}
async function copyExport() {
  if (!exportText.value) return;
  try {
    await navigator.clipboard.writeText(exportText.value);
    notice.value = '导出 JSON 已复制，顺序与工作面一致';
  } catch {
    notice.value = '复制失败，可手动选择导出内容';
  }
}
function downloadExport() {
  if (!exported.value) return;
  const blob = new Blob([exportText.value], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${exported.value.id}-order.json`;
  a.click();
  URL.revokeObjectURL(url);
  notice.value = '已按当前展示顺序导出';
}
</script>

<template>
  <div class='studio'>
    <header>
      <div>
        <p class='eyebrow'>CLAY / CURATION LAB</p>
        <h1>陶艺展览策划台</h1>
        <p class='intro'>把每件作品放进属于它的光线与距离里。</p>
      </div>
      <div class='header-note'>{{ state.exhibitions.length }} 场展览 · {{ state.artworks.length }} 件作品</div>
    </header>
    <main>
      <section class='rail'>
        <div class='new-box'>
          <input v-model='newTitle' placeholder='新展览名称' @keyup.enter='add'>
          <button @click='add'>创建草稿</button>
        </div>
        <div v-for='e in state.exhibitions' :key='e.id' class='exhibit-row' :class='{ active: e.id === selected }' @click='selected = e.id'>
          <div>
            <span>{{ e.status }}</span>
            <h3>{{ e.title }}</h3>
            <p>{{ e.subtitle }}</p>
          </div>
          <b>{{ e.pieces.length }} 件</b>
        </div>
      </section>
      <section class='canvas' v-if='current'>
        <div class='canvas-top'>
          <div>
            <p class='eyebrow'>策展工作面</p>
            <h2>{{ current.title }}</h2>
            <p>{{ current.description }}</p>
          </div>
          <button class='release' @click='pub'>上线展览</button>
        </div>
        <div class='meta'>
          <span>策展人 · {{ current.curator }}</span>
          <span>{{ current.opening }} — {{ current.closing }}</span>
          <span class='status'>{{ current.status }}</span>
        </div>

        <div class='order-bar'>
          <p class='eyebrow'>单一顺序事实 · ORDER OF DISPLAY</p>
          <div class='fingerprint' :class='{ invalid: orderIssues.length }'>
            <span class='fp-count'>已编排 {{ current.pieces.length }} 件</span>
            <code v-if='fingerprint'>{{ fingerprint }}</code>
            <code v-else class='fp-empty'>尚未加入作品</code>
          </div>
          <p class='order-hint'>已编排作品按此顺序置顶，可拖拽卡片或用上移/下移调整；调整即时保存，刷新与切换展览后保持不变。</p>
          <ul v-if='orderIssues.length' class='order-issues'>
            <li v-for='issue in orderIssues' :key='issue.code'>顺序异常：{{ issue.message }}</li>
          </ul>
        </div>

        <div class='piece-grid'>
          <div
            v-for='row in gridRows'
            :key='row.artwork.id'
            class='piece'
            :class='{
              chosen: row.chosen,
              draggable: row.chosen,
              dragging: draggingId === row.artwork.id,
              dropTarget: row.chosen && dragOverIndex === row.index && draggingId !== row.artwork.id,
            }'
            :draggable='row.chosen'
            @click='row.chosen ? null : onToggle(row.artwork.id)'
            @dragstart='row.chosen ? onDragStart(row.artwork.id, $event) : null'
            @dragover='row.chosen ? onDragOver(row.index, $event) : null'
            @drop='row.chosen ? onDrop(row.index) : null'
            @dragend='onDragEnd'
          >
            <div class='piece-art' :style='{ background: row.artwork.tone }'>
              <span class='order-badge' v-if='row.chosen' title='拖动调整顺序'>⋮⋮ {{ row.index + 1 }}</span>
              <span v-else>{{ row.artwork.year }}</span>
            </div>
            <div>
              <h3>{{ row.artwork.title }}</h3>
              <p>{{ row.artwork.artist }} · {{ row.artwork.material }}</p>
              <small>{{ row.artwork.note }}</small>
            </div>
            <div class='piece-actions' @click.stop>
              <template v-if='row.chosen'>
                <button class='mini' :disabled='row.index === 0' title='上移' @click='onMove(row.artwork.id, -1)'>↑ 上移</button>
                <button class='mini' :disabled='row.index === current.pieces.length - 1' title='下移' @click='onMove(row.artwork.id, 1)'>↓ 下移</button>
                <button class='mini remove' title='移出本展览（不影响作品档案）' @click='onToggle(row.artwork.id)'>移出</button>
              </template>
              <button v-else class='mini add' @click='onToggle(row.artwork.id)'>加入展览</button>
            </div>
          </div>
        </div>

        <div class='entry-grid'>
          <section class='entry'>
            <p class='eyebrow'>展览详情 · 展示顺序</p>
            <h3>{{ current.title }}（{{ orderedPieces.length }} 件）</h3>
            <ol class='order-list'>
              <li v-for='(a, i) in orderedPieces' :key='a.id'>
                <span class='station-no'>{{ i + 1 }}</span>
                <span class='station-name'>{{ a.title }}</span>
                <small>{{ a.artist }} · {{ a.material }} · {{ a.year }}</small>
              </li>
              <li v-if='!orderedPieces.length' class='empty-line'>还没有作品加入本展览</li>
            </ol>
            <p class='entry-fp'>顺序指纹 <code>{{ fingerprint || '—' }}</code></p>
          </section>

          <section class='entry'>
            <p class='eyebrow'>导览预览 · GUIDE PREVIEW</p>
            <h3>观众将按此动线参观</h3>
            <ol class='guide-list'>
              <li v-for='(a, i) in orderedPieces' :key='a.id'>
                <span class='station-no'>第 {{ i + 1 }} 站</span>
                <span class='station-name'>{{ a.title }}</span>
                <small>{{ a.note }}</small>
              </li>
              <li v-if='!orderedPieces.length' class='empty-line'>加入作品后生成导览动线</li>
            </ol>
            <p class='entry-fp'>顺序指纹 <code>{{ fingerprint || '—' }}</code></p>
          </section>
        </div>

        <section class='entry export-entry'>
          <div class='export-head'>
            <div>
              <p class='eyebrow'>后续导出 · EXPORT</p>
              <h3>导出数据读取的就是当前顺序</h3>
            </div>
            <div class='export-actions'>
              <button class='mini' @click='copyExport'>复制 JSON</button>
              <button class='mini add' @click='downloadExport'>下载 JSON</button>
            </div>
          </div>
          <pre class='export-pre'>{{ exportText }}</pre>
          <p class='entry-fp'>顺序指纹 <code>{{ fingerprint || '—' }}</code>（与网格、详情、导览一致）</p>
        </section>

        <div class='notice' v-if='notice'>{{ notice }}</div>
      </section>
    </main>
  </div>
</template>
