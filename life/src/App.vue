<template>
  <div class="game-root">
    <canvas ref="canvasEl" class="game-canvas" />
    <GameUI @begin="onBegin" @continue="onContinue" @restart="onRestart" />
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as THREE from 'three'
import { Game } from './game/game'
import { buildWorld, elevationAt } from './game/environment'
import { createDadFigure, createUncleFigure, createBoyFigure } from './game/characters'
import { createPlayerController } from './game/player'
import { createThirdPersonCamera } from './game/thirdPersonCamera'
import { createCompanion } from './game/companion'
import { createMobCrowd } from './game/mob'
import { ZoneDirector } from './game/zones'
import { Ambience } from './game/audio'
import { uiState } from './game/uiState'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { loadModels } from './game/models'
import GameUI from './components/GameUI.vue'

const canvasEl = ref(null)
let game = null
let zoneDirector = null
let ambience = null
let playerController = null
let thirdPersonCam = null
let mobCrowd = null
let resizeObserver = null

function handleResize() {
  if (!game || !canvasEl.value) return
  const { clientWidth, clientHeight } = canvasEl.value
  game.resize(clientWidth, clientHeight)
}

function onKeydown(e) {
  if (e.code === 'Space') {
    e.preventDefault()
    zoneDirector?.continuePrompt()
  } else if (e.code === 'KeyE') {
    zoneDirector?.interact()
  } else if (e.code === 'Escape' && uiState.phase === 'playing') {
    uiState.paused = !uiState.paused
  }
}

function onBegin() {
  ambience.start()
  ambience.setVolume(uiState.volume)
  mobCrowd.activate()
  uiState.phase = 'playing'
}

function onContinue() {
  zoneDirector.continuePrompt()
}

function onRestart() {
  window.location.reload()
}

onMounted(async () => {
  const canvas = canvasEl.value
  game = new Game(canvas)
  handleResize()

  // Real 3D models (trees, bushes, fences, streetlights, background village
  // houses) — loaded before the world is built so buildWorld() can use them
  // right away instead of falling back to the old procedural geometry.
  const models = await loadModels()

  const world = buildWorld(game.scene, models)

  const dad = createDadFigure()
  // Spawn inside the house — the mob approaches and attacks from outside
  // (visible/audible through the door), but the player never goes out to
  // meet it. Starts empty-handed; the "pickup" happens once the mob has
  // gathered, see ZoneDirector's approach->lull transition.
  dad.mount.position.set(0, elevationAt(2.0), 2.0)
  dad.setCarrying(false)
  game.scene.add(dad.mount)

  const uncle = createUncleFigure()
  uncle.mount.position.set(1.2, elevationAt(1.4), 1.4)
  game.scene.add(uncle.mount)

  // Set down at the hideout and walked the rest of the way, rather than
  // carried, until dad picks him back up at the plank — see ZoneDirector's
  // 'hiding' stage and tryPlacePlank() in zones.js. Hidden until then.
  const boy = createBoyFigure()
  boy.mount.visible = false
  game.scene.add(boy.mount)

  mobCrowd = createMobCrowd(models, 16)
  game.scene.add(mobCrowd.group)

  thirdPersonCam = createThirdPersonCamera(game.camera, dad.mount, canvas, {
    yaw: 0,
    pitch: 0.35,
    distance: 6.2,
    obstacles: [world.houseGroup],
  })
  playerController = createPlayerController(dad.mount, thirdPersonCam.getYaw)
  const companion = createCompanion(uncle.mount, dad.mount)
  const boyCompanion = createCompanion(boy.mount, dad.mount, new THREE.Vector3(-1.0, 0, 0.5))

  world.mobCrowd = mobCrowd
  world.dadFigure = dad
  world.boyFigure = boy
  world.uncleCompanion = companion
  world.uncleMount = uncle.mount
  world.playerController = playerController

  zoneDirector = new ZoneDirector(game, world, dad.mount)
  ambience = new Ambience()

  if (process.env.NODE_ENV !== 'production') {
    window.__debug = { game, world, dad, uncle, boy, mobCrowd, zoneDirector, uiState, playerController, thirdPersonCam, models }
    // TEMPORARY: exposes THREE itself so test scripts can construct real
    // Box3/Vector3 instances against live scene objects. Remove once the
    // soldier leg-mesh identification work is done.
    window.__debug.THREE = THREE
    // TEMPORARY: inspects a GLTF model's real bounding box (min/max/size)
    // via an actual GLTFLoader parse, so scale factors can be worked out
    // for the newly added model assets. Remove once that's done.
    const gltfLoader = new GLTFLoader()
    window.__debug.inspectModel = (url) =>
      new Promise((resolve, reject) => {
        gltfLoader.load(
          url,
          (gltf) => {
            const box = new THREE.Box3().setFromObject(gltf.scene)
            const size = new THREE.Vector3()
            box.getSize(size)
            const center = new THREE.Vector3()
            box.getCenter(center)
            let skinnedCount = 0
            let hasBones = false
            const topLevelBoxes = gltf.scene.children.map((child) => {
              const b = new THREE.Box3().setFromObject(child)
              const s = new THREE.Vector3()
              b.getSize(s)
              return { name: child.name, size: s.toArray(), min: b.min.toArray() }
            })
            gltf.scene.traverse((o) => {
              if (o.isSkinnedMesh) skinnedCount++
              if (o.isBone) hasBones = true
            })
            resolve({
              min: box.min.toArray(),
              max: box.max.toArray(),
              size: size.toArray(),
              center: center.toArray(),
              animations: gltf.animations.map((a) => ({ name: a.name, duration: a.duration })),
              skinnedCount,
              hasBones,
              topLevelBoxes,
            })
          },
          undefined,
          (err) => reject(err && err.message)
        )
      })
  }

  game.addUpdatable((dt) => {
    world.update(dt)
    mobCrowd.update(dt)

    const playerMoving = playerController.update(dt)
    dad.setWalking(playerMoving)
    dad.update(dt)

    const uncleMoving = companion.update(dt)
    uncle.setWalking(uncleMoving)
    uncle.update(dt)

    const boyMoving = boyCompanion.update(dt)
    boy.setWalking(boyMoving)
    boy.update(dt)

    thirdPersonCam.update(dt, playerMoving)

    if (uiState.phase === 'playing') {
      const tension = zoneDirector.update(dt)
      ambience.setTension(tension)
      ambience.update(dt)
    }
  })
  game.start()

  watch(
    () => uiState.paused,
    (paused) => {
      if (paused) {
        game.stop()
        ambience.pause()
      } else {
        game.start()
        ambience.resume()
      }
    }
  )
  watch(
    () => uiState.volume,
    (volume) => ambience.setVolume(volume)
  )

  window.addEventListener('resize', handleResize)
  window.addEventListener('keydown', onKeydown)
  if (window.ResizeObserver) {
    resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(canvas)
  }

  uiState.ready = true
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('keydown', onKeydown)
  if (resizeObserver) resizeObserver.disconnect()
  playerController?.dispose()
  thirdPersonCam?.dispose()
  ambience?.stop()
  game?.dispose()
})
</script>

<style>
html, body {
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: #000;
}

#app {
  margin: 0;
}

.game-root {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
}

.game-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
}
</style>
