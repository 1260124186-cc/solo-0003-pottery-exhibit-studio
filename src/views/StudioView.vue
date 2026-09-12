<script setup lang='ts'>
import { useExhibitionFlow } from '../composables/useExhibitionFlow';
import StudioHeader from '../components/StudioHeader.vue';
import ExhibitionRail from '../components/ExhibitionRail.vue';
import ExhibitionCanvas from '../components/ExhibitionCanvas.vue';

// 页面层只负责组合：状态与动作全部来自 useExhibitionFlow，
// 通过 props 下发、events 回收，子组件不直接触碰 service。
const {
  state,
  selectedId,
  current,
  newTitle,
  notice,
  select,
  createDraft,
  releaseCurrent,
  toggleArtwork,
} = useExhibitionFlow();
</script>

<template>
  <div class='studio'>
    <StudioHeader :exhibition-count='state.exhibitions.length' :artwork-count='state.artworks.length' />
    <main>
      <ExhibitionRail
        :exhibitions='state.exhibitions'
        :selected-id='selectedId'
        :current='current'
        v-model:new-title='newTitle'
        @select='select'
        @create='createDraft'
      />
      <ExhibitionCanvas
        v-if='current'
        :current='current'
        :artworks='state.artworks'
        :notice='notice'
        @release='releaseCurrent'
        @toggle='toggleArtwork'
      />
    </main>
  </div>
</template>
