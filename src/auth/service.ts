// service.ts
import { md5, randomString, toQueryString } from '@/shared/utils'
import { inject, App, Plugin } from 'vue'
import { pickBy } from 'lodash-es'

export interface Config {
  serverUrl: string
}

const env = (window as any).env

export const config: Config = {
  serverUrl: env?.SERVER_URL || '',
}

type Auth = { password?: string; salt?: string; hash?: string }

interface ServerInfo {
  name: string
  version: string
  openSubsonic: boolean
  extensions: string[]
}

function normalizeServerUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

export class AuthService {
  public server = ''
  public serverInfo: ServerInfo | null = null
  public username = ''

  private salt = ''
  private hash = ''
  private password = ''
  private authenticated = false

  constructor() {
    this.server = normalizeServerUrl(
      config.serverUrl || localStorage.getItem('server') || ''
    )

    this.username = localStorage.getItem('username') || ''
    this.salt = localStorage.getItem('salt') || ''
    this.hash = localStorage.getItem('hash') || ''
    this.password = localStorage.getItem('password') || ''
  }

  private saveSession() {
    if (!config.serverUrl) {
      localStorage.setItem('server', this.server)
    }

    localStorage.setItem('username', this.username)
    localStorage.setItem('salt', this.salt)
    localStorage.setItem('hash', this.hash)
    localStorage.setItem('password', this.password)
  }

  get urlParams() {
    return toQueryString(
      pickBy(
        {
          u: this.username,
          s: this.salt,
          t: this.hash,
          p: this.password,
        },
        (x) => x !== undefined && x !== ''
      )
    )
  }

  async autoLogin(): Promise<boolean> {
    if (!this.server || !this.username) {
      return false
    }

    try {
      const auth = {
        salt: this.salt,
        hash: this.hash,
        password: this.password,
      }

      await login(this.server, this.username, auth)

      this.authenticated = true
      this.serverInfo = await fetchServerInfo(this)

      return true
    } catch {
      return false
    }
  }

  async loginWithPassword(server: string, username: string, password: string): Promise<void> {
    server = normalizeServerUrl(server)

    const salt = randomString()
    const hash = md5(password + salt)

    try {
      await login(server, username, { hash, salt })

      this.salt = salt
      this.hash = hash
      this.password = ''
    } catch {
      await login(server, username, { password })

      this.salt = ''
      this.hash = ''
      this.password = password
    }

    this.server = server
    this.username = username
    this.authenticated = true

    this.serverInfo = await fetchServerInfo(this)

    this.saveSession()
  }

  logout() {
    localStorage.clear()
    sessionStorage.clear()
  }

  isAuthenticated() {
    return this.authenticated
  }
}

async function safeJson(response: Response) {
  const text = await response.text()

  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Server returned non-JSON response: ${text.slice(0, 120)}`)
  }
}

async function login(server: string, username: string, auth: Auth) {
  const qs = toQueryString(
    pickBy(
      {
        s: auth.salt,
        t: auth.hash,
        p: auth.password,
      },
      (x) => x !== undefined
    ) as Record<string, string>
  )

  const url = `${server}/rest/ping?u=${username}&${qs}&v=1.16.1&c=Airdrome&f=json`

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(response.statusText)
  }

  const body = await safeJson(response)

  const subsonicResponse = body['subsonic-response']

  if (!subsonicResponse || subsonicResponse.status !== 'ok') {
    const message =
      subsonicResponse?.error?.message ||
      subsonicResponse?.status ||
      'Unknown error'

    throw new Error(message)
  }
}

async function fetchServerInfo(auth: AuthService): Promise<ServerInfo> {
  const url = `${auth.server}/rest/getOpenSubsonicExtensions?${auth.urlParams}&v=1.16.1&c=Airdrome&f=json`

  try {
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(response.statusText)
    }

    const body = await safeJson(response)

    const subsonicResponse = body['subsonic-response']

    if (subsonicResponse?.status === 'ok') {
      return {
        name: subsonicResponse.type,
        version: subsonicResponse.version,
        openSubsonic: true,
        extensions: (subsonicResponse.openSubsonicExtensions || []).map(
          (ext: any) => ext.name
        ),
      }
    }
  } catch {
    // ignore errors and fallback below
  }

  return {
    name: 'Subsonic',
    version: 'Unknown',
    openSubsonic: false,
    extensions: [],
  }
}

const apiSymbol = Symbol('auth')

export function useAuth(): AuthService {
  return inject(apiSymbol) as AuthService
}

export function createAuth(): AuthService & Plugin {
  const instance = new AuthService()

  return Object.assign(instance, {
    install(app: App) {
      app.provide(apiSymbol, instance)
    },
  })
}
