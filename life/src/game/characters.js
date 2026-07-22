import * as THREE from 'three'

function humanMaterial(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05 })
}

const SKIN = 0xdba876
const SHOE_COLOR = 0x2a1f18

// Builds one leg as a hip -> knee joint chain (rather than a single straight
// capsule) so the walk cycle can bend the knee during the swing instead of
// the leg staying a rigid stick. `hip` is the group callers rotate for the
// hip swing; `knee` is nested inside it (positioned at the knee) for the
// knee-bend rotation.
function buildLeg({ legColor, shoeColor, upperLen, lowerLen, radius }) {
  const legMat = humanMaterial(legColor)
  const shoeMat = humanMaterial(shoeColor)
  const lowerRadius = radius * 0.85
  const upperHeight = upperLen + radius * 2
  const lowerHeight = lowerLen + lowerRadius * 2
  const shoeHeight = radius * 0.8

  const hip = new THREE.Group()
  const upperGeo = new THREE.CapsuleGeometry(radius, upperLen, 4, 8)
  upperGeo.translate(0, -upperHeight / 2, 0)
  const upperMesh = new THREE.Mesh(upperGeo, legMat)
  hip.add(upperMesh)

  const knee = new THREE.Group()
  knee.position.y = -upperHeight
  hip.add(knee)

  const lowerGeo = new THREE.CapsuleGeometry(lowerRadius, lowerLen, 4, 8)
  lowerGeo.translate(0, -lowerHeight / 2, 0)
  const lowerMesh = new THREE.Mesh(lowerGeo, legMat)
  knee.add(lowerMesh)

  const shoe = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.3, shoeHeight, radius * 3.1), shoeMat)
  shoe.position.set(0, -lowerHeight - shoeHeight / 2, radius * 0.5)
  knee.add(shoe)

  return { hip, knee, height: upperHeight + lowerHeight + shoeHeight }
}

// Builds one arm as a shoulder -> elbow joint chain, mirroring buildLeg
// above, so the walk cycle can bend the elbow slightly as the arm swings.
function buildArm({ sleeveColor, upperLen, lowerLen, radius }) {
  const sleeveMat = humanMaterial(sleeveColor)
  const skinMat = humanMaterial(SKIN)
  const lowerRadius = radius * 0.85
  const upperHeight = upperLen + radius * 2
  const lowerHeight = lowerLen + lowerRadius * 2

  const shoulder = new THREE.Group()
  const upperGeo = new THREE.CapsuleGeometry(radius, upperLen, 4, 8)
  upperGeo.translate(0, -upperHeight / 2, 0)
  const upperMesh = new THREE.Mesh(upperGeo, sleeveMat)
  shoulder.add(upperMesh)

  const elbow = new THREE.Group()
  elbow.position.y = -upperHeight
  shoulder.add(elbow)

  const lowerGeo = new THREE.CapsuleGeometry(lowerRadius, lowerLen, 4, 8)
  lowerGeo.translate(0, -lowerHeight / 2, 0)
  const lowerMesh = new THREE.Mesh(lowerGeo, skinMat)
  elbow.add(lowerMesh)

  const hand = new THREE.Mesh(new THREE.SphereGeometry(lowerRadius * 1.1, 10, 8), skinMat)
  hand.position.y = -lowerHeight
  elbow.add(hand)

  return { shoulder, elbow, height: upperHeight + lowerHeight }
}

