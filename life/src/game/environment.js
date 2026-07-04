import * as THREE from 'three'
import { TorchGroup, createEmberField, updateEmberField } from './effects'
import { makeMoonTexture, makeGlowTexture } from './textures'
import { brick, slopeRoof, baseplateTile, BRICK_H, STUD, buildMinifigure } from './lego'

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
const STREAM_HALF_DEPTH = 3.6 // half of the water plane's un-flooded Z extent
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
  if (z > -9) return new THREE.Color(0x2a6b30) // yard grass — vivid green
  if (z > -14.6) return new THREE.Color(0x3a3a2c) // stream banks, muddy
  if (z > -18) return new THREE.Color(0x1f4a1e) // transition — dark green
  return new THREE.Color(0x163a16) // deep forest floor — dark green
}

// A worn brown-gray dirt path blended in along the walked route (house ->
// stream -> hideout) — see distanceToPath() below, which already tracks
// this same corridor to keep it clear of trees. Wide and light enough to
// read clearly against the dark green forest floor, not just a faint tint.
const PATH_COLOR = new THREE.Color(0x7a6a52)
const PATH_HALF_WIDTH = 1.8

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
  const blended = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const zLocal = pos.getZ(i) // before we overwrite, plane's local z maps to world z after centering
    const worldZ = (zStart + zEnd) / 2 - zLocal
    const worldX = pos.getX(i)
    const y = elevationAt(worldZ) + (Math.random() - 0.5) * 0.05
    pos.setY(i, y)
    pos.setZ(i, worldZ)
    let c = zoneColor(worldZ)
    const pathDist = distanceToPath(worldX, worldZ)
    if (pathDist < PATH_HALF_WIDTH) {
      blended.copy(c).lerp(PATH_COLOR, (1 - pathDist / PATH_HALF_WIDTH) * 0.95)
      c = blended
    }
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
const WALL_UNITS = 9 // brick-heights tall
const WALL_H = WALL_UNITS * BRICK_H
// House footprint, in world units. The back wall stays fixed at z = -1 (all
// of the escape sequence's z-thresholds are calibrated relative to it) —
// only the front (street-facing) side extends further out and the walls
// widen to make the house bigger.
const HOUSE_HALF_WIDTH = 5.4
const HOUSE_BACK_Z = -1
const HOUSE_FRONT_Z = 8.5
const HOUSE_WIDTH = HOUSE_HALF_WIDTH * 2
const HOUSE_DEPTH = HOUSE_FRONT_Z - HOUSE_BACK_Z + 1.2
const HOUSE_CENTER_Z = (HOUSE_BACK_Z + HOUSE_FRONT_Z) / 2
// The door opening stays a fixed, human-sized gap regardless of how wide
// the walls get — only the flanking wall segments stretch to reach it.
const DOOR_HALF_WIDTH = 0.6
const WALL_SEGMENT_STUDS = (HOUSE_HALF_WIDTH - DOOR_HALF_WIDTH) / STUD
const WALL_SEGMENT_CENTER_X = (HOUSE_HALF_WIDTH + DOOR_HALF_WIDTH) / 2
// Player can't push out past this z toward the front door — they escape
// through the back window, not out the front (see ZoneDirector's
// front-door barrier check in zones.js).
export const FRONT_BARRIER_Z = HOUSE_FRONT_Z - 1.3
// How tall the back opening's sill is — this is what makes it read as a
// window (an opening that starts above the floor, low enough to still
// climb through) rather than a second door identical to the front one.
const WINDOW_SILL_H = 0.9
// The window is deliberately bigger than the door opening — wide and tall
// enough to read as a real "climb out" opening (see the WINDOW_CLIMB
// mechanic in zones.js, which now gates crossing it on an E-keypress).
const WINDOW_HALF_WIDTH = 1.1
const WINDOW_OPENING_H = 2.1
const WINDOW_WALL_SEGMENT_STUDS = (HOUSE_HALF_WIDTH - WINDOW_HALF_WIDTH) / STUD
const WINDOW_WALL_SEGMENT_CENTER_X = (HOUSE_HALF_WIDTH + WINDOW_HALF_WIDTH) / 2
// Where the player interacts (E) to climb through the window, and where
// they land outside afterward — see ZoneDirector's climbThroughWindow().
export const WINDOW_INSIDE_POS = new THREE.Vector3(0, 0, HOUSE_BACK_Z + 1.1)
export const WINDOW_OUTSIDE_POS = new THREE.Vector3(0, 0, HOUSE_BACK_Z - 1.1)

// The interior partition wall splitting the house into a back bedroom and
// a small front room near the door — see buildHouse() below, where it's
// actually built, and getWallColliders(), which blocks its solid sections.
const PARTITION_Z = HOUSE_BACK_Z + 5.8
const PARTITION_DOORWAY_X = 2.0
const PARTITION_DOORWAY_HALF_WIDTH = 0.9

const WALL_HALF_THICKNESS = STUD / 2

