import * as THREE from 'three'
import { elevationAt, ROAD_Z } from './environment'

function randRange([min, max]) {
  return min + Math.random() * (max - min)
}

// Crowd figures are background dressing at a distance — cast no shadows
// (that's the expensive part) and get their own material clones (rather
// than sharing the Soldier prototype's originals) so each member can fade
// out independently during the retreat (see the 'fading' state below)
// without fading every other clone at once. Marked transparent up front so
// that fade can just ramp opacity later.
function prepMobFigure(mount) {
  const materials = []
  mount.traverse((obj) => {
    if (!obj.isMesh) return
    obj.castShadow = false
    obj.material = obj.material.clone()
    obj.material.transparent = true
    materials.push(obj.material)
  })
  return materials
}

const RUN_CLIP = 'Armature|Rifle@Run.001'
const IDLE_CLIP = 'Armature|Rifle@Aim'

// Wraps one Soldier.glb clone with its own AnimationMixer — the model
// animates via a rigid bone hierarchy, not vertex skinning (see models.js),
// so a plain .clone() plus a fresh mixer per instance is enough, no
// SkeletonUtils needed. Switches between a running clip while
// approaching/retreating and a held-still aiming clip while gathered at the
// door.
function wrapSoldierFigure(models) {
  const mount = new THREE.Object3D()
  const group = models.soldier.clone()
  mount.add(group)
  const materials = prepMobFigure(mount)

  const mixer = new THREE.AnimationMixer(group)
  const findClip = (name) => models.soldierAnimations.find((a) => a.name === name)
  const runAction = mixer.clipAction(findClip(RUN_CLIP))
  const idleAction = mixer.clipAction(findClip(IDLE_CLIP))
  runAction.play()
  idleAction.play()
  idleAction.enabled = false
  // Stagger each member's run cycle so a crowd doesn't move in lockstep.
  runAction.time = Math.random() * runAction.getClip().duration

  let running = true
  function setWalking(value) {
    if (value === running) return
    running = value
    runAction.enabled = running
    idleAction.enabled = !running
  }

  function update(dt) {
    mixer.update(dt)
  }

  return { mount, materials, setWalking, update }
}

// A crowd of full, animated soldier figures (see wrapSoldierFigure above)
// that comes down the road (parallel to the river), turns onto the short
// driveway to the house, gathers/presses at the door and yard, then
// retreats back up the road and fades once the attack beat ends.
export function createMobCrowd(models, count = 16, options = {}) {
  // Spawn far to one side, along the road (fixed-ish Z, varying X), so the
  // crowd visibly travels the road before turning toward the house.
  const spawnXRange = options.spawnXRange ?? [-24, -18]
  const spawnZRange = options.spawnZRange ?? [ROAD_Z - 1.5, ROAD_Z + 1.5]
  // The driveway junction where the road meets the path to the house.
  const roadJunction = options.roadJunction ?? { x: 0, z: ROAD_Z }
  // Yard sits between the house's front door at z~8.5 and the fence's
  // street-facing gate at z=10.3.
  const gatherZRange = options.gatherZRange ?? [8.9, 10.0]
  const gatherXRange = options.gatherXRange ?? [-4.0, 2.0]
  const doorZ = options.doorZ ?? 9.0
  const doorXRange = options.doorXRange ?? [-0.5, 0.5]
  const doorFraction = options.doorFraction ?? 0.25
  const speedRange = options.speedRange ?? [1.6, 2.4]
  const retreatMaxDuration = options.retreatMaxDuration ?? 6
  const fadeDuration = options.fadeDuration ?? 1.5

  const group = new THREE.Group()
  const members = []

  for (let i = 0; i < count; i++) {
    const figure = wrapSoldierFigure(models)

    const x = randRange(spawnXRange)
    const z = randRange(spawnZRange)
    figure.mount.position.set(x, elevationAt(z), z)
    group.add(figure.mount)

    const atDoor = Math.random() < doorFraction
    const targetX = atDoor ? randRange(doorXRange) : randRange(gatherXRange)
    const targetZ = atDoor ? doorZ + (Math.random() - 0.5) * 0.4 : randRange(gatherZRange)

    members.push({
      figure,
      materials: figure.materials,
      spawnX: x,
      spawnZ: z,
      targetX,
      targetZ,
      speed: randRange(speedRange),
      state: 'idle', // idle | onRoad | approaching | gathered | retreating | fading | hidden
      stateElapsed: 0,
    })
  }

  let active = false

  function activate() {
    active = true
    members.forEach((m) => {
      m.state = 'onRoad'
      m.stateElapsed = 0
    })
  }

  // Steps a member toward an explicit (tx, tz) target; returns whether it arrived.
  function stepToward(m, dt, tx, tz) {
    const pos = m.figure.mount.position
    const dx = tx - pos.x
    const dz = tz - pos.z
    const dist = Math.hypot(dx, dz)
    if (dist > 0.15) {
      const step = Math.min(dist, m.speed * dt)
      const nx = pos.x + (dx / dist) * step
      const nz = pos.z + (dz / dist) * step
      pos.set(nx, elevationAt(nz), nz)
      m.figure.mount.rotation.y = Math.atan2(dx, dz)
      return false
    }
    return true
  }

  function update(dt) {
    if (!active) return
    members.forEach((m) => {
      m.stateElapsed += dt
      if (m.state === 'onRoad') {
        m.figure.setWalking(true)
        if (stepToward(m, dt, roadJunction.x, roadJunction.z)) {
          m.state = 'approaching'
          m.stateElapsed = 0
        }
      } else if (m.state === 'approaching') {
        m.figure.setWalking(true)
        if (stepToward(m, dt, m.targetX, m.targetZ)) {
          m.state = 'gathered'
          m.stateElapsed = 0
        }
      } else if (m.state === 'gathered') {
        // Holds the aiming pose in place — reads as pressing at the door,
        // without the running clip looking like jogging in place.
        m.figure.setWalking(false)
      } else if (m.state === 'retreating') {
        m.figure.setWalking(true)
        const arrived = stepToward(m, dt, m.spawnX, m.spawnZ)
        if (arrived || m.stateElapsed > retreatMaxDuration) {
          m.state = 'fading'
          m.stateElapsed = 0
        }
      } else if (m.state === 'fading') {
        const t = Math.min(m.stateElapsed / fadeDuration, 1)
        m.materials.forEach((mat) => {
          mat.opacity = 1 - t
        })
        if (t >= 1) {
          m.figure.mount.visible = false
          m.state = 'hidden'
        }
      }
      m.figure.update(dt)
    })
  }

  // Fraction of the crowd that has reached the house — drives the approach
  // stage's tension ramp off actual crowd proximity rather than a timer.
  function arrivedRatio() {
    const arrived = members.filter((m) => m.state !== 'idle' && m.state !== 'onRoad' && m.state !== 'approaching').length
    return arrived / members.length
  }

  function beginRetreat() {
    members.forEach((m) => {
      m.state = 'retreating'
      m.stateElapsed = 0
    })
  }

  function isDone() {
    return members.every((m) => m.state === 'hidden')
  }

  // True if any still-visible member is within `radius` of `position` —
  // used to catch the player if they wander into the crowd.
  function checkCollision(position, radius) {
    return members.some(
      (m) => m.state !== 'hidden' && m.figure.mount.position.distanceTo(position) < radius
    )
  }

  return { group, update, activate, arrivedRatio, beginRetreat, isDone, checkCollision }
}