// A jointed, human-proportioned figure — hip/knee and shoulder/elbow chains
// (see buildLeg/buildArm above) instead of a single rigid LEGO-style limb,
// plus a bit of surface detail (collar, shoes, simple face) so it reads as
// a dressed person rather than a smooth mannequin. `colors` = { torso,
// legs, hair, shoes }. `build` varies proportions per character —
// { heightScale, widthScale, headScale } — so dad/uncle/boy don't all read
// as the same mold in different colors.
export function buildHumanFigure(colors, { carrying = false, scale = 1, build = {} } = {}) {
  const heightScale = build.heightScale ?? 1
  const widthScale = build.widthScale ?? 1
  const headScale = build.headScale ?? 1

  const group = new THREE.Group()
  const torsoMat = humanMaterial(colors.torso)
  const hairMat = humanMaterial(colors.hair || 0x2a2015)
  const collarMat = humanMaterial(new THREE.Color(colors.torso).multiplyScalar(0.65).getHex())
  const skinMat = humanMaterial(SKIN)

  const leg = { upperLen: 0.24 * heightScale, lowerLen: 0.22 * heightScale, radius: 0.085 * widthScale }
  const legL = buildLeg({ legColor: colors.legs, shoeColor: colors.shoes ?? SHOE_COLOR, ...leg })
  legL.hip.position.x = -0.11 * widthScale
  const legR = buildLeg({ legColor: colors.legs, shoeColor: colors.shoes ?? SHOE_COLOR, ...leg })
  legR.hip.position.x = 0.11 * widthScale
  const hipY = legL.height
  legL.hip.position.y = hipY
  legR.hip.position.y = hipY
  group.add(legL.hip)
  group.add(legR.hip)

  const torsoLength = 0.42 * heightScale
  const torsoRadius = 0.19 * widthScale
  const torsoHeight = torsoLength + torsoRadius * 2
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(torsoRadius, torsoLength, 4, 8), torsoMat)
  torso.position.y = hipY + torsoHeight / 2 - torsoRadius * 0.3
  group.add(torso)

  // A slightly darker ring at the neckline, reading as a collar.
  const collar = new THREE.Mesh(new THREE.TorusGeometry(torsoRadius * 0.75, torsoRadius * 0.16, 6, 12), collarMat)
  collar.rotation.x = Math.PI / 2
  collar.position.y = hipY + torsoHeight - torsoRadius * 0.55
  group.add(collar)

  const shoulderY = hipY + torsoHeight - torsoRadius * 0.6
  const arm = { upperLen: 0.2 * heightScale, lowerLen: 0.18 * heightScale, radius: 0.065 * widthScale }
  const armL = buildArm({ sleeveColor: colors.torso, ...arm })
  armL.shoulder.position.set(-(torsoRadius + arm.radius * 0.6), shoulderY, 0)
  const armR = buildArm({ sleeveColor: colors.torso, ...arm })
  armR.shoulder.position.set(torsoRadius + arm.radius * 0.6, shoulderY, 0)
  group.add(armL.shoulder)
  group.add(armR.shoulder)

  const neckY = shoulderY + 0.02
  const headRadius = 0.155 * headScale
  const head = new THREE.Mesh(new THREE.SphereGeometry(headRadius, 16, 12), skinMat)
  head.position.y = neckY + headRadius
  group.add(head)

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(headRadius * 1.05, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    hairMat
  )
  hair.position.y = head.position.y + headRadius * 0.15
  group.add(hair)

  // A minimal face — two eye dots and a small nose bump — enough to read as
  // a face at close range without needing an actual textured head.
  const eyeMat = humanMaterial(0x1a1410)
  const eyeGeo = new THREE.SphereGeometry(headRadius * 0.11, 8, 6)
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat)
  eyeL.position.set(-headRadius * 0.38, head.position.y + headRadius * 0.05, headRadius * 0.9)
  group.add(eyeL)
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat)
  eyeR.position.set(headRadius * 0.38, head.position.y + headRadius * 0.05, headRadius * 0.9)
  group.add(eyeR)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(headRadius * 0.16, headRadius * 0.3, 8), skinMat)
  nose.rotation.x = Math.PI / 2
  nose.position.set(0, head.position.y - headRadius * 0.05, headRadius * 0.98)
  group.add(nose)

  group.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true
      obj.receiveShadow = true
    }
  })

  group.scale.setScalar(scale)

  const parts = {
    hipL: legL.hip,
    kneeL: legL.knee,
    hipR: legR.hip,
    kneeR: legR.knee,
    shoulderL: armL.shoulder,
    elbowL: armL.elbow,
    shoulderR: armR.shoulder,
    elbowR: armR.elbow,
    head,
    torso,
  }

  if (carrying) {
    const childGroup = buildHumanFigure(
      { torso: 0xd4453a, legs: 0x2f3a5f, hair: 0x4a3222 },
      { scale: 0.62, build: { headScale: 1.15 } }
    ).group
    childGroup.rotation.y = Math.PI
    childGroup.position.set(0, hipY + torsoHeight * 0.45, 0.22)
    group.add(childGroup)
    parts.child = childGroup
    // Fold the carrying arms inward as if cradling the child.
    armL.shoulder.rotation.set(-1.9, 0, 0.35)
    armR.shoulder.rotation.set(-1.9, 0, -0.35)
  }

  return { group, parts }
}

