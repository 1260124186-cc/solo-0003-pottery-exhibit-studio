<script setup lang='ts'>
import {ref, computed, watch} from 'vue';
import {useExhibitionFlow} from '../composables/useExhibitionFlow';
import type {Exhibition} from '../domain/models';
import {
  nextStatus,
  prevStatus,
  completionChecklist,
  isReady,
  missingConditions,
} from '../domain/flow';

const {
  state,
  create,
  transition,
  rollback,
  togglePiece,
  updateInfo,
} = useExhibitionFlow();

const selected = ref<string>(state.value.exhibitions[0]?.id || '');
const current = computed<Exhibition | undefined>(() =>
  state.value.exhibitions.find((x: Exhibition) => x.id === selected.value),
);

const notice = ref('');
const noticeKind = ref<'ok' | 'err'>('ok');
const newTitle = ref('');

// 回退的两步确认状态：仅控制面板，不改变展览状态
const rollbackArmed = ref(false);

const checklist = computed(() =>
  current.value ? completionChecklist(current.value) : [],
);
const ready = computed(() => (current.value ? isReady(current.value) : false));
const locked = computed(() => current.value?.status === '已上线');
const forwardTarget = computed(() =>
  current.value ? nextStatus(current.value.status) : null,
);
const backwardTarget = computed(() =>
  current.value ? prevStatus(current.value.status) : null,
);

const forwardLabel: Record<string, string> = {
  '预览中': '提交到预览中',
  '已上线': '上线展览',
};

function sayOk(msg: string) {
  noticeKind.value = 'ok';
  notice.value = msg;
}
function sayErr(msg: string) {
  noticeKind.value = 'err';
  notice.value = msg;
}

watch(selected, () => {
  rollbackArmed.value = false;
  notice.value = '';
});

function add() {
  try {
    const e = create(newTitle.value);
    selected.value = e.id;
    newTitle.value = '';
    sayOk('已创建展览草稿');
  } catch (e: any) {
    sayErr(e.message);
  }
}

function advance() {
  if (!current.value || !forwardTarget.value) return;
  try {
    transition(current.value.id, forwardTarget.value);
    rollbackArmed.value = false;
    sayOk(`状态已更新为「${forwardTarget.value}」`);
  } catch (e: any) {
    sayErr(e.message);
  }
}

// 第一次点击只进入“待确认”，不产生任何状态变化
function requestRollback() {
  if (!current.value || !backwardTarget.value) return;
  if (!rollbackArmed.value) {
    rollbackArmed.value = true;
    return;
  }
  try {
    rollback(current.value.id, true);
    const target = backwardTarget.value;
    rollbackArmed.value = false;
    sayOk(`已确认回退，状态更新为「${target}」`);
  } catch (e: any) {
    rollbackArmed.value = false;
    sayErr(e.message);
  }
}

function choose(artId: string) {
  if (!current.value) return;
  if (locked.value) {
    sayErr('已上线的展览已锁定，如需调整请先回退到预览中');
    return;
  }
  try {
    togglePiece(current.value.id, artId);
  } catch (e: any) {
    sayErr(e.message);
  }
}

type InfoField = 'title' | 'subtitle' | 'curator' | 'opening' | 'closing' | 'description';
function saveField(field: InfoField, e: Event) {
  if (!current.value) return;
  const value = (e.target as HTMLInputElement | HTMLTextAreaElement).value;
  try {
    updateInfo(current.value.id, {[field]: value} as Partial<Exhibition>);
  } catch (err: any) {
    sayErr(err.message);
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
      <div class='header-note'>{{ state.exhibitions.length }} 场展览 · {{ state.artworks.length }} 件作品</div>
    </header>
    <main>
      <section class='rail'>
        <div class='new-box'>
          <input v-model='newTitle' placeholder='新展览名称' @keyup.enter='add'>
          <button @click='add'>创建草稿</button>
        </div>
        <div
          v-for='e in state.exhibitions'
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
      </section>

      <section class='canvas' v-if='current'>
        <div class='canvas-top'>
          <div>
            <p class='eyebrow'>策展工作面</p>
            <h2>{{ current.title }}</h2>
            <p>{{ current.description }}</p>
          </div>
          <span class='status-badge' :class='{ locked }'>{{ current.status }}</span>
        </div>

        <div class='meta'>
          <span>策展人 · {{ current.curator }}</span>
          <span>{{ current.opening }} — {{ current.closing }}</span>
          <span v-if='locked' class='lock-hint'>已上线：作品与信息已锁定，回退后可编辑</span>
        </div>

        <section class='flow-panel'>
          <div class='checklist'>
            <h4>上线校验（进入预览与上线共用同一套条件）</h4>
            <ul>
              <li v-for='item in checklist' :key='item.key' :class='{ ok: item.ok }'>
                <span>{{ item.ok ? '✓' : '○' }}</span>{{ item.label }}
              </li>
            </ul>
            <p v-if='!ready' class='missing'>
              尚未满足：{{ missingConditions(current).join('；') }}
            </p>
          </div>

          <div class='actions'>
            <button
              v-if='forwardTarget'
              class='btn-advance'
              :disabled='!ready'
              :title='ready ? "" : `还需：${missingConditions(current).join("；")}`'
              @click='advance'
            >
              {{ forwardLabel[forwardTarget] }}
            </button>
            <p v-if='forwardTarget && !ready' class='action-hint'>条件未满足，无法前进到「{{ forwardTarget }}」</p>

            <template v-if='backwardTarget'>
              <button
                class='btn-rollback'
                :class='{ armed: rollbackArmed }'
                @click='requestRollback'
              >
                <template v-if='!rollbackArmed'>回退到「{{ backwardTarget }}」</template>
                <template v-else>确认回退到「{{ backwardTarget }}」？再次点击确认</template>
              </button>
              <button v-if='rollbackArmed' class='btn-cancel' @click='rollbackArmed = false'>取消</button>
              <p v-if='rollbackArmed' class='action-hint warn'>回退必须明确确认，取消或离开本展览则不生效</p>
            </template>
          </div>
        </section>

        <section class='info-form'>
          <h4>展览信息</h4>
          <div class='form-grid'>
            <label>标题
              <input :value='current.title' :disabled='locked' @change='saveField("title", $event)'>
            </label>
            <label>副标题
              <input :value='current.subtitle' :disabled='locked' @change='saveField("subtitle", $event)'>
            </label>
            <label>策展人
              <input :value='current.curator' :disabled='locked' @change='saveField("curator", $event)'>
            </label>
            <label>开幕日期
              <input type='date' :value='current.opening' :disabled='locked' @change='saveField("opening", $event)'>
            </label>
            <label>闭幕日期
              <input type='date' :value='current.closing' :disabled='locked' @change='saveField("closing", $event)'>
            </label>
            <label class='wide'>展览说明
              <textarea :value='current.description' :disabled='locked' rows='2' @change='saveField("description", $event)'></textarea>
            </label>
          </div>
        </section>

        <div class='piece-grid'>
          <div
            class='piece'
            v-for='a in state.artworks'
            :key='a.id'
            :class='{ chosen: current.pieces.includes(a.id) }'
            @click='choose(a.id)'
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

        <div class='notice' v-if='notice' :class='noticeKind'>{{ notice }}</div>
      </section>
    </main>
  </div>
</template>
