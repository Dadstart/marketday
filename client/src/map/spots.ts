export type MapArea = 'pavilion' | 'grass' | 'food-truck';

export type MapSpot = {
  area: MapArea;
  spot: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

export const MAP_IMAGE_WIDTH = 1024;
export const MAP_IMAGE_HEIGHT = 734;

export const MAP_SPOTS: MapSpot[] = [
  { area: 'grass', spot: 28, left: 26.22, top: 13.56, width: 2.05, height: 3.0 },
  { area: 'grass', spot: 27, left: 29.15, top: 13.56, width: 2.05, height: 3.0 },
  { area: 'grass', spot: 26, left: 32.67, top: 17.92, width: 2.05, height: 2.86 },
  { area: 'grass', spot: 25, left: 35.5, top: 17.78, width: 2.05, height: 3.0 },
  { area: 'grass', spot: 24, left: 44.29, top: 18.73, width: 2.05, height: 3.0 },
  { area: 'grass', spot: 23, left: 46.53, top: 18.73, width: 2.05, height: 3.0 },
  { area: 'grass', spot: 22, left: 49.27, top: 18.73, width: 2.05, height: 3.0 },
  { area: 'grass', spot: 21, left: 52.1, top: 18.73, width: 2.05, height: 3.0 },
  { area: 'grass', spot: 20, left: 57.67, top: 17.1, width: 2.05, height: 3.0 },
  { area: 'grass', spot: 19, left: 57.67, top: 21.05, width: 2.05, height: 3.0 },
  { area: 'grass', spot: 18, left: 59.13, top: 25.54, width: 1.95, height: 2.86 },
  { area: 'grass', spot: 17, left: 59.23, top: 29.36, width: 1.95, height: 2.86 },
  { area: 'grass', spot: 16, left: 51.03, top: 35.35, width: 1.95, height: 2.86 },
  { area: 'grass', spot: 15, left: 57.76, top: 48.43, width: 1.95, height: 3.0 },
  { area: 'grass', spot: 14, left: 60.3, top: 48.43, width: 2.05, height: 3.0 },
  { area: 'grass', spot: 13, left: 62.94, top: 48.43, width: 2.05, height: 3.0 },
  { area: 'grass', spot: 12, left: 65.58, top: 48.43, width: 1.95, height: 3.0 },
  { area: 'grass', spot: 11, left: 68.21, top: 48.43, width: 1.95, height: 3.0 },
  { area: 'grass', spot: 10, left: 70.85, top: 48.43, width: 1.95, height: 3.0 },
  { area: 'grass', spot: 9, left: 73.49, top: 48.43, width: 1.95, height: 3.0 },
  { area: 'grass', spot: 8, left: 75.44, top: 51.98, width: 1.95, height: 2.86 },
  { area: 'grass', spot: 7, left: 73.49, top: 55.11, width: 1.95, height: 2.86 },
  { area: 'grass', spot: 6, left: 70.85, top: 54.97, width: 1.95, height: 2.86 },
  { area: 'grass', spot: 5, left: 68.21, top: 54.97, width: 1.95, height: 2.86 },
  { area: 'grass', spot: 4, left: 65.58, top: 55.11, width: 1.95, height: 2.86 },
  { area: 'grass', spot: 3, left: 62.94, top: 55.11, width: 2.05, height: 2.86 },
  { area: 'grass', spot: 2, left: 60.3, top: 55.11, width: 2.05, height: 2.86 },
  { area: 'grass', spot: 1, left: 57.76, top: 55.11, width: 1.95, height: 2.86 },
  { area: 'pavilion', spot: 1, left: 50.44, top: 45.57, width: 1.95, height: 3.13 },
  { area: 'pavilion', spot: 2, left: 47.8, top: 45.44, width: 2.05, height: 3.13 },
  { area: 'pavilion', spot: 3, left: 45.17, top: 45.57, width: 1.95, height: 3.0 },
  { area: 'pavilion', spot: 4, left: 42.63, top: 45.57, width: 1.95, height: 3.0 },
  { area: 'pavilion', spot: 5, left: 42.53, top: 51.16, width: 2.05, height: 3.13 },
  { area: 'pavilion', spot: 6, left: 42.53, top: 54.56, width: 2.25, height: 3.27 },
  { area: 'pavilion', spot: 7, left: 42.63, top: 58.11, width: 2.05, height: 3.13 },
  { area: 'pavilion', spot: 8, left: 42.63, top: 61.65, width: 2.05, height: 3.0 },
  { area: 'pavilion', spot: 9, left: 45.07, top: 61.65, width: 2.05, height: 3.0 },
  { area: 'pavilion', spot: 10, left: 47.8, top: 61.65, width: 1.95, height: 3.13 },
  { area: 'pavilion', spot: 11, left: 50.44, top: 61.65, width: 1.95, height: 3.13 },
  { area: 'pavilion', spot: 12, left: 47.8, top: 54.84, width: 2.05, height: 3.13 },
  { area: 'pavilion', spot: 13, left: 47.8, top: 51.7, width: 2.05, height: 2.86 },
  { area: 'food-truck', spot: 1, left: 80.52, top: 74.32, width: 3.22, height: 4.77 },
  { area: 'food-truck', spot: 2, left: 80.52, top: 82.49, width: 3.22, height: 4.9 },
];

export function areaLabel(area: MapArea): string {
  if (area === 'pavilion') {
    return 'Pavilion';
  }
  if (area === 'food-truck') {
    return 'Food truck';
  }
  return 'Grass';
}

export function spotLimit(area: MapArea): number {
  if (area === 'pavilion') {
    return 13;
  }
  if (area === 'food-truck') {
    return 2;
  }
  return 28;
}
