<script setup lang='ts'>
import type { Artwork, Exhibition } from '../domain/models';
import NoticeToast from './NoticeToast.vue';

// 策展工作面：当前展览信息、上线动作与作品编排网格
defineProps<{
  current: Exhibition;
  artworks: Artwork[];
  notice: string;
}>();

const emit = defineEmits<{
  release: [];
  toggle: [artworkId: string];
}>();
</script>

<template>
  <section class='canvas'>
    <div class='canvas-top'>
      <div>
        <p class='eyebrow'>策展工作面</p>
        <h2>{{ current.title }}</h2>
        <p>{{ current.description }}</p>
      </div>
      <button class='release' @click="emit('release')">上线展览</button>
    </div>
    <div class='meta'>
      <span>策展人 · {{ current.curator }}</span>
      <span>{{ current.opening }} — {{ current.closing }}</span>
      <span class='status'>{{ current.status }}</span>
    </div>
    <div class='piece-grid'>
      <div
        class='piece'
        v-for='a in artworks'
        :key='a.id'
        :class='{ chosen: current.pieces.includes(a.id) }'
        @click="emit('toggle', a.id)"
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
    <NoticeToast :notice='notice' />
  </section>
</template>
