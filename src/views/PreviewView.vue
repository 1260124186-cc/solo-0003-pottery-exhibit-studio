<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useExhibitService } from '../services/exhibitService';
import { useGuideNarratives } from '../services/guideNarrationService';
import type { Artwork, Exhibition } from '../domain/models';

const props = defineProps<{ exhibitionId: string }>();
const emit = defineEmits<{ back: [] }>();

const { state } = useExhibitService();
const { getNarration, saveNarration } = useGuideNarratives();

const exhibition = computed<Exhibition | undefined>(() =>
  state.value.exhibitions.find((x: Exhibition) => x.id === props.exhibitionId),
);

// 按作品加入展览的顺序（pieces 数组顺序）展示
const pieces = computed<Artwork[]>(() =>
  exhibition.value
    ? exhibition.value.pieces
        .map((id) => state.value.artworks.find((a: Artwork) => a.id === id))
        .filter((a): a is Artwork => Boolean(a))
    : [],
);

const index = ref(0);
const current = computed(() => pieces.value[index.value]);

// 当前作品的导览词：默认以观众视角成段展示，策展人可展开撰写
const editing = ref(false);
const draft = ref('');
const savedFlash = ref(false);
let flashTimer: ReturnType<typeof setTimeout> | undefined;

watch(
  [current, pieces],
  () => {
    draft.value = current.value ? getNarration(current.value.id) : '';
    editing.value = false;
    savedFlash.value = false;
  },
  { immediate: true },
);

function startEdit() {
  draft.value = current.value ? getNarration(current.value.id) : '';
  editing.value = true;
}

function go(step: number) {
  const n = pieces.value.length;
  if (!n) return;
  index.value = (index.value + step + n) % n;
}
const prev = () => go(-1);
const next = () => go(1);

function save() {
  if (!current.value) return;
  draft.value = saveNarration(current.value.id, draft.value);
  editing.value = false;
  savedFlash.value = true;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (savedFlash.value = false), 2000);
}

function onKey(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === 'TEXTAREA' || tag === 'INPUT') return;
  if (e.key === 'ArrowRight') next();
  if (e.key === 'ArrowLeft') prev();
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  clearTimeout(flashTimer);
});
</script>

<template>
  <div class="preview">
    <header class="preview-header">
      <button class="back" @click="emit('back')">← 返回策展工作面</button>
      <p class="eyebrow">AUDIENCE PREVIEW · 观众视角</p>
    </header>

    <template v-if="exhibition">
      <section class="tour-head">
        <h1>{{ exhibition.title }}</h1>
        <p class="subtitle">{{ exhibition.subtitle }}</p>
        <p class="hours">开放时间：{{ exhibition.opening }} — {{ exhibition.closing }}</p>
      </section>

      <section v-if="pieces.length" class="tour">
        <p class="counter">第 {{ index + 1 }} / {{ pieces.length }} 件</p>

        <article v-if="current" :key="current.id" class="piece-card">
          <div class="piece-visual" :style="{ background: current.tone }">
            <span>{{ current.year }}</span>
          </div>
          <div class="piece-body">
            <h2>{{ current.title }}</h2>
            <p class="attrib">{{ current.artist }} · {{ current.material }} · {{ current.year }}</p>
            <p class="note">{{ current.note }}</p>

            <div class="narration">
              <h3>观众导览</h3>
              <template v-if="!editing">
                <p class="narration-text" v-if="getNarration(current.id)">{{ getNarration(current.id) }}</p>
                <p class="narration-empty" v-else>策展人尚未为这件作品撰写导览词。</p>
                <div class="narration-actions">
                  <button class="edit-narration" @click="startEdit">
                    {{ getNarration(current.id) ? '编辑导览词' : '撰写导览词' }}
                  </button>
                  <span class="saved-hint" v-if="savedFlash">已保存，刷新后仍保留 ✓</span>
                </div>
              </template>
              <template v-else>
                <textarea
                  v-model="draft"
                  rows="4"
                  placeholder="为这件作品写一段观众可读的导览文字，保存后刷新仍会保留。"
                ></textarea>
                <div class="narration-actions">
                  <button class="save-narration" @click="save">保存导览词</button>
                  <button class="cancel-narration" @click="editing = false">取消</button>
                </div>
              </template>
            </div>
          </div>
        </article>

        <nav class="tour-nav">
          <button class="nav-btn" @click="prev">← 上一件</button>
          <button class="nav-btn primary" @click="next">
            {{ index === pieces.length - 1 ? '回到第一件 →' : '下一件 →' }}
          </button>
        </nav>
        <p class="key-hint">也可使用键盘 ← → 切换作品</p>
      </section>

      <section v-else class="empty-tour">
        <h2>暂时无法开始导览</h2>
        <p>这场展览还没有编排任何作品。请返回策展工作面，至少加入一件作品后再进入观众预览。</p>
        <button class="nav-btn primary" @click="emit('back')">返回策展工作面</button>
      </section>
    </template>

    <section v-else class="empty-tour">
      <h2>未找到这场展览</h2>
      <p>该展览可能已被移除，请返回策展工作面重新选择。</p>
      <button class="nav-btn primary" @click="emit('back')">返回策展工作面</button>
    </section>
  </div>
</template>