// Solid wall rectangles for dad/uncle to collide with (see
// resolveWallCollision below) — the window gap is deliberately excluded
// here since crossing it is gated by a scripted E-keypress climb instead
// (see ZoneDirector's climbThroughWindow() in zones.js), and the door gap
// is excluded since the FRONT_BARRIER_Z soft clamp already keeps the
// player well clear of it.
export function getWallColliders() {
  return [
    { minX: -HOUSE_HALF_WIDTH, maxX: -WINDOW_HALF_WIDTH, minZ: HOUSE_BACK_Z - WALL_HALF_THICKNESS, maxZ: HOUSE_BACK_Z + WALL_HALF_THICKNESS },
    { minX: WINDOW_HALF_WIDTH, maxX: HOUSE_HALF_WIDTH, minZ: HOUSE_BACK_Z - WALL_HALF_THICKNESS, maxZ: HOUSE_BACK_Z + WALL_HALF_THICKNESS },
    { minX: -HOUSE_HALF_WIDTH, maxX: -DOOR_HALF_WIDTH, minZ: HOUSE_FRONT_Z - WALL_HALF_THICKNESS, maxZ: HOUSE_FRONT_Z + WALL_HALF_THICKNESS },
    { minX: DOOR_HALF_WIDTH, maxX: HOUSE_HALF_WIDTH, minZ: HOUSE_FRONT_Z - WALL_HALF_THICKNESS, maxZ: HOUSE_FRONT_Z + WALL_HALF_THICKNESS },
    { minX: -HOUSE_HALF_WIDTH - WALL_HALF_THICKNESS, maxX: -HOUSE_HALF_WIDTH + WALL_HALF_THICKNESS, minZ: HOUSE_BACK_Z - 1, maxZ: HOUSE_FRONT_Z + 1 },
    { minX: HOUSE_HALF_WIDTH - WALL_HALF_THICKNESS, maxX: HOUSE_HALF_WIDTH + WALL_HALF_THICKNESS, minZ: HOUSE_BACK_Z - 1, maxZ: HOUSE_FRONT_Z + 1 },
    // The interior partition, solid except for its doorway gap.
    { minX: -HOUSE_HALF_WIDTH, maxX: PARTITION_DOORWAY_X - PARTITION_DOORWAY_HALF_WIDTH, minZ: PARTITION_Z - WALL_HALF_THICKNESS, maxZ: PARTITION_Z + WALL_HALF_THICKNESS },
    { minX: PARTITION_DOORWAY_X + PARTITION_DOORWAY_HALF_WIDTH, maxX: HOUSE_HALF_WIDTH, minZ: PARTITION_Z - WALL_HALF_THICKNESS, maxZ: PARTITION_Z + WALL_HALF_THICKNESS },
  ]
}

// The game's only "physics": a circle-vs-axis-aligned-rectangle push-out.
// If `pos` (a plain {x,z}-bearing object, e.g. an Object3D's .position) ends
// up inside/too close to a solid wall rectangle, nudge it back out along
// the shortest escape direction. Used by player.js and companion.js so dad
// and the uncle can't clip through house walls.
export function resolveWallCollision(pos, radius, colliders) {
  for (const c of colliders) {
    const closestX = Math.max(c.minX, Math.min(pos.x, c.maxX))
    const closestZ = Math.max(c.minZ, Math.min(pos.z, c.maxZ))
    const dx = pos.x - closestX
    const dz = pos.z - closestZ
    const distSq = dx * dx + dz * dz
    if (distSq >= radius * radius) continue
    const dist = Math.sqrt(distSq)
    if (dist < 1e-5) {
      // Dead-center inside the rectangle (shouldn't normally happen) — push
      // out along whichever axis has the least penetration.
      const penX = Math.min(pos.x - c.minX, c.maxX - pos.x)
      const penZ = Math.min(pos.z - c.minZ, c.maxZ - pos.z)
      if (penX < penZ) pos.x += pos.x < (c.minX + c.maxX) / 2 ? -radius : radius
      else pos.z += pos.z < (c.minZ + c.maxZ) / 2 ? -radius : radius
      continue
    }
    const push = radius - dist
    pos.x += (dx / dist) * push
    pos.z += (dz / dist) * push
  }
}

// The same minifigure used for the standalone "boy" figure (see
// createBoyFigure() in characters.js), laid on its back on the mattress —
// reads as a normal LEGO minifigure asleep, rather than an ad-hoc blob.
function buildSleepingChild() {
  const outer = new THREE.Group()
  const { group } = buildMinifigure(
    { torso: 0xd4453a, legs: 0x2f3a5f, head: 0xf2c48d, hair: 0x4a3222 },
    { scale: 0.62 }
  )
  // Standing, the rig's feet are at local y=0 and it extends upward along
  // +y; rotating -90 degrees about X lays it flat, extending along -z from
  // the origin. Center that span on the mattress and rest it on top.
  group.rotation.x = -Math.PI / 2
  group.position.set(0, 0, 0.55)
  outer.add(group)
  return outer
}

