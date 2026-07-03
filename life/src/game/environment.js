import * as THREE from 'three'
import { TorchGroup, createEmberField, updateEmberField } from './effects'
import { makeMoonTexture, makeGlowTexture } from './textures'
import { brick, slopeRoof, baseplateTile, BRICK_H, STUD } from './lego'

// Ground elevation keyframes: [z, groundY]. Linear interpolation between them.
const GROUND_KEYS = [
  [8, 0],
  [-1, 0],
  [-9, 0],
  [-9.6, -0.45],
  [-12.4, -0.55],
  [-14.6, -0.05],
  [-18, 0.2],
  [-24, 2.4],
  [-29.5, 4.5],
  [-36, 4.7],
]

export function elevationAt(z) {
  if (z >= GROUND_KEYS[0][0]) return GROUND_KEYS[0][1]
  for (let i = 0; i < GROUND_KEYS.length - 1; i++) {
    const [z0, y0] = GROUND_KEYS[i]
    const [z1, y1] = GROUND_KEYS[i + 1]
    if (z <= z0 && z >= z1) {
      const t = (z0 - z) / (z0 - z1)
      return y0 + (y1 - y0) * t
    }
  }
  return GROUND_KEYS[GROUND_KEYS.length - 1][1]
}

// The road that the mob comes down runs parallel to the river (both along
// X), crossing the open field at this Z — a short driveway connects it to
// the house's front gate.
export const ROAD_Z = 11

// Where the boy sleeps until the player walks over and picks him up — see
// ZoneDirector.tryPickup() in zones.js.
export const BED_X = -1.6
export const BED_Z = 3.4

// The stream crossing, reused for the morning return trip — see
// ZoneDirector's 'return' stage in zones.js.
export const STREAM_CENTER_X = 1.6
export const STREAM_CENTER_Z = -12.4
const STREAM_HALF_DEPTH = 2.6 // half of the water plane's un-flooded Z extent
const FLOOD_SCALE_Z = 1.4 // how much wider the stream gets once flooded
export const FLOOD_HALF_DEPTH = STREAM_HALF_DEPTH * FLOOD_SCALE_Z
// The flooded water's true edges — used to gate the barrier, the "walk on
// the plank or fall in" check, and the "crossed" subtitle.
export const FLOOD_SOUTH_Z = STREAM_CENTER_Z - FLOOD_HALF_DEPTH // forest side
export const FLOOD_NORTH_Z = STREAM_CENTER_Z + FLOOD_HALF_DEPTH // house side

export const PLANK_WIDTH = 1.8
const PLANK_THICKNESS = 0.22
const PLANK_OVERHANG = 1 // extra length resting on each bank past the flood's true edge
const PLANK_LENGTH = FLOOD_HALF_DEPTH * 2 + PLANK_OVERHANG * 2
const PLANK_REST_X = STREAM_CENTER_X
const PLANK_REST_Z = FLOOD_SOUTH_Z - 1.5 // safely on dry ground, short walk from the barrier
const PLANK_PLACED_Y = 0.06
export const PLANK_SURFACE_Y = PLANK_PLACED_Y + PLANK_THICKNESS / 2

// Where the player needs to get to during the escape's 'hiding' beat — just
// behind the rock in the forest (see buildForest()'s rock, below), out of
// the sweeping torchlight's view. See ZoneDirector's 'intro' stage.
export const HIDE_SPOT_X = 5.6
export const HIDE_SPOT_Z = -30.3

function zoneColor(z) {
  if (z > 9) return new THREE.Color(0x4a4438) // open field beyond the yard
  if (z > -9) return new THREE.Color(0x33422c) // yard grass
  if (z > -14.6) return new THREE.Color(0x3a3a2c) // stream banks, muddy
  if (z > -18) return new THREE.Color(0x2c3322) // transition
  return new THREE.Color(0x1d2a1c) // deep forest floor
}

