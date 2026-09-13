<script setup lang='ts'>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useExhibitionFlow } from '../composables/useExhibitionFlow';
import { describeDeleteScope, deletionBlockedReason } from '../domain/lifecycle';
import type { Exhibition } from '../domain/models';

const { state, create, duplicate, release, togglePiece, remove } = useExhibitionFlow();

const selected = ref<string>(state.value.exhibitions[0]?.id ?? '');
const current = computed<Exhibition | undefined>(() => state.value.exhibitions.find((x) => x.id === selected.value));
const notice = ref('');
const newTitle = ref('');

/** 待确认删除的展览 id；为 null 表示确认弹窗关闭，此时不产生任何变化 */
const pendingDeleteId = ref<string | null>(null);
const pendingDelete = computed(() => (pendingDeleteId.value ? state.value.exhibitions.find((e) => e.id === pendingDeleteId.value) : undefined));
const pendingScope = computed(() => (pendingDeleteId.value ? describeDeleteScope(state.value, pendingDeleteId.value) : null));

function arrangementOf(id: string) {
  return state.value.arrangements.find((a) => a.exhibitionId === id);
}
function guidesOf(id: string) {
  return state.value.guides.filter((g) => g.exhibitionId === id);
}
function sourceOf(e: Exhibition) {
  return e.copiedFrom ? state.value.exhibitions.find((x) => x.id === e.copiedFrom) : undefined;
}

/** 删除成功后自动选中剩下的展览：优先被删项的相邻展览，没有则清空选中 */
function nearestRemaining(id: string): string {
  const list = state.value.exhibitions;
  const index = list.findIndex((x) => x.id === id);
  if (index === -1) return list[0]?.id ?? '';
  const neighbor = list[index + 1] ?? list[index - 1];
  return neighbor?.id ?? '';
}

function blockReason(e: Exhibition) {
  return deletionBlockedReason(e.status);
}

function add() {
  try {
    const e = create(newTitle.value);
    selected.value = e.id;
    newTitle.value = '';
    notice.value = '已创建展览草稿';
  } catch (err: unknown) {
    notice.value = (err as Error).message;
  }
}

function copyAsDraft() {
  if (!current.value) return;
  const copy = duplicate(current.value.id);
  selected.value = copy.id;
  notice.value = '已复制为新的草稿（独立编排与导览）';
}

function pub() {
  if (!current.value) return;
  try {
    release(current.value.id);
    notice.value = '展览已上线';
  } catch (err: unknown) {
    notice.value = (err as Error).message;
  }
}

/** 第一步：打开确认弹窗（不删除任何数据） */
function askDelete(id: string) {
  const e = state.value.exhibitions.find((x) => x.id === id);
  if (!e) return;
  const reason = deletionBlockedReason(e.status);
  if (reason) {
    notice.value = reason;
    return;
  }
  pendingDeleteId.value = id;
}

/** 取消确认：关闭弹窗，不产生任何变化 */
function cancelDelete() {
  pendingDeleteId.value = null;
}