// A simple couch, set with its back to the back wall so it sits facing
// into the room, in front of the window.
function buildCouch() {
  const group = new THREE.Group()
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a5a6b, flatShading: true })
  const cushionMat = new THREE.MeshStandardMaterial({ color: 0x4a7086, flatShading: true })

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 0.7), bodyMat)
  base.position.set(0, 0.2, 0)
  group.add(base)

  const seatCushion = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.22, 0.6), cushionMat)
  seatCushion.position.set(0, 0.51, 0.02)
  group.add(seatCushion)

  const backrest = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 0.22), bodyMat)
  backrest.position.set(0, 0.75, -0.34)
  group.add(backrest)

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.7), bodyMat)
  armL.position.set(-0.9, 0.47, 0)
  group.add(armL)
  const armR = armL.clone()
  armR.position.x = 0.9
  group.add(armR)

  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })
  return group
}

// Real glass — see-through, not just a dark tinted panel — shared by the
// decorative side windows and the door's window pane.
const GLASS_COLOR = 0xcfe8ee
function buildGlassMaterial() {
  return new THREE.MeshStandardMaterial({
    color: GLASS_COLOR,
    flatShading: true,
    roughness: 0.1,
    metalness: 0.05,
    transparent: true,
    opacity: 0.28,
  })
}

// A glass pane + frame, sized to actually fill a wall cutout (see
// buildSideWallWithWindows below) so you can genuinely see outside through
// it, rather than a "window" backed by solid wall.
function buildDecorativeWindow(width, height, depth) {
  const group = new THREE.Group()
  const glass = new THREE.Mesh(new THREE.BoxGeometry(depth, height, width), buildGlassMaterial())
  group.add(glass)
  const mullionMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, flatShading: true })
  const mullionH = new THREE.Mesh(new THREE.BoxGeometry(depth + 0.02, 0.05, width + 0.04), mullionMat)
  group.add(mullionH)
  const mullionV = new THREE.Mesh(new THREE.BoxGeometry(depth + 0.02, height + 0.04, 0.05), mullionMat)
  group.add(mullionV)
  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })
  // Exposed so damageHouse() (see buildWorld()) can shatter this pane once
  // the mob has been at the house.
  group.userData.glassMesh = glass
  return group
}

// Solid wall (no gap) along Z at position x, except for real cutouts at
// each z in `windowZs` — each cutout spans [sillH, sillH+windowH] and is
// filled with a genuine see-through glass pane (buildDecorativeWindow). The
// collision system is flat (X/Z only, ignoring height — see
// resolveWallCollision), so a window-height gap here doesn't open up a new
// way through the wall; it still reads as fully solid to movement.
function buildSideWallWithWindows(x, wallCenterZ, wallLengthStuds, windowZs, windowWidth, sillH, windowH) {
  const group = new THREE.Group()
  const headerH = 1.5 * BRICK_H
  const headerY = sillH + windowH
  const infillY = headerY + headerH
  const infillH = WALL_H - infillY

  const sill = brick(1, wallLengthStuds, sillH / BRICK_H, WALL_COLOR, { studs: false })
  sill.position.set(x, 0, wallCenterZ)
  group.add(sill)

  if (infillH > 0.05) {
    const infill = brick(1, wallLengthStuds, (headerH + infillH) / BRICK_H, WALL_COLOR, { studs: false })
    infill.position.set(x, headerY, wallCenterZ)
    group.add(infill)
  }

  const wallHalfLen = (wallLengthStuds * STUD) / 2
  const wallMinZ = wallCenterZ - wallHalfLen
  const wallMaxZ = wallCenterZ + wallHalfLen
  const sortedWindows = [...windowZs].sort((a, b) => a - b)
  let cursor = wallMinZ
  const segments = []
  for (const wz of sortedWindows) {
    segments.push([cursor, wz - windowWidth / 2])
    cursor = wz + windowWidth / 2
  }
  segments.push([cursor, wallMaxZ])

  for (const [segMinZ, segMaxZ] of segments) {
    const segLen = segMaxZ - segMinZ
    if (segLen <= 0.02) continue
    const seg = brick(1, segLen / STUD, windowH / BRICK_H, WALL_COLOR, { studs: false })
    seg.position.set(x, sillH, (segMinZ + segMaxZ) / 2)
    group.add(seg)
  }

  const glassMeshes = []
  for (const wz of sortedWindows) {
    const win = buildDecorativeWindow(windowWidth, windowH, 0.44)
    win.position.set(x, sillH + windowH / 2, wz)
    group.add(win)
    glassMeshes.push(win.userData.glassMesh)
  }
  group.userData.glassMeshes = glassMeshes

  return group
}

