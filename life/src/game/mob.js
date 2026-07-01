import * as THREE from 'three'
import { wrapFigure } from './characters'
import { elevationAt, ROAD_Z } from './environment'

// Deliberately all brown/olive/grey — no blues or greens close to dad's
// teal or the uncle's blue, so the family reads as distinct from the crowd.
const CLOTHING_COLORS = [0x4a3c2c, 0x5c3a3a, 0x4a4a3a, 0x3a3428, 0x554433, 0x40382a]

function randomMobColors() {
  const torso = CLOTHING_COLORS[Math.floor(Math.random() * CLOTHING_COLORS.length)]
  return {
    torso,
    legs: 0x2a2a26,
    head: 0xf2c48d,
    hair: Math.random() > 0.5 ? 0x2a2015 : 0x1c1c1c,
  }
}

function randRange([min, max]) {
  return min + Math.random() * (max - min)
}

// Crowd figures are background dressing at a distance — cast no shadows
// (that's the expensive part) and mark materials transparent up front so
// the retreat fade-out can just ramp opacity later.
function prepMobFigure(mount) {
  const materials = []
  mount.traverse((obj) => {
    if (!obj.isMesh) return
    obj.castShadow = false
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    mats.forEach((mat) => {
      if (mat && !materials.includes(mat)) {
        mat.transparent = true
        materials.push(mat)
      }
    })
  })
  return materials
}

// A crowd of full, leg-swinging minifigures (reusing characters.js'
// wrapFigure) that comes down the road (parallel to the river), turns onto
// the short driveway to the house, gathers/presses at the door and yard,
// then retreats back up the road and fades once the attack beat ends.
export function createMobCrowd(count = 16, options = {}) {
  // Spawn far to one side, along the road (fixed-ish Z, varying X), so the
  // crowd visibly travels the road before turning toward the house.
  const spawnXRange = options.spawnXRange ?? [-24, -18]
  const spawnZRange = options.spawnZRange ?? [ROAD_Z - 1.5, ROAD_Z + 1.5]
  // The driveway junction where the road meets the path to the house.
  const roadJunction = options.roadJunction ?? { x: 0, z: ROAD_Z }
  // Yard sits between the (bigger) house's front door at z~5.8 and the
  // fence's street-facing gate at z=9.
  const gatherZRange = options.gatherZRange ?? [6.5, 8.8]
  const gatherXRange = options.gatherXRange ?? [-3.5, 1.5]
  const doorZ = options.doorZ ?? 6.3
  const doorXRange = options.doorXRange ?? [-0.5, 0.5]
  const doorFraction = options.doorFraction ?? 0.25
  const speedRange = options.speedRange ?? [1.6, 2.4]
  const retreatMaxDuration = options.retreatMaxDuration ?? 6
  const fadeDuration = options.fadeDuration ?? 1.5

  const group = new THREE.Group()
  const members = []

  for (let i = 0; i < count; i++) {
    const figure = wrapFigure(randomMobColors(), {})
    const materials = prepMobFigure(figure.mount)

    const x = randRange(spawnXRange)
    const z = randRange(spawnZRange)
    figure.mount.position.set(x, elevationAt(z), z)
    group.add(figure.mount)

    const atDoor = Math.random() < doorFraction
    const targetX = atDoor ? randRange(doorXRange) : randRange(gatherXRange)
    const targetZ = atDoor ? doorZ + (Math.random() - 0.5) * 0.4 : randRange(gatherZRange)

    members.push({
      figure,
      materials,
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
        // Agitated shuffle in place — reads as pressing/banging at the door.
        m.figure.setWalking(true)
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

  return { group, update, activate, arrivedRatio, beginRetreat, isDone }
}
