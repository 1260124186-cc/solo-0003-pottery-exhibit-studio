import type { Artwork, Exhibition } from './models'

/** 单条命中：原始数据 + 命中的字段名（用于界面展示）。 */
export interface SearchMatch<T> {
  item: T
  matchedFields: string[]
}

/** 全局搜索结果，展览与作品分组返回，顺序与源数据一致（稳定可复现）。 */
export interface SearchResults {
  exhibitions: SearchMatch<Exhibition>[]
  artworks: SearchMatch<Artwork>[]
}

export const EMPTY_RESULTS: SearchResults = { exhibitions: [], artworks: [] }

/**
 * 关键词归一化规则（对关键词与被搜索字段施加同一套规则，保证同一关键词
 * 无论输入时的大小写与空格习惯如何，匹配结果都稳定可复现）：
 * 1. 去除首尾空白（含全角空格 U+3000、制表符、换行等所有 Unicode 空白）；
 * 2. 中间的连续空白折叠为单个半角空格（不删除，故 “光 的” ≠ “光的”）；
 * 3. 统一小写（toLowerCase，仅影响拉丁字母，对中文无影响）。
 */
export function normalizeKeyword(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase()
}

interface FieldDef<T> {
  label: string
  pick: (item: T) => string
}

/** 展览参与搜索的字段：名称、副标题、策展人。 */
const EXHIBITION_FIELDS: FieldDef<Exhibition>[] = [
  { label: '展览名称', pick: (e) => e.title },
  { label: '副标题', pick: (e) => e.subtitle },
  { label: '策展人', pick: (e) => e.curator },
]

/** 作品参与搜索的字段：标题、作者、材质。 */
const ARTWORK_FIELDS: FieldDef<Artwork>[] = [
  { label: '作品标题', pick: (a) => a.title },
  { label: '作者', pick: (a) => a.artist },
  { label: '材质', pick: (a) => a.material },
]

function matchItem<T>(item: T, fields: FieldDef<T>[], kw: string): SearchMatch<T> | null {
  const matchedFields = fields
    .filter((f) => normalizeKeyword(f.pick(item)).includes(kw))
    .map((f) => f.label)
  return matchedFields.length ? { item, matchedFields } : null
}

/**
 * 纯函数搜索：只读取传入数据，不做任何修改。
 * 关键词先归一化；归一化后为空串时返回空结果（调用方据此展示“未输入”状态）。
 */
export function searchAll(
  exhibitions: Exhibition[],
  artworks: Artwork[],
  rawKeyword: string,
): SearchResults {
  const kw = normalizeKeyword(rawKeyword)
  if (!kw) return { exhibitions: [], artworks: [] }
  return {
    exhibitions: exhibitions
      .map((e) => matchItem(e, EXHIBITION_FIELDS, kw))
      .filter((m): m is SearchMatch<Exhibition> => m !== null),
    artworks: artworks
      .map((a) => matchItem(a, ARTWORK_FIELDS, kw))
      .filter((m): m is SearchMatch<Artwork> => m !== null),
  }
}