function buildGround() {
  const widthSegs = 45
  const depthSegs = 70
  const width = 56
  const zStart = 16
  const zEnd = -36
  const geometry = new THREE.PlaneGeometry(width, zStart - zEnd, widthSegs, depthSegs)
  geometry.rotateX(-Math.PI / 2)
  const pos = geometry.attributes.position
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const zLocal = pos.getZ(i) // before we overwrite, plane's local z maps to world z after centering
    const worldZ = (zStart + zEnd) / 2 - zLocal
    const y = elevationAt(worldZ) + (Math.random() - 0.5) * 0.05
    pos.setY(i, y)
    pos.setZ(i, worldZ)
    const c = zoneColor(worldZ)
    colors[i * 3] = c.r + (Math.random() - 0.5) * 0.03
    colors[i * 3 + 1] = c.g + (Math.random() - 0.5) * 0.03
    colors[i * 3 + 2] = c.b + (Math.random() - 0.5) * 0.03
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 1,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.receiveShadow = true
  return mesh
}

const WALL_COLOR = 0xcaa24a
const ROOF_COLOR = 0xa8302a
const WALL_UNITS = 6 // brick-heights tall
const WALL_H = WALL_UNITS * BRICK_H
// House footprint, in world units. The back wall stays fixed at z = -1 (all
// of the escape sequence's z-thresholds are calibrated relative to it) —
// only the front (street-facing) side extends further out and the walls
// widen to make the house bigger.
const HOUSE_HALF_WIDTH = 3.8
const HOUSE_BACK_Z = -1
const HOUSE_FRONT_Z = 6.8
const HOUSE_WIDTH = HOUSE_HALF_WIDTH * 2
const HOUSE_DEPTH = HOUSE_FRONT_Z - HOUSE_BACK_Z + 1.2
const HOUSE_CENTER_Z = (HOUSE_BACK_Z + HOUSE_FRONT_Z) / 2
// The window/door opening stays a fixed, human-sized gap regardless of how
// wide the walls get — only the flanking wall segments stretch to reach it.
const OPENING_HALF_WIDTH = 0.6
const WALL_SEGMENT_STUDS = (HOUSE_HALF_WIDTH - OPENING_HALF_WIDTH) / STUD
const WALL_SEGMENT_CENTER_X = (HOUSE_HALF_WIDTH + OPENING_HALF_WIDTH) / 2
// Player can't push out past this z toward the front door — they escape
// through the back window, not out the front (see ZoneDirector's
// front-door barrier check in zones.js).
export const FRONT_BARRIER_Z = HOUSE_FRONT_Z - 1.3

// A small blanketed shape with a head peeking out — reads as a sleeping
// child at a glance without needing the full minifigure rig lying down.
function buildSleepingChild() {
  const group = new THREE.Group()
  const blanketMat = new THREE.MeshStandardMaterial({ color: 0x8a3a3a, flatShading: true })
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.24, 1.35), blanketMat)
  blanket.position.set(0, 0.12, 0.05)
  blanket.castShadow = true
  blanket.receiveShadow = true
  group.add(blanket)

  const headMat = new THREE.MeshStandardMaterial({ color: 0xf2c48d, flatShading: true })
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), headMat)
  head.position.set(0, 0.16, -0.7)
  head.castShadow = true
  group.add(head)

  const hairMat = new THREE.MeshStandardMaterial({ color: 0x4a3222, flatShading: true })
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
    hairMat
  )
  hair.position.set(0, 0.22, -0.7)
  group.add(hair)

  return group
}

