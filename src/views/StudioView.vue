<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useExhibitionFlow } from '../composables/useExhibitionFlow';
import type { Exhibition } from '../domain/models';

const { state, create, release, togglePiece, updateInfo } = useExhibitionFlow();

const selected = ref(state.value.exhibitions[0]?.id || '');
const current = computed(() => state.value.exhibitions.find((x) => x.id === selected.value));

const notice = ref('');
const noticeError = ref(false);
function flash(msg: string, error = false) {
  notice.value = msg;
  noticeError.value = error;
}

const newTitle = ref('');
function add() {
  try {
    const e = create(newTitle.value);
    selected.value = e.id;
    newTitle.value = '';
    flash('已创建展览草稿');
  } catch (e: any) {
    flash(e.message, true);
  }
}
function pub() {
  const e = current.value;
  if (!e) return;
  if (e.status === '已上线') {
    flash('该展览已上线，信息修改请使用“编辑展览信息”');
    return;
  }
  try {
    release(e.id);
    flash('展览已上线，导览与分享已同步展示当前信息');
  } catch (e: any) {
    flash(e.message, true);
  }
}

/* ---- 编辑展览信息（副标题 / 策展人 / 开放日期 / 结束日期 / 说明） ---- */
const editing = ref(false);
const form = ref({ subtitle: '', curator: '', opening: '', closing: '', description: '' });

function startEdit() {
  const e = current.value;
  if (!e) return;
  form.value = {
    subtitle: e.subtitle,
    curator: e.curator,
    opening: e.opening,
    closing: e.closing,
    description: e.description
  };
  editing.value = true;
  flash('');
}
function cancelEdit() {
  editing.value = false;
  flash('');
}
function saveInfo() {
  const e = current.value;
  if (!e) return;
  try {
    updateInfo(e.id, { ...form.value });
    editing.value = false;
    flash(e.status === '已上线' ? '展览信息已保存，已立即同步至导览与分享' : '展览信息已保存');
  } catch (err: any) {
    // 明确提示原因；输入内容保留，未写入任何字段
    flash('保存失败：' + err.message, true);
  }
}
watch(selected, () => {
  editing.value = false;
  notice.value = '';
});

/* ---- 视图切换：策展工作面 / 观众导览（四处展示同源） ---- */
const view = ref<'studio' | 'guide'>(location.hash === '#/guide' ? 'guide' : 'studio');
function setView(v: 'studio' | 'guide') {
  view.value = v;
  history.replaceState(null, '', v === 'guide' ? '#/guide' : '#/studio');
}
window.addEventListener('hashchange', () => {
  view.value = location.hash === '#/guide' ? 'guide' : 'studio';
});

const published = computed(() => state.value.exhibitions.filter((e) => e.status === '已上线'));
function artTitle(id: string) {
  return state.value.artworks.find((a) => a.id === id)?.title ?? id;
}

