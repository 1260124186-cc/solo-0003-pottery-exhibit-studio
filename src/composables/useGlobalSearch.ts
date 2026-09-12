import { ref, watch } from 'vue'
import {
  normalizeKeyword,
  searchAll,
  type SearchResults,
} from '../domain/search'
import { useExhibitService } from '../services/exhibitService'

/**
 * 搜索状态机：
 * - idle    未输入有效关键词（归一化后为空），展示输入提示；
 * - pending 已输入、搜索执行中（含防抖等待与在途请求），旧结果降透明度保留；
 * - ready   最近一次搜索的结果已生效（可能为空，展示空结果状态）。
 */
export type SearchPhase = 'idle' | 'pending' | 'ready'

export interface GlobalSearchOptions {
  /** 输入防抖毫秒数，默认 200；submit() 会跳过防抖立即执行。 */
  debounceMs?: number
  /**
   * 搜索执行器，入参为归一化后的关键词，异步返回结果。
   * 默认在微任务中对当前本地数据执行纯函数 searchAll（只读）；
   * 测试可注入可控延迟的执行器来验证竞态处理。
   */
  executor?: (keyword: string) => Promise<SearchResults>
}

function emptyResults(): SearchResults {
  return { exhibitions: [], artworks: [] }
}

export function useGlobalSearch(options: GlobalSearchOptions = {}) {
  const debounceMs = options.debounceMs ?? 200
  const { state } = useExhibitService()
  const executor =
    options.executor ??
    ((kw: string) =>
      Promise.resolve().then(() =>
        searchAll(state.value.exhibitions, state.value.artworks, kw),
      ))

  /** 输入框原始内容（未归一化）。 */
  const keyword = ref('')
  /** 产生当前结果的归一化关键词，用于结果区标题与空结果提示。 */
  const appliedKeyword = ref('')
  const results = ref<SearchResults>(emptyResults())
  const phase = ref<SearchPhase>('idle')

  // 单调递增的请求序号：每次发起/作废搜索都递增，结果返回时序号
  // 已过期（不等于当前值）则直接丢弃，保证旧结果永远不会覆盖新结果。
  let ticket = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  // 最近一次发出的搜索（归一化关键词 + 其序号）：watch 回调晚于 submit
  // 触发时，据此识别“同一关键词的搜索已在途/已生效”，避免误作废自己。
  let lastIssuedKw = ''
  let lastIssuedTicket = -1

  function cancelTimer() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  async function run(raw: string) {
    const kw = normalizeKeyword(raw)
    const my = ++ticket
    if (!kw) {
      // 未输入有效关键词：立即复位，不调用执行器。
      lastIssuedKw = ''
      lastIssuedTicket = -1
      results.value = emptyResults()
      appliedKeyword.value = ''
      phase.value = 'idle'
      return
    }
    lastIssuedKw = kw
    lastIssuedTicket = my
    phase.value = 'pending'
    try {
      const found = await executor(kw)
      if (my !== ticket) return // 已有更新的搜索，丢弃过期结果
      results.value = found
      appliedKeyword.value = kw
      phase.value = 'ready'
    } catch {
      if (my !== ticket) return
      results.value = emptyResults()
      appliedKeyword.value = kw
      phase.value = 'ready'
    }
  }

  // 输入即搜索（防抖）：每次击键先作废旧的在途搜索，避免其结果晚到覆盖。
  watch(keyword, (raw) => {
    cancelTimer()
    const kw = normalizeKeyword(raw)
    if (!kw) {
      void run(raw)
      return
    }
    // 同一归一化关键词的搜索仍有效（通常由 submit 刚发出）：无需重复调度。
    // 归一化相同意味着结果必然相同，跳过不影响正确性。
    if (kw === lastIssuedKw && lastIssuedTicket === ticket) return
    ticket++
    phase.value = 'pending'
    timer = setTimeout(() => {
      timer = null
      void run(raw)
    }, debounceMs)
  })

  /** 提交搜索：取消防抖、立即执行当前输入。 */
  function submit() {
    cancelTimer()
    void run(keyword.value)
  }

  /** 清空关键词并复位到未输入状态。 */
  function clear() {
    cancelTimer()
    if (keyword.value === '') {
      void run('') // 已是空串时 watch 不会触发，手动复位
    } else {
      keyword.value = '' // 触发 watch 复位
    }
  }

  return { keyword, appliedKeyword, results, phase, submit, clear }
}
