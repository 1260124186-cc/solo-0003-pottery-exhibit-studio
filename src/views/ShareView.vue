<script setup lang="ts">
import { computed, ref } from 'vue';
import { useExhibitService } from '../services/exhibitService';
import { selectedExhibitionId } from '../composables/useSelectedExhibition';
import { buildShareText } from '../domain/shareText';
import { copyShareText, type CopyResult } from '../composables/useClipboard';
import type { Artwork, Exhibition } from '../domain/models';

const props = defineProps<{ routeId?: string }>();

const { state } = useExhibitService();

// 数据只能来自当前选中的已上线展览；路由 id 仅用于与工作面选中项互相定位
const sharedExhibition = computed((): Exhibition | null => {
  const id = props.routeId || selectedExhibitionId.value;
  const e = (state.value.exhibitions as Exhibition[]).find((x) => x.id === id);
  return e && e.status === '已上线' ? e : null;
});

const publishedExhibitions = computed<Exhibition[]>(() =>
  (state.value.exhibitions as Exhibition[]).filter((e) => e.status === '已上线'),
);

const hasPublished = computed(() => publishedExhibitions.value.length > 0);

const sharePieces = computed<Artwork[]>(
  () =>
    sharedExhibition.value
      ? (sharedExhibition.value.pieces
          .map((id) => (state.value.artworks as Artwork[]).find((a) => a.id === id))
          .filter((a): a is Artwork => Boolean(a)) as Artwork[])
      : [],
);

const shareText = computed(() =>
  sharedExhibition.value
    ? buildShareText(sharedExhibition.value, state.value.artworks as Artwork[])
    : '',
);

const feedback = ref<{ kind: CopyResult | 'hint'; message: string } | null>(null);

async function onCopy() {
  if (!shareText.value) return;
  const result = await copyShareText(shareText.value);
  if (result === 'success') feedback.value = { kind: 'success', message: '分享文本已复制到剪贴板' };
  else if (result === 'failure') feedback.value = { kind: 'failure', message: '复制失败，请手动选择下方文本复制' };
  else feedback.value = { kind: 'hint', message: '当前浏览器不支持自动复制剪贴板，请手动选择下方文本复制' };
}
</script>

<template>
  <div class="share-page">
    <header class="share-header">
      <a class="back-link" href="#/studio">← 返回策展工作面</a>
      <p class="eyebrow">PUBLIC / READ-ONLY VIEW</p>
    </header>

    <!-- 没有任何已上线展览 -->
    <main class="share-empty" v-if="!sharedExhibition && !hasPublished">
      <h1>暂无可分享的展览</h1>
      <p>当前还没有已上线的展览。请先在策展工作面编排作品并上线展览。</p>
      <a class="back-cta" href="#/studio">前往策展工作面</a>
    </main>

    <!-- 有已上线展览，但选中项无效或不是已上线状态 -->
    <main class="share-empty" v-else-if="!sharedExhibition">
      <h1>该展览暂不可分享</h1>
      <p>只有<strong>已上线</strong>的展览才能进入观众分享视图。</p>
      <ul class="published-list">
        <li v-for="e in publishedExhibitions" :key="e.id">
          <a :href="`#/share/${e.id}`">{{ e.title }}</a>
        </li>
      </ul>
      <a class="back-cta" href="#/studio">返回策展工作面</a>
    </main>

    <!-- 只读观众分享视图 -->
    <main class="share-card" v-else>
      <p class="eyebrow">观众分享 · 已上线展览</p>
      <h1>{{ sharedExhibition.title }}</h1>
      <p class="share-subtitle">{{ sharedExhibition.subtitle }}</p>

      <dl class="share-meta">
        <div>
          <dt>开放时间</dt>
          <dd>{{ sharedExhibition.opening }} — {{ sharedExhibition.closing }}</dd>
        </div>
        <div>
          <dt>策展人</dt>
          <dd>{{ sharedExhibition.curator }}</dd>
        </div>
        <div>
          <dt>状态</dt>
          <dd class="status">{{ sharedExhibition.status }}</dd>
        </div>
      </dl>

      <section class="share-pieces">
        <h2>作品清单 · {{ sharePieces.length }} 件</h2>
        <ol>
          <li v-for="a in sharePieces" :key="a.id">
            <div class="piece-art" :style="{ background: a.tone }"><span>{{ a.year }}</span></div>
            <div>
              <h3>{{ a.title }}</h3>
              <p>{{ a.artist }} · {{ a.material }}</p>
              <small>{{ a.note }}</small>
            </div>
          </li>
        </ol>
      </section>

      <section class="share-actions">
        <button type="button" @click="onCopy">复制分享文本</button>
        <p
          v-if="feedback"
          class="copy-feedback"
          :class="feedback.kind"
          role="status"
          aria-live="polite"
        >{{ feedback.message }}</p>
      </section>

      <textarea class="share-text" readonly :value="shareText" aria-label="分享文本预览"></textarea>
    </main>
  </div>
</template>
