import * as THREE from 'three'
import { elevationAt } from './environment'

// A simple "follow at an offset" companion — used for the uncle, who stays
// near the player without being directly controlled.
export function createCompanion(mount, playerMount, offset = new THREE.Vector3(1.4, 0, 0.6)) {
  const desired = new THREE.Vector3()
  const toDesired = new THREE.Vector3()

  function update(dt) {
    desired.copy(offset).applyAxisAngle(new THREE.Vector3(0, 1, 0), playerMount.rotation.y)
    desired.add(playerMount.position)

    toDesired.subVectors(desired, mount.position)
    toDesired.y = 0
    const dist = toDesired.length()

    let moving = false
    if (dist > 0.05) {
      const step = Math.min(dist, (2.6 + dist * 0.6) * dt)
      toDesired.normalize()
      mount.position.addScaledVector(toDesired, step)
      mount.rotation.y = Math.atan2(toDesired.x, toDesired.z)
      moving = true
    }
    mount.position.y = elevationAt(mount.position.z)
    return moving
  }

  return { update }
}
