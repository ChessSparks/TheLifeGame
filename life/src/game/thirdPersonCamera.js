import * as THREE from 'three'

function angleLerp(a, b, t) {
  const diff = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI
  return a + diff * t
}

// Orbits behind/above a target. Drag with the mouse to look around; movement
// elsewhere in the app is expected to read `getYaw()` to move relative to
// whatever direction the camera is currently facing. While the target is
// moving (and the player isn't actively dragging), the camera also slowly
// swings its yaw around to settle back behind whichever way the target is
// currently facing — player.js sets the target's rotation.y to match its
// movement direction, and camera-relative "forward" is (sin(yaw), -cos(yaw)),
// so the camera ends up behind the target when yaw = PI - target.rotation.y.
export function createThirdPersonCamera(camera, target, canvas, options = {}) {
  let yaw = options.yaw ?? Math.PI
  let pitch = options.pitch ?? 0.42
  const distance = options.distance ?? 6.5
  const minPitch = options.minPitch ?? 0.08
  const maxPitch = options.maxPitch ?? 1.1
  const lookHeight = options.lookHeight ?? 1.5
  const obstacles = options.obstacles ?? []
  // How eagerly the camera swings back behind the target while it's moving
  // — smaller is slower/lazier, closer to 1 is near-instant.
  const followRate = options.followRate ?? 0.002
  // Safety floor only (keeps the camera from landing on top of the target
  // if an obstacle is right up against it) — NOT a comfortable minimum,
  // since it must never exceed the space a small room can actually offer.
  const minDistance = options.minDistance ?? 0.6

  let dragging = false
  let lastX = 0
  let lastY = 0

  function onPointerDown(e) {
    dragging = true
    lastX = e.clientX
    lastY = e.clientY
  }
  function onPointerMove(e) {
    if (!dragging) return
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    yaw -= dx * 0.0032
    pitch -= dy * 0.0032
    pitch = Math.max(minPitch, Math.min(maxPitch, pitch))
  }
  function onPointerUp() {
    dragging = false
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)

  const targetPos = new THREE.Vector3()
  const desiredPos = new THREE.Vector3()
  const lookAt = new THREE.Vector3()
  let initialized = false

  const raycaster = new THREE.Raycaster()
  const rayOrigin = new THREE.Vector3()
  const rayDir = new THREE.Vector3()

  // Pulls the desired camera position in along the target->camera ray if
  // something solid (e.g. a house wall) sits between them, so the camera
  // never ends up clipped through geometry.
  function clampToObstacles() {
    if (!obstacles.length) return
    rayOrigin.set(targetPos.x, targetPos.y + lookHeight, targetPos.z)
    rayDir.subVectors(desiredPos, rayOrigin)
    const fullDistance = rayDir.length()
    if (fullDistance < 0.0001) return
    rayDir.normalize()
    raycaster.set(rayOrigin, rayDir)
    raycaster.near = 0
    raycaster.far = fullDistance
    const hits = raycaster.intersectObjects(obstacles, true)
    if (hits.length) {
      const clamped = Math.max(minDistance, hits[0].distance - 0.25)
      desiredPos.copy(rayOrigin).addScaledVector(rayDir, clamped)
    }
  }

  function update(dt, isMoving = false) {
    target.getWorldPosition(targetPos)

    if (isMoving && !dragging) {
      const desiredYaw = Math.PI - target.rotation.y
      const followFactor = 1 - Math.pow(followRate, dt)
      yaw = angleLerp(yaw, desiredYaw, followFactor)
    }

    const horizontal = distance * Math.cos(pitch)
    const vertical = distance * Math.sin(pitch)
    desiredPos.set(targetPos.x - Math.sin(yaw) * horizontal, targetPos.y + vertical + 0.6, targetPos.z + Math.cos(yaw) * horizontal)
    clampToObstacles()

    if (!initialized) {
      camera.position.copy(desiredPos)
      initialized = true
    } else {
      const lerpFactor = 1 - Math.pow(0.0001, dt)
      camera.position.lerp(desiredPos, lerpFactor)
    }

    lookAt.set(targetPos.x, targetPos.y + lookHeight, targetPos.z)
    camera.lookAt(lookAt)
  }

  function getYaw() {
    return yaw
  }

  function dispose() {
    canvas.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  }

  return { update, getYaw, dispose }
}
