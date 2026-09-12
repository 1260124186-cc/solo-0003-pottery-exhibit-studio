import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import StudioView from './StudioView.vue'

beforeAll(() => {
  // jsdom 未实现 scrollIntoView，打桩以便验证跳转行为
  ;(Element.prototype as any).scrollIntoView = vi.fn()
})

async function searchFor(wrapper: VueWrapper, kw: string) {
  await wrapper.get('.search-box input').setValue(kw)
  await wrapper.get('.search-box button').trigger('click')
  await flushPromises()
}

function resultRow(wrapper: VueWrapper, text: string) {
  const row = wrapper.findAll('.result-row').find((r) => r.text().includes(text))
  if (!row) throw new Error(`未找到包含「${text}」的结果行`)
  return row
}

describe('StudioView 全局搜索', () => {
  it('初始为未输入状态，展示提示、不展示结果', () => {
    const wrapper = mount(StudioView)
    expect(wrapper.get('.search-hint').text()).toContain('输入关键词')
    expect(wrapper.find('.result-groups').exists()).toBe(false)
    expect(wrapper.find('.search-empty').exists()).toBe(false)
  })

  it('按策展人搜索：只命中展览组', async () => {
    const wrapper = mount(StudioView)
    await searchFor(wrapper, '陈默')
    const groups = wrapper.findAll('.result-group')
    expect(groups).toHaveLength(1)
    expect(groups[0]!.text()).toContain('展览 · 1')
    expect(groups[0]!.text()).toContain('手的回声')
    expect(groups[0]!.text()).toContain('匹配：策展人')
  })

  it('按作者搜索：只命中作品组', async () => {
    const wrapper = mount(StudioView)
    await searchFor(wrapper, '林澄')
    const groups = wrapper.findAll('.result-group')
    expect(groups).toHaveLength(1)
    expect(groups[0]!.text()).toContain('作品 · 1')
    expect(groups[0]!.text()).toContain('潮汐之后')
    expect(groups[0]!.text()).toContain('匹配：作者')
  })

  it('按材质搜索：命中多件作品', async () => {
    const wrapper = mount(StudioView)
    await searchFor(wrapper, '釉')
    expect(wrapper.get('.result-group h3').text()).toBe('作品 · 3')
    expect(wrapper.findAll('.result-row')).toHaveLength(3)
  })

  it('同一关键词同时命中展览与作品时分组展示', async () => {
    const wrapper = mount(StudioView)
    await searchFor(wrapper, '光')
    const groups = wrapper.findAll('.result-group')
    expect(groups).toHaveLength(2)
    expect(groups[0]!.text()).toContain('展览 · 1')
    expect(groups[0]!.text()).toContain('光的容器')
    expect(groups[1]!.text()).toContain('作品 · 1')
    expect(groups[1]!.text()).toContain('折光容器')
  })

  it('无结果时展示空状态并回显归一化后的关键词', async () => {
    const wrapper = mount(StudioView)
    await searchFor(wrapper, '  不存在的词  ')
    expect(wrapper.get('.search-empty').text()).toContain('「不存在的词」')
    expect(wrapper.find('.result-groups').exists()).toBe(false)
  })

  it('输入归一化：首尾空格与大小写不影响结果', async () => {
    const wrapper = mount(StudioView)
    await searchFor(wrapper, '林澄')
    const baseline = wrapper.findAll('.result-row').map((r) => r.text())

    await searchFor(wrapper, '　 林澄 　')
    expect(wrapper.findAll('.result-row').map((r) => r.text())).toEqual(baseline)
  })

  it('清空关键词后回到未输入状态', async () => {
    const wrapper = mount(StudioView)
    await searchFor(wrapper, '光')
    expect(wrapper.find('.result-groups').exists()).toBe(true)

    await wrapper.get('.search-box input').setValue('')
    expect(wrapper.get('.search-hint').text()).toContain('输入关键词')
    expect(wrapper.find('.result-groups').exists()).toBe(false)
  })

  it('搜索本身不修改数据、不改变当前选中的展览', async () => {
    const wrapper = mount(StudioView)
    const beforeTitle = wrapper.get('.canvas h2').text()
    const activeBefore = wrapper.findAll('.exhibit-row').findIndex((r) => classesActive(r))

    await searchFor(wrapper, '光')
    await searchFor(wrapper, '林澄')
    await searchFor(wrapper, '不存在的词')

    expect(wrapper.get('.canvas h2').text()).toBe(beforeTitle)
    const activeAfter = wrapper.findAll('.exhibit-row').findIndex((r) => classesActive(r))
    expect(activeAfter).toBe(activeBefore)
    expect(localStorage.getItem('pottery-exhibit-studio-v1')).toBeNull()
  })

  it('点击展览结果：跳转到该展览（选中并滚动到工作面）', async () => {
    const wrapper = mount(StudioView)
    expect(wrapper.get('.canvas h2').text()).toBe('手的回声')

    await searchFor(wrapper, '光的容器')
    await resultRow(wrapper, '光的容器').trigger('click')

    expect(wrapper.get('.canvas h2').text()).toBe('光的容器')
    expect(wrapper.findAll('.exhibit-row')[1]!.classes()).toContain('active')
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('点击作品结果：滚动并高亮作品卡片，不改变选中的展览', async () => {
    const wrapper = mount(StudioView)
    const titleBefore = wrapper.get('.canvas h2').text()

    await searchFor(wrapper, '林澄')
    await resultRow(wrapper, '潮汐之后').trigger('click')

    expect(wrapper.get('#piece-a1').classes()).toContain('flash')
    expect(wrapper.get('.canvas h2').text()).toBe(titleBefore)
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    expect(localStorage.getItem('pottery-exhibit-studio-v1')).toBeNull()
  })
})

function classesActive(row: { classes: () => string[] }) {
  return row.classes().includes('active')
}
