// Player ufficiale di YouTube (IFrame Player API), senza i suoi comandi: li
// disegna components/Television.tsx. Lo script si scarica una volta sola,
// solo quando un televisore sta per comparire sullo schermo.

export interface YouTubePlayer {
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  loadVideoById(options: { videoId: string; startSeconds?: number }): void
  /** carica il video fermo, senza farlo partire */
  cueVideoById(options: { videoId: string; startSeconds?: number }): void
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
  getVolume(): number
  setVolume(volume: number): void
  mute(): void
  unMute(): void
  isMuted(): boolean
  destroy(): void
}

export interface YouTubeApi {
  Player: new (
    element: HTMLElement,
    options: {
      /** facoltativo se element è un iframe già pronto */
      videoId?: string
      host?: string
      width?: string
      height?: string
      playerVars?: Record<string, string | number>
      events?: {
        onReady?: (event: { target: YouTubePlayer }) => void
        onStateChange?: (event: { data: number }) => void
        onError?: (event: { data: number }) => void
      }
    }
  ) => YouTubePlayer
}

/** stati del player (YT.PlayerState) */
export const PlayerState = {
  unstarted: -1,
  ended: 0,
  playing: 1,
  paused: 2,
  buffering: 3,
  cued: 5
} as const

let api: Promise<YouTubeApi> | undefined

export function loadYouTubeApi(): Promise<YouTubeApi> {
  if (api) return api
  api = new Promise<YouTubeApi>((resolve, reject) => {
    const w = window as any
    if (w.YT?.Player) {
      resolve(w.YT)
      return
    }
    const previous = w.onYouTubeIframeAPIReady
    w.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve(w.YT)
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.addEventListener('error', () => {
      api = undefined
      reject(new Error('YouTube non raggiungibile'))
    })
    document.head.append(script)
  })
  return api
}
