// Minimal procedural ambience: wind, and a heartbeat that rises with tension.
// No audio files are used; everything is synthesized with the Web Audio API.
export class Ambience {
  constructor() {
    this.ctx = null
    this.tension = 0
    this.heartbeatTimer = 0
    this.volume = 0.8
  }

  start() {
    if (this.ctx) return
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    this.ctx = new AudioCtx()

    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = this.volume
    this.masterGain.connect(this.ctx.destination)

    const noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

    this.noise = this.ctx.createBufferSource()
    this.noise.buffer = noiseBuffer
    this.noise.loop = true

    this.windFilter = this.ctx.createBiquadFilter()
    this.windFilter.type = 'lowpass'
    this.windFilter.frequency.value = 380

    this.windGain = this.ctx.createGain()
    this.windGain.gain.value = 0.05

    this.noise.connect(this.windFilter).connect(this.windGain).connect(this.masterGain)
    this.noise.start()
  }

  setVolume(value) {
    this.volume = value
    if (this.masterGain) this.masterGain.gain.value = value
  }

  pause() {
    this.ctx?.suspend()
  }

  resume() {
    this.ctx?.resume()
  }

  setTension(value) {
    this.tension = value
    if (!this.ctx) return
    this.windFilter.frequency.value = 300 + value * 500
    this.windGain.gain.value = 0.04 + value * 0.06
  }

  update(dt) {
    if (!this.ctx) return
    if (this.tension > 0.35) {
      this.heartbeatTimer -= dt
      if (this.heartbeatTimer <= 0) {
        this._beat()
        this.heartbeatTimer = 1.0 - this.tension * 0.4
      }
    }
  }

  _beat() {
    const now = this.ctx.currentTime
    for (const offset of [0, 0.18]) {
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 55
      gain.gain.value = 0
      gain.gain.setValueAtTime(0, now + offset)
      gain.gain.linearRampToValueAtTime(0.12 * this.tension, now + offset + 0.02)
      gain.gain.linearRampToValueAtTime(0, now + offset + 0.18)
      osc.connect(gain).connect(this.masterGain)
      osc.start(now + offset)
      osc.stop(now + offset + 0.2)
    }
  }

  stop() {
    if (this.noise) this.noise.stop()
    if (this.ctx) this.ctx.close()
    this.ctx = null
  }
}
