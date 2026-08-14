import type { PlaitElement, PlaitTheme, Viewport } from '@plait/core';

export type BoardValue = {
  children: PlaitElement[];
  viewport?: Viewport;
  theme?: PlaitTheme;
};

export type MapMeta = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type Directory = {
  id: 'drawnix-mindmap-library';
  version: 1;
  currentMapId: string;
  maps: MapMeta[];
};

export type StoredMap = {
  id: string;
  title: string;
  version: 1;
  board: BoardValue;
  updatedAt: string;
};