function buildHouse() {
  const group = new THREE.Group()
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3f, flatShading: true })

  const floor = new THREE.Mesh(new THREE.BoxGeometry(HOUSE_WIDTH, 0.1, HOUSE_DEPTH), floorMat)
  floor.position.set(0, -0.05, HOUSE_CENTER_Z)
  floor.receiveShadow = true
  group.add(floor)

  // Back wall (z = -1), split to leave a window/exit gap in the middle.
  const backLeft = brick(WALL_SEGMENT_STUDS, 1, WALL_UNITS, WALL_COLOR, { studs: false })
  backLeft.position.set(-WALL_SEGMENT_CENTER_X, 0, HOUSE_BACK_Z)
  group.add(backLeft)
  const backRight = brick(WALL_SEGMENT_STUDS, 1, WALL_UNITS, WALL_COLOR, { studs: false })
  backRight.position.set(WALL_SEGMENT_CENTER_X, 0, HOUSE_BACK_Z)
  group.add(backRight)
  const lintel = brick(3, 1, 1.5, WALL_COLOR, { studs: false })
  lintel.position.set(0, WALL_H - 1.5 * BRICK_H, HOUSE_BACK_Z)
  group.add(lintel)

  // Side walls
  const sideWallStuds = (HOUSE_DEPTH + 1.4) / STUD
  const leftWall = brick(1, sideWallStuds, WALL_UNITS, WALL_COLOR, { studs: false })
  leftWall.position.set(-HOUSE_HALF_WIDTH, 0, HOUSE_CENTER_Z)
  group.add(leftWall)
  const rightWall = brick(1, sideWallStuds, WALL_UNITS, WALL_COLOR, { studs: false })
  rightWall.position.set(HOUSE_HALF_WIDTH, 0, HOUSE_CENTER_Z)
  group.add(rightWall)

  // Front wall, facing the street — split to leave a door opening in the
  // middle, mirroring the back-window split above.
  const frontLeft = brick(WALL_SEGMENT_STUDS, 1, WALL_UNITS, WALL_COLOR, { studs: false })
  frontLeft.position.set(-WALL_SEGMENT_CENTER_X, 0, HOUSE_FRONT_Z)
  group.add(frontLeft)
  const frontRight = brick(WALL_SEGMENT_STUDS, 1, WALL_UNITS, WALL_COLOR, { studs: false })
  frontRight.position.set(WALL_SEGMENT_CENTER_X, 0, HOUSE_FRONT_Z)
  group.add(frontRight)
  const frontLintel = brick(3, 1, 1.5, WALL_COLOR, { studs: false })
  frontLintel.position.set(0, WALL_H - 1.5 * BRICK_H, HOUSE_FRONT_Z)
  group.add(frontLintel)

  // Ceiling
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(HOUSE_WIDTH, 0.16, HOUSE_DEPTH), floorMat)
  ceiling.position.set(0, WALL_H + 0.08, HOUSE_CENTER_Z)
  ceiling.castShadow = true
  ceiling.receiveShadow = true
  group.add(ceiling)

  // Chunky pitched roof
  const roof = slopeRoof(23, 34, 3.5, ROOF_COLOR)
  roof.position.set(0, WALL_H + 0.9, HOUSE_CENTER_Z)
  group.add(roof)

  // A simple bed
  const bedMat = new THREE.MeshStandardMaterial({ color: 0x6b5a4a, flatShading: true })
  const mattressMat = new THREE.MeshStandardMaterial({ color: 0xcfc6b0, flatShading: true })
  const bedFrame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.35, 2), bedMat)
  bedFrame.position.set(BED_X, 0.2, BED_Z)
  bedFrame.castShadow = true
  bedFrame.receiveShadow = true
  group.add(bedFrame)
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.18, 1.9), mattressMat)
  mattress.position.set(BED_X, 0.46, BED_Z)
  mattress.castShadow = true
  mattress.receiveShadow = true
  group.add(mattress)

  const sleepingChild = buildSleepingChild()
  sleepingChild.position.set(BED_X, 0.46, BED_Z)
  group.add(sleepingChild)

  // A crate for a bit more yard detail
  const crate = brick(2, 2, 2, 0x8a5a2c)
  crate.position.set(2.0, 0, 4.4)
  group.add(crate)

  // Dim warm bedroom light, lit before the mob arrives
  const bedroomLight = new THREE.PointLight(0xffb066, 1.4, 8)
  bedroomLight.position.set(-0.6, 1.8, 2.6)
  group.add(bedroomLight)

  return { group, bedroomLight, sleepingChild }
}

