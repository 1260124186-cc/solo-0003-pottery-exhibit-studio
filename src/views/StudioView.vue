<script setup lang="ts">
import { computed, ref } from 'vue';
import { useExhibitionFlow } from '../composables/useExhibitionFlow';
import { useExhibitionList } from '../composables/useExhibitionList';
import { useListFilter } from '../composables/useListFilter';
import { STATUS_FILTERS } from '../domain/listFilter';

const { state, create, release, togglePiece } = useExhibitionFlow();
const { statusFilter, visibleExhibitions, selected } = useExhibitionList();
const { setStatusFilter } = useListFilter();

const current = computed(() =>
  state.value.exhibitions.find((x: { id: string }) => x.id === selected.value),
);

const notice = ref('');
const newTitle = ref('');

function add() {
  try {
    const e = create(newTitle.value);
    // 新建的是草稿：切到“草稿”筛选，保证它在左侧可见并稳定选中，
    // 随后由确定性回退规则（可见列表第一条，新建项 unshift 在最前）选中它。
    setStatusFilter('草稿');
    selected.value = e.id;
    newTitle.value = '';
    notice.value = '已创建展览草稿';
  } catch (e: unknown) {
    notice.value = (e as Error).message;
  }
}

function publish() {
  try {
    release(selected.value);
    notice.value = '展览已上线';
  } catch (e: unknown) {
    notice.value = (e as Error).message;
  }
}
</script>

<template>
  <div class='studio'>
    <header>
      <div>
        <p class='eyebrow'>CLAY / CURATION LAB</p>
        <h1>陶艺展览策划台</h1>
        <p class='intro'>把每件作品放进属于它的光线与距离里。</p>
      </div>
      <div class='header-note'>
        {{ state.exhibitions.length }} 场展览 · {{ state.artworks.length }} 件作品
      </div>
    </header>
    <main>
      <section class='rail'>
        <div class='new-box'>
          <input v-model='newTitle' placeholder='新展览名称' @keyup.enter='add'>
          <button @click='add'>创建草稿</button>
        </div>
        <div class='filter-bar' role='tablist' aria-label='按状态筛选展览'>
          <button
            v-for='f in STATUS_FILTERS'
            :key='f'
            type='button'
            class='filter-tab'
            :class='{ on: f === statusFilter }'
            :aria-pressed='f === statusFilter'
            @click='setStatusFilter(f)'
          >{{ f }}</button>
        </div>
        <div v-if='visibleExhibitions.length'>
          <div
            v-for='e in visibleExhibitions'
            :key='e.id'
            class='exhibit-row'
            :class='{ active: e.id === selected }'
            @click='selected = e.id'
          >
            <div>
              <span>{{ e.status }}</span>
              <h3>{{ e.title }}</h3>
              <p>{{ e.subtitle }}</p>
            </div>
            <b>{{ e.pieces.length }} 件</b>
          </div>
        </div>
        <p v-else class='empty-list'>当前筛选下没有展览。</p>
      </section>
      <section class='canvas' v-if='current'>
        <div class='canvas-top'>
          <div>
            <p class='eyebrow'>策展工作面</p>
            <h2>{{ current.title }}</h2>
            <p>{{ current.description }}</p>
          </div>
          <button class='publish' @click='publish'>上线展览</button>
        </div>
        <div class='meta'>
          <span>策展人 · {{ current.curator }}</span>
          <span>{{ current.opening }} — {{ current.closing }}</span>
          <span class='status'>{{ current.status }}</span>
        </div>
        <div class='piece-grid'>
          <div
            class='piece'
            v-for='a in state.artworks'
            :key='a.id'
            :class='{ chosen: current.pieces.includes(a.id) }'
            @click='togglePiece(current.id, a.id)'
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
        <div class='notice' v-if='notice'>{{ notice }}</div>
      </section>
      <section class='canvas empty-canvas' v-else>
        <p class='eyebrow'>策展工作面</p>
        <p>当前筛选下没有可编辑的展览，请切换筛选项或创建草稿。</p>
      </section>
    </main>
  </div>
</template>
