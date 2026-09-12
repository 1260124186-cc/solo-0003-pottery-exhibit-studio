<script setup lang='ts'>
import type { Exhibition } from '../domain/models';

// 左侧展览栏：新建草稿输入 + 展览列表选择
const props = defineProps<{
  exhibitions: Exhibition[];
  selectedId: string;
  // 沿用原 StudioView 的渲染行为：每行的状态与标题取自当前选中展览
  current: Exhibition | undefined;
}>();

const newTitle = defineModel<string>('newTitle', { default: '' });

const emit = defineEmits<{
  select: [id: string];
  create: [];
}>();
</script>

<template>
  <section class='rail'>
    <div class='new-box'>
      <input v-model='newTitle' placeholder='新展览名称' @keyup.enter="emit('create')" />
      <button @click="emit('create')">创建草稿</button>
    </div>
    <div
      v-for='e in props.exhibitions'
      :key='e.id'
      class='exhibit-row'
      :class='{ active: e.id === props.selectedId }'
      @click="emit('select', e.id)"
    >
      <div>
        <span>{{ props.current?.status }}</span>
        <h3>{{ props.current?.title }}</h3>
        <p>{{ e.subtitle }}</p>
      </div>
      <b>{{ e.pieces.length }} 件</b>
    </div>
  </section>
</template>
