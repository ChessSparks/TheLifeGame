<template>
  <div class="ui-layer">
    <div class="vignette" />
    <div class="fade" :style="{ opacity: uiState.fadeOpacity }" />

    <transition name="fade-text">
      <p v-if="uiState.subtitle" class="subtitle">{{ uiState.subtitle }}</p>
    </transition>

    <transition name="fade-text">
      <div v-if="uiState.promptVisible" class="prompt" @click="$emit('continue')">
        {{ uiState.promptText }}
      </div>
    </transition>

    <div v-if="uiState.phase === 'title'" class="card title-card">
      <h1>{{ uiState.titleText }}</h1>
      <p>{{ uiState.titleSubtext }}</p>
      <p class="note">A short, true memory. Best with sound on and a moment of quiet.</p>
      <button :disabled="!uiState.ready" @click="$emit('begin')">{{ uiState.ready ? 'Begin' : 'Loading…' }}</button>
    </div>

    <div v-if="uiState.phase === 'ended'" class="card end-card">
      <h2>{{ uiState.endTitle }}</h2>
      <p>{{ uiState.endBody }}</p>
      <button @click="$emit('restart')">Restart</button>
    </div>

    <div v-if="uiState.phase === 'gameover'" class="card gameover-card">
      <h2>{{ uiState.gameOverTitle }}</h2>
      <p>{{ uiState.gameOverBody }}</p>
      <button @click="$emit('restart')">Try Again</button>
    </div>

    <transition name="fade-text">
      <p v-if="uiState.interactHint" class="interact-hint">{{ uiState.interactHint }}</p>
    </transition>

    <button
      v-if="uiState.phase === 'playing' && !uiState.paused"
      class="pause-button"
      @click="uiState.paused = true"
    >
      II
    </button>

    <transition name="fade-text">
      <div v-if="uiState.paused" class="card pause-card">
        <h2>Paused</h2>
        <label class="volume-row">
          Volume
          <input type="range" min="0" max="1" step="0.01" v-model.number="uiState.volume" />
        </label>
        <button @click="uiState.paused = false">Resume</button>
        <button class="secondary" @click="$emit('restart')">Restart</button>
      </div>
    </transition>

    <p v-if="uiState.phase === 'playing'" class="look-hint" :class="{ hidden: !showHint }">
      WASD to move · drag to look around · E to interact · Esc to pause
    </p>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { uiState } from '../game/uiState'

defineEmits(['begin', 'continue', 'restart'])

const showHint = ref(false)
watch(
  () => uiState.phase,
  (phase) => {
    if (phase === 'playing') {
      showHint.value = true
      setTimeout(() => {
        showHint.value = false
      }, 6000)
    }
  }
)
</script>

<style scoped>
.ui-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  font-family: Georgia, 'Times New Roman', serif;
  color: #ece6d8;
}

.vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0) 45%, rgba(0, 0, 0, 0.65) 100%);
}

.fade {
  position: absolute;
  inset: 0;
  background: #000;
  transition: opacity 0.4s linear;
}

.subtitle {
  position: absolute;
  bottom: 9%;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 1.3rem;
  letter-spacing: 0.02em;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.9);
  padding: 0 10%;
}

.prompt {
  position: absolute;
  bottom: 3%;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 1rem;
  opacity: 0.85;
  pointer-events: auto;
  cursor: pointer;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.9);
  animation: pulse 1.8s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 0.95; }
}

.card {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: rgba(2, 3, 5, 0.78);
  pointer-events: auto;
  padding: 2rem;
}

.card h1 {
  font-size: 2.6rem;
  letter-spacing: 0.08em;
  margin-bottom: 0.4rem;
}

.card h2 {
  font-size: 1.8rem;
  max-width: 36rem;
  margin-bottom: 0.6rem;
}

.card p {
  max-width: 30rem;
  line-height: 1.5;
  opacity: 0.9;
}

.card .note {
  margin-top: 1.2rem;
  font-size: 0.85rem;
  opacity: 0.6;
}

.card button {
  margin-top: 1.6rem;
  padding: 0.6rem 2.2rem;
  font-size: 1rem;
  background: transparent;
  border: 1px solid #ece6d8;
  color: #ece6d8;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.card button:hover {
  background: #ece6d8;
  color: #0a0c10;
}

.gameover-card {
  background: rgba(38, 4, 4, 0.85);
}

.interact-hint {
  position: absolute;
  bottom: 3%;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 1rem;
  opacity: 0.85;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.9);
  animation: pulse 1.8s ease-in-out infinite;
}

.pause-button {
  position: absolute;
  top: 4%;
  right: 4%;
  pointer-events: auto;
  background: transparent;
  border: 1px solid rgba(236, 230, 216, 0.4);
  color: #ece6d8;
  opacity: 0.55;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  padding: 0.35rem 0.6rem;
  cursor: pointer;
  transition: opacity 0.2s;
}

.pause-button:hover {
  opacity: 0.9;
}

.volume-row {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-top: 1.4rem;
  font-size: 0.85rem;
  opacity: 0.85;
}

.card button.secondary {
  margin-top: 0.7rem;
  opacity: 0.65;
  font-size: 0.85rem;
}

.look-hint {
  position: absolute;
  bottom: 14%;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 0.8rem;
  opacity: 0.55;
  transition: opacity 1s;
}

.look-hint.hidden {
  opacity: 0;
}

.fade-text-enter-active,
.fade-text-leave-active {
  transition: opacity 0.6s;
}
.fade-text-enter-from,
.fade-text-leave-to {
  opacity: 0;
}
</style>