// A wooden door panel filling the front opening, with a glass pane in the
// upper half so you can see outside through it — this is the one the mob
// pounds on, and the front-door barrier (see FRONT_BARRIER_Z in zones.js)
// means it stays shut; the back window is the only real way out.
function buildDoor(width, height) {
  const group = new THREE.Group()
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x4a3222, flatShading: true })
  const lowerH = height * 0.45
  const lower = new THREE.Mesh(new THREE.BoxGeometry(width, lowerH, 0.12), doorMat)
  lower.position.y = lowerH / 2
  group.add(lower)

  const paneH = height - lowerH - 0.1
  const paneW = width - 0.16
  const glass = new THREE.Mesh(new THREE.BoxGeometry(paneW, paneH, 0.1), buildGlassMaterial())
  glass.position.y = lowerH + 0.1 + paneH / 2
  group.add(glass)
  const mullionMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, flatShading: true })
  const paneFrame = new THREE.Mesh(new THREE.BoxGeometry(paneW + 0.04, 0.05, 0.14), mullionMat)
  paneFrame.position.y = lowerH + 0.1 + paneH / 2
  group.add(paneFrame)

  const handleMat = new THREE.MeshStandardMaterial({ color: 0x8a7a4a, flatShading: true })
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 8), handleMat)
  handle.rotation.z = Math.PI / 2
  handle.position.set(width * 0.32, lowerH * 0.6, 0.1)
  group.add(handle)
  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })
  // Exposed so damageHouse() can shatter the door's own pane too.
  group.userData.glassMesh = glass
  group.userData.doorMat = doorMat
  return group
}

