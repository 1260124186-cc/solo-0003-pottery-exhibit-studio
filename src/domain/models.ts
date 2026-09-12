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
  /** 导览说明（导览信息，与空间信息二者齐备其一即为完成） */
  guide?: string;
  /** 展览空间信息（展厅、动线等） */
  venue?: string;
}
