import * as THREE from 'three'
import { buildMinifigure } from './lego'

// Wraps a minifigure with a `mount` (positioned/rotated by controllers) and
// an inner group that only carries the walk-cycle animation, so animation
// never fights with position updates from a controller.
export function wrapFigure(colors, options) {
  const mount = new THREE.Object3D()
  const { group, parts } = buildMinifigure(colors, options)
  mount.add(group)

  let walkPhase = Math.random() * Math.PI * 2
  let walking = false
  // Mutable (not const): setCarrying() below can flip this at runtime, since
  // the "carrying" arm pose is otherwise a fixed pose baked in at construction.
  let canSwingArms = !parts.child

  function setWalking(value) {
    walking = value
  }

  // Toggles the carrying pose at runtime (used for the pickup moment once
  // the player gets inside) instead of only being fixed at construction.
  function setCarrying(value) {
    if (!parts.child) return
    parts.child.visible = value
    canSwingArms = !value
    if (value) {
      parts.armL.rotation.set(-1.9, 0, 0.35)
      parts.armR.rotation.set(-1.9, 0, -0.35)
    } else {
      parts.armL.rotation.set(0, 0, 0)
      parts.armR.rotation.set(0, 0, 0)
    }
  }

  function update(dt, speedScale = 1) {
    if (walking) {
      walkPhase += dt * 6 * speedScale
      const swing = Math.sin(walkPhase) * 0.55
      parts.legL.rotation.x = swing
      parts.legR.rotation.x = -swing
      if (canSwingArms) {
        parts.armL.rotation.x = -swing * 0.7
        parts.armR.rotation.x = swing * 0.7
      }
      group.position.y = Math.abs(Math.sin(walkPhase * 2)) * 0.05
    } else {
      parts.legL.rotation.x = 0
      parts.legR.rotation.x = 0
      if (canSwingArms) {
        parts.armL.rotation.x = 0
        parts.armR.rotation.x = 0
      }
      group.position.y = 0
    }
  }

  return { mount, group, parts, setWalking, setCarrying, update }
}

// Brighter/more saturated than the mob's deliberately drab earth tones, so
// the family reads clearly against the crowd during the street approach.
export function createDadFigure() {
  return wrapFigure(
    { torso: 0x1f7a52, legs: 0x2c2c2c, head: 0xf2c48d, hair: 0x2a2015 },
    { carrying: true }
  )
}

export function createUncleFigure() {
  return wrapFigure({ torso: 0x2f6bad, legs: 0x33322c, head: 0xf2c48d, hair: 0x1c1c1c })
}

// Same colors/scale as the child molded into dad's carrying pose (see
// buildMinifigure's `carrying` option in lego.js) — used as a standalone,
// walking figure for the stretch between being set down at the hideout and
// picked back up at the plank. See ZoneDirector's 'hiding' stage in zones.js.
export function createBoyFigure() {
  return wrapFigure({ torso: 0xd4453a, legs: 0x2f3a5f, head: 0xf2c48d, hair: 0x4a3222 }, { scale: 0.62 })
}
