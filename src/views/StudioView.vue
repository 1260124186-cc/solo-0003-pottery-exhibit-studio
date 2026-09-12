<script setup lang="ts">
import { computed, ref } from 'vue'
import { useExhibitionFlow } from '../composables/useExhibitionFlow'
import { useGlobalSearch } from '../composables/useGlobalSearch'

const { state, create, release, togglePiece } = useExhibitionFlow()
const selected = ref(state.value.exhibitions[0]?.id || '')
const current = computed(() => state.value.exhibitions.find((x: any) => x.id === selected.value))
const notice = ref('')
const newTitle = ref('')

function add() {
  try {
    const e = create(newTitle.value)
    selected.value = e.id
    newTitle.value = ''
    notice.value = '已创建展览草稿'
  } catch (e: any) {
    notice.value = e.message
  }
}

function pub() {
  try {
    release(selected.value)
    notice.value = '展览已上线'
  } catch (e: any) {
    notice.value = e.message
  }
}

// 全局搜索：只读取数据，不修改 state，也不触碰 selected。
const { keyword, appliedKeyword, results, phase, submit } = useGlobalSearch()
const isEmpty = computed(() => !results.value.exhibitions.length && !results.value.artworks.length)

const canvasEl = ref<HTMLElement | null>(null)
const highlighted = ref('')

// 点击展览结果：用户主动跳转，选中该展览并滚动到策展工作面。
function jumpExhibition(id: string) {
  selected.value = id
  canvasEl.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
}

// 点击作品结果：滚动到作品卡片并短暂高亮，不改变当前选中的展览。
function jumpArtwork(id: string) {
  highlighted.value = id
  document.getElementById('piece-' + id)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
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
      <div class="header-note">{{ state.exhibitions.length }} 场展览 · {{ state.artworks.length }} 件作品</div>
    </header>

    <section class="search">
      <div class="search-box">
        <input
          v-model="keyword"
          placeholder="搜索展览名称、副标题、策展人，或作品标题、作者、材质"
          @keyup.enter="submit"
        >
        <button @click="submit">搜索</button>
      </div>
      <p class="search-hint" v-if="phase === 'idle'">输入关键词即时搜索；搜索只读取数据，不会修改任何内容</p>
      <div v-else class="search-results" :class="{ loading: phase === 'pending' }">
        <p class="search-hint" v-if="phase === 'pending'">搜索中…</p>
        <template v-if="appliedKeyword">
          <p v-if="isEmpty" class="search-empty">未找到与「{{ appliedKeyword }}」匹配的展览或作品</p>
          <div v-else class="result-groups">
            <div class="result-group" v-if="results.exhibitions.length">
              <h3>展览 · {{ results.exhibitions.length }}</h3>
              <div
                v-for="m in results.exhibitions"
                :key="'e' + m.item.id"
                class="result-row"
                @click="jumpExhibition(m.item.id)"
              >
                <div>
                  <h4>{{ m.item.title }}</h4>
                  <p>{{ m.item.subtitle }} · 策展人 {{ m.item.curator }}</p>
                </div>
                <span class="result-fields">匹配：{{ m.matchedFields.join('、') }}</span>
              </div>
            </div>
            <div class="result-group" v-if="results.artworks.length">
              <h3>作品 · {{ results.artworks.length }}</h3>
              <div
                v-for="m in results.artworks"
                :key="'a' + m.item.id"
                class="result-row"
                @click="jumpArtwork(m.item.id)"
              >
                <div>
                  <h4>{{ m.item.title }}</h4>
                  <p>{{ m.item.artist }} · {{ m.item.material }}</p>
                </div>
                <span class="result-fields">匹配：{{ m.matchedFields.join('、') }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>
    </section>

    <main>
      <section class="rail">
        <div class="new-box">
          <input v-model="newTitle" placeholder="新展览名称" @keyup.enter="add">
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
            <span>{{ current?.status }}</span>
            <h3>{{ current?.title }}</h3>
            <p>{{ e.subtitle }}</p>
          </div>
          <b>{{ e.pieces.length }} 件</b>
        </div>
      </section>
      <section class="canvas" v-if="current" ref="canvasEl">
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
        <div class="piece-grid">
          <div
            class="piece"
            v-for="a in state.artworks"
            :key="a.id"
            :id="'piece-' + a.id"
            :class="{ chosen: current.pieces.includes(a.id), flash: highlighted === a.id }"
            @click="togglePiece(current.id, a.id)"
          >
            <div class="piece-art" :style="{ background: a.tone }"><span>{{ a.year }}</span></div>
            <div>
              <h3>{{ a.title }}</h3>
              <p>{{ a.artist }} · {{ a.material }}</p>
              <small>{{ a.note }}</small>
            </div>
            <button>{{ current.pieces.includes(a.id) ? '已编排' : '加入展览' }}</button>
          </div>
        </div>
        <div class="notice" v-if="notice">{{ notice }}</div>
      </section>
    </main>
  </div>
</template>
