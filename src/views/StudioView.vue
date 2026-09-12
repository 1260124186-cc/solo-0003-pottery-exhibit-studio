<script setup lang="ts">
import { ref, computed } from 'vue';
import { useExhibitionFlow } from '../composables/useExhibitionFlow';
import type { InfoField } from '../services/exhibitService';
import { evaluateExhibition, piecesOf } from '../domain/readiness';

const { state, create, release, togglePiece, updateInfo } = useExhibitionFlow();

const selected = ref<string>(state.value.exhibitions[0]?.id ?? '');
const current = computed(() => state.value.exhibitions.find((x) => x.id === selected.value));

/**
 * 完成度面板数据。这是纯函数对当前展览的只读投影：
 * 不修改任何字段，刷新后由同一份数据重新算出相同结果。
 */
const readiness = computed(() => evaluateExhibition(current.value ?? null));

/** 当前展览的作品列表（旧数据缺 pieces 字段时兜底为空数组，视图永不直接读 .pieces） */
const currentPieces = computed<string[]>(() => piecesOf(current.value));

const notice = ref('');
const newTitle = ref('');

function add(): void {
  try {
    const e = create(newTitle.value);
    selected.value = e.id;
    newTitle.value = '';
    notice.value = '已创建展览草稿';
  } catch (e: unknown) {
    notice.value = (e as Error).message;
  }
}

function pub(): void {
  if (!current.value) return;
  try {
    release(current.value.id);
    // 面板结论与上线动作来自同一规则；能走到这里说明 readiness.canRelease 必为 true
    notice.value = '展览已上线';
  } catch (e: unknown) {
    notice.value = (e as Error).message;
  }
}

/** 面板中的信息补录：只写信息字段白名单，status 不参与、不会被修改 */
function edit(field: InfoField, value: string): void {
  if (!current.value) return;
  updateInfo(current.value.id, { [field]: value });
}
</script>

<template>
  <div class="studio">
    <header>
      <div>
        <p class="eyebrow">CLAY / CURATION LAB</p>
        <h1>陶艺展览策划台</h1>
        <p class="intro">把每件作品放进属于它的光线与距离里。</p>
      </div>
      <div class="header-note">{{ state.exhibitions.length }} 场展览 · {{ state.artworks.length }} 件作品</div>
    </header>
    <main>
      <section class="rail">
        <div class="new-box">
          <input v-model="newTitle" placeholder="新展览名称" @keyup.enter="add">
          <button @click="add">创建草稿</button>
        </div>
        <div
          v-for="e in state.exhibitions"
          :key="e.id"
          class="exhibit-row"
          :class="{ active: e.id === selected }"
          @click="selected = e.id"
        >
          <div>
            <span>{{ e.status }}</span>
            <h3>{{ e.title || '未命名展览' }}</h3>
            <p>{{ e.subtitle || '暂无副标题' }}</p>
          </div>
          <b>{{ piecesOf(e).length }} 件</b>
        </div>
      </section>

      <section class="canvas" v-if="current">
        <div class="canvas-top">
          <div>
            <p class="eyebrow">策展工作面</p>
            <h2>{{ current.title || '未命名展览' }}</h2>
            <p>{{ current.description || '尚未撰写展览说明。' }}</p>
          </div>
          <button class="release" @click="pub">上线展览</button>
        </div>

        <!-- 展览完成度面板：只读判定 + 信息补录；不改变展览状态 -->
        <aside class="readiness" :class="readiness.state">
          <div class="readiness-head">
            <div>
              <p class="eyebrow">EXHIBITION READINESS</p>
              <h3>
                完成度：{{ readiness.stateLabel }}
                <span class="percent">{{ readiness.passedChecks }}/{{ readiness.totalChecks }} 项 · {{ readiness.percent }}%</span>
              </h3>
            </div>
            <span class="badge" :class="readiness.state">{{ readiness.stateLabel }}</span>
          </div>
          <p class="readiness-summary">{{ readiness.summary }}</p>

          <div v-for="g in readiness.groups" :key="g.id" class="readiness-group">
            <p class="group-title">
              <span :class="g.pass ? 'ok' : 'bad'">{{ g.pass ? '✓' : '!' }}</span>
              {{ g.label }}
            </p>
            <ul>
              <li v-for="c in g.checks" :key="c.id" :class="c.status">
                <span class="mark">{{ c.status === 'pass' ? '已齐备' : '缺失' }}</span>
                <span class="check-label">{{ c.label }}</span>
                <span class="reason" v-if="c.reason">— {{ c.reason }}</span>
              </li>
            </ul>
          </div>

          <details class="info-editor">
            <summary>补录基础信息、导览或空间信息</summary>
            <div class="info-grid">
              <label>名称<input :value="current.title" @input="edit('title', ($event.target as HTMLInputElement).value)"></label>
              <label>副标题<input :value="current.subtitle" @input="edit('subtitle', ($event.target as HTMLInputElement).value)"></label>
              <label>策展人<input :value="current.curator" @input="edit('curator', ($event.target as HTMLInputElement).value)"></label>
              <label>开展日期<input type="date" :value="current.opening" @input="edit('opening', ($event.target as HTMLInputElement).value)"></label>
              <label>闭幕日期<input type="date" :value="current.closing" @input="edit('closing', ($event.target as HTMLInputElement).value)"></label>
              <label class="span2">展览说明<input :value="current.description" @input="edit('description', ($event.target as HTMLInputElement).value)"></label>
              <label class="span2">导览说明<input :value="current.guide ?? ''" placeholder="可与空间信息二选一" @input="edit('guide', ($event.target as HTMLInputElement).value)"></label>
              <label class="span2">空间信息<input :value="current.venue ?? ''" placeholder="展厅 / 动线，可与导览说明二选一" @input="edit('venue', ($event.target as HTMLInputElement).value)"></label>
            </div>
          </details>

          <p class="readiness-foot">
            本面板仅为完成度的辅助呈现，不会改变展览状态；上线按钮仍执行同一套校验。
          </p>
        </aside>

        <div class="meta">
          <span>策展人 · {{ current.curator || '未署名' }}</span>
          <span>{{ current.opening || '日期待定' }} — {{ current.closing || '日期待定' }}</span>
          <span class="status">{{ current.status }}</span>
        </div>
        <div class="piece-grid">
          <div
            v-for="a in state.artworks"
            :key="a.id"
            class="piece"
            :class="{ chosen: currentPieces.includes(a.id) }"
            @click="togglePiece(current.id, a.id)"
          >
            <div class="piece-art" :style="{ background: a.tone }"><span>{{ a.year }}</span></div>
            <div>
              <h3>{{ a.title }}</h3>
              <p>{{ a.artist }} · {{ a.material }}</p>
              <small>{{ a.note }}</small>
            </div>
            <button>{{ currentPieces.includes(a.id) ? '已编排' : '加入展览' }}</button>
          </div>
        </div>
        <div class="notice" v-if="notice">{{ notice }}</div>
      </section>

      <section class="canvas empty-canvas" v-else>
        <p class="eyebrow">策展工作面</p>
        <h2>还没有选中的展览</h2>
        <p>在左侧创建草稿或选择一场展览，完成度面板会显示它距离上线还缺什么。</p>
      </section>
    </main>
  </div>
</template>
