<script setup lang='ts'>
// 页头：产品标识与展览/作品统计
defineProps<{
  exhibitionCount: number;
  artworkCount: number;
}>();
</script>

<template>
  <header>
    <div>
      <p class='eyebrow'>CLAY / CURATION LAB</p>
      <h1>陶艺展览策划台</h1>
      <p class='intro'>把每件作品放进属于它的光线与距离里。</p>
    </div>
    <div class='header-note'>{{ exhibitionCount }} 场展览 · {{ artworkCount }} 件作品</div>
  </header>
</template>
