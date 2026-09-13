<script setup lang="ts">
import {computed, ref} from 'vue';
import {useExhibitionFlow} from '../composables/useExhibitionFlow';
import {usePieceBrowser, type PieceSortMode} from '../composables/usePieceBrowser';

const {state, create, release, togglePiece} = useExhibitionFlow();

const selected = ref<string>(state.value.exhibitions[0]?.id ?? '');
const current = computed(() =>
  state.value.exhibitions.find((e) => e.id === selected.value),
);

const notice = ref('');
const newTitle = ref('');

function add() {
  try {
    const e = create(newTitle.value);
    selected.value = e.id;
    newTitle.value = '';
    notice.value = '已创建展览草稿';
  } catch (err: any) {
    notice.value = err.message;
  }
}

function pub() {
  try {
    release(selected.value);
    notice.value = '展览已上线';
  } catch (err: any) {
    notice.value = err.message;
  }
}

// 排序与筛选是工作面层面的视图状态：切换展览时保持生效，清除后恢复全部作品。
const sortMode = ref<PieceSortMode>('default');
const artistFilter = ref('');
const {artists, isFiltering, visiblePieces} = usePieceBrowser(
  computed(() => state.value.artworks),
  sortMode,
  artistFilter,
);

function resetBrowser() {
  sortMode.value = 'default';
  artistFilter.value = '';
}
</script>

<template>
  <div class="studio">
    <header>
      <div>
        <p class="eyebrow">CLAY / CURATION LAB</p>
        <h1>陶艺展览策划台</h1>
        <p class="intro">把每件作品放进属于它的光线与距离里。</p>
      </div>
      <div class="header-note">
        {{ state.exhibitions.length }} 场展览 · {{ state.artworks.length }} 件作品
      </div>
    </header>
    <main>
      <section class="rail">
        <div class="new-box">
          <input v-model="newTitle" placeholder="新展览名称" @keyup.enter="add" />
          <button @click="add">创建草稿</button>
        </div>
        <div
          v-for="e in state.exhibitions"
          :key="e.id"
          class="exhibit-row"
          :class="{ active: e.id === selected }"
          @click="selected = e.id"
        >
          <div>
            <span>{{ e.status }}</span>
            <h3>{{ e.title }}</h3>
            <p>{{ e.subtitle }}</p>
          </div>
          <b>{{ e.pieces.length }} 件</b>
        </div>
      </section>
      <section class="canvas" v-if="current">
        <div class="canvas-top">
          <div>
            <p class="eyebrow">策展工作面</p>
            <h2>{{ current.title }}</h2>
            <p>{{ current.description }}</p>
          </div>
          <button class="release" @click="pub">上线展览</button>
        </div>
        <div class="meta">
          <span>策展人 · {{ current.curator }}</span>
          <span>{{ current.opening }} — {{ current.closing }}</span>
          <span class="status">{{ current.status }}</span>
        </div>

        <div class="browser-controls">
          <label class="control">
            <span>排序</span>
            <select v-model="sortMode">
              <option value="default">按编排顺序</option>
              <option value="year-desc">年份从新到旧</option>
              <option value="year-asc">年份从旧到新</option>
            </select>
          </label>
          <label class="control">
            <span>作者</span>
            <select v-model="artistFilter">
              <option value="">全部作者</option>
              <option v-for="name in artists" :key="name" :value="name">
                {{ name }}
              </option>
            </select>
          </label>
          <button
            class="clear"
            type="button"
            :disabled="!isFiltering"
            @click="resetBrowser"
          >
            清除筛选与排序
          </button>
          <span class="result-count">显示 {{ visiblePieces.length }} / {{ state.artworks.length }} 件</span>
        </div>

        <div class="piece-grid" v-if="visiblePieces.length">
          <div
            v-for="a in visiblePieces"
            :key="a.id"
            class="piece"
            :class="{ chosen: current.pieces.includes(a.id) }"
            @click="togglePiece(current.id, a.id)"
          >
            <div class="piece-art" :style="{ background: a.tone }">
              <span>{{ a.year }}</span>
            </div>
            <div>
              <h3>{{ a.title }}</h3>
              <p>{{ a.artist }} · {{ a.material }}</p>
              <small>{{ a.note }}</small>
            </div>
            <button @click.stop="togglePiece(current.id, a.id)">
              {{ current.pieces.includes(a.id) ? '已编排' : '加入展览' }}
            </button>
          </div>
        </div>
        <div class="empty-state" v-else>
          <p>当前筛选下没有作品</p>
          <small v-if="artistFilter">作者「{{ artistFilter }}」暂无作品，请尝试切换作者或清除筛选。</small>
          <button type="button" @click="resetBrowser">清除筛选与排序</button>
        </div>

        <div class="notice" v-if="notice">{{ notice }}</div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.browser-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
  margin-top: 22px;
  padding: 16px;
  background: #f8f4ee;
  border: 1px solid #e0d8cc;
}

.control {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: #82786d;
}

.control select {
  min-width: 150px;
  padding: 9px 10px;
  background: #fff;
  border: 1px solid #b8aea3;
  border-radius: 4px;
  color: #292725;
  font: inherit;
  cursor: pointer;
}

.clear {
  border: 1px solid #b8aea3;
  background: transparent;
  color: #5c544b;
  padding: 9px 14px;
  border-radius: 4px;
  cursor: pointer;
}

.clear:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.result-count {
  font-size: 12px;
  color: #91867b;
}

.release {
  border: 0;
  background: #2e3934;
  color: #fff;
  padding: 12px 16px;
  cursor: pointer;
}

.empty-state {
  margin-top: 30px;
  padding: 48px 20px;
  text-align: center;
  background: #f8f4ee;
  border: 1px dashed #c4baad;
}

.empty-state p {
  margin: 0 0 8px;
  font-size: 17px;
  color: #5c544b;
}

.empty-state small {
  display: block;
  color: #91867b;
  margin-bottom: 18px;
}

.empty-state button {
  border: 1px solid #b8aea3;
  background: #fff;
  color: #5c544b;
  padding: 9px 16px;
  border-radius: 4px;
  cursor: pointer;
}

@media (max-width: 800px) {
  .browser-controls {
    flex-direction: column;
    align-items: stretch;
  }

  .control select,
  .clear,
  .empty-state button {
    width: 100%;
    min-height: 44px;
  }

  .result-count {
    text-align: center;
  }
}
</style>