function buildHouse() {
  const group = new THREE.Group()
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3f, flatShading: true })

  const floor = new THREE.Mesh(new THREE.BoxGeometry(HOUSE_WIDTH, 0.1, HOUSE_DEPTH), floorMat)
  floor.position.set(0, -0.05, HOUSE_CENTER_Z)
  floor.receiveShadow = true
  group.add(floor)

  // Back wall (z = -1), split to leave a window opening in the middle — a
  // real window, not another door, so it reads distinctly from the front:
  // a solid sill fills the bottom of the gap up to WINDOW_SILL_H, and it's
  // wider/taller than the door (WINDOW_HALF_WIDTH/WINDOW_OPENING_H).
  const backLeft = brick(WINDOW_WALL_SEGMENT_STUDS, 1, WALL_UNITS, WALL_COLOR, { studs: false })
  backLeft.position.set(-WINDOW_WALL_SEGMENT_CENTER_X, 0, HOUSE_BACK_Z)
  group.add(backLeft)
  const backRight = brick(WINDOW_WALL_SEGMENT_STUDS, 1, WALL_UNITS, WALL_COLOR, { studs: false })
  backRight.position.set(WINDOW_WALL_SEGMENT_CENTER_X, 0, HOUSE_BACK_Z)
  group.add(backRight)

  // The opening itself is left completely clear (no pane/mullions) — it's
  // a window that's been thrown open for the escape, not intact glass.
  // Below it, a solid sill; above it, a header brick and then infill wall
  // up to the (possibly much taller) roofline.
  const windowStuds = (WINDOW_HALF_WIDTH * 2) / STUD
  const sillUnits = WINDOW_SILL_H / BRICK_H
  const sill = brick(windowStuds, 1, sillUnits, WALL_COLOR, { studs: false })
  sill.position.set(0, 0, HOUSE_BACK_Z)
  group.add(sill)

  const windowHeaderY = WINDOW_SILL_H + WINDOW_OPENING_H
  const windowHeaderH = 1.5 * BRICK_H
  const windowHeader = brick(windowStuds, 1, windowHeaderH / BRICK_H, WALL_COLOR, { studs: false })
  windowHeader.position.set(0, windowHeaderY, HOUSE_BACK_Z)
  group.add(windowHeader)

  const infillY = windowHeaderY + windowHeaderH
  const infillH = WALL_H - infillY
  if (infillH > 0.05) {
    const windowInfill = brick(windowStuds, 1, infillH / BRICK_H, WALL_COLOR, { studs: false })
    windowInfill.position.set(0, infillY, HOUSE_BACK_Z)
    group.add(windowInfill)
  }

  // Side walls — each with a couple of real (see-through) window cutouts
  // for visual variety. Safe to actually cut these: collision is flat
  // X/Z-only (see resolveWallCollision), so a gap partway up the wall's
  // height still reads as fully solid to movement — the back window
  // remains the only real way through.
  const sideWallStuds = (HOUSE_DEPTH + 1.4) / STUD
  const sideWindowZs = [1.6, HOUSE_FRONT_Z - 2.4]
  const leftWall = buildSideWallWithWindows(-HOUSE_HALF_WIDTH, HOUSE_CENTER_Z, sideWallStuds, sideWindowZs, 1.0, 0.9, 1.3)
  group.add(leftWall)
  const rightWall = buildSideWallWithWindows(HOUSE_HALF_WIDTH, HOUSE_CENTER_Z, sideWallStuds, sideWindowZs, 1.0, 0.9, 1.3)
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

  // Hinged on its own left edge (rather than the door's own center) so
  // damageHouse() can swing it open like it's hanging off a broken hinge.
  const door = buildDoor(DOOR_HALF_WIDTH * 2 - 0.06, WALL_H - 1.5 * BRICK_H - 0.05)
  door.position.x = DOOR_HALF_WIDTH - 0.03
  const doorPivot = new THREE.Group()
  doorPivot.add(door)
  doorPivot.position.set(-DOOR_HALF_WIDTH + 0.03, 0, HOUSE_FRONT_Z - 0.17)
  group.add(doorPivot)

  // Ceiling
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(HOUSE_WIDTH, 0.16, HOUSE_DEPTH), floorMat)
  ceiling.position.set(0, WALL_H + 0.08, HOUSE_CENTER_Z)
  ceiling.castShadow = true
  ceiling.receiveShadow = true
  group.add(ceiling)

  // Chunky pitched roof, sized to overhang the (variable) footprint below
  const roofWidthStuds = (HOUSE_WIDTH + 2) / STUD
  const roofDepthStuds = (HOUSE_DEPTH + 4) / STUD
  const roof = slopeRoof(roofWidthStuds, roofDepthStuds, 3.5, ROOF_COLOR)
  roof.position.set(0, WALL_H + 0.9, HOUSE_CENTER_Z)
  group.add(roof)

  // A chimney, off-center so it reads against the roof's slope
  const chimneyMat = new THREE.MeshStandardMaterial({ color: 0x8a6a52, flatShading: true })
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.0, 0.7), chimneyMat)
  chimney.position.set(HOUSE_HALF_WIDTH * 0.45, WALL_H + 2.0, HOUSE_BACK_Z + 1.6)
  chimney.castShadow = true
  chimney.receiveShadow = true
  group.add(chimney)
  const chimneyCapMat = new THREE.MeshStandardMaterial({ color: 0x5a4636, flatShading: true })
  const chimneyCap = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.9), chimneyCapMat)
  chimneyCap.position.set(chimney.position.x, WALL_H + 3.08, chimney.position.z)
  chimneyCap.castShadow = true
  group.add(chimneyCap)

  // A partition wall splitting the single room into a back bedroom (bed,
  // sleeping child, escape window, couch) and a small front room near the
  // door (table, crate) — with a doorway gap so it reads as an actual house
  // layout rather than one open box. Purely decorative: the player never
  // needs to cross it (the front door stays barriered the whole game), so
  // there's no separate doorway-collision handling to worry about.
  const partitionMat = 0x8a7a63
  const partitionLeftMinX = -HOUSE_HALF_WIDTH
  const partitionLeftMaxX = PARTITION_DOORWAY_X - PARTITION_DOORWAY_HALF_WIDTH
  const partitionLeft = brick((partitionLeftMaxX - partitionLeftMinX) / STUD, 1, WALL_UNITS, partitionMat, { studs: false })
  partitionLeft.position.set((partitionLeftMinX + partitionLeftMaxX) / 2, 0, PARTITION_Z)
  group.add(partitionLeft)
  const partitionRightMinX = PARTITION_DOORWAY_X + PARTITION_DOORWAY_HALF_WIDTH
  const partitionRightMaxX = HOUSE_HALF_WIDTH
  const partitionRight = brick((partitionRightMaxX - partitionRightMinX) / STUD, 1, WALL_UNITS, partitionMat, { studs: false })
  partitionRight.position.set((partitionRightMinX + partitionRightMaxX) / 2, 0, PARTITION_Z)
  group.add(partitionRight)

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
  sleepingChild.position.set(BED_X, 0.56, BED_Z) // resting on the mattress's top surface
  group.add(sleepingChild)

  // A nightstand beside the bed
  const nightstandMat = new THREE.MeshStandardMaterial({ color: 0x5a4636, flatShading: true })
  const nightstand = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.5), nightstandMat)
  nightstand.position.set(BED_X - 0.9, 0.28, BED_Z - 1.1)
  nightstand.castShadow = true
  nightstand.receiveShadow = true
  group.add(nightstand)

  // A couch facing into the room, back against the wall, in front of the window
  const couch = buildCouch()
  couch.position.set(0, 0, HOUSE_BACK_Z + 0.9)
  group.add(couch)

  // A rug under the bedroom's sitting area
  const rugMat1 = new THREE.MeshStandardMaterial({ color: 0x7a3a34, flatShading: true, roughness: 1 })
  const bedroomRug = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.03, 2.0), rugMat1)
  bedroomRug.position.set(-0.4, 0.015, 1.6)
  bedroomRug.receiveShadow = true
  group.add(bedroomRug)

  // The front room, near the door: a small dining table + two stools, and
  // the household's storage crate.
  const tableMat = new THREE.MeshStandardMaterial({ color: 0x6b5a4a, flatShading: true })
  const TABLE_X = -1.4
  const TABLE_Z = PARTITION_Z + 1.7
  const tableTop = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 1.3), tableMat)
  tableTop.position.set(TABLE_X, 0.62, TABLE_Z)
  tableTop.castShadow = true
  tableTop.receiveShadow = true
  group.add(tableTop)
  const legGeo = new THREE.BoxGeometry(0.1, 0.6, 0.1)
  for (const [lx, lz] of [
    [-0.55, -0.55],
    [0.55, -0.55],
    [-0.55, 0.55],
    [0.55, 0.55],
  ]) {
    const leg = new THREE.Mesh(legGeo, tableMat)
    leg.position.set(TABLE_X + lx, 0.3, TABLE_Z + lz)
    leg.castShadow = true
    group.add(leg)
  }
  const stoolMat = new THREE.MeshStandardMaterial({ color: 0x5a4636, flatShading: true })
  for (const [sx, sz] of [
    [TABLE_X - 1.0, TABLE_Z],
    [TABLE_X + 1.0, TABLE_Z],
  ]) {
    const stool = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.5), stoolMat)
    stool.position.set(sx, 0.22, sz)
    stool.castShadow = true
    stool.receiveShadow = true
    group.add(stool)
  }

  // The household's storage crate, moved into the front room
  const crate = brick(2, 2, 2, 0x8a5a2c)
  crate.position.set(2.4, 0, PARTITION_Z + 2.2)
  group.add(crate)

  const rugMat2 = new THREE.MeshStandardMaterial({ color: 0x4a5a3a, flatShading: true, roughness: 1 })
  const frontRoomRug = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.03, 1.8), rugMat2)
  frontRoomRug.position.set(TABLE_X, 0.015, TABLE_Z)
  frontRoomRug.receiveShadow = true
  group.add(frontRoomRug)

  // Dim warm bedroom light, lit before the mob arrives
  const bedroomLight = new THREE.PointLight(0xffb066, 1.4, 8)
  bedroomLight.position.set(-0.6, 1.8, 2.6)
  group.add(bedroomLight)

  // A second warm light for the front room, near the table
  const frontRoomLight = new THREE.PointLight(0xffb066, 1.0, 6)
  frontRoomLight.position.set(TABLE_X, 1.8, TABLE_Z)
  group.add(frontRoomLight)

  // Exposed so damageHouse() (see buildWorld()) can wreck the door/windows
  // once the family gets back home the morning after the attack.
  const windowGlassMeshes = [...leftWall.userData.glassMeshes, ...rightWall.userData.glassMeshes, door.userData.glassMesh]

  return { group, bedroomLight, sleepingChild, doorPivot, doorMat: door.userData.doorMat, windowGlassMeshes }
}

