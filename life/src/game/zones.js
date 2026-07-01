import * as THREE from 'three'
import { uiState, showSubtitle, showPrompt, hidePrompt, showEnd } from './uiState'

// Story beats are now driven by where the player is (and, early on, by a
// simple timer) rather than a fixed camera timeline — the player walks the
// route themselves in third person.
export class ZoneDirector {
  constructor(game, world, playerMount) {
    this.game = game
    this.world = world
    this.playerMount = playerMount
    this.elapsed = 0
    this.fired = new Set()
    // approach | lull | attack | retreat | intro | hiding | waitPrompt | dawn | ended
    this.stage = 'approach'
    this.stageElapsed = 0
    // Guards the intro-onward triggers below, which key off this.stageElapsed
    // and must not fire until the mob-attack prelude has handed off to them.
    this.introStarted = false
    uiState.fadeOpacity = 1
  }

  once(id, fn) {
    if (this.fired.has(id)) return
    this.fired.add(id)
    fn()
  }

  continuePrompt() {
    if (this.stage === 'waitPrompt') {
      hidePrompt()
      this.stage = 'dawn'
      this.stageElapsed = 0
    } else if (this.stage === 'attack') {
      hidePrompt()
      this.world.mobCrowd.beginRetreat()
      this.stage = 'retreat'
      this.stageElapsed = 0
    }
  }

  update(dt) {
    this.elapsed += dt
    this.stageElapsed += dt
    const z = this.playerMount.position.z

    // Fade in from black once the player can see anything at all.
    uiState.fadeOpacity = Math.max(0, 1 - this.elapsed * 0.6)

    if (this.stage === 'approach') {
      this.once('mob-visible', () => showSubtitle("Something's coming up the road.", 4000))
      // Tension and the approach->lull handoff are both driven by real crowd
      // proximity (arrivedRatio) rather than player position, since the
      // player stays inside the house for this whole beat.
      this.world.torchGroupHouse.intensity = Math.min(0.6, this.world.mobCrowd.arrivedRatio() * 0.6)
      if (this.world.mobCrowd.arrivedRatio() > 0.8) {
        this.stage = 'lull'
        this.stageElapsed = 0
        this.world.dadFigure.setCarrying(true)
        showSubtitle('He scoops up the boy.', 3500)
      }
    } else if (this.stage === 'lull') {
      this.world.torchGroupHouse.intensity *= 0.94
      if (this.stageElapsed > 2.5) {
        this.stage = 'attack'
        this.stageElapsed = 0
        showSubtitle("They're outside. Pounding on the door.", 4500)
      }
    } else if (this.stage === 'attack') {
      this.world.torchGroupHouse.intensity = Math.min(1, this.world.torchGroupHouse.intensity + dt * 0.5)
      if (this.stageElapsed > 2) showPrompt('Hold on — click when ready')
    } else if (this.stage === 'retreat') {
      this.world.torchGroupHouse.intensity = Math.max(0.15, this.world.torchGroupHouse.intensity - dt * 0.12)
      if (this.world.mobCrowd.isDone()) {
        this.stage = 'intro'
        this.stageElapsed = 0
        this.introStarted = true
      }
    }

    if (this.introStarted) {
      this.once('asleep', () => showSubtitle("It's late. The house is quiet.", 5000))
      this.once('voices', () => {
        if (this.stageElapsed > 5) showSubtitle('Voices outside. Then more of them.', 5000)
      })
      if (this.fired.has('voices')) {
        this.world.torchGroupHouse.intensity = Math.min(0.55, (this.stageElapsed - 5) * 0.15)
      }

      if (z < -1.6) {
        this.once('through-window', () => {
          showSubtitle('Through the back window. Run.', 4500)
          this.world.torchGroupHouse.intensity = 0.8
        })
      }
      if (z < -9.4) {
        this.once('stream', () => showSubtitle('The river. Careful steps.', 4000))
      }
      if (z < -14.8) {
        this.once('far-bank', () => showSubtitle('Almost across.', 3500))
      }
      if (z < -18) {
        this.once('hill', () => {
          showSubtitle('Uphill. Into the trees.', 4000)
        })
      }
      if (this.fired.has('hill') && this.stage === 'intro') {
        this.world.torchGroupHouse.intensity = Math.max(0.15, this.world.torchGroupHouse.intensity - dt * 0.05)
      }

      if (z < -27 && this.stage === 'intro') {
        this.stage = 'hiding'
        this.stageElapsed = 0
        showSubtitle("Here. Don't move. Don't make a sound.", 5000)
      }
    }

    if (this.stage === 'hiding') {
      const t = Math.min(this.stageElapsed / 6, 1)
      this.world.torchGroupForest.intensity = Math.sin(t * Math.PI) * 0.9
      this.world.torchGroupHouse.intensity *= 0.98
      if (this.stageElapsed > 6.5) {
        this.stage = 'waitPrompt'
        this.stageElapsed = 0
      }
    } else if (this.stage === 'waitPrompt') {
      this.world.torchGroupForest.intensity *= 0.97
      if (this.stageElapsed > 1.5) showPrompt('Hold still — click when ready')
    } else if (this.stage === 'dawn') {
      const t = Math.min(this.stageElapsed / 6, 1)
      if (t < 0.3) {
        uiState.fadeOpacity = t / 0.3
      } else if (t < 0.5) {
        uiState.fadeOpacity = 1
      } else {
        const dt2 = (t - 0.5) / 0.5
        uiState.fadeOpacity = 1 - dt2
        this.world.hemiLight.intensity = 2.6 + dt2 * 1.4
        this.world.dirLight.intensity = 1.4 + dt2 * 1.0
        this.world.hemiLight.color.lerp(new THREE.Color(0xbfd6ff), dt2 * 0.6)
        this.game.scene.fog.color.lerp(new THREE.Color(0x9fb6cc), dt2 * 0.6)
        this.game.scene.background.lerp(new THREE.Color(0x9fb6cc), dt2 * 0.6)
        this.world.moon.setOpacity(1 - dt2)
      }
      if (t >= 1) {
        showSubtitle('By morning, they were gone.', 6000)
        this.stage = 'ended'
        this.stageElapsed = 0
      }
    } else if (this.stage === 'ended' && this.stageElapsed > 2.5) {
      this.once('end-card', () =>
        showEnd(
          'In memory of that night, 1997.',
          'This is based on a true family memory from the war’s aftermath in Croatia — a father and uncle who got a child out a back window, across a stream, and into the trees until a mob passed.'
        )
      )
    }

    return Math.min(1, this.world.torchGroupHouse.intensity + this.world.torchGroupForest.intensity)
  }
}
