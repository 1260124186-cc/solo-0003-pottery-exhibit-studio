<script setup lang='ts'>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import StudioView from './views/StudioView.vue';
import PreviewView from './views/PreviewView.vue';

// 轻量 hash 路由：#/preview/<展览id> 进入观众导览预览；刷新后仍停留在预览页。
const previewId = ref<string | null>(null);

function syncRoute() {
  const m = window.location.hash.match(/^#\/preview\/([^/]+)$/);
  previewId.value = m ? decodeURIComponent(m[1]) : null;
}
function backToStudio() {
  // 使用 history 回退，使浏览器返回键行为自然
  if (window.location.hash) window.location.hash = '';
}
function onHash() {
  syncRoute();
}
onMounted(() => {
  syncRoute();
  window.addEventListener('hashchange', onHash);
});
onBeforeUnmount(() => window.removeEventListener('hashchange', onHash));
</script>

<template>
  <PreviewView v-if='previewId' :exhibition-id='previewId' @back='backToStudio' />
  <StudioView v-else />
</template>
