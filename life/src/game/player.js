import * as THREE from 'three'
import { elevationAt, getWallColliders, resolveWallCollision } from './environment'

function angleLerp(a, b, t) {
  const diff = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI
  return a + diff * t
}

// Movement is split into small sub-steps, each with its own collision
// check, so a single frame's worth of movement can never be large enough
// to tunnel straight through a wall instead of colliding with it.
const MAX_SUBSTEP = 0.12

// Camera-relative WASD movement. `getYaw` reads the third-person camera's
// current yaw so "forward" always means "away from the camera".
export function createPlayerController(mount, getYaw, options = {}) {
  const speed = options.speed ?? 3.4
  const radius = options.radius ?? 0.35
  const colliders = getWallColliders()
  let enabled = true
  const keys = {}

  function onKeyDown(e) {
    keys[e.code] = true
  }
  function onKeyUp(e) {
    keys[e.code] = false
  }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  const forward = new THREE.Vector3()
  const right = new THREE.Vector3()
  const moveDir = new THREE.Vector3()

  // Lets a director (see ZoneDirector.climbThroughWindow() in zones.js)
  // pause normal input while it drives a scripted move directly, e.g. the
  // hop through the window, without fighting whatever keys are held.
  function setEnabled(value) {
    enabled = value
  }

  function update(dt) {
    if (!enabled) return false
    const yaw = getYaw()
    const fwd = keys.KeyW || keys.ArrowUp ? 1 : 0
    const back = keys.KeyS || keys.ArrowDown ? 1 : 0
    const left = keys.KeyA || keys.ArrowLeft ? 1 : 0
    const rightK = keys.KeyD || keys.ArrowRight ? 1 : 0

    forward.set(Math.sin(yaw), 0, -Math.cos(yaw))
    right.set(Math.cos(yaw), 0, Math.sin(yaw))

    moveDir.set(0, 0, 0)
    moveDir.addScaledVector(forward, fwd - back)
    moveDir.addScaledVector(right, rightK - left)

    let moving = false
    if (moveDir.lengthSq() > 0.0001) {
      moveDir.normalize()
      const totalStep = speed * dt
      const substeps = Math.max(1, Math.ceil(totalStep / MAX_SUBSTEP))
      const stepPerSubstep = totalStep / substeps
      for (let i = 0; i < substeps; i++) {
        mount.position.addScaledVector(moveDir, stepPerSubstep)
        resolveWallCollision(mount.position, radius, colliders)
      }
      const targetAngle = Math.atan2(moveDir.x, moveDir.z)
      mount.rotation.y = angleLerp(mount.rotation.y, targetAngle, Math.min(dt * 8, 1))
      moving = true
    }
    mount.position.y = elevationAt(mount.position.z)
    return moving
  }

  function dispose() {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
  }

  return { update, dispose, setEnabled }
}
