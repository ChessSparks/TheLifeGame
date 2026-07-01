import { reactive } from 'vue'

export const uiState = reactive({
  phase: 'title', // 'title' | 'playing' | 'ended'
  titleText: '1997',
  titleSubtext: 'A village in eastern Croatia.',
  subtitle: '',
  promptVisible: false,
  promptText: '',
  fadeOpacity: 1,
  endTitle: '',
  endBody: '',
})

let subtitleTimer = null

export function showSubtitle(text, holdMs = 3200) {
  uiState.subtitle = text
  if (subtitleTimer) clearTimeout(subtitleTimer)
  if (holdMs > 0) {
    subtitleTimer = setTimeout(() => {
      uiState.subtitle = ''
    }, holdMs)
  }
}

export function clearSubtitle() {
  uiState.subtitle = ''
  if (subtitleTimer) clearTimeout(subtitleTimer)
}

export function showPrompt(text) {
  uiState.promptText = text
  uiState.promptVisible = true
}

export function hidePrompt() {
  uiState.promptVisible = false
}

export function showEnd(title, body) {
  uiState.endTitle = title
  uiState.endBody = body
  uiState.phase = 'ended'
}
