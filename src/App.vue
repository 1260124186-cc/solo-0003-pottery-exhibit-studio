<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import StudioView from './views/StudioView.vue';
import ShareView from './views/ShareView.vue';

const hash = ref(window.location.hash || '#/studio');
const onChange = () => { hash.value = window.location.hash || '#/studio'; };
onMounted(() => window.addEventListener('hashchange', onChange));
onUnmounted(() => window.removeEventListener('hashchange', onChange));

const route = computed(() => {
  const m = /^#\/share\/?([^/]*)\/?$/.exec(hash.value);
  if (m) return { name: 'share' as const, id: decodeURIComponent(m[1] || '') };
  return { name: 'studio' as const, id: '' };
});
</script>

<template>
  <ShareView v-if="route.name === 'share'" :route-id="route.id" />
  <StudioView v-else />
</template>
