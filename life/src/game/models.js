import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Loaded once at startup (see App.vue) and handed to buildWorld() so
// environment.js can use real assets for decorative scenery instead of
// procedural LEGO-brick geometry. The main house keeps its procedural
// geometry — its exact window/door openings and wall positions are load
// -bearing for the climb-through-window and collision logic, and none of
// these downloaded models have openings in the right places to match that.
const MODEL_URLS = {
  bush: '/models/Bush with Flowers.glb',
  fence: '/models/Fence.glb',
  fern: '/models/Fern.glb',
  metalFence: '/models/Metal Fence.glb',
  grassPatch: '/models/grass green.glb',
  plant: '/models/Plant.glb',
  rock: '/models/Rock Medium.glb',
  villageHouse: '/models/House.glb',
  pine: '/models/Pine.glb',
  streetlight: '/models/Streetlight.glb',
  trees: '/models/Trees.glb',
  soldier: '/models/Soldier.glb',
}

function enableShadows(root) {
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })
}

// Collapses a loaded model's full node hierarchy down to one mesh per
// distinct material. Some of these models are dozens of separate sub-mesh
// nodes (grass green.glb alone has 82) — left as-is, every single clone of
// a prototype costs as many draw calls as it has sub-meshes, and with
// hundreds of scattered instances (trees, bushes, grass) that added up to
// tens of thousands of draw calls and visible stuttering. Falls back to
// the original object untouched if merging fails for any reason (e.g.
// mismatched vertex attributes across sub-meshes).
function mergeByMaterial(object) {
  try {
    object.updateMatrixWorld(true)
    const groups = new Map()
    object.traverse((o) => {
      if (!o.isMesh) return
      const mat = Array.isArray(o.material) ? o.material[0] : o.material
      const geom = o.geometry.clone()
      geom.applyMatrix4(o.matrixWorld)
      if (!groups.has(mat)) groups.set(mat, [])
      groups.get(mat).push(geom)
    })
    if (groups.size === 0) return object
    const merged = new THREE.Group()
    for (const [mat, geoms] of groups) {
      merged.add(new THREE.Mesh(mergeGeometries(geoms, false), mat))
    }
    return merged
  } catch (err) {
    console.warn('mergeByMaterial failed, using unmerged model:', err)
    return object
  }
}

// Wraps `object` in an outer anchor Group sitting at (0,0,0), with `object`
// (merged down to one mesh per material — see mergeByMaterial above, unless
// `skipMerge` is set) nested inside at whatever offset re-centers it
// horizontally and drops its lowest point to y=0. The raw models are all
// over the place in their own origin placement (some centered, some
// offset, Trees.glb's individual trees baked in a row ~200 units from the
// origin) — callers need a prototype whose OWN position they can safely
// overwrite with `.position.set(x, y, z)` after cloning, without
// disturbing the centering correction. Keeping that correction on a
// nested child (rather than on the object callers reposition) is what
// makes that safe.
// `skipMerge` must be used for animated models (Soldier.glb) — merging
// bakes every mesh's transform into flat geometry and discards the
// original named bone/pivot nodes that the animation's keyframe tracks
// target, so a merged animated model has nothing left to actually animate.
function anchor(object, { skipMerge = false } = {}) {
  const merged = skipMerge ? object : mergeByMaterial(object)
  const box = new THREE.Box3().setFromObject(merged)
  const center = new THREE.Vector3()
  box.getCenter(center)
  merged.position.x -= center.x
  merged.position.z -= center.z
  merged.position.y -= box.min.y
  const wrapper = new THREE.Group()
  wrapper.add(merged)
  return wrapper
}

function loadOne(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => resolve(gltf), undefined, (err) => reject(new Error(`Failed to load ${url}: ${err && err.message}`)))
  })
}

