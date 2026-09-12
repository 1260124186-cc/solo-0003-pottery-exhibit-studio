<script setup lang='ts'>
// 右下角提示条：展示最近一次操作的结果或失败原因
defineProps<{
  notice: string;
}>();
</script>

<template>
  <div class='notice' v-if='notice'>{{ notice }}</div>
</template>
