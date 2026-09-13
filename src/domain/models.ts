export type ExhibitStatus = '草稿' | '预览中' | '已上线';

export interface Artwork {
  id: string;
  title: string;
  artist: string;
  material: string;
  year: number;
  note: string;
  tone: string;
}

export interface Exhibition {
  id: string;
  title: string;
  subtitle: string;
  curator: string;
  status: ExhibitStatus;
  opening: string;
  closing: string;
  pieces: string[];
  description: string;
  /** 来源展览 id：由“复制为草稿”生成时指向源展览；源被删除后清空为 null，副本本身保留 */
  copiedFrom: string | null;
}

/** 空间编排：从属于一场展览，随草稿一起删除 */
export interface SpaceArrangement {
  exhibitionId: string;
  updatedAt: string;
  rooms: SpaceRoom[];
}

export interface SpaceRoom {
  name: string;
  pieceIds: string[];
}

/** 导览文字：从属于一场展览，随草稿一起删除 */
export interface GuideText {
  id: string;
  exhibitionId: string;
  title: string;
  body: string;
  updatedAt: string;
}

export interface StudioState {
  exhibitions: Exhibition[];
  artworks: Artwork[];
  arrangements: SpaceArrangement[];
  guides: GuideText[];
}
