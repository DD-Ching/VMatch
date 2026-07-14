/** Procedural sprite textures (no binary assets in the repo). */
import * as THREE from 'three';

export function radialSprite(size = 128, inner = 1, falloff = 2.2): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c + 0.5, y - c + 0.5) / c;
      const a = Math.max(0, Math.min(1, inner * Math.pow(Math.max(0, 1 - d), falloff)));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Blackbody-ish LUT from ember (#FF6B2D) through gold to sear (#DDEBFF),
 *  driven by normalized brightness 0..1 (D10). */
export function blackbody(t: number, out: THREE.Color): THREE.Color {
  const ember = { r: 1.0, g: 0.42, b: 0.18 };
  const mid = { r: 1.0, g: 0.79, b: 0.48 };
  const sear = { r: 0.87, g: 0.92, b: 1.0 };
  const clamp = Math.max(0, Math.min(1, t));
  if (clamp < 0.5) {
    const k = clamp * 2;
    out.setRGB(ember.r + (mid.r - ember.r) * k, ember.g + (mid.g - ember.g) * k, ember.b + (mid.b - ember.b) * k);
  } else {
    const k = (clamp - 0.5) * 2;
    out.setRGB(mid.r + (sear.r - mid.r) * k, mid.g + (sear.g - mid.g) * k, mid.b + (sear.b - mid.b) * k);
  }
  return out;
}
