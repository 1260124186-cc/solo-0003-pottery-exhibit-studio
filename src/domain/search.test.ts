import { describe, expect, it } from 'vitest'
import type { Artwork, Exhibition } from './models'
import { artworks, exhibitions } from './seed'
import { normalizeKeyword, searchAll } from './search'

describe('normalizeKeyword 归一化规则', () => {
  it('去除首尾半角空格', () => {
    expect(normalizeKeyword('  光  ')).toBe('光')
  })

  it('去除首尾全角空格、制表符、换行等 Unicode 空白', () => {
    expect(normalizeKeyword('　光　')).toBe('光')
    expect(normalizeKeyword('\t\n光\r\n')).toBe('光')
  })

  it('中间连续空白折叠为单个半角空格（不删除）', () => {
    expect(normalizeKeyword('soft   ash')).toBe('soft ash')
    expect(normalizeKeyword('soft　 ash')).toBe('soft ash')
    expect(normalizeKeyword('光 的')).toBe('光 的')
    expect(normalizeKeyword('光 的')).not.toBe('光的')
  })

  it('统一小写', () => {
    expect(normalizeKeyword('Clay WORKS')).toBe('clay works')
  })

  it('纯空白归一化为空串', () => {
    expect(normalizeKeyword('')).toBe('')
    expect(normalizeKeyword('   ')).toBe('')
    expect(normalizeKeyword('　')).toBe('')
    expect(normalizeKeyword(' \t\n ')).toBe('')
  })
})

describe('searchAll 按字段搜索', () => {
  it('按展览名称匹配', () => {
    const r = searchAll(exhibitions, artworks, '手的回声')
    expect(r.exhibitions.map((m) => m.item.id)).toEqual(['e1'])
    expect(r.exhibitions[0]!.matchedFields).toEqual(['展览名称'])
    expect(r.artworks).toEqual([])
  })

  it('按副标题匹配', () => {
    const r = searchAll(exhibitions, artworks, '泥土')
    expect(r.exhibitions.map((m) => m.item.id)).toEqual(['e1'])
    expect(r.exhibitions[0]!.matchedFields).toEqual(['副标题'])
  })

  it('按策展人匹配', () => {
    const r = searchAll(exhibitions, artworks, '周宁')
    expect(r.exhibitions.map((m) => m.item.id)).toEqual(['e2'])
    expect(r.exhibitions[0]!.matchedFields).toEqual(['策展人'])
    expect(r.artworks).toEqual([])
  })

  it('按作品标题匹配', () => {
    const r = searchAll(exhibitions, artworks, '潮汐')
    expect(r.artworks.map((m) => m.item.id)).toEqual(['a1'])
    expect(r.artworks[0]!.matchedFields).toEqual(['作品标题'])
    expect(r.exhibitions).toEqual([])
  })

  it('按作者匹配', () => {
    const r = searchAll(exhibitions, artworks, '林澄')
    expect(r.artworks.map((m) => m.item.id)).toEqual(['a1'])
    expect(r.artworks[0]!.matchedFields).toEqual(['作者'])
  })

  it('按材质匹配，可命中多件作品', () => {
    const r = searchAll(exhibitions, artworks, '釉')
    expect(r.artworks.map((m) => m.item.id)).toEqual(['a1', 'a3', 'a4'])
    expect(r.artworks.every((m) => m.matchedFields.includes('材质'))).toBe(true)
  })

  it('同一关键词可同时命中展览与作品，同一项可命中多个字段', () => {
    const r = searchAll(exhibitions, artworks, '光')
    expect(r.exhibitions.map((m) => m.item.id)).toEqual(['e2'])
    expect(r.exhibitions[0]!.matchedFields).toEqual(['展览名称', '副标题'])
    expect(r.artworks.map((m) => m.item.id)).toEqual(['a2'])
  })

  it('无匹配时两组都为空', () => {
    const r = searchAll(exhibitions, artworks, '不存在的关键词xyz')
    expect(r.exhibitions).toEqual([])
    expect(r.artworks).toEqual([])
  })

  it('关键词归一化后为空时不搜索，直接返回空结果', () => {
    for (const kw of ['', '   ', '　', ' \t\n ']) {
      expect(searchAll(exhibitions, artworks, kw)).toEqual({
        exhibitions: [],
        artworks: [],
      })
    }
  })
})

describe('searchAll 归一化稳定性', () => {
  const latinExhibitions: Exhibition[] = [
    {
      id: 'x1',
      title: 'Clay Works',
      subtitle: 'Soft  Ash',
      curator: 'Alice CHEN',
      status: '草稿',
      opening: '2025-01-01',
      closing: '2025-02-01',
      pieces: [],
      description: '',
    },
  ]
  const latinArtworks: Artwork[] = [
    { id: 'y1', title: 'Ash Vase', artist: 'Bob', material: '粗陶', year: 2024, note: '', tone: '#000' },
  ]

  it('大小写不敏感', () => {
    expect(searchAll(latinExhibitions, [], 'clay').exhibitions.map((m) => m.item.id)).toEqual(['x1'])
    expect(searchAll(latinExhibitions, [], 'CLAY').exhibitions.map((m) => m.item.id)).toEqual(['x1'])
    expect(searchAll(latinExhibitions, [], 'alice chen').exhibitions.map((m) => m.item.id)).toEqual(['x1'])
    expect(searchAll([], latinArtworks, 'ash').artworks.map((m) => m.item.id)).toEqual(['y1'])
  })

  it('字段中的连续空白同样折叠后再匹配', () => {
    const r = searchAll(latinExhibitions, [], 'soft  ash')
    expect(r.exhibitions.map((m) => m.item.id)).toEqual(['x1'])
    expect(r.exhibitions[0]!.matchedFields).toEqual(['副标题'])
  })

  it('同一关键词的不同输入形式产生完全相同的结果（可复现）', () => {
    const base = searchAll(exhibitions, artworks, '光')
    expect(searchAll(exhibitions, artworks, '  光  ')).toEqual(base)
    expect(searchAll(exhibitions, artworks, '　光　')).toEqual(base)
    expect(searchAll(exhibitions, artworks, '\t光\n')).toEqual(base)

    const latinBase = searchAll(latinExhibitions, latinArtworks, 'clay works')
    expect(searchAll(latinExhibitions, latinArtworks, ' Clay  Works ')).toEqual(latinBase)
    expect(searchAll(latinExhibitions, latinArtworks, 'CLAY WORKS')).toEqual(latinBase)
  })

  it('搜索不修改传入的数据', () => {
    const frozenExhibitions = Object.freeze(exhibitions.map((e) => Object.freeze({ ...e, pieces: Object.freeze([...e.pieces]) })))
    const frozenArtworks = Object.freeze(artworks.map((a) => Object.freeze({ ...a })))
    const snapshot = JSON.stringify({ e: frozenExhibitions, a: frozenArtworks })
    searchAll(frozenExhibitions as unknown as Exhibition[], frozenArtworks as unknown as Artwork[], '光')
    expect(JSON.stringify({ e: frozenExhibitions, a: frozenArtworks })).toBe(snapshot)
  })
})
