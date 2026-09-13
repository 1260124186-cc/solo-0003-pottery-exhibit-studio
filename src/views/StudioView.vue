<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useExhibitionFlow } from '../composables/useExhibitionFlow';
import ArtworkDrawer from '../components/ArtworkDrawer.vue';
import type { Artwork } from '../domain/models';

const { state, create, release, addPiece, removePiece } = useExhibitionFlow();

const selected = ref<string>(state.value.exhibitions[0]?.id ?? '');
const notice = ref('');
const newTitle = ref('');

// 抽屉里查看的作品；为 null 时抽屉关闭。关闭抽屉不会改动 selected，列表选择状态得以保留
const drawerArtworkId = ref<string | null>(null);

/**
 * 每个 (展览, 作品) 维度维护「最后一次意图」和一个串行泵：
 * 快速连点加入/移出时，每次点击都覆盖意图，泵按点击顺序把动作送进
 * 服务层队列并等待落盘；等待期间到达的新意图会继续执行，不丢点击。
 */
const intent = new Map<string, 'add' | 'remove'>();
const pumping = reactive<Record<string, boolean>>({});

function pendingKey(exhibitId: string, artworkId: string) {
  return `${exhibitId}:${artworkId}`;
}

const current = computed(
  () => state.value.exhibitions.find((item) => item.id === selected.value) ?? null,
);

const drawerArtwork = computed<Artwork | null>(
  () =>
    state.value.artworks.find((item) => item.id === drawerArtworkId.value) ?? null,
);

const drawerPending = computed(() => {
  if (!drawerArtworkId.value) return false;
  return !!pumping[pendingKey(selected.value, drawerArtworkId.value)];
});

function isChosen(artworkId: string) {
  return !!current.value?.pieces.includes(artworkId);
}

async function add() {
  try {
    const exhibition = await create(newTitle.value);
    selected.value = exhibition.id;
    newTitle.value = '';
    notice.value = '已创建展览草稿';
  } catch (err) {
    notice.value = (err as Error).message;
  }
}

async function publish() {
  if (!current.value) return;
  try {
    await release(current.value.id);
    notice.value = '展览已上线';
  } catch (err) {
    notice.value = (err as Error).message;
  }
}

/**
 * 加入 / 移出是两条幂等的显式动作（不再用 toggle 语义）。
 * 每次点击都无条件登记为「最后意图」，由每 (展览, 作品) 一条的收敛泵
 * 按点击顺序送进服务层串行队列；不在此处同步读取编排状态做预判——
 * 否则快速反转点击（如抽屉移出、列表立即加入）会被误判为冗余而丢弃。
 * 服务动作本身幂等，收敛循环即使多执行一次也是安全的。
 */
function changeMembership(
  artworkId: string,
  action: 'add' | 'remove',
  explicit: boolean,
) {
  const exhibitId = selected.value;
  if (!exhibitId) return;
  const key = pendingKey(exhibitId, artworkId);
  intent.set(key, action);
  if (pumping[key]) return;

  pumping[key] = true;
  void (async () => {
    try {
      // 收敛循环：每轮把作品置为「最后一次点击」想要的样子。
      // 服务动作幂等，因此每次点击都无条件登记意图：
      // 即使点击时状态看起来已一致（可能是第一次动作尚未落盘的反转点击），
      // 也要在 await 落盘后重新对齐，保证最后一次点击必胜。
      while (intent.has(key)) {
        const wanted = intent.get(key)!;
        const included = !!current.value?.pieces.includes(artworkId);
        if ((wanted === 'add') === included) {
          intent.delete(key);
          break;
        }
        const run = wanted === 'add' ? addPiece : removePiece;
        await run(exhibitId, artworkId);
        // CAS：只有在没有更新的点击覆盖意图时才清除；
        // await 落盘期间到达的新意图由下一轮继续处理
        if (intent.get(key) === wanted) intent.delete(key);
        if (explicit) {
          notice.value = wanted === 'add' ? '作品已加入展览' : '作品已移出展览';
        }
      }
    } catch (err) {
      intent.delete(key);
      notice.value = (err as Error).message;
    } finally {
      pumping[key] = false;
    }
  })();
}

