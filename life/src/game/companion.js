import * as THREE from 'three'
import { elevationAt, getWallColliders, resolveWallCollision } from './environment'

// Catch-up speed is capped rather than left to scale forever with distance
// — an unbounded speed can cover more than a wall's thickness in a single
// frame right after a sudden target change (a stage swapping the follow
// offset, or the player teleporting), tunneling straight through it instead
// of colliding. Movement is also split into small sub-steps, each with its
// own collision check, as a second line of defense against tunneling.
const MAX_CATCHUP_SPEED = 6
const MAX_SUBSTEP = 0.12

// A simple "follow at an offset" companion — used for the uncle, who stays
// near the player without being directly controlled.
export function createCompanion(mount, playerMount, initialOffset = new THREE.Vector3(1.4, 0, 0.6), options = {}) {
  const offset = initialOffset.clone()
  const radius = options.radius ?? 0.35
  const colliders = getWallColliders()
  const desired = new THREE.Vector3()
  const toDesired = new THREE.Vector3()

  // Lets a director (see ZoneDirector's 'return' stage in zones.js) swap the
  // follow offset at runtime — e.g. tucking in directly behind the player
  // single-file for a narrow plank crossing, instead of the usual side-by-side.
  function setOffset(next) {
    offset.copy(next)
  }

  function update(dt) {
    desired.copy(offset).applyAxisAngle(new THREE.Vector3(0, 1, 0), playerMount.rotation.y)
    desired.add(playerMount.position)

    toDesired.subVectors(desired, mount.position)
    toDesired.y = 0
    const dist = toDesired.length()

    let moving = false
    if (dist > 0.05) {
      const speed = Math.min(2.6 + dist * 0.6, MAX_CATCHUP_SPEED)
      const totalStep = Math.min(dist, speed * dt)
      toDesired.normalize()
      const substeps = Math.max(1, Math.ceil(totalStep / MAX_SUBSTEP))
      const stepPerSubstep = totalStep / substeps
      for (let i = 0; i < substeps; i++) {
        mount.position.addScaledVector(toDesired, stepPerSubstep)
        resolveWallCollision(mount.position, radius, colliders)
      }
      mount.rotation.y = Math.atan2(toDesired.x, toDesired.z)
      moving = true
    }
    mount.position.y = elevationAt(mount.position.z)
    return moving
  }

  return { update, setOffset }
}