// Wraps a figure with a `mount` (positioned/rotated by controllers) and an
// inner group that only carries the walk-cycle animation, so animation
// never fights with position updates from a controller.
export function wrapFigure(colors, options) {
  const mount = new THREE.Object3D()
  const { group, parts } = buildHumanFigure(colors, options)
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
      parts.shoulderL.rotation.set(-1.9, 0, 0.35)
      parts.shoulderR.rotation.set(-1.9, 0, -0.35)
    } else {
      parts.shoulderL.rotation.set(0, 0, 0)
      parts.shoulderR.rotation.set(0, 0, 0)
    }
  }

  function update(dt, speedScale = 1) {
    if (walking) {
      walkPhase += dt * 6 * speedScale
      const swing = Math.sin(walkPhase) * 0.55
      parts.hipL.rotation.x = swing
      parts.hipR.rotation.x = -swing
      // Knee bends during the forward part of each leg's own swing (when
      // the foot is lifted), and straightens again as it plants — a rough
      // stylized approximation rather than a biomechanically exact gait.
      parts.kneeL.rotation.x = Math.max(0, Math.sin(walkPhase)) * 0.9
      parts.kneeR.rotation.x = Math.max(0, -Math.sin(walkPhase)) * 0.9
      if (canSwingArms) {
        parts.shoulderL.rotation.x = -swing * 0.7
        parts.shoulderR.rotation.x = swing * 0.7
        parts.elbowL.rotation.x = Math.max(0, -Math.sin(walkPhase)) * 0.5
        parts.elbowR.rotation.x = Math.max(0, Math.sin(walkPhase)) * 0.5
      }
      group.position.y = Math.abs(Math.sin(walkPhase * 2)) * 0.05
    } else {
      parts.hipL.rotation.x = 0
      parts.hipR.rotation.x = 0
      parts.kneeL.rotation.x = 0
      parts.kneeR.rotation.x = 0
      if (canSwingArms) {
        parts.shoulderL.rotation.x = 0
        parts.shoulderR.rotation.x = 0
        parts.elbowL.rotation.x = 0
        parts.elbowR.rotation.x = 0
      }
      group.position.y = 0
    }
  }

  return { mount, group, parts, setWalking, setCarrying, update }
}

// Brighter/more saturated than the mob's deliberately drab earth tones, so
// the family reads clearly against the crowd during the street approach.
// Built a bit broader/stockier than the uncle — a protective-father read.
export function createDadFigure() {
  return wrapFigure(
    { torso: 0x1f7a52, legs: 0x2c2c2c, hair: 0x2a2015 },
    { carrying: true, build: { widthScale: 1.1 } }
  )
}

// Taller and leaner than the dad, so the two don't read as the same mold
// in different colors.
export function createUncleFigure() {
  return wrapFigure(
    { torso: 0x2f6bad, legs: 0x33322c, hair: 0x1c1c1c },
    { build: { heightScale: 1.08, widthScale: 0.92, headScale: 0.95 } }
  )
}

// Same colors/scale as the child molded into dad's carrying pose (see
// buildHumanFigure's `carrying` option above) — used as a standalone,
// walking figure for the stretch between being set down at the hideout and
// picked back up at the plank. See ZoneDirector's 'hiding' stage in
// zones.js. A proportionally bigger head than the adults, like a real child.
export function createBoyFigure() {
  return wrapFigure(
    { torso: 0xd4453a, legs: 0x2f3a5f, hair: 0x4a3222 },
    { scale: 0.62, build: { headScale: 1.15, widthScale: 0.9 } }
  )
}