// A perimeter picket fence around the house and yard, with a gate-sized gap
// on the street-facing side lining up with the door and the mob's approach.
function buildYardFence() {
  const group = new THREE.Group()
  const FENCE_COLOR = 0x5a4632
  const halfW = 7.2
  const zBack = -3.5
  const zFront = 10.3
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

// A simple background house — walls + a roof, no interior/collision detail
// (the player never walks out past the front yard/road in normal play, so
// these are only ever seen from a distance). Used to fill out the village.
function buildVillageHouse(x, z, rotY, wallColor, roofColor) {
  const group = new THREE.Group()
  const wallUnits = 6
  const wallH = wallUnits * BRICK_H
  const widthStuds = 9
  const depthStuds = 8
  const halfW = (widthStuds * STUD) / 2
  const halfD = (depthStuds * STUD) / 2

  const floorMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, flatShading: true })
  const floor = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2, 0.1, halfD * 2), floorMat)
  floor.position.y = -0.05
  group.add(floor)

  const backWall = brick(widthStuds, 1, wallUnits, wallColor, { studs: false })
  backWall.position.set(0, 0, -halfD)
  group.add(backWall)
  const frontWall = brick(widthStuds, 1, wallUnits, wallColor, { studs: false })
  frontWall.position.set(0, 0, halfD)
  group.add(frontWall)
  const leftWall = brick(1, depthStuds, wallUnits, wallColor, { studs: false })
  leftWall.position.set(-halfW, 0, 0)
  group.add(leftWall)
  const rightWall = brick(1, depthStuds, wallUnits, wallColor, { studs: false })
  rightWall.position.set(halfW, 0, 0)
  group.add(rightWall)

  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2, 0.14, halfD * 2), floorMat)
  ceiling.position.y = wallH + 0.07
  group.add(ceiling)

  const roof = slopeRoof(widthStuds + 2, depthStuds + 3, 2.2, roofColor)
  roof.position.y = wallH + 0.65
  group.add(roof)

  // A small fence enclosure around the house's own yard — same "posts
  // along the perimeter" approach as buildYardFence().
  const FENCE_COLOR = 0x5a4632
  const fenceHalfW = halfW + 2.2
  const fenceHalfD = halfD + 2.6
  const fenceSpacing = 1.1
  function fencePost(px, pz) {
    const p = brick(1, 1, 2, FENCE_COLOR, { studs: false })
    p.position.set(px, 0, pz)
    group.add(p)
  }
  for (let pz = -fenceHalfD; pz <= fenceHalfD + 0.01; pz += fenceSpacing) {
    fencePost(-fenceHalfW, pz)
    fencePost(fenceHalfW, pz)
  }
  for (let px = -fenceHalfW; px <= fenceHalfW + 0.01; px += fenceSpacing) {
    fencePost(px, -fenceHalfD)
    if (Math.abs(px) < 1.0) continue // gate gap facing the road
    fencePost(px, fenceHalfD)
  }

  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })
  group.position.set(x, 0, z)
  group.rotation.y = rotY
  return group
}