/* ---- 分享：信息同样取自唯一数据源 ---- */
const shareTarget = ref<Exhibition | null>(null);
const shareUrl = computed(() => `${location.origin}${location.pathname}#/guide`);
const copied = ref(false);
function share(e: Exhibition) {
  shareTarget.value = e;
}
function closeShare() {
  shareTarget.value = null;
}
function pickLink(event: Event) {
  (event.target as HTMLInputElement).select();
}
async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareUrl.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    flash('复制失败，请手动选择链接复制', true);
  }
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
      <div class="header-side">
        <nav class="view-switch">
          <button :class="{ on: view === 'studio' }" @click="setView('studio')">策展工作面</button>
          <button :class="{ on: view === 'guide' }" @click="setView('guide')">观众导览</button>
        </nav>
        <div class="header-note">{{ state.exhibitions.length }} 场展览 · {{ state.artworks.length }} 件作品</div>
      </div>
    </header>

    <!-- 策展工作面：列表 + 详情 -->
    <main v-if="view === 'studio'">
      <section class="rail">
        <div class="new-box">
          <input v-model="newTitle" placeholder="新展览名称" @keyup.enter="add">
          <button @click="add">创建草稿</button>
        </div>
        <div v-for="e in state.exhibitions" :key="e.id" class="exhibit-row"
          :class="{ active: e.id === selected }" @click="selected = e.id">
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
          <div class="top-actions">
            <button class="ghost" @click="startEdit">编辑展览信息</button>
            <button class="release" :disabled="current.status === '已上线'" @click="pub">
              {{ current.status === '已上线' ? '已上线' : '上线展览' }}
            </button>
          </div>
        </div>
        <div class="meta">
          <span>策展人 · {{ current.curator }}</span>
          <span>{{ current.opening }} — {{ current.closing }}</span>
          <span class="status">{{ current.status }}</span>
          <button class="link" v-if="current.status === '已上线'" @click="share(current)">分享</button>
        </div>

        <form v-if="editing" class="edit-panel" @submit.prevent="saveInfo">
          <h4>编辑展览信息</h4>
          <p class="edit-warn" v-if="current.status === '已上线'">
            该展览已上线：保存后修改将立即对观众可见，导览与分享同步更新，不产生待发布版本。
          </p>
          <label>副标题
            <input v-model="form.subtitle" required placeholder="展览副标题">
          </label>
          <label>策展人
            <input v-model="form.curator" required placeholder="策展人署名">
          </label>
          <div class="date-row">
            <label>开放日期
              <input v-model="form.opening" type="date" required>
            </label>
            <label>结束日期
              <input v-model="form.closing" type="date" required>
            </label>
          </div>
          <label>说明
            <textarea v-model="form.description" required rows="3" placeholder="展览说明"></textarea>
          </label>
          <div class="edit-actions">
            <button type="button" class="ghost" @click="cancelEdit">取消</button>
            <button type="submit" class="release">保存</button>
          </div>
        </form>

        <div class="piece-grid">
          <div class="piece" v-for="a in state.artworks" :key="a.id"
            :class="{ chosen: current.pieces.includes(a.id) }" @click="togglePiece(current.id, a.id)">
            <div class="piece-art" :style="{ background: a.tone }"><span>{{ a.year }}</span></div>
            <div>
              <h3>{{ a.title }}</h3>
              <p>{{ a.artist }} · {{ a.material }}</p>
              <small>{{ a.note }}</small>
            </div>
            <button>{{ current.pieces.includes(a.id) ? '已编排' : '加入展览' }}</button>
          </div>
        </div>
      </section>
    </main>

    <!-- 观众导览：只展示已上线展览，字段与策展工作面同源 -->
    <main v-else class="guide">
      <div class="guide-head">
        <p class="eyebrow">VISITOR GUIDE</p>
        <h2>当前导览</h2>
        <p class="intro">仅展示已上线展览；信息与策展工作面同源，策展人保存后立即更新。</p>
      </div>
      <div v-if="!published.length" class="guide-empty">暂无已上线展览。</div>
      <article v-for="e in published" :key="e.id" class="guide-card">
        <div class="guide-card-head">
          <div>
            <h3>{{ e.title }}</h3>
            <p class="guide-sub">{{ e.subtitle }}</p>
          </div>
          <button class="ghost" @click="share(e)">分享</button>
        </div>
        <div class="meta">
          <span>策展人 · {{ e.curator }}</span>
          <span>{{ e.opening }} — {{ e.closing }}</span>
        </div>
        <p class="guide-desc">{{ e.description }}</p>
        <ul class="guide-pieces">
          <li v-for="id in e.pieces" :key="id">{{ artTitle(id) }}</li>
        </ul>
      </article>
    </main>

    <!-- 分享弹层：只读唯一数据源 -->
    <div v-if="shareTarget" class="modal-mask" @click.self="closeShare">
      <div class="modal" role="dialog" aria-modal="true">
        <h3>{{ shareTarget.title }}</h3>
        <p class="guide-sub">{{ shareTarget.subtitle }}</p>
        <p class="share-line">策展人 · {{ shareTarget.curator }}</p>
        <p class="share-line">{{ shareTarget.opening }} — {{ shareTarget.closing }}</p>
        <p class="guide-desc">{{ shareTarget.description }}</p>
        <div class="share-link">
          <input readonly :value="shareUrl" @focus="pickLink">
          <button class="release" @click="copyLink">{{ copied ? '已复制' : '复制链接' }}</button>
        </div>
        <button class="ghost" @click="closeShare">关闭</button>
      </div>
    </div>

    <div class="notice" :class="{ error: noticeError }" v-if="notice">{{ notice }}</div>
  </div>
</template>