// A perimeter picket fence around the house and yard, with a gate-sized gap
// on the street-facing side lining up with the door and the mob's approach.
function buildYardFence() {
  const group = new THREE.Group()
  const FENCE_COLOR = 0x5a4632
  const halfW = 6.5
  const zBack = -3.5
  const zFront = 9.0
  const spacing = 1.1
  const gateHalfWidth = 1.0

  function post(x, z) {
    const p = brick(1, 1, 2, FENCE_COLOR, { studs: false })
    p.position.set(x, 0, z)
    group.add(p)
  }

  for (let z = zBack; z <= zFront + 0.01; z += spacing) {
    post(-halfW, z)
    post(halfW, z)
  }
  for (let x = -halfW; x <= halfW + 0.01; x += spacing) {
    post(x, zBack)
  }
  for (let x = -halfW; x <= halfW + 0.01; x += spacing) {
    if (Math.abs(x) < gateHalfWidth) continue // gate gap facing the street
    post(x, zFront)
  }

  return group
}

// The road itself — a distinct strip crossing the field at ROAD_Z, running
// along X so it reads as parallel to the river rather than blending into
// the surrounding field color.
function buildRoad() {
  const width = 50
  const depth = 5
  const geometry = new THREE.PlaneGeometry(width, depth, 40, 4)
  geometry.rotateX(-Math.PI / 2)
  geometry.translate(0, 0.02, ROAD_Z)
  const pos = geometry.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const base = new THREE.Color(0x6b6255)
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, pos.getY(i) + (Math.random() - 0.5) * 0.03)
    colors[i * 3] = base.r + (Math.random() - 0.5) * 0.04
    colors[i * 3 + 1] = base.g + (Math.random() - 0.5) * 0.04
    colors[i * 3 + 2] = base.b + (Math.random() - 0.5) * 0.04
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.receiveShadow = true
  return mesh
}

// A barn standing further off to the side of the house, in the same open
// yard/field but with real distance from it — not fenced in with the house.
function buildBarn(x, z) {
  const group = new THREE.Group()
  const BARN_COLOR = 0x6b2f26
  const BARN_ROOF_COLOR = 0x3a2c28
  const wallUnits = 5
  const wallH = wallUnits * BRICK_H
  const halfW = 2.4
  const halfD = 3.2

  const floorMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, flatShading: true })
  const floor = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2, 0.1, halfD * 2), floorMat)
  floor.position.set(0, -0.05, 0)
  floor.receiveShadow = true
  group.add(floor)

  const backWall = brick(12, 1, wallUnits, BARN_COLOR, { studs: false })
  backWall.position.set(0, 0, -halfD)
  group.add(backWall)
  const frontWall = brick(12, 1, wallUnits, BARN_COLOR, { studs: false })
  frontWall.position.set(0, 0, halfD)
  group.add(frontWall)
  const leftWall = brick(1, 16, wallUnits, BARN_COLOR, { studs: false })
  leftWall.position.set(-halfW + 0.05, 0, 0)
  group.add(leftWall)
  const rightWall = brick(1, 16, wallUnits, BARN_COLOR, { studs: false })
  rightWall.position.set(halfW - 0.05, 0, 0)
  group.add(rightWall)

  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2, 0.14, halfD * 2), floorMat)
  ceiling.position.set(0, wallH + 0.07, 0)
  ceiling.castShadow = true
  ceiling.receiveShadow = true
  group.add(ceiling)

  const roof = slopeRoof(18, 27, 3, BARN_ROOF_COLOR)
  roof.position.set(0, wallH + 0.8, 0)
  group.add(roof)

  const barnLight = new THREE.PointLight(0xffb066, 0.8, 6)
  barnLight.position.set(0, 1.6, halfD - 0.3)
  group.add(barnLight)

  group.position.set(x, 0, z)
  return group
}

