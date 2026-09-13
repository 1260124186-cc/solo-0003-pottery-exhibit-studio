import type { Artwork, Exhibition, GuideText, SpaceArrangement } from './models';

export const artworks: Artwork[] = [
  { id: 'a1', title: '潮汐之后', artist: '林澄', material: '白瓷·盐釉', year: 2024, note: '釉面留下潮线般的自然纹理。', tone: '#c9795d' },
  { id: 'a2', title: '折光容器', artist: '周野', material: '粗陶·金彩', year: 2023, note: '以折面的阴影回应室内光线。', tone: '#8b7355' },
  { id: 'a3', title: '未完成的圆', artist: '沈禾', material: '炻器·木灰釉', year: 2024, note: '保留拉坯过程中的手指痕迹。', tone: '#6d8b82' },
  { id: 'a4', title: '风从南方来', artist: '叶青', material: '瓷板·釉下彩', year: 2022, note: '用极简线条描绘季风路径。', tone: '#5d7ea4' },
];

export const exhibitions: Exhibition[] = [
  { id: 'e1', title: '手的回声', subtitle: '当泥土记住每一次触碰', curator: '陈默', status: '预览中', opening: '2024-09-12', closing: '2024-11-30', pieces: ['a1', 'a3'], description: '一场关于手感、时间与材料关系的当代陶艺展。', copiedFrom: null },
  { id: 'e2', title: '光的容器', subtitle: '器物在光线中改变形状', curator: '周宁', status: '草稿', opening: '2024-12-01', closing: '2025-01-15', pieces: ['a2', 'a4'], description: '探索釉色与空间之间的轻盈对话。', copiedFrom: null },
  // 由 e1“复制为草稿”产生的独立草稿：删除任何其他展览时都应保留它，仅在源被删除时解除来源关联
  { id: 'e3', title: '手的回声 · 巡展草稿', subtitle: '巡展版本编排', curator: '陈默', status: '草稿', opening: '2025-03-01', closing: '2025-05-10', pieces: ['a1'], description: '基于《手的回声》复制的巡展草稿，独立编排。', copiedFrom: 'e1' },
];

export const arrangements: SpaceArrangement[] = [
  {
    exhibitionId: 'e1',
    updatedAt: '2024-09-01',
    rooms: [
      { name: '序厅', pieceIds: ['a1'] },
      { name: '回声厅', pieceIds: ['a3'] },
    ],
  },
  {
    exhibitionId: 'e2',
    updatedAt: '2024-11-20',
    rooms: [{ name: '折光厅', pieceIds: ['a2', 'a4'] }],
  },
  {
    exhibitionId: 'e3',
    updatedAt: '2025-01-08',
    rooms: [{ name: '巡展序厅', pieceIds: ['a1'] }],
  },
];

export const guides: GuideText[] = [
  { id: 'g1', exhibitionId: 'e1', title: '入口导览', body: '从第一件白瓷开始，跟随釉面的潮线进入手感的时间。', updatedAt: '2024-09-05' },
  { id: 'g2', exhibitionId: 'e2', title: '光线提示', body: '建议在午后侧光下观看折面器物的阴影变化。', updatedAt: '2024-11-22' },
  { id: 'g3', exhibitionId: 'e3', title: '巡展说明', body: '巡展仅保留核心作品，动线比原版更紧凑。', updatedAt: '2025-01-09' },
];
