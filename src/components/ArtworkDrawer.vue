<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Artwork, Exhibition } from '../domain/models';

const props = defineProps<{
  artwork: Artwork;
  exhibitions: Exhibition[];
  selectedExhibitId: string;
  pending: boolean;
}>();

const emit = defineEmits<{
  close: [];
  add: [artworkId: string];
  remove: [artworkId: string];
}>();

const closeButton = ref<HTMLButtonElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

const currentExhibition = computed(
  () => props.exhibitions.find((item) => item.id === props.selectedExhibitId) ?? null,
);

const isInCurrent = computed(
  () => !!currentExhibition.value?.pieces.includes(props.artwork.id),
);

const memberExhibitions = computed(() =>
  props.exhibitions.filter((item) => item.pieces.includes(props.artwork.id)),
);

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation();
    emit('close');
  }
}

function restoreFocus() {
  previouslyFocused?.focus?.();
  previouslyFocused = null;
}

function notifyClose() {
  emit('close');
}

onMounted(() => {
  previouslyFocused = document.activeElement as HTMLElement | null;
  window.addEventListener('keydown', onKeydown, true);
  void nextTick(() => closeButton.value?.focus());
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true);
  restoreFocus();
});
</script>

<template>
  <Teleport to="body">
    <div class="drawer-layer" @click.self="notifyClose">
      <aside
        class="drawer"
        role="dialog"
        aria-modal="true"
        :aria-label="`作品详情：${artwork.title}`"
      >
        <header class="drawer-head">
          <p class="eyebrow">作品档案</p>
          <button
            ref="closeButton"
            class="drawer-close"
            type="button"
            aria-label="关闭详情"
            @click="notifyClose"
          >
            ✕
          </button>
        </header>

        <div class="drawer-cover" :style="{ background: artwork.tone }">
          <span>{{ artwork.year }}</span>
        </div>

        <h2 class="drawer-title">{{ artwork.title }}</h2>

        <dl class="drawer-fields">
          <div><dt>艺术家</dt><dd>{{ artwork.artist }}</dd></div>
          <div><dt>材质</dt><dd>{{ artwork.material }}</dd></div>
          <div><dt>创作年份</dt><dd>{{ artwork.year }}</dd></div>
          <div><dt>档案编号</dt><dd>{{ artwork.id }}</dd></div>
        </dl>

        <p class="drawer-note">{{ artwork.note }}</p>

        <section class="drawer-membership">
          <h3>当前所属展览</h3>
          <ul v-if="memberExhibitions.length">
            <li v-for="exhibition in memberExhibitions" :key="exhibition.id">
              <span>{{ exhibition.title }}</span>
              <em v-if="exhibition.id === selectedExhibitId">当前查看</em>
            </li>
          </ul>
          <p v-else class="drawer-empty">尚未编入任何展览。</p>
        </section>

        <footer class="drawer-actions">
          <template v-if="currentExhibition">
            <button
              v-if="!isInCurrent"
              type="button"
              class="drawer-add"
              :aria-busy="pending"
              @click="emit('add', artwork.id)"
            >
              {{ pending ? '处理中…' : `加入「${currentExhibition.title}」` }}
            </button>
            <button
              v-else
              type="button"
              class="drawer-remove"
              :aria-busy="pending"
              @click="emit('remove', artwork.id)"
            >
              {{ pending ? '处理中…' : `从「${currentExhibition.title}」移出` }}
            </button>
          </template>
          <button type="button" class="drawer-done" @click="notifyClose">关闭</button>
        </footer>
      </aside>
    </div>
  </Teleport>
</template>
