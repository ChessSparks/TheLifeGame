import * as THREE from 'three'

// Shared "brick" unit system so every piece we build snaps to the same grid.
export const STUD = 0.4
export const BRICK_H = 0.48
export const PLATE_H = BRICK_H / 3

function plasticMaterial(color) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.35, metalness: 0.05 })
}

function addStuds(group, studsX, studsZ, topY, material) {
  const studRadius = STUD * 0.28
  const studHeight = STUD * 0.35
  const studGeo = new THREE.CylinderGeometry(studRadius, studRadius, studHeight, 10)
  const mesh = new THREE.InstancedMesh(studGeo, material, studsX * studsZ)
  mesh.castShadow = true
  mesh.receiveShadow = true
  const m = new THREE.Matrix4()
  let i = 0
  for (let ix = 0; ix < studsX; ix++) {
    for (let iz = 0; iz < studsZ; iz++) {
      m.makeTranslation(-(studsX - 1) * STUD / 2 + ix * STUD, topY + studHeight / 2, -(studsZ - 1) * STUD / 2 + iz * STUD)
      mesh.setMatrixAt(i++, m)
    }
  }
  group.add(mesh)
}

// A single brick, `studsX` x `studsZ` footprint, `heightUnits` brick-heights tall.
export function brick(studsX, studsZ, heightUnits, color, { studs = true } = {}) {
  const group = new THREE.Group()
  const material = plasticMaterial(color)
  const width = studsX * STUD
  const depth = studsZ * STUD
  const height = heightUnits * BRICK_H
  const body = new THREE.Mesh(new THREE.BoxGeometry(width - 0.02, height, depth - 0.02), material)
  body.position.y = height / 2
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)
  if (studs) addStuds(group, studsX, studsZ, height, material)
  group.userData.footprint = { width, depth, height }
  return group
}

// A flat baseplate tile covered in studs — used for the "tamed" ground near the house.
export function baseplateTile(studsX, studsZ, color) {
  const group = new THREE.Group()
  const material = plasticMaterial(color)
  const width = studsX * STUD
  const depth = studsZ * STUD
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, PLATE_H, depth), material)
  body.position.y = PLATE_H / 2
  body.receiveShadow = true
  group.add(body)
  addStuds(group, studsX, studsZ, PLATE_H, material)
  return group
}

// A simple slope/roof brick — a triangular prism, plastic-shaded, no studs.
export function slopeRoof(widthStuds, depthStuds, heightUnits, color) {
  const width = widthStuds * STUD
  const depth = depthStuds * STUD
  const height = heightUnits * BRICK_H
  const material = plasticMaterial(color)
  const geo = new THREE.CylinderGeometry(0, width / 2, height, 4, 1)
  geo.rotateY(Math.PI / 4)
  const mesh = new THREE.Mesh(geo, material)
  mesh.scale.set(1, 1, depth / width)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

const SKIN = 0xf2c48d

// A LEGO-style minifigure. `colors` = { torso, legs, head, hair }.
// If `carrying` is true, a smaller minifigure is molded into the figure's
// arms (used for the father carrying the child).
export function buildMinifigure(colors, { carrying = false, scale = 1 } = {}) {
  const group = new THREE.Group()
  const legMat = plasticMaterial(colors.legs)
  const torsoMat = plasticMaterial(colors.torso)
  const skinMat = plasticMaterial(SKIN)
  const headMat = plasticMaterial(colors.head || SKIN)
  const hairMat = plasticMaterial(colors.hair || 0x2a2015)

  const legHeight = 0.62
  const hipY = legHeight
  const legGeo = new THREE.BoxGeometry(0.24, legHeight, 0.3)
  const legL = new THREE.Mesh(legGeo, legMat)
  legL.geometry.translate(0, -legHeight / 2, 0)
  legL.position.set(-0.13, hipY, 0)
  group.add(legL)
  const legR = new THREE.Mesh(legGeo, legMat)
  legR.geometry.translate(0, -legHeight / 2, 0)
  legR.position.set(0.13, hipY, 0)
  group.add(legR)

  const torsoHeight = 0.56
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, torsoHeight, 0.34), torsoMat)
  torso.position.y = hipY + torsoHeight / 2
  group.add(torso)

  const shoulderY = hipY + torsoHeight
  const armLength = 0.5
  const armGeo = new THREE.BoxGeometry(0.18, armLength, 0.2)
  armGeo.translate(0, -armLength / 2, 0)
  const handGeo = new THREE.BoxGeometry(0.16, 0.16, 0.18)

  const armL = new THREE.Mesh(armGeo, torsoMat)
  armL.position.set(-0.38, shoulderY, 0)
  group.add(armL)
  const handL = new THREE.Mesh(handGeo, skinMat)
  handL.position.set(0, -armLength, 0)
  armL.add(handL)

  const armR = new THREE.Mesh(armGeo, torsoMat)
  armR.position.set(0.38, shoulderY, 0)
  group.add(armR)
  const handR = new THREE.Mesh(handGeo, skinMat)
  handR.position.set(0, -armLength, 0)
  armR.add(handR)

  const neckY = shoulderY + 0.06
  const headHeight = 0.4
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, headHeight, 12), headMat)
  head.position.y = neckY + headHeight / 2
  group.add(head)

  const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 8), headMat)
  stud.position.y = neckY + headHeight + 0.04
  group.add(stud)

  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat)
  hair.position.y = neckY + headHeight - 0.04
  group.add(hair)

  group.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true
      obj.receiveShadow = true
    }
  })

  group.scale.setScalar(scale)

  const parts = { legL, legR, armL, armR, handL, handR, head, torso }

  if (carrying) {
    const childGroup = buildMinifigure(
      { torso: 0xd4453a, legs: 0x2f3a5f, head: SKIN, hair: 0x4a3222 },
      { scale: 0.62 }
    ).group
    childGroup.rotation.y = Math.PI
    childGroup.position.set(0, hipY + torsoHeight * 0.55, 0.22)
    group.add(childGroup)
    parts.child = childGroup
    // Fold the carrying arms inward as if cradling the child.
    armL.rotation.x = -1.9
    armL.rotation.z = 0.35
    armR.rotation.x = -1.9
    armR.rotation.z = -0.35
  }

  return { group, parts }
}
