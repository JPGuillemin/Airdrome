// player/session.ts
//
// "Session de lecture unique" : un seul appareil joue à la fois.
// La file serveur mémorise le dernier écrivain (`changedBy`) : celui qui a
// écrit en dernier possède la session.
//
//   idle      → pas de lecture. On n'écrit que si la file est encore à nous.
//   claiming  → lecture démarrée, on écrit la file pour que le serveur nous désigne.
//               Pas de test de prise de contrôle (le serveur nomme peut-être l'ancien appareil).
//   active    → écriture réussie. On sonde le serveur ; si un autre appareil écrit, on cède.
import { sleep } from '@/shared/utils'
import { usePlayerStore } from './store'

const POLL_MS = 5000
// La 1re requête après une reprise peut échouer (WebView en arrière-plan, connexion périmée)
const CLAIM_BACKOFF_MS = [0, 400, 1200, 2500, 5000]

type State = 'idle' | 'claiming' | 'active'
let state: State = 'idle'
let pollTimer: ReturnType<typeof setTimeout> | undefined

/** True si cet appareil est (ou devient) l'appareil actif. */
export function ownsSession(): boolean {
  return state !== 'idle'
}

// ── Cycle de vie (appelé depuis les événements audio) ────────────────────

/** Lecture démarrée : écrire la file d'abord, surveiller ensuite. */
export async function claimSession() {
  if (state !== 'idle') return
  state = 'claiming'
  const player = usePlayerStore()
  // Rien à écrire : la première sauvegarde fera la prise de session
  if (!navigator.onLine || !player.queue?.length || !player.track) return

  for (const delay of CLAIM_BACKOFF_MS) {
    if (delay) await sleep(delay)
    if (state !== 'claiming') return // relâchée, ou déjà prise par un save
    if (await writeQueue()) return
  }
  console.info('[session] claim failed after retries; will retry on next save')
}

/** Lecture arrêtée : sauvegarder la position finale, puis relâcher. */
export async function onPlaybackStopped() {
  if (state === 'idle') return // déjà relâchée (ex. prise de contrôle)
  await saveSession()
  // La lecture a pu reprendre pendant la sauvegarde
  if (!usePlayerStore().isPlaying) releaseSession()
}

/** Fermeture de la page : seul l'appareil actif écrit (un appareil idle a déjà sauvegardé en pausant). */
export function onUnload() {
  if (state !== 'idle') void saveSession({ blind: true })
}

/** Abandonner la session SANS rien écrire sur le serveur. */
export function releaseSession() {
  state = 'idle'
  clearTimeout(pollTimer)
}

// ── Sauvegarde ───────────────────────────────────────────────────────────

/**
 * Seul chemin d'écriture de la file. Sauf `blind` (déchargement de page, où
 * l'asynchrone n'est pas fiable), on vérifie d'abord qu'on a le droit d'écrire,
 * pour ne jamais effacer la prise de session d'un autre appareil.
 */
export async function saveSession({ blind = false } = {}) {
  try {
    if (!blind && !(await mayWrite())) return
    await writeQueue()
  } catch (err) {
    console.info('[session] save aborted:', err)
  }
}

async function mayWrite(): Promise<boolean> {
  const api = usePlayerStore().api
  switch (state) {
    case 'idle':
      // Appareil au repos : n'écrire que si la file serveur est encore la nôtre
      return api.isOwnQueueWriter((await api.getPlayQueue()).changedBy)
    case 'claiming':
      // Prise de session pas encore arrivée (ex. erreur réseau à la reprise).
      // Le serveur nomme encore l'ancien appareil : ce n'est PAS une prise de
      // contrôle, on réessaie la prise de session.
      await writeQueue()
      return false
    case 'active':
      return !(await lostSession())
    default:
      return false
  }
}

/** Une tentative d'écriture. True si elle a abouti. En `claiming`, une écriture réussie termine la prise de session. */
async function writeQueue(): Promise<boolean> {
  const player = usePlayerStore()
  if (!navigator.onLine || !player.queue?.length || !player.track) return false
  try {
    if (!(await player.api.savePlayQueue(player.queue, player.track, Math.trunc(player.currentTime)))) return false
  } catch (err) {
    console.info('[session] write failed', err)
    return false
  }
  if (state === 'claiming') {
    state = 'active'
    schedulePoll()
  }
  return true
}

// ── Détection de prise de contrôle ───────────────────────────────────────

/**
 * True si on ne doit PAS écrire : un autre appareil a pris la session (on
 * relâche et on se met en pause), ou on a été relâché pendant la requête.
 */
async function lostSession(): Promise<boolean> {
  const player = usePlayerStore()
  const { changedBy } = await player.api.getPlayQueue()
  if (state !== 'active') return true
  if (player.api.isOwnQueueWriter(changedBy)) return false
  console.info(`[session] taken over by ${changedBy}`)
  releaseSession() // d'abord : rien ne doit réécrire et provoquer un ping-pong
  player.takeoverAt = Date.now()
  void player.pause() // positionne userPaused : les handlers de visibilité/périphérique ne relancent pas
  return true
}

/** setTimeout chaînés (pas setInterval) : les ticks ne peuvent jamais se chevaucher. */
function schedulePoll() {
  clearTimeout(pollTimer)
  pollTimer = setTimeout(async () => {
    try {
      if (usePlayerStore().isPlaying && navigator.onLine) await lostSession()
    } catch {
      // Hors ligne ou erreur transitoire : réessayer au prochain tick
    }
    if (state === 'active') schedulePoll()
  }, POLL_MS)
}
