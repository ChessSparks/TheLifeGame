import * as THREE from 'three'

export function makeGlowTexture(innerColor = 'rgba(255,200,120,1)', outerColor = 'rgba(255,140,40,0)') {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, innerColor)
  gradient.addColorStop(1, outerColor)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

// Crater-mottled sphere texture for the moon, generated on a canvas so the
// whole scene stays free of downloaded image assets.
export function makeMoonTexture() {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  const base = ctx.createRadialGradient(size * 0.4, size * 0.35, size * 0.05, size * 0.5, size * 0.5, size * 0.65)
  base.addColorStop(0, '#f4f1ea')
  base.addColorStop(1, '#cfd0d6')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)

  for (let i = 0; i < 40; i++) {
    const cx = Math.random() * size
    const cy = Math.random() * size
    const r = 4 + Math.random() * 18
    const shade = 0.7 + Math.random() * 0.15
    const crater = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r)
    crater.addColorStop(0, `rgba(170,168,162,${shade})`)
    crater.addColorStop(1, 'rgba(170,168,162,0)')
    ctx.fillStyle = crater
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}
