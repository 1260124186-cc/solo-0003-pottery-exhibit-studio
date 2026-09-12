import { beforeEach, describe, expect, it, vi } from 'vitest'

// 与 src/services/exhibitService.ts 内部使用的存储键保持一致
const STORAGE_KEY = 'pottery-exhibit-studio-v1'

// 服务在模块顶层读取 localStorage 并持有模块级单例状态，
// 因此每个用例都先清空存储、再重置模块注册表，最后动态导入，
// 确保用例之间既不共享浏览器存储也不共享内存状态。
async function loadService() {
  vi.resetModules()
  return import('./exhibitService')
}

describe('useExhibitService', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  describe('展览创建', () => {
    it('名称只含空格时不能创建，并抛出错误', async () => {
      const { useExhibitService } = await loadService()
      const { create } = useExhibitService()

      expect(() => create('   ')).toThrow('展览名称不能为空')
      expect(() => create('\t\n ')).toThrow('展览名称不能为空')
    })

    it('正常名称可以创建，且名称会被 trim', async () => {
      const { useExhibitService } = await loadService()
      const { state, create } = useExhibitService()

      const before = state.value.exhibitions.length
      const e = create('  青瓷记 ')

      expect(e.title).toBe('青瓷记')
      expect(state.value.exhibitions).toHaveLength(before + 1)
      expect(state.value.exhibitions[0].id).toBe(e.id)
    })
  })

  describe('作品加入与移出', () => {
    it('同一件作品重复切换不会在 pieces 中产生重复项', async () => {
      const { useExhibitService } = await loadService()
      const { state, create, togglePiece } = useExhibitService()
      const e = create('重复加入测试')

      // 模拟连续编排/取消：a1、a2 加入后反复切换同一作品
      for (const artId of ['a1', 'a2', 'a1', 'a2', 'a3']) {
        togglePiece(e.id, artId)
        const pieces = state.value.exhibitions.find((x: any) => x.id === e.id)!.pieces
        // 任何一步，同一作品 id 至多出现一次
        expect(new Set(pieces).size).toBe(pieces.length)
      }

      const finalPieces = state.value.exhibitions.find((x: any) => x.id === e.id)!.pieces
      expect(finalPieces).toEqual(['a3'])
      // 持久化内容中同样不允许出现重复项
      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      const savedPieces = persisted.exhibitions.find((x: any) => x.id === e.id).pieces
      expect(new Set(savedPieces).size).toBe(savedPieces.length)
    })

    it('移出作品后数量正确，持久化与内存状态一致', async () => {
      const { useExhibitService } = await loadService()
      const { state, create, togglePiece } = useExhibitService()
      const e = create('移出数量测试')
      const piecesOf = () =>
        state.value.exhibitions.find((x: any) => x.id === e.id)!.pieces

      togglePiece(e.id, 'a1')
      togglePiece(e.id, 'a2')
      expect(piecesOf()).toHaveLength(2)

      togglePiece(e.id, 'a1')
      expect(piecesOf()).toHaveLength(1)
      expect(piecesOf()).toEqual(['a2'])

      togglePiece(e.id, 'a2')
      expect(piecesOf()).toHaveLength(0)

      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      expect(persisted.exhibitions.find((x: any) => x.id === e.id).pieces).toEqual([])
    })
  })

  describe('上线校验', () => {
    it('没有编排任何作品时上线被拒绝', async () => {
      const { useExhibitService } = await loadService()
      const { state, create, release } = useExhibitService()
      const e = create('空展览')

      expect(e.pieces).toHaveLength(0)
      expect(() => release(e.id)).toThrow('至少编排一件作品后才能上线')
      expect(state.value.exhibitions.find((x: any) => x.id === e.id)!.status).toBe('草稿')
    })

    it('正常上线后状态变为已上线，并写入本地存储', async () => {
      const { useExhibitService } = await loadService()
      const { state, create, togglePiece, release } = useExhibitService()
      const e = create('可上线展览')
      togglePiece(e.id, 'a1')

      release(e.id)

      expect(state.value.exhibitions.find((x: any) => x.id === e.id)!.status).toBe('已上线')
      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      expect(persisted.exhibitions.find((x: any) => x.id === e.id).status).toBe('已上线')
    })
  })

  describe('本地存储恢复', () => {
    it('localStorage 中的合法 JSON 会在重新加载时恢复为应用状态', async () => {
      const stored = {
        exhibitions: [
          {
            id: 'restored-1',
            title: '从本地恢复的展览',
            subtitle: '',
            curator: '',
            status: '草稿',
            opening: '2025-01-01',
            closing: '2025-02-01',
            pieces: ['a2'],
            description: '',
          },
        ],
        artworks: [],
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))

      const { useExhibitService } = await loadService()
      const { state } = useExhibitService()

      expect(state.value.exhibitions).toHaveLength(1)
      expect(state.value.exhibitions[0]).toMatchObject({
        id: 'restored-1',
        title: '从本地恢复的展览',
        pieces: ['a2'],
      })
    })

    it('localStorage 内容不是合法 JSON 时安全回退到初始数据，而不是崩溃', async () => {
      localStorage.setItem(STORAGE_KEY, '{这不是合法的 JSON')

      // 模块加载本身不应因 JSON.parse 抛出而失败
      const mod = await loadService()
      const { state } = mod.useExhibitService()

      // 回退到 seed 中的初始展览与作品数据
      expect(state.value.exhibitions.length).toBeGreaterThan(0)
      expect(state.value.artworks.length).toBeGreaterThan(0)
    })
  })
})
