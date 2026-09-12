import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { SearchResults } from '../domain/search'
import { useExhibitService } from '../services/exhibitService'
import { useGlobalSearch } from './useGlobalSearch'

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

/** 冲刷微任务：fake timers 下不能依赖 flushPromises（其内部定时器可能被冻结）。 */
async function flushMicro() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

/** 可控延迟的执行器：记录调用、按关键词挂起，测试手动决定返回顺序。 */
function controlledExecutor() {
  const calls: string[] = []
  const pending = new Map<string, (r: SearchResults) => void>()
  const executor = vi.fn((kw: string) => {
    calls.push(kw)
    const d = deferred<SearchResults>()
    pending.set(kw, d.resolve)
    return d.promise
  })
  return { calls, pending, executor }
}

const resultsA: SearchResults = {
  exhibitions: [{ item: { id: 'eX' } as never, matchedFields: ['展览名称'] }],
  artworks: [],
}
const resultsB: SearchResults = {
  exhibitions: [],
  artworks: [{ item: { id: 'aX' } as never, matchedFields: ['作者'] }],
}

afterEach(() => {
  vi.useRealTimers()
})

describe('useGlobalSearch 执行时机', () => {
  it('输入后按防抖即时搜索，执行器收到归一化后的关键词', async () => {
    vi.useFakeTimers()
    const executor = vi.fn(() => Promise.resolve(resultsA))
    const s = useGlobalSearch({ executor, debounceMs: 200 })

    s.keyword.value = '  林澄  '
    await nextTick()
    expect(executor).not.toHaveBeenCalled() // 防抖窗口内不执行
    expect(s.phase.value).toBe('pending')

    await vi.advanceTimersByTimeAsync(200)
    expect(executor).toHaveBeenCalledTimes(1)
    expect(executor).toHaveBeenCalledWith('林澄')
    expect(s.phase.value).toBe('ready')
    expect(s.appliedKeyword.value).toBe('林澄')
    expect(s.results.value).toEqual(resultsA)
  })

  it('快速连续输入只执行最后一次搜索', async () => {
    vi.useFakeTimers()
    const executor = vi.fn(() => Promise.resolve(resultsA))
    const s = useGlobalSearch({ executor, debounceMs: 200 })

    s.keyword.value = '林'
    await nextTick()
    await vi.advanceTimersByTimeAsync(100)
    s.keyword.value = '林澄'
    await nextTick()
    await vi.advanceTimersByTimeAsync(100)
    expect(executor).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(100)
    expect(executor).toHaveBeenCalledTimes(1)
    expect(executor).toHaveBeenCalledWith('林澄')
  })

  it('submit 跳过防抖立即执行', async () => {
    vi.useFakeTimers()
    const executor = vi.fn(() => Promise.resolve(resultsA))
    const s = useGlobalSearch({ executor, debounceMs: 200 })

    s.keyword.value = '光'
    await nextTick()
    s.submit()
    expect(executor).toHaveBeenCalledTimes(1)
    expect(executor).toHaveBeenCalledWith('光')
    await flushMicro()
    expect(s.phase.value).toBe('ready')
  })

  it('未输入有效关键词（含纯空白、全角空格）时不执行搜索，保持 idle', async () => {
    const executor = vi.fn(() => Promise.resolve(resultsA))
    const s = useGlobalSearch({ executor })

    for (const kw of ['', '   ', '　']) {
      s.keyword.value = kw
      s.submit()
      await flushPromises()
      expect(executor).not.toHaveBeenCalled()
      expect(s.phase.value).toBe('idle')
      expect(s.appliedKeyword.value).toBe('')
      expect(s.results.value).toEqual({ exhibitions: [], artworks: [] })
    }
  })

  it('清空关键词后立即复位到未输入状态', async () => {
    const executor = vi.fn(() => Promise.resolve(resultsA))
    const s = useGlobalSearch({ executor })

    s.keyword.value = '光'
    s.submit()
    await flushPromises()
    expect(s.phase.value).toBe('ready')

    s.keyword.value = ''
    await nextTick()
    expect(s.phase.value).toBe('idle')
    expect(s.results.value).toEqual({ exhibitions: [], artworks: [] })
    expect(s.appliedKeyword.value).toBe('')
  })
})

describe('useGlobalSearch 竞态处理', () => {
  it('旧搜索的结果晚于新搜索返回时，不得覆盖当前结果', async () => {
    const { pending, executor } = controlledExecutor()
    const s = useGlobalSearch({ executor })

    s.keyword.value = 'aaa'
    s.submit()
    s.keyword.value = 'bbb'
    s.submit()

    // 新结果先返回 → 生效
    pending.get('bbb')!(resultsB)
    await flushPromises()
    expect(s.phase.value).toBe('ready')
    expect(s.results.value).toEqual(resultsB)
    expect(s.appliedKeyword.value).toBe('bbb')

    // 旧结果晚返回 → 必须被丢弃
    pending.get('aaa')!(resultsA)
    await flushPromises()
    expect(s.results.value).toEqual(resultsB)
    expect(s.appliedKeyword.value).toBe('bbb')
    expect(s.phase.value).toBe('ready')
  })

  it('旧搜索先返回时同样被丢弃，不会短暂覆盖为新搜索让位', async () => {
    const { pending, executor } = controlledExecutor()
    const s = useGlobalSearch({ executor })

    s.keyword.value = 'aaa'
    s.submit()
    s.keyword.value = 'bbb'
    s.submit()

    // 旧结果先返回 → 直接丢弃，仍处在新搜索的等待中
    pending.get('aaa')!(resultsA)
    await flushPromises()
    expect(s.results.value).toEqual({ exhibitions: [], artworks: [] })
    expect(s.phase.value).toBe('pending')

    pending.get('bbb')!(resultsB)
    await flushPromises()
    expect(s.results.value).toEqual(resultsB)
    expect(s.phase.value).toBe('ready')
  })

  it('输入变化立即使在途搜索失效，即使新搜索尚未发出', async () => {
    vi.useFakeTimers()
    const { pending, executor } = controlledExecutor()
    const s = useGlobalSearch({ executor, debounceMs: 200 })

    s.keyword.value = 'aaa'
    s.submit() // aaa 在途
    s.keyword.value = 'bbb' // 击键立即作废 aaa，等待防抖
    await nextTick()

    pending.get('aaa')!(resultsA)
    await flushMicro()
    expect(s.results.value).toEqual({ exhibitions: [], artworks: [] })
    expect(s.phase.value).toBe('pending')

    await vi.advanceTimersByTimeAsync(200) // 防抖后发出 bbb
    pending.get('bbb')!(resultsB)
    await flushMicro()
    expect(s.results.value).toEqual(resultsB)
    expect(s.appliedKeyword.value).toBe('bbb')
  })
})

describe('useGlobalSearch 默认执行器（真实数据）', () => {
  it('只读搜索：不修改 state、不写 localStorage', async () => {
    const { state } = useExhibitService()
    const snapshot = JSON.stringify(state.value)

    const s = useGlobalSearch()
    s.keyword.value = '  光  '
    s.submit()
    await flushPromises()

    expect(s.phase.value).toBe('ready')
    expect(s.appliedKeyword.value).toBe('光')
    expect(s.results.value.exhibitions.map((m) => m.item.id)).toEqual(['e2'])
    expect(s.results.value.artworks.map((m) => m.item.id)).toEqual(['a2'])

    expect(JSON.stringify(state.value)).toBe(snapshot)
    expect(localStorage.getItem('pottery-exhibit-studio-v1')).toBeNull()
  })
})
