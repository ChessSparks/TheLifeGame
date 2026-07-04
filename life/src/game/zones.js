import * as THREE from 'three'
import { uiState, showSubtitle, showEnd, showGameOver } from './uiState'
import {
  FLOOD_SOUTH_Z,
  FLOOD_NORTH_Z,
  STREAM_CENTER_X,
  PLANK_WIDTH,
  PLANK_SURFACE_Y,
  HIDE_SPOT_X,
  HIDE_SPOT_Z,
  FRONT_BARRIER_Z,
  WINDOW_INSIDE_POS,
  WINDOW_OUTSIDE_POS,
  elevationAt,
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
// The uncle's usual side-by-side follow spot, and the single-file spot he
// tucks into for the narrow plank crossing (see the 'return' stage below) —
// side-by-side would put him off the plank's width and into the water.
const UNCLE_SIDE_OFFSET = new THREE.Vector3(1.4, 0, 0.6)
const UNCLE_INLINE_OFFSET = new THREE.Vector3(0, 0, -1.1)
// How close to the rock counts as "hidden behind it".
const HIDE_RADIUS = 2.2
const HIDE_SPOT = new THREE.Vector3(HIDE_SPOT_X, 0, HIDE_SPOT_Z)
// Where dad (and the uncle) get physically held back until the window
// climb happens — a bit short of the wall itself. This is checked
// unconditionally from the start of the game (not gated behind any stage),
// otherwise it can be bypassed by reaching the window before the mob
// sequence even plays out. Once in 'intro' (mob sequence already done),
// reaching this line auto-triggers the climb — no keypress needed.
const WINDOW_BARRIER_Z = WINDOW_INSIDE_POS.z - 0.6
const WINDOW_CLIMB_DURATION = 1.1

// Ground-plane-only distance — proximity checks (bed, plank) care about
// where the player is standing on the map, not how it compares to a
// marker's arbitrary y value against wildly varying terrain height.
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
    // approach | gameover | caught | lull | attack | intro | hiding | waitPrompt | dawn | return | drowned | ended
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
    this.wentThroughWindow = false
    // null when no scripted climb is playing; 0..1 progress while it is.
    this.climbAnimT = null
    // Same, for the uncle's climb — kicked off right as dad's finishes (see
    // the climb-completion code below), so he follows through the window
    // the same way instead of just walking around to it.
    this.uncleClimbAnimT = null
    this.uncleClimbStart = null
    uiState.fadeOpacity = 1
  }

  once(id, fn) {
    if (this.fired.has(id)) return
    this.fired.add(id)
    fn()
  }

  // No stage waits on a click anymore (see the 'attack' and 'waitPrompt'
  // stages in update(), which now both auto-advance) — kept as a harmless
  // no-op since App.vue/GameUI.vue still send Space-presses and prompt
  // clicks here.
  continuePrompt() {}

  // Single 'E'-keypress entry point (see App.vue) — dispatches to whichever
  // interaction is relevant for the current stage. Climbing through the
  // window is no longer one of these — it now happens automatically once
  // the player reaches it (see the window-barrier block in update()).
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
    // the player back from the door until they've actually climbed through
    // the window (this.wentThroughWindow, set below).
    if (!this.wentThroughWindow && z > FRONT_BARRIER_Z) {
      this.playerMount.position.z = FRONT_BARRIER_Z
      z = FRONT_BARRIER_Z
    }

    // The window barrier (and the scripted climb that lifts it) is checked
    // unconditionally, from the very start of the game — not gated behind
    // this.introStarted — otherwise it can be walked straight past before
    // the mob-attack sequence even plays out. No keypress needed: reaching
    // the window during 'intro' (i.e. once the mob-attack beat has already
    // played out) climbs through automatically.
    if (!this.wentThroughWindow) {
      if (this.climbAnimT !== null) {
        // Scripted hop through the window — drives dad's position directly
        // while input is disabled, rather than letting the player just walk
        // through.
        this.climbAnimT += dt / WINDOW_CLIMB_DURATION
        const t = Math.min(this.climbAnimT, 1)
        const eased = t * t * (3 - 2 * t)
        this.playerMount.position.lerpVectors(WINDOW_INSIDE_POS, WINDOW_OUTSIDE_POS, eased)
        this.playerMount.position.y = elevationAt(this.playerMount.position.z) + Math.sin(t * Math.PI) * 0.5
        this.playerMount.rotation.x = -Math.sin(t * Math.PI) * 0.4
        z = this.playerMount.position.z
        if (t >= 1) {
          this.climbAnimT = null
          this.playerMount.rotation.x = 0
          this.wentThroughWindow = true
          this.world.playerController.setEnabled(true)
          showSubtitle('Through the back window. Run.', 4500)
          // However fast they got here, the escape narrative (voices,
          // stream, hill, etc. — all gated on introStarted) picks up from
          // here, even if lull/attack hadn't finished playing out.
          this.stage = 'intro'
          this.stageElapsed = 0
          this.introStarted = true
          // The uncle follows the same way, right behind — see the
          // uncleClimbAnimT block below, rather than just walking around.
          this.uncleClimbAnimT = 0
          this.uncleClimbStart = this.world.uncleMount.position.clone()
        }
      } else if (z < WINDOW_BARRIER_Z) {
        // Once the boy's actually in hand, nothing holds them back from
        // bolting for the window immediately — they don't have to wait out
        // the lull/attack beats first.
        if (this.childPickedUp && !TERMINAL_STAGES.has(this.stage)) {
          this.climbAnimT = 0
          this.world.playerController.setEnabled(false)
        } else {
          // Don't have the boy yet — held back at the sill.
          this.playerMount.position.z = WINDOW_BARRIER_Z
          z = WINDOW_BARRIER_Z
        }
      }
      if (this.world.uncleMount.position.z < WINDOW_BARRIER_Z) {
        this.world.uncleMount.position.z = WINDOW_BARRIER_Z
      }
    }

    // The uncle's own climb-through hop, kicked off right as dad's finishes
    // (see this.uncleClimbAnimT above) — runs independently of wentThroughWindow
    // since it continues after that's already true.
    if (this.uncleClimbAnimT !== null) {
      this.uncleClimbAnimT += dt / WINDOW_CLIMB_DURATION
      const ut = Math.min(this.uncleClimbAnimT, 1)
      const ueased = ut * ut * (3 - 2 * ut)
      const uncleMount = this.world.uncleMount
      uncleMount.position.lerpVectors(this.uncleClimbStart, WINDOW_OUTSIDE_POS, ueased)
      uncleMount.position.y = elevationAt(uncleMount.position.z) + Math.sin(ut * Math.PI) * 0.5
      uncleMount.rotation.x = -Math.sin(ut * Math.PI) * 0.4
      if (ut >= 1) {
        this.uncleClimbAnimT = null
        uncleMount.rotation.x = 0
      }
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
      if (this.stageElapsed > 4) {
        // No click needed — after a beat of pounding at the door, they
        // move on their own. They don't retreat once the family gets away
        // — they stay gathered at the house until morning (see the
        // 'waitPrompt' stage below).
        this.world.torchGroupHouse.intensity = 0.5
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

      if (this.stage === 'intro') {
        // Reaching the hideout isn't just about z — the player has to
        // actually walk behind the rock, out of the torchlight's sweep.
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
      // torchGroupHouse deliberately isn't touched here — the mob is still
      // camped at the house all through the night (see continuePrompt()),
      // so its glow stays steady until they're finally sent off at dawn.
      const t = Math.min(this.stageElapsed / 6, 1)
      this.world.torchGroupForest.intensity = Math.sin(t * Math.PI) * 0.9
      if (this.stageElapsed > 6.5) {
        this.stage = 'waitPrompt'
        this.stageElapsed = 0
      }
    } else if (this.stage === 'waitPrompt') {
      // No click needed — once behind the rock, they just wait it out and
      // morning comes on its own.
      this.world.torchGroupForest.intensity *= 0.97
      if (this.stageElapsed > 4) {
        // The mob has been camped outside all night — only morning
        // actually sends them away.
        this.world.mobCrowd.beginRetreat()
        this.stage = 'dawn'
        this.stageElapsed = 0
      }
    } else if (this.stage === 'dawn') {
      const t = Math.min(this.stageElapsed / 6, 1)
      // The mob's retreat (see continuePrompt()) plays out over roughly
      // this same span — fade their glow out in step with it.
      this.world.torchGroupHouse.intensity = 0.5 * (1 - t)
      if (t < 0.3) {
        uiState.fadeOpacity = t / 0.3
      } else if (t < 0.5) {
        uiState.fadeOpacity = 1
      } else {
        const dt2 = (t - 0.5) / 0.5
        uiState.fadeOpacity = 1 - dt2
        // Kept modest — much higher and the ground's vertex colors wash
        // out toward gray/white under ACES tone mapping instead of reading
        // as a green-and-brown morning landscape. Same for the fog/
        // background target below — a pale blue reads as an overexposed
        // haze against the forest floor, so it leans more sage than sky.
        this.world.hemiLight.intensity = 2.6 + dt2 * 0.3
        this.world.dirLight.intensity = 1.4 + dt2 * 0.2
        this.world.hemiLight.color.lerp(new THREE.Color(0xbfd6ff), dt2 * 0.4)
        this.game.scene.fog.color.lerp(new THREE.Color(0x4a5c3e), dt2 * 0.45)
        this.game.scene.background.lerp(new THREE.Color(0x4a5c3e), dt2 * 0.45)
        this.game.scene.fog.density = 0.035 - dt2 * 0.015
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

      // The plank is too narrow to walk side-by-side — tuck the uncle in
      // behind dad, single-file, for the crossing itself.
      const inFloodZone = z > FLOOD_SOUTH_Z && z < FLOOD_NORTH_Z
      this.world.uncleCompanion.setOffset(inFloodZone ? UNCLE_INLINE_OFFSET : UNCLE_SIDE_OFFSET)

      if (!this.plankPlaced) {
        const dist = horizontalDistance(this.playerMount.position, this.world.plankRestPosition)
        uiState.interactHint = dist < PLANK_INTERACT_RADIUS ? 'Press E to lay the plank across' : ''
        // Can't wade the swollen stream without it — hold the player at the bank.
        if (z > FLOOD_SOUTH_Z) {
          this.playerMount.position.z = FLOOD_SOUTH_Z
        }
      } else {
        uiState.interactHint = ''
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
        // The uncle gets the same solid footing on the plank while crossing
        // beside/behind dad — otherwise he'd visibly sink into the flooded
        // streambed instead of standing on the surface.
        const uncleMount = this.world.uncleMount
        const uncleInFloodZone = uncleMount.position.z > FLOOD_SOUTH_Z && uncleMount.position.z < FLOOD_NORTH_Z
        if (uncleInFloodZone && Math.abs(uncleMount.position.x - STREAM_CENTER_X) < PLANK_HALF_WIDTH) {
          uncleMount.position.y = PLANK_SURFACE_Y
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
