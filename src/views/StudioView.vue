<script setup lang="ts">
import { ref, computed } from 'vue';
import { useExhibitionFlow } from '../composables/useExhibitionFlow';
import { evaluateCompletion } from '../domain/completion';
import type { Exhibition } from '../domain/models';

const { state, create, release, togglePiece, patch } = useExhibitionFlow();
const selected = ref<string>(state.value.exhibitions[0]?.id || '');
const current = computed<Exhibition | undefined>(() =>
  state.value.exhibitions.find((x) => x.id === selected.value),
);
const isOnline = computed(() => current.value?.status === '已上线');

// 完成度面板与上线动作共用 evaluateCompletion，结论永远一致
const completion = computed(() =>
  current.value ? evaluateCompletion(current.value) : null,
);

interface Feedback {
  type: 'success' | 'error';
  lines: string[];
}
const feedback = ref<Feedback | null>(null);

const newTitle = ref('');

function add() {
  try {
    const e = create(newTitle.value);
    selected.value = e.id;
    newTitle.value = '';
    feedback.value = { type: 'success', lines: ['已创建展览草稿'] };
  } catch (err: any) {
    feedback.value = { type: 'error', lines: [err.message] };
  }
}

function pub() {
  if (!current.value) return;
  try {
    release(current.value.id);
    feedback.value = { type: 'success', lines: ['校验通过，展览已上线；列表与本地存储已同步'] };
  } catch (err: any) {
    // 逐项列出具体缺什么，且状态保持原样（服务层未做任何部分修改）
    feedback.value = {
      type: 'error',
      lines: ['上线失败，以下必要信息未满足：', ...err.message.split('；')],
    };
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
          :class='{ active: e.id === selected, online: e.status === "已上线" }'
          @click='selected = e.id'
        >
          <div>
            <span class='row-status'>{{ e.status }}</span>
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
          <button class='release' :disabled='isOnline' @click='pub'>
            {{ isOnline ? '已上线' : '上线展览' }}
          </button>
        </div>

        <div class='meta'>
          <span>策展人 · {{ current.curator }}</span>
          <span>{{ current.opening }} — {{ current.closing }}</span>
          <span class='status'>{{ current.status }}</span>
          <span v-if='isOnline' class='locked-hint'>已锁定，导览与分享内容保持稳定</span>
        </div>

        <!-- 完成度面板：判定规则与上线校验同源 -->
        <div class='completion' v-if='completion'>
          <div class='completion-head'>
            <span class='eyebrow'>必要信息完成度</span>
            <strong :class='completion.ok ? "ok" : "bad"'>{{ completion.percent }}%</strong>
          </div>
          <ul>
            <li v-for='item in completion.items' :key='item.key' :class='item.ok ? "ok" : "bad"'>
              <span>{{ item.ok ? '✓' : '!' }}</span>{{ item.label }}
              <em v-if='!item.ok'>{{ item.reason }}</em>
            </li>
          </ul>
        </div>

        <!-- 基础信息编辑：上线后锁定 -->
        <fieldset class='basics' :disabled='isOnline'>
          <legend class='eyebrow'>展览基础信息</legend>
          <label>标题<input :value='current.title' @input='patch(current.id, { title: ($event.target as HTMLInputElement).value })'></label>
          <label>副标题<input :value='current.subtitle' @input='patch(current.id, { subtitle: ($event.target as HTMLInputElement).value })'></label>
          <label>策展人<input :value='current.curator' @input='patch(current.id, { curator: ($event.target as HTMLInputElement).value })'></label>
          <label>开放日期<input type='date' :value='current.opening' @input='patch(current.id, { opening: ($event.target as HTMLInputElement).value })'></label>
          <label>结束日期<input type='date' :value='current.closing' @input='patch(current.id, { closing: ($event.target as HTMLInputElement).value })'></label>
          <label class='wide'>展览说明<textarea :value='current.description' @input='patch(current.id, { description: ($event.target as HTMLTextAreaElement).value })'></textarea></label>
        </fieldset>

        <div class='piece-grid'>
          <div
            class='piece'
            v-for='a in state.artworks'
            :key='a.id'
            :class='{ chosen: current.pieces.includes(a.id) }'
            @click='!isOnline && togglePiece(current.id, a.id)'
          >
            <div class='piece-art' :style='{ background: a.tone }'><span>{{ a.year }}</span></div>
            <div>
              <h3>{{ a.title }}</h3>
              <p>{{ a.artist }} · {{ a.material }}</p>
              <small>{{ a.note }}</small>
            </div>
            <button :disabled='isOnline'>{{ current.pieces.includes(a.id) ? '已编排' : '加入展览' }}</button>
          </div>
        </div>

        <!-- 成功与失败使用不同样式；失败时逐项列出缺什么 -->
        <div v-if='feedback' class='feedback' :class='feedback.type'>
          <p v-for='(line, i) in feedback.lines' :key='i' :class='{ lead: i === 0 && feedback.type === "error" }'>
            {{ line }}
          </p>
        </div>
      </section>
    </main>
  </div>
</template>