function openDrawer(artworkId: string) {
  drawerArtworkId.value = artworkId;
}

function closeDrawer() {
  drawerArtworkId.value = null;
}

function onCardKeydown(event: KeyboardEvent, artworkId: string) {
  if (event.target !== event.currentTarget) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openDrawer(artworkId);
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
      <div class="header-note">
        {{ state.exhibitions.length }} 场展览 · {{ state.artworks.length }} 件作品
      </div>
    </header>

    <main>
      <section class="rail">
        <div class="new-box">
          <input v-model="newTitle" placeholder="新展览名称" @keyup.enter="add" />
          <button type="button" @click="add">创建草稿</button>
        </div>
        <div
          v-for="exhibition in state.exhibitions"
          :key="exhibition.id"
          class="exhibit-row"
          :class="{ active: exhibition.id === selected }"
          @click="selected = exhibition.id"
        >
          <div>
            <span>{{ exhibition.status }}</span>
            <h3>{{ exhibition.title }}</h3>
            <p>{{ exhibition.subtitle }}</p>
          </div>
          <b>{{ exhibition.pieces.length }} 件</b>
        </div>
      </section>

      <section v-if="current" class="canvas">
        <div class="canvas-top">
          <div>
            <p class="eyebrow">策展工作面</p>
            <h2>{{ current.title }}</h2>
            <p>{{ current.description }}</p>
          </div>
          <button type="button" class="release" @click="publish">上线展览</button>
        </div>
        <div class="meta">
          <span>策展人 · {{ current.curator }}</span>
          <span>{{ current.opening }} — {{ current.closing }}</span>
          <span class="status">{{ current.status }}</span>
        </div>

        <div class="piece-grid">
          <div
            v-for="artwork in state.artworks"
            :key="artwork.id"
            class="piece"
            :class="{ chosen: isChosen(artwork.id) }"
          >
            <div
              class="piece-body"
              role="button"
              tabindex="0"
              :aria-label="`查看作品详情：${artwork.title}`"
              :aria-expanded="drawerArtworkId === artwork.id"
              @click="openDrawer(artwork.id)"
              @keydown="onCardKeydown($event, artwork.id)"
            >
              <div class="piece-art" :style="{ background: artwork.tone }">
                <span>{{ artwork.year }}</span>
              </div>
              <div class="piece-text">
                <h3>{{ artwork.title }}</h3>
                <p>{{ artwork.artist }} · {{ artwork.material }}</p>
                <small>{{ artwork.note }}</small>
              </div>
            </div>
            <div class="piece-footer">
              <button
                type="button"
                class="piece-toggle"
                :aria-busy="!!pumping[pendingKey(current.id, artwork.id)]"
                @click.stop="
                  changeMembership(
                    artwork.id,
                    isChosen(artwork.id) ? 'remove' : 'add',
                    true,
                  )
                "
              >
                <template v-if="pumping[pendingKey(current.id, artwork.id)]">
                  处理中…
                </template>
                <template v-else>
                  {{ isChosen(artwork.id) ? '移出展览' : '加入展览' }}
                </template>
              </button>
              <span
                v-if="isChosen(artwork.id)"
                class="piece-badge"
                aria-label="已编入当前展览"
                >● 已编入</span
              >
            </div>
          </div>
        </div>

        <div v-if="notice" class="notice" role="status">{{ notice }}</div>
      </section>
    </main>

    <ArtworkDrawer
      v-if="drawerArtwork"
      :artwork="drawerArtwork"
      :exhibitions="state.exhibitions"
      :selected-exhibit-id="selected"
      :pending="drawerPending"
      @close="closeDrawer"
      @add="(id) => changeMembership(id, 'add', true)"
      @remove="(id) => changeMembership(id, 'remove', true)"
    />
  </div>
</template>