function buildStream() {
  // Long in X (the river's length, so both banks run off past the visible
  // frame) and narrow in Z (the crossing width) — reads as a river rather
  // than a contained pond. Kept centered on its own group (rather than
  // baking the world-space offset into the geometry) so floodStream() can
  // scale it wider around its true center for the morning return trip.
  const group = new THREE.Group()
  const geometry = new THREE.PlaneGeometry(30, 5.2, 56, 10)
  geometry.rotateX(-Math.PI / 2)
  const material = new THREE.MeshStandardMaterial({
    color: 0x0d2836,
    flatShading: true,
    roughness: 0.3,
    metalness: 0.2,
    transparent: true,
    opacity: 0.88,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.basePositions = geometry.attributes.position.array.slice()
  group.add(mesh)
  group.position.set(STREAM_CENTER_X, -0.5, STREAM_CENTER_Z)
  group.userData.mesh = mesh
  return group
}

function updateWater(streamGroup, elapsed) {
  const mesh = streamGroup.userData.mesh
  const pos = mesh.geometry.attributes.position
  const base = mesh.userData.basePositions
  for (let i = 0; i < pos.count; i++) {
    const ix = i * 3
    const x = base[ix]
    const z = base[ix + 2]
    // A ridge that travels along X over time (the river's length) reads as
    // flowing current, layered under a smaller cross-wise ripple for texture.
    pos.array[ix + 1] =
      base[ix + 1] + Math.sin(x * 0.5 - elapsed * 1.8) * 0.035 + Math.sin(z * 1.4 + elapsed * 0.7) * 0.015
  }
  pos.needsUpdate = true
}

// Widens and raises the stream around its own center once morning comes —
// the ford that was walkable at night is a real crossing now, so the player
// needs the plank (see buildPlank()/placePlank() below).
function floodStream(streamGroup) {
  streamGroup.scale.z = FLOOD_SCALE_Z
  streamGroup.position.y += 0.3
}

// A plank the player must lay across the stream on the return trip. Sized to
// fully cover the flooded water plus a bit of overhang onto each bank, so no
// water is left exposed on either side once it's placed. Starts resting
// crosswise on the forest-side bank (long axis along X); once placed it
// pivots to span the water (long axis along Z).
function buildPlank() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, flatShading: true })
  const plank = new THREE.Mesh(new THREE.BoxGeometry(PLANK_WIDTH, PLANK_THICKNESS, PLANK_LENGTH), mat)
  plank.castShadow = true
  plank.receiveShadow = true
  plank.rotation.y = Math.PI / 2
  plank.position.set(PLANK_REST_X, elevationAt(PLANK_REST_Z) + PLANK_THICKNESS / 2, PLANK_REST_Z)
  return plank
}

function placePlank(plank) {
  plank.rotation.y = 0
  plank.position.set(STREAM_CENTER_X, PLANK_PLACED_Y, STREAM_CENTER_Z)
}

function distanceToPath(x, z) {
  // Rough path centerline x as a function of z, used to keep a tree-free lane.
  const cx = z > -9 ? 0.8 : z > -18 ? 1.6 : 2.2 + (-18 - z) * 0.18
  return Math.abs(x - cx)
}

