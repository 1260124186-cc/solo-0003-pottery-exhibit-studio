import type { Artwork, Exhibition } from './models';

export const artworks: Artwork[] = [
  { id: 'a1', title: '潮汐之后', artist: '林澄', material: '白瓷·盐釉', year: 2024, note: '釉面留下潮线般的自然纹理。', tone: '#c9795d' },
  { id: 'a2', title: '折光容器', artist: '周野', material: '粗陶·金彩', year: 2023, note: '以折面的阴影回应室内光线。', tone: '#8b7355' },
  { id: 'a3', title: '未完成的圆', artist: '沈禾', material: '炻器·木灰釉', year: 2024, note: '保留拉坯过程中的手指痕迹。', tone: '#6d8b82' },
  { id: 'a4', title: '风从南方来', artist: '叶青', material: '瓷板·釉下彩', year: 2022, note: '用极简线条描绘季风路径。', tone: '#5d7ea4' },
];

export const exhibitions: Exhibition[] = [
  {
    id: 'e1',
    title: '手的回声',
    subtitle: '当泥土记住每一次触碰',
    curator: '陈默',
    status: '预览中',
    opening: '2024-09-12',
    closing: '2024-11-30',
    pieces: ['a1', 'a3'],
    description: '一场关于手感、时间与材料关系的当代陶艺展。',
    guide: '按“触痕—回响—留白”三段动线导览，每段配三分钟语音讲解。',
    venue: '一号展厅，环形动线，约 220 平方米。',
  },
  {
    id: 'e2',
    title: '光的容器',
    subtitle: '器物在光线中改变形状',
    curator: '周宁',
    status: '草稿',
    opening: '2024-12-01',
    closing: '2025-01-15',
    pieces: ['a2', 'a4'],
    description: '探索釉色与空间之间的轻盈对话。',
  },
  {
    id: 'e3',
    title: '素坯',
    subtitle: '',
    curator: '',
    status: '草稿',
    opening: '',
    closing: '',
    pieces: [],
    description: '',
  },
];
