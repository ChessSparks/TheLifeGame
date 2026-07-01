import * as THREE from 'three'
import { makeGlowTexture } from './textures'

const emberTexture = makeGlowTexture('rgba(255,210,150,1)', 'rgba(255,140,40,0)')

// A cluster of warm flickering "torches" used to suggest the mob without depicting it directly.
export class TorchGroup {
  constructor(count, spread) {
    this.group = new THREE.Group()
    this.lights = []
    this.sprites = []
    this.phases = []

    const material = new THREE.SpriteMaterial({
      map: emberTexture,
      color: 0xffaa55,
      transparent: true,
      depthWrite: false,
    })

    for (let i = 0; i < count; i++) {
      const sprite = new THREE.Sprite(material.clone())
      sprite.scale.setScalar(0.9 + Math.random() * 0.5)
      sprite.position.set((Math.random() - 0.5) * spread, 1.2 + Math.random() * 0.4, (Math.random() - 0.5) * spread)
      this.group.add(sprite)
      this.sprites.push(sprite)

      const light = new THREE.PointLight(0xff9a4d, 0, 9)
      light.position.copy(sprite.position)
      this.group.add(light)
      this.lights.push(light)

      this.phases.push(Math.random() * Math.PI * 2)
    }

    this.intensity = 0
  }

  update() {
    const time = performance.now() * 0.001
    for (let i = 0; i < this.lights.length; i++) {
      const flicker = 0.65 + Math.sin(time * (4 + i) + this.phases[i]) * 0.2 + Math.random() * 0.15
      this.lights[i].intensity = this.intensity * flicker * 2.4
      this.sprites[i].material.opacity = this.intensity * flicker
    }
  }
}

// Slow drifting fireflies / embers for atmosphere in the forest.
export function createEmberField(count, radius) {
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * radius
    positions[i * 3 + 1] = Math.random() * 3 + 0.3
    positions[i * 3 + 2] = (Math.random() - 0.5) * radius
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    size: 0.06,
    map: emberTexture,
    transparent: true,
    depthWrite: false,
    color: 0xffd9a0,
    opacity: 0.8,
  })
  const points = new THREE.Points(geometry, material)
  points.userData.basePositions = positions.slice()
  return points
}

export function updateEmberField(points, dt, elapsed) {
  const pos = points.geometry.attributes.position
  const base = points.userData.basePositions
  for (let i = 0; i < pos.count; i++) {
    const ix = i * 3
    pos.array[ix + 1] = base[ix + 1] + Math.sin(elapsed * 0.6 + i) * 0.25
    pos.array[ix + 0] = base[ix + 0] + Math.sin(elapsed * 0.3 + i * 1.7) * 0.15
  }
  pos.needsUpdate = true
}
