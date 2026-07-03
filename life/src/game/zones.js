import * as THREE from 'three'
import { uiState, showSubtitle, showPrompt, hidePrompt, showEnd, showGameOver } from './uiState'
import {
  FLOOD_SOUTH_Z,
  FLOOD_NORTH_Z,
  STREAM_CENTER_X,
  PLANK_WIDTH,
  PLANK_SURFACE_Y,
  HIDE_SPOT_X,
  HIDE_SPOT_Z,
  FRONT_BARRIER_Z,
} from './environment'

// How close the player must be to the bed to pick the boy up.
const PICKUP_RADIUS = 1.5
// Fraction of the mob that counts as "reached the house" — crossing this
// starts the pickup countdown below.
const MOB_REACHED_THRESHOLD = 0.8
// Once the mob has reached the house, this many seconds of real grace time
// remain to pick the boy up before it's a game over.
const PICKUP_GRACE_SECONDS = 5
// How close any mob member can get to the player before it's a game over.
const TOUCH_RADIUS = 0.9
// Stages where the mob's touch no longer matters (already ended one way or another).
const TERMINAL_STAGES = new Set(['gameover', 'caught', 'drowned', 'ended'])
// How close the player must be to the plank's resting spot to lay it down.
const PLANK_INTERACT_RADIUS = 1.6
// How far off the plank's centerline the player can stray before falling in.
const PLANK_HALF_WIDTH = PLANK_WIDTH / 2
// Player z at which the return trip counts as "back inside the house".
const HOUSE_ARRIVAL_Z = 1.2
// How close to the rock counts as "hidden behind it".
const HIDE_RADIUS = 2.2
const HIDE_SPOT = new THREE.Vector3(HIDE_SPOT_X, 0, HIDE_SPOT_Z)

