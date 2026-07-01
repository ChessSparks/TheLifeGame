import * as THREE from 'three'
import { elevationAt } from './environment'

function angleLerp(a, b, t) {
  const diff = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI
  return a + diff * t
}

// Camera-relative WASD movement. `getYaw` reads the third-person camera's
// current yaw so "forward" always means "away from the camera".
export function createPlayerController(mount, getYaw, options = {}) {
  const speed = options.speed ?? 3.4
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

  function update(dt) {
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
      mount.position.addScaledVector(moveDir, speed * dt)
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

  return { update, dispose }
}