function buildForest() {
  const group = new THREE.Group()
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2c20, flatShading: true })
  const canopyMats = [
    new THREE.MeshStandardMaterial({ color: 0x1f3320, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x24351f, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x1a2c1e, flatShading: true }),
  ]

  // Gather placements first so we know exact per-material instance counts
  // before allocating the InstancedMeshes.
  const specs = []
  const count = 170
  for (let i = 0; i < count; i++) {
    // Extends up to z = -1 (right behind the house) so the yard the player
    // actually runs through has a few trees too, not just bare baseplate.
    const z = -1 - Math.random() * 35
    const density = z < -18 ? 1 : z < -10 ? 0.4 : 0.15
    if (Math.random() > density) continue
    const x = (Math.random() - 0.5) * 22
    if (distanceToPath(x, z) < 1.6) continue
    specs.push({
      x,
      z,
      groundY: elevationAt(z),
      trunkHeight: 1.6 + Math.random() * 1.6,
      canopyHeight: 1.6 + Math.random() * 1.4,
      canopyRadius: 0.7 + Math.random() * 0.5,
      canopyRotY: Math.random() * Math.PI,
      matIndex: i % canopyMats.length,
    })
  }

  const dummy = new THREE.Object3D()

  const trunkGeo = new THREE.CylinderGeometry(0.08, 0.14, 1, 5)
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, specs.length)
  trunkMesh.castShadow = true
  trunkMesh.receiveShadow = true

  const canopyGeo = new THREE.ConeGeometry(1, 1, 6)
  const canopyBuckets = canopyMats.map((mat, gi) => ({
    mesh: new THREE.InstancedMesh(canopyGeo, mat, specs.filter((s) => s.matIndex === gi).length),
    cursor: 0,
  }))
  canopyBuckets.forEach(({ mesh }) => {
    mesh.castShadow = true
    mesh.receiveShadow = true
  })

  specs.forEach((s, idx) => {
    dummy.position.set(s.x, s.groundY + s.trunkHeight / 2, s.z)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.set(1, s.trunkHeight, 1)
    dummy.updateMatrix()
    trunkMesh.setMatrixAt(idx, dummy.matrix)

    const bucket = canopyBuckets[s.matIndex]
    dummy.position.set(s.x, s.groundY + s.trunkHeight + s.canopyHeight / 2 - 0.2, s.z)
    dummy.rotation.set(0, s.canopyRotY, 0)
    dummy.scale.set(s.canopyRadius, s.canopyHeight, s.canopyRadius)
    dummy.updateMatrix()
    bucket.mesh.setMatrixAt(bucket.cursor++, dummy.matrix)
  })
  trunkMesh.instanceMatrix.needsUpdate = true
  group.add(trunkMesh)
  canopyBuckets.forEach(({ mesh }) => {
    mesh.instanceMatrix.needsUpdate = true
    group.add(mesh)
  })

  // A large rock near the hideout for cover
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x4a4f55, flatShading: true })
  const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 0), rockMat)
  rock.position.set(5.6, elevationAt(-29.5) + 0.6, -29)
  rock.scale.set(1.3, 0.9, 1.1)
  rock.rotation.set(0.3, 0.6, 0.1)
  rock.castShadow = true
  rock.receiveShadow = true
  group.add(rock)

  // A soft patch of moonlight breaking through the canopy right where the
  // player needs to get to behind the rock — see HIDE_SPOT_X/Z above and
  // ZoneDirector's 'intro' stage in zones.js.
  const hideGlowMat = new THREE.MeshBasicMaterial({
    map: makeGlowTexture('rgba(210,225,255,0.6)', 'rgba(210,225,255,0)'),
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
  })
  const hideGlow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), hideGlowMat)
  hideGlow.rotation.x = -Math.PI / 2
  hideGlow.position.set(HIDE_SPOT_X, elevationAt(HIDE_SPOT_Z) + 0.03, HIDE_SPOT_Z)
  group.add(hideGlow)

  // Grass blades scattered across the forest floor, same bucket-instancing
  // approach as the trunks/canopies above.
  const bladeGeo = new THREE.CylinderGeometry(0.02, 0.06, 1, 3)
  const bladeMats = [
    new THREE.MeshStandardMaterial({ color: 0x3a5a2c, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x2f4a24, flatShading: true }),
  ]
  const bladeSpecs = []
  const bladeCount = 2000
  for (let i = 0; i < bladeCount; i++) {
    const z = -18 - Math.random() * 18
    const x = (Math.random() - 0.5) * 24
    bladeSpecs.push({
      x,
      z,
      groundY: elevationAt(z),
      height: 0.15 + Math.random() * 0.2,
      rotY: Math.random() * Math.PI,
      matIndex: i % bladeMats.length,
    })
  }
  const bladeBuckets = bladeMats.map((mat, gi) => ({
    mesh: new THREE.InstancedMesh(bladeGeo, mat, bladeSpecs.filter((s) => s.matIndex === gi).length),
    cursor: 0,
  }))
  bladeBuckets.forEach(({ mesh }) => {
    mesh.receiveShadow = true
  })
  bladeSpecs.forEach((s) => {
    const bucket = bladeBuckets[s.matIndex]
    dummy.position.set(s.x, s.groundY + s.height / 2, s.z)
    dummy.rotation.set(0, s.rotY, 0)
    dummy.scale.set(1, s.height, 1)
    dummy.updateMatrix()
    bucket.mesh.setMatrixAt(bucket.cursor++, dummy.matrix)
  })
  bladeBuckets.forEach(({ mesh }) => {
    mesh.instanceMatrix.needsUpdate = true
    group.add(mesh)
  })

  return group
}