/** 第二步：确认删除，成功后自动选择剩下的展览；失败时弹窗保留且不改动选择 */
function confirmDelete() {
  const id = pendingDeleteId.value;
  if (!id) return;
  const target = state.value.exhibitions.find((x) => x.id === id);
  if (!target) {
    pendingDeleteId.value = null;
    return;
  }
  const retainedCount = describeDeleteScope(state.value, id).retainedCopies.length;
  const nextId = nearestRemaining(id);
  try {
    remove(id); // 打开弹窗时已校验为草稿；若期间状态已变，服务层抛出且不写入
  } catch (err: unknown) {
    notice.value = (err as Error).message;
    return; // 失败时保留弹窗与当前选择，不产生任何变化
  }
  pendingDeleteId.value = null;
  selected.value = nextId;
  notice.value = retainedCount
    ? `草稿及其空间编排、导览文字已删除；${retainedCount} 场由它复制的草稿已保留并解除来源关联`
    : '草稿及其空间编排、导览文字已删除';
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') cancelDelete();
}
onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
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
        <div
          v-for='e in state.exhibitions'
          :key='e.id'
          class='exhibit-row'
          :class='{ active: e.id === selected }'
          @click='selected = e.id'
        >
          <div class='exhibit-info'>
            <span class='status-tag' :class='"s-" + e.status'>{{ e.status }}</span>
            <h3>{{ e.title }}</h3>
            <p>{{ e.subtitle }}</p>
          </div>
          <div class='row-side'>
            <b>{{ e.pieces.length }} 件</b>
            <button
              class='mini-delete'
              :disabled='!!blockReason(e)'
              :title='blockReason(e) ?? "删除草稿"'
              @click.stop='askDelete(e.id)'
            >删除</button>
          </div>
        </div>
      </section>

      <section class='canvas' v-if='current'>
        <div class='canvas-top'>
          <div>
            <p class='eyebrow'>策展工作面</p>
            <h2>{{ current.title }}</h2>
            <p>{{ current.description }}</p>
          </div>
          <div class='top-actions'>
            <button class='ghost' @click='copyAsDraft'>复制为草稿</button>
            <button class='release' @click='pub'>上线展览</button>
          </div>
        </div>

        <div class='meta'>
          <span>策展人 · {{ current.curator }}</span>
          <span>{{ current.opening }} — {{ current.closing }}</span>
          <span class='status'>{{ current.status }}</span>
          <span v-if='sourceOf(current)' class='source-note'>复制自《{{ sourceOf(current)?.title }}》</span>
        </div>

        <div class='related'>
          <div class='related-block'>
            <h4>空间编排</h4>
            <template v-if='arrangementOf(current.id)'>
              <p v-if='!arrangementOf(current.id)!.rooms.length' class='muted'>尚未划分展厅。</p>
              <ul v-else>
                <li v-for='(room, i) in arrangementOf(current.id)!.rooms' :key='i'>
                  {{ room.name }} · {{ room.pieceIds.length }} 件作品
                </li>
              </ul>
            </template>
          </div>
          <div class='related-block'>
            <h4>导览文字（{{ guidesOf(current.id).length }}）</h4>
            <ul>
              <li v-for='g in guidesOf(current.id)' :key='g.id'>{{ g.title }}</li>
            </ul>
          </div>
        </div>

        <div class='piece-grid'>
          <div
            class='piece'
            v-for='a in state.artworks'
            :key='a.id'
            :class='{ chosen: current.pieces.includes(a.id) }'
            @click='togglePiece(current.id, a.id)'
          >
            <div class='piece-art' :style='{ background: a.tone }'><span>{{ a.year }}</span></div>
            <div>
              <h3>{{ a.title }}</h3>
              <p>{{ a.artist }} · {{ a.material }}</p>
              <small>{{ a.note }}</small>
            </div>
            <button>{{ current.pieces.includes(a.id) ? '已编排' : '加入展览' }}</button>
          </div>
        </div>

        <div class='danger-zone'>
          <template v-if='!blockReason(current)'>
            <div>
              <h4>删除草稿</h4>
              <p>删除将同时清掉这场展览的空间编排与导览文字；由它复制出的草稿会保留。此操作不可恢复。</p>
            </div>
            <button class='danger' @click='askDelete(current.id)'>删除此草稿</button>
          </template>
          <template v-else>
            <div>
              <h4>删除不可用</h4>
              <p class='blocked-reason'>{{ blockReason(current) }}</p>
            </div>
            <button class='danger' disabled>不可删除</button>
          </template>
        </div>

        <div class='notice' v-if='notice'>{{ notice }}</div>
      </section>

      <section class='canvas empty' v-else>
        <p class='eyebrow'>策展工作面</p>
        <h2>暂无展览</h2>
        <p class='muted'>在左侧输入名称创建第一场展览草稿。</p>
      </section>
    </main>

    <div class='modal-mask' v-if='pendingDelete' @click.self='cancelDelete'>
      <div class='modal' role='dialog' aria-modal='true' aria-label='确认删除草稿'>
        <p class='eyebrow'>删除草稿 · 二次确认</p>
        <h3>确定删除《{{ pendingDelete.title }}》吗？</h3>
        <ul class='scope-list'>
          <li>将删除这场<b>草稿</b>展览本身；</li>
          <li>将一并删除它的空间编排（{{ pendingScope?.arrangementCount ?? 0 }} 组）与导览文字（{{ pendingScope?.guideCount ?? 0 }} 条）；</li>
          <li>作品档案和其他展览不受影响；</li>
          <li v-if='pendingScope && pendingScope.retainedCopies.length'>
            由它复制出的 {{ pendingScope.retainedCopies.length }} 场草稿会保留，仅解除来源关联：
            <span v-for='c in pendingScope.retainedCopies' :key='c.id' class='retained'>《{{ c.title }}》</span>
          </li>
          <li v-else>没有由它复制出的草稿。</li>
        </ul>
        <p class='muted'>此操作不可恢复。点击“取消”或按 Esc 不产生任何变化。</p>
        <div class='modal-actions'>
          <button class='ghost' @click='cancelDelete'>取消</button>
          <button class='danger' @click='confirmDelete'>确认删除</button>
        </div>
      </div>
    </div>
  </div>
</template>