// Shared between buildVillage() (which places the houses) and
// buildVillageGreenery() (which scatters trees/bushes/grass around them,
// staying clear of each house's own fenced yard).
const VILLAGE_HOUSES = [
  [-19, ROAD_Z + 9, 0.2],
  [-10, ROAD_Z + 15, -0.15],
  [11, ROAD_Z + 10, 0.3],
  [21, ROAD_Z + 16, -0.25],
  [-27, ROAD_Z + 20, 0.1],
  [30, ROAD_Z + 22, -0.1],
  [2, ROAD_Z + 24, 0.05],
]

// A small village lining the road — pure background scenery giving the
// "village in eastern Croatia" setting some visual weight beyond a single
// isolated house. Set back from the road itself and placed past the front
// yard (z > ROAD_Z), which the player never actually walks out to in
// normal play, so no collision needed.
function buildVillage() {
  const group = new THREE.Group()
  const palette = [
    [0xb8a888, 0x5a3f30],
    [0xc9c2ab, 0x4a3a2c],
    [0xa89478, 0x3a2c28],
    [0xbfae90, 0x6b4a36],
  ]
  VILLAGE_HOUSES.forEach(([x, z, rotY], i) => {
    const [wallColor, roofColor] = palette[i % palette.length]
    group.add(buildVillageHouse(x, z, rotY, wallColor, roofColor))
  })
  return group
}