// A single street lamp: pole + glowing head + warm point light, lighting
// the approach street the way the bedroom light/torches light the yard.
function buildStreetLamp(x, z) {
  const group = new THREE.Group()
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, flatShading: true, roughness: 0.6 })
  const poleHeight = 3.4
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, poleHeight, 6), poleMat)
  pole.position.set(x, poleHeight / 2, z)
  pole.castShadow = true
  group.add(pole)

  const headMat = new THREE.MeshStandardMaterial({
    color: 0xffdca0,
    emissive: 0xffb35c,
    emissiveIntensity: 1.4,
    flatShading: true,
  })
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), headMat)
  head.position.set(x, poleHeight + 0.05, z)
  group.add(head)

  const glowMat = new THREE.SpriteMaterial({
    map: makeGlowTexture('rgba(255,210,140,0.9)', 'rgba(255,170,80,0)'),
    color: 0xffc98a,
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
  })
  const glow = new THREE.Sprite(glowMat)
  glow.position.copy(head.position)
  glow.scale.setScalar(1.6)
  group.add(glow)

  const light = new THREE.PointLight(0xffb35c, 2.0, 8)
  light.position.copy(head.position)
  group.add(light)

  return group
}

// A row of lamps lighting the road the mob comes down, spaced along it
// (alternating slightly off-center) rather than blocking the driveway gate.
function buildStreetLamps() {
  const group = new THREE.Group()
  const positions = [
    [-18, ROAD_Z - 1.4],
    [-6, ROAD_Z + 1.4],
    [6, ROAD_Z - 1.4],
    [18, ROAD_Z + 1.4],
  ]
  positions.forEach(([x, z]) => group.add(buildStreetLamp(x, z)))
  return group
}

// A procedural crater-mottled moon, far enough away that it reads as a
// fixed sky object. `fog: false` on its materials keeps it visible through
// the scene's exponential fog regardless of distance.
function buildMoon() {
  const group = new THREE.Group()

  const moonMat = new THREE.MeshStandardMaterial({
    map: makeMoonTexture(),
    emissive: 0xaab4d9,
    emissiveIntensity: 0.45,
    roughness: 1,
    fog: false,
    transparent: true,
  })
  const moon = new THREE.Mesh(new THREE.SphereGeometry(3.2, 24, 24), moonMat)
  group.add(moon)

  const glowMat = new THREE.SpriteMaterial({
    map: makeGlowTexture('rgba(225,235,255,0.9)', 'rgba(180,200,255,0)'),
    color: 0xbfd0ff,
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
  })
  const glow = new THREE.Sprite(glowMat)
  glow.scale.setScalar(14)
  group.add(glow)

  group.position.set(16, 28, -60)

  function setOpacity(v) {
    moonMat.opacity = v
    glowMat.opacity = v * 0.9
  }

  return { group, setOpacity }
}

