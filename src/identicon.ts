/**
 * Identicon Generator
 * 型名からハッシュ値を計算し、一意のアイコン（SVG）を生成する
 */

// シンプルなハッシュ関数（djb2）
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return hash >>> 0; // 符号なし整数に変換
}

// ハッシュから色を生成
function hashToColor(hash: number, offset: number = 0): string {
  const h = ((hash >> offset) % 360 + 360) % 360;
  const s = 60 + (hash % 30); // 60-90%
  const l = 45 + ((hash >> 4) % 20); // 45-65%
  return `hsl(${h}, ${s}%, ${l}%)`;
}

// 型名から色を取得（エクスポート用）
export function getTypeColor(typeName: string): string {
  const hash = hashString(typeName);
  return hashToColor(hash);
}

// 5x5のパターンを生成（左右対称）
function generatePattern(hash: number): boolean[][] {
  const pattern: boolean[][] = [];
  
  for (let y = 0; y < 5; y++) {
    pattern[y] = [];
    for (let x = 0; x < 3; x++) {
      // ハッシュの各ビットを使ってセルのon/offを決定
      const bitIndex = y * 3 + x;
      pattern[y][x] = ((hash >> bitIndex) & 1) === 1;
    }
    // 左右対称にする
    pattern[y][3] = pattern[y][1];
    pattern[y][4] = pattern[y][0];
  }
  
  return pattern;
}

// SVGを生成
export function generateIdenticon(typeName: string, size: number = 14): string {
  const hash = hashString(typeName);
  const pattern = generatePattern(hash);
  const color = hashToColor(hash);
  const bgColor = hashToColor(hash, 16);
  
  const cellSize = size / 5;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
  svg += `<rect width="${size}" height="${size}" fill="${bgColor}" opacity="0.3"/>`;
  
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      if (pattern[y][x]) {
        svg += `<rect x="${x * cellSize}" y="${y * cellSize}" width="${cellSize}" height="${cellSize}" fill="${color}"/>`;
      }
    }
  }
  
  svg += '</svg>';
  return svg;
}

// SVGをData URIに変換
export function svgToDataUri(svg: string): string {
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, '%27')
    .replace(/"/g, '%22');
  return `data:image/svg+xml,${encoded}`;
}

// 型名からData URIを生成（メイン関数）
export function getTypeIconUri(typeName: string, size: number = 14): string {
  const svg = generateIdenticon(typeName, size);
  return svgToDataUri(svg);
}

// 継承チェーンのアイコンを生成
export function getInheritanceIconUris(
  typeNames: string[],
  size: number = 14
): string[] {
  return typeNames.map(name => getTypeIconUri(name, size));
}

// 複数のidenticonを横に並べた1つのSVGを生成
export function generateCombinedIdenticon(typeNames: string[], size: number = 14): string {
  const totalWidth = typeNames.length * size;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${size}" viewBox="0 0 ${totalWidth} ${size}">`;

  for (let i = 0; i < typeNames.length; i++) {
    const typeName = typeNames[i];
    const hash = hashStringExport(typeName);
    const pattern = generatePatternExport(hash);
    const color = hashToColorExport(hash);
    const bgColor = hashToColorExport(hash, 16);
    const offsetX = i * size;
    const cellSize = size / 5;

    // 背景
    svg += `<rect x="${offsetX}" y="0" width="${size}" height="${size}" fill="${bgColor}" opacity="0.3"/>`;

    // パターン
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        if (pattern[y][x]) {
          svg += `<rect x="${offsetX + x * cellSize}" y="${y * cellSize}" width="${cellSize}" height="${cellSize}" fill="${color}"/>`;
        }
      }
    }
  }

  svg += '</svg>';
  return svg;
}

// エクスポート用のヘルパー関数
function hashStringExport(str: string): number {
  return hashString(str);
}

function hashToColorExport(hash: number, offset: number = 0): string {
  return hashToColor(hash, offset);
}

function generatePatternExport(hash: number): boolean[][] {
  return generatePattern(hash);
}

// キャッシュ
const iconCache = new Map<string, string>();
const combinedIconCache = new Map<string, string>();

// 結合されたidenticonのData URI（キャッシュ付き）
export function getCombinedIconUri(typeNames: string[], size: number = 14): string {
  const key = `${typeNames.join(':')}:${size}`;
  if (!combinedIconCache.has(key)) {
    const svg = generateCombinedIdenticon(typeNames, size);
    combinedIconCache.set(key, svgToDataUri(svg));
  }
  return combinedIconCache.get(key)!;
}

export function getCachedTypeIconUri(typeName: string, size: number = 14): string {
  const key = `${typeName}:${size}`;
  if (!iconCache.has(key)) {
    iconCache.set(key, getTypeIconUri(typeName, size));
  }
  return iconCache.get(key)!;
}

export function clearIconCache(): void {
  iconCache.clear();
  combinedIconCache.clear();
}
