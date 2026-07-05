import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

export class Game {
  constructor(canvas) {
    this.canvas = canvas
    this.clock = new THREE.Clock()

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x05070b)
    this.scene.fog = new THREE.FogExp2(0x05070b, 0.035)

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.05, 200)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.35

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.4, 0.82)
    this.composer.addPass(this.bloomPass)
    this.composer.addPass(new OutputPass())

    this._updatables = []
  }

  addUpdatable(fn) {
    this._updatables.push(fn)
  }

  resize(width, height) {
    this.camera.aspect = width / Math.max(height, 1)
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
    this.composer.setSize(width, height)
  }

  start() {
    this.renderer.setAnimationLoop(() => this._tick())
  }

  stop() {
    this.renderer.setAnimationLoop(null)
  }

  _tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05)
    for (const fn of this._updatables) fn(dt)
    this.composer.render()
  }

  dispose() {
    this.stop()
    this.renderer.dispose()
  }
}