export function buildWorld(scene) {
  const hemiLight = new THREE.HemisphereLight(0x3a5590, 0x445a34, 2.6)
  scene.add(hemiLight)
  // A flat, angle-independent fill so no surface ever goes fully black,
  // regardless of which way it happens to be facing the directional light.
  const fillLight = new THREE.AmbientLight(0x445566, 1.4)
  scene.add(fillLight)
  const dirLight = new THREE.DirectionalLight(0x8fb0ff, 1.4)
  dirLight.position.set(-6, 10, 4)
  dirLight.castShadow = true
  dirLight.shadow.mapSize.set(2048, 2048)
  dirLight.shadow.bias = -0.0015
  dirLight.shadow.camera.near = 1
  dirLight.shadow.camera.far = 60
  dirLight.shadow.camera.left = -22
  dirLight.shadow.camera.right = 22
  dirLight.shadow.camera.top = 20
  dirLight.shadow.camera.bottom = -45
  scene.add(dirLight)

  const moon = buildMoon()
  scene.add(moon.group)

  const ground = buildGround()
  scene.add(ground)

  const streetLamps = buildStreetLamps()
  scene.add(streetLamps)

  // A patch of LEGO baseplate in the yard behind the house, where the ground
  // is "tamed" — it gives way to loose, organic forest terrain further out.
  const yardPlate = baseplateTile(34, 26, 0x3f8a3f)
  yardPlate.position.set(0, 0.05, -5.5)
  scene.add(yardPlate)

  const road = buildRoad()
  scene.add(road)

  const { group: houseGroup, bedroomLight, sleepingChild } = buildHouse()
  scene.add(houseGroup)

  // Decorative only (not a camera-collision obstacle) — added directly to
  // the scene rather than houseGroup so thin fence posts don't snag the
  // camera's raycast against world.houseGroup.
  scene.add(buildYardFence())

  // A barn in the back yard (left side), where the player actually runs
  // during the escape — the front yard past the fence is never visited in
  // normal play, so a barn placed there would never be seen.
  scene.add(buildBarn(-10, -5))

  const water = buildStream()
  scene.add(water)

  const plank = buildPlank()
  scene.add(plank)

  const forest = buildForest()
  scene.add(forest)

  const emberField = createEmberField(60, 20)
  emberField.position.set(2, 0, -24)
  scene.add(emberField)

  // Mob presence near the front of the house — suggested only through light, never depicted.
  const torchGroupHouse = new TorchGroup(10, 4)
  torchGroupHouse.group.position.set(-1, 0, HOUSE_FRONT_Z + 0.7)
  scene.add(torchGroupHouse.group)

  // A second torch line that sweeps past below the hideout in the final beats.
  const torchGroupForest = new TorchGroup(8, 3)
  torchGroupForest.group.position.set(-4, elevationAt(-22), -22)
  scene.add(torchGroupForest.group)

  let elapsed = 0
  function update(dt) {
    elapsed += dt
    updateWater(water, elapsed)
    updateEmberField(emberField, dt, elapsed)
    torchGroupHouse.update()
    torchGroupForest.update()
  }

  return {
    hemiLight,
    dirLight,
    bedroomLight,
    water,
    moon,
    houseGroup,
    sleepingChild,
    bedPosition: new THREE.Vector3(BED_X, 0, BED_Z),
    plank,
    plankRestPosition: new THREE.Vector3(PLANK_REST_X, 0, PLANK_REST_Z),
    floodStream: () => floodStream(water),
    placePlank: () => placePlank(plank),
    torchGroupHouse,
    torchGroupForest,
    update,
  }
}