// Returns a dict of ready-to-clone prototype Object3Ds (each an anchor
// group — see anchor() above), scaled to roughly match this scene's
// existing proportions (a standing minifigure is ~1.6 units tall). Clone
// with .clone() and set .position/.rotation on the clone before adding
// more than one instance to the scene.
export async function loadModels() {
  const loader = new GLTFLoader()
  const raw = {}
  await Promise.all(
    Object.entries(MODEL_URLS).map(async ([key, url]) => {
      raw[key] = await loadOne(loader, url)
    })
  )

  const models = {}

  models.bush = anchor(raw.bush.scene)
  enableShadows(models.bush)

  // Fence.glb's real size is ~0.95 x 8.57 x 19.69 — a long run, but ~8.5
  // units tall (a picket fence should read at about waist/chest height,
  // ~1.1 units). Scaled down to match. Its long (run) dimension is
  // natively along Z, not X — rotated 90° so it's along X instead, which
  // is the axis tileFencePanels() (environment.js) measures as "width".
  raw.fence.scene.scale.setScalar(1.1 / 8.567781448364258)
  raw.fence.scene.rotation.y = Math.PI / 2
  models.fence = anchor(raw.fence.scene)
  enableShadows(models.fence)

  // Metal Fence.glb is ~3.55 x 2.875 x 0.115 — scaled to a ~1.1-unit-tall panel.
  raw.metalFence.scene.scale.setScalar(1.1 / 2.875330076688282)
  models.metalFence = anchor(raw.metalFence.scene)
  enableShadows(models.metalFence)

  // Fern.glb is huge natively (~8.85 x 2.69 x 8.49) — scaled down to a
  // knee-high ground fern (~1.1 units tall).
  raw.fern.scene.scale.setScalar(1.1 / 2.4413082599639893)
  models.fern = anchor(raw.fern.scene)
  enableShadows(models.fern)

  // Plant.glb (~1.27 x 1.01 x 1.39) is already close to a believable small
  // potted/ground plant scale — left mostly as-is.
  models.plant = anchor(raw.plant.scene)
  enableShadows(models.plant)

  // Rock Medium.glb (~3.05 x 1.90 x 2.48) — scaled down a bit for scattered
  // ground clutter rather than a boulder-sized feature.
  raw.rock.scene.scale.setScalar(0.6)
  models.rock = anchor(raw.rock.scene)
  enableShadows(models.rock)

  models.grassPatch = anchor(raw.grassPatch.scene)
  // Receives shadows (so it still darkens under trees/the house) but
  // doesn't cast them — a shadow from a few blades of grass is invisible
  // at this scale, and with hundreds of instances scattered around,
  // casting was pure wasted cost.
  models.grassPatch.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false
      o.receiveShadow = true
    }
  })

  // House.glb (~3.64 x 2.93 x 3.08) is used only for the background
  // village houses (see buildVillageHouse in environment.js) — purely
  // decorative, so no collision/opening alignment to worry about. Scaled
  // up to read as a real cottage next to the procedural main house.
  raw.villageHouse.scene.scale.setScalar(2.6)
  models.villageHouse = anchor(raw.villageHouse.scene)
  enableShadows(models.villageHouse)

  // Pine.glb is a proper tall background tree (~10 units) — kept close to
  // its native scale, just slightly reduced so it doesn't tower absurdly
  // over the house.
  raw.pine.scene.scale.setScalar(0.8)
  models.pine = anchor(raw.pine.scene)
  enableShadows(models.pine)

  // Streetlight.glb is tiny natively (~0.96 units tall) — scaled up to a
  // believable street-lamp height matching the old procedural version.
  raw.streetlight.scene.scale.setScalar(3.4 / 0.9599148090154197)
  models.streetlight = anchor(raw.streetlight.scene)
  enableShadows(models.streetlight)

  // Trees.glb bundles 5 separate named tree variants (NormalTree_1..5) as
  // siblings baked in a row far from the origin, nested one level under a
  // wrapping "RootNode" (the scene's only direct child) — pull each one
  // out on its own and anchor it individually rather than using the whole
  // group as one object. A direct .children filter on the scene itself
  // only ever sees "RootNode" and matches nothing, silently leaving this
  // empty — traverse() is needed to reach the actual named nodes. But each
  // NormalTree_N node also has its own small nested detail parts that
  // happen to match the same name prefix (confirmed via real bounding
  // boxes: 10 of the 15 raw matches were ~0.01-0.06 units, tiny fragments,
  // not trees) — only keeping matches whose parent ISN'T itself another
  // match filters those nested duplicates out, leaving the 5 real ones.
  const normalTreeNodes = []
  raw.trees.scene.traverse((o) => {
    if (!o.name || !o.name.startsWith('NormalTree_')) return
    if (o.parent && o.parent.name && o.parent.name.startsWith('NormalTree_')) return
    normalTreeNodes.push(o)
  })
  models.normalTrees = normalTreeNodes.map((child) => {
    const wrapped = anchor(child.clone())
    enableShadows(wrapped)
    return wrapped
  })

  // Soldier.glb — used for the mob crowd (see mob.js). It animates via a
  // rigid bone hierarchy (Blender-style parented parts), not vertex
  // skinning, so no SkeletonUtils cloning is needed — plain .clone() plus
  // a fresh AnimationMixer per instance works. Its hierarchy is kept
  // intact (skipMerge) since the animation's keyframe tracks target
  // specific named nodes that mergeByMaterial would otherwise discard.
  raw.soldier.scene.scale.setScalar(1.6 / 5.935780727553266)
  models.soldier = anchor(raw.soldier.scene, { skipMerge: true })
  enableShadows(models.soldier)
  models.soldierAnimations = raw.soldier.animations

  return models
}