// Trees, bushes, and grass scattered around the village so it doesn't read
// as houses dropped on bare field — same instancing approach as
// buildForest(), just over the village's z-range and kept clear of each
// house's own fenced yard.
function buildVillageGreenery() {
  const group = new THREE.Group()
  const clearOfHouses = (x, z) => VILLAGE_HOUSES.every(([hx, hz]) => Math.hypot(x - hx, z - hz) > 5.5)
  const dummy = new THREE.Object3D()

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2c20, flatShading: true })
  const canopyMats = [
    new THREE.MeshStandardMaterial({ color: 0x2f4a24, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x385228, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x2a4020, flatShading: true }),
  ]
  const treeSpecs = []
  const treeCount = 130
  for (let i = 0; i < treeCount; i++) {
    const x = (Math.random() - 0.5) * 70
    const z = ROAD_Z + 4 + Math.random() * 38
    if (!clearOfHouses(x, z)) continue
    treeSpecs.push({
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
  const trunkGeo = new THREE.CylinderGeometry(0.08, 0.14, 1, 5)
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, treeSpecs.length)
  trunkMesh.castShadow = true
  trunkMesh.receiveShadow = true
  const canopyGeo = new THREE.ConeGeometry(1, 1, 6)
  const canopyBuckets = canopyMats.map((mat, gi) => ({
    mesh: new THREE.InstancedMesh(canopyGeo, mat, treeSpecs.filter((s) => s.matIndex === gi).length),
    cursor: 0,
  }))
  canopyBuckets.forEach(({ mesh }) => {
    mesh.castShadow = true
    mesh.receiveShadow = true
  })
  treeSpecs.forEach((s, idx) => {
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

  const bushCount = 20
  for (let i = 0; i < bushCount; i++) {
    const x = (Math.random() - 0.5) * 70
    const z = ROAD_Z + 4 + Math.random() * 38
    if (!clearOfHouses(x, z)) continue
    const bush = buildBerryBush(0.5 + Math.random() * 0.4)
    bush.position.set(x, elevationAt(z), z)
    bush.rotation.y = Math.random() * Math.PI * 2
    group.add(bush)
  }

  const bladeGeo = new THREE.CylinderGeometry(0.02, 0.06, 1, 3)
  const bladeMats = [
    new THREE.MeshStandardMaterial({ color: 0x4a7a3a, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x3f6a30, flatShading: true }),
  ]
  const bladeSpecs = []
  const bladeCount = 1600
  for (let i = 0; i < bladeCount; i++) {
    const x = (Math.random() - 0.5) * 74
    const z = ROAD_Z + 3 + Math.random() * 40
    if (!clearOfHouses(x, z)) continue
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

function buildStream() {
  // Long in X (the river's length, so both banks run off past the visible
  // frame) and narrow in Z (the crossing width) — reads as a river rather
  // than a contained pond. Kept centered on its own group (rather than
  // baking the world-space offset into the geometry) so floodStream() can
  // scale it wider around its true center for the morning return trip.
  const group = new THREE.Group()
  const geometry = new THREE.PlaneGeometry(30, STREAM_HALF_DEPTH * 2, 56, 14)
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

// Keeps trees/bushes clear of both the flooded crossing and the plank's
// rest spot on the near bank — without this, scenery can spawn close
// enough to visibly clip through the plank or crowd the crossing.
function nearStreamOrPlank(x, z) {
  return z > FLOOD_SOUTH_Z - 3 && z < FLOOD_NORTH_Z + 1 && Math.abs(x - STREAM_CENTER_X) < 2.4
}

// A rounded berry bush — a handful of overlapping foliage clumps with
// scattered red berries. Used for the hideout's cover (in place of a plain
// rock) and scattered again through the forest for ground-level variety.
function buildBerryBush(scale = 1) {
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x2c4a24, flatShading: true })
  const bushClumps = [
    [0, 0.75, 0, 0.9],
    [0.55, 0.55, 0.35, 0.65],
    [-0.5, 0.5, -0.35, 0.6],
    [0.15, 0.95, -0.5, 0.55],
    [-0.35, 0.9, 0.5, 0.5],
  ]
  const bush = new THREE.Group()
  for (const [cx, cy, cz, cr] of bushClumps) {
    const clump = new THREE.Mesh(new THREE.IcosahedronGeometry(cr, 0), bushMat)
    clump.position.set(cx, cy, cz)
    clump.castShadow = true
    clump.receiveShadow = true
    bush.add(clump)
  }
  const berryMat = new THREE.MeshStandardMaterial({ color: 0xa8283a, flatShading: true })
  const berryGeo = new THREE.SphereGeometry(0.07, 6, 6)
  for (let i = 0; i < 18; i++) {
    const [cx, cy, cz, cr] = bushClumps[Math.floor(Math.random() * bushClumps.length)]
    const theta = Math.random() * Math.PI * 2
    const phi = Math.random() * Math.PI
    const br = cr * 0.95
    const berry = new THREE.Mesh(berryGeo, berryMat)
    berry.position.set(cx + Math.sin(phi) * Math.cos(theta) * br, cy + Math.cos(phi) * br, cz + Math.sin(phi) * Math.sin(theta) * br)
    berry.castShadow = true
    bush.add(berry)
  }
  bush.scale.setScalar(scale)
  return bush
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
    if (nearStreamOrPlank(x, z)) continue
    // Keep clear of the house's back wall/window across its full width —
    // otherwise a tree can spawn close enough to visibly poke into the
    // back-window view, or clip the wall, right where the house is widest.
    if (Math.abs(x) < HOUSE_HALF_WIDTH + 1.0 && z > HOUSE_BACK_Z - 1.5) continue
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

  // The berry bush near the hideout for cover, in place of a plain rock
  const hideoutBush = buildBerryBush()
  hideoutBush.position.set(5.6, elevationAt(-29.5), -29)
  hideoutBush.rotation.y = 0.6
  group.add(hideoutBush)

  // More bushes scattered through the forest for ground-level variety,
  // kept clear of the path and (lightly) clear of each other.
  const scatterBushCount = 26
  for (let i = 0; i < scatterBushCount; i++) {
    const z = -3 - Math.random() * 32
    const x = (Math.random() - 0.5) * 22
    if (distanceToPath(x, z) < 1.8) continue
    if (nearStreamOrPlank(x, z)) continue
    if (Math.abs(x - 5.6) < 2 && Math.abs(z + 29) < 2) continue // skip right on top of the hideout bush
    const scatterBush = buildBerryBush(0.55 + Math.random() * 0.45)
    scatterBush.position.set(x, elevationAt(z), z)
    scatterBush.rotation.y = Math.random() * Math.PI * 2
    group.add(scatterBush)
  }

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
  // Kept clear of the house's own floor (its near edge sits right at the
  // back wall, not past it) — it used to overlap 0.7 units into the
  // interior while sitting higher than the house floor, poking the green
  // baseplate up through the back window's view from inside.
  yardPlate.position.set(0, 0.05, HOUSE_BACK_Z - 5.2)
  scene.add(yardPlate)

  const road = buildRoad()
  scene.add(road)

  const { group: houseGroup, bedroomLight, sleepingChild, doorPivot, doorMat, windowGlassMeshes } = buildHouse()
  scene.add(houseGroup)

  // Decorative only (not a camera-collision obstacle) — added directly to
  // the scene rather than houseGroup so thin fence posts don't snag the
  // camera's raycast against world.houseGroup.
  scene.add(buildYardFence())

  // A barn in the back yard (left side), where the player actually runs
  // during the escape — the front yard past the fence is never visited in
  // normal play, so a barn placed there would never be seen.
  scene.add(buildBarn(-10, -5))

  // A small village along the road, out past the front yard — visible in
  // the distance (and through the front door's glass pane) without needing
  // to be walked through.
  scene.add(buildVillage())
  scene.add(buildVillageGreenery())

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

  // Called once the family gets back home the morning after — the door
  // hangs open off a broken hinge, and every window pane (the back-window
  // area's own glass doesn't exist since it's a real opening, so just the
  // decorative side windows + the door's own pane) reads as smashed out.
  let houseDamaged = false
  function damageHouse() {
    if (houseDamaged) return
    houseDamaged = true
    doorPivot.rotation.y = -1.1
    doorMat.color.setHex(0x2a1f16)
    for (const glass of windowGlassMeshes) {
      glass.material.color.setHex(0x14181a)
      glass.material.opacity = 0.5
      glass.material.roughness = 0.9
      glass.rotation.z = (Math.random() - 0.5) * 0.5
      glass.rotation.x = (Math.random() - 0.5) * 0.3
    }
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
    damageHouse,
    update,
  }
}