// Ground-plane-only distance — proximity checks (bed, plank, hide spot) care
// about where the player is standing on the map, not how it compares to a
// marker's arbitrary y value against wildly varying terrain height (the
// forest floor near the hideout climbs several units above sea level).
function horizontalDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

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
    // approach | gameover | caught | lull | attack | retreat | intro | hiding | waitPrompt | dawn | return | ended
    this.stage = 'approach'
    this.stageElapsed = 0
    // Guards the intro-onward triggers below, which key off this.stageElapsed
    // and must not fire until the mob-attack prelude has handed off to them.
    this.introStarted = false
    this.childPickedUp = false
    this.urgencyShown = false
    // Seconds left to pick the boy up, once the mob has reached the house.
    // null until the countdown starts (see MOB_REACHED_THRESHOLD below).
    this.pickupDeadline = null
    this.plankPlaced = false
    this.crossedShown = false
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

  // Single 'E'-keypress entry point (see App.vue) — dispatches to whichever
  // interaction is relevant for the current stage.
  interact() {
    if (this.stage === 'approach') this.tryPickup()
    else if (this.stage === 'return') this.tryPlacePlank()
  }

  // Only does anything while the player is still in the approach beat,
  // hasn't already grabbed the boy, and is standing close enough to the bed.
  tryPickup() {
    if (this.childPickedUp) return
    const dist = horizontalDistance(this.playerMount.position, this.world.bedPosition)
    if (dist > PICKUP_RADIUS) return
    this.childPickedUp = true
    this.world.dadFigure.setCarrying(true)
    this.world.sleepingChild.visible = false
    uiState.interactHint = ''
    showSubtitle('He scoops up the boy.', 3500)
  }

  // Lays the plank across the swollen stream on the morning return trip —
  // only works once the player has walked over to where it's resting. Also
  // where dad picks the boy back up (he's been walking beside them, not
  // carried, since being set down at the hideout — see the 'hiding' stage
  // transition below).
  tryPlacePlank() {
    if (this.plankPlaced) return
    const dist = horizontalDistance(this.playerMount.position, this.world.plankRestPosition)
    if (dist > PLANK_INTERACT_RADIUS) return
    this.plankPlaced = true
    this.world.placePlank()
    this.world.dadFigure.setCarrying(true)
    this.world.boyFigure.mount.visible = false
    uiState.interactHint = ''
    showSubtitle('He picks the boy back up and lays the plank across.', 3400)
  }

  update(dt) {
    this.elapsed += dt
    this.stageElapsed += dt
    let z = this.playerMount.position.z

    // Fade in from black once the player can see anything at all.
    uiState.fadeOpacity = Math.max(0, 1 - this.elapsed * 0.6)

    // Catching the mob's touch is checked every frame, independent of
    // story stage, so wandering into the crowd is always fatal while the
    // mob is out (members fade to 'hidden' once the retreat finishes, at
    // which point checkCollision naturally stops matching anyone).
    if (!TERMINAL_STAGES.has(this.stage)) {
      if (this.world.mobCrowd.checkCollision(this.playerMount.position, TOUCH_RADIUS)) {
        this.stage = 'caught'
        this.stageElapsed = 0
        uiState.interactHint = ''
      }
    }

    // They escape through the back window, not out the front door — hold
    // the player back from the door until they've actually gone through
    // the window (once('through-window') below marks that permanently).
    if (!this.fired.has('through-window') && z > FRONT_BARRIER_Z) {
      this.playerMount.position.z = FRONT_BARRIER_Z
      z = FRONT_BARRIER_Z
    }

    if (this.stage === 'approach') {
      this.once('mob-visible', () => showSubtitle("Something's coming up the road.", 4000))
      // Tension is driven by real crowd proximity (arrivedRatio) rather than
      // player position, since the mob's approach is on its own clock. But
      // the approach->lull handoff now additionally requires the player to
      // have actually walked over and picked the boy up (see tryPickup()).
      // Once the mob reaches the house (ratio past the threshold), a real
      // countdown starts — running out is a game over.
      const ratio = this.world.mobCrowd.arrivedRatio()
      this.world.torchGroupHouse.intensity = Math.min(0.6, ratio * 0.6)

      if (this.childPickedUp) {
        uiState.interactHint = ''
        if (ratio > MOB_REACHED_THRESHOLD) {
          this.stage = 'lull'
          this.stageElapsed = 0
          showSubtitle('You have him. Move.', 3000)
        }
      } else if (ratio > MOB_REACHED_THRESHOLD) {
        if (this.pickupDeadline === null) {
          this.pickupDeadline = PICKUP_GRACE_SECONDS
          showSubtitle("They're at the house — get him now!", 2200)
        }
        this.pickupDeadline -= dt
        uiState.interactHint = `Get to him — ${Math.max(0, Math.ceil(this.pickupDeadline))}s!`
        if (this.pickupDeadline <= 0) {
          uiState.interactHint = ''
          this.stage = 'gameover'
          this.stageElapsed = 0
        }
      } else {
        const dist = horizontalDistance(this.playerMount.position, this.world.bedPosition)
        uiState.interactHint = dist < PICKUP_RADIUS ? 'Press E to pick him up' : ''
        if (!this.urgencyShown && ratio > 0.3) {
          this.urgencyShown = true
          showSubtitle('Get him. Now.', 3500)
        }
      }
    } else if (this.stage === 'gameover') {
      this.world.torchGroupHouse.intensity = Math.min(1, this.world.torchGroupHouse.intensity + dt * 0.8)
      if (this.stageElapsed > 1.2) {
        this.once('gameover-card', () =>
          showGameOver(
            'They were too fast.',
            'The crowd reached the door before he could get the boy out of bed.'
          )
        )
      }
    } else if (this.stage === 'caught') {
      this.world.torchGroupHouse.intensity = Math.min(1, this.world.torchGroupHouse.intensity + dt * 1.2)
      if (this.stageElapsed > 1) {
        this.once('caught-card', () =>
          showGameOver('Caught.', 'The crowd got to him before he could get away.')
        )
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

      if (this.stage === 'intro') {
        // Reaching the hideout isn't just about z anymore — the player has
        // to actually walk behind the rock, out of the torchlight's sweep.
        const distToHide = horizontalDistance(this.playerMount.position, HIDE_SPOT)
        if (z < -25) {
          uiState.interactHint = distToHide < HIDE_RADIUS ? '' : 'Get behind the rock'
        }
        if (distToHide < HIDE_RADIUS) {
          uiState.interactHint = ''
          this.stage = 'hiding'
          this.stageElapsed = 0
          // Set the boy down beside them — he walks on his own from here
          // until dad picks him back up at the plank (see tryPlacePlank()).
          this.world.dadFigure.setCarrying(false)
          this.world.boyFigure.mount.position.copy(this.playerMount.position)
          this.world.boyFigure.mount.visible = true
          showSubtitle("Here. Don't move. Don't make a sound.", 5000)
        }
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
        showSubtitle('Morning. Time to get him home.', 4500)
        this.stage = 'return'
        this.stageElapsed = 0
      }
    } else if (this.stage === 'return') {
      this.once('flood', () => {
        this.world.floodStream()
        showSubtitle('The stream is running higher this morning.', 4000)
      })

      if (!this.plankPlaced) {
        const dist = horizontalDistance(this.playerMount.position, this.world.plankRestPosition)
        uiState.interactHint = dist < PLANK_INTERACT_RADIUS ? 'Press E to lay the plank across' : ''
        // Can't wade the swollen stream without it — hold the player at the bank.
        if (z > FLOOD_SOUTH_Z) {
          this.playerMount.position.z = FLOOD_SOUTH_Z
        }
      } else {
        uiState.interactHint = ''
        const inFloodZone = z > FLOOD_SOUTH_Z && z < FLOOD_NORTH_Z
        if (inFloodZone) {
          const onPlank = Math.abs(this.playerMount.position.x - STREAM_CENTER_X) < PLANK_HALF_WIDTH
          if (onPlank) {
            // Stand on the plank's surface, not the flooded streambed below it.
            this.playerMount.position.y = PLANK_SURFACE_Y
          } else {
            this.stage = 'drowned'
            this.stageElapsed = 0
          }
        }
        if (!this.crossedShown && z > FLOOD_NORTH_Z) {
          this.crossedShown = true
          showSubtitle('Across. Almost home.', 3500)
        }
      }

      if (z > HOUSE_ARRIVAL_Z) {
        uiState.interactHint = ''
        showSubtitle('Home.', 3000)
        this.stage = 'ended'
        this.stageElapsed = 0
      }
    } else if (this.stage === 'drowned') {
      if (this.stageElapsed > 1) {
        this.once('drowned-card', () =>
          showGameOver('Into the water.', 'He slipped off the plank into the swollen stream.')
        )
      }
    } else if (this.stage === 'ended' && this.stageElapsed > 2.5) {
      this.once('end-card', () =>
        showEnd(
          'In memory of that night, 1997.',
          'This is based on a true family memory from the war’s aftermath in Croatia — a father and uncle who got a child out a back window, across a stream, and into the trees until a mob passed. By morning the stream had risen; they laid a plank across it and carried him home.'
        )
      )
    }

    return Math.min(1, this.world.torchGroupHouse.intensity + this.world.torchGroupForest.intensity)
  }
}
