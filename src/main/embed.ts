import { config as loadEnv } from 'dotenv'
import { app, type BrowserWindow } from 'electron'
import { existsSync } from 'fs'
import { loadConfig } from './config/configStore'
import { registerArticleIpc } from './ipc/article'
import { registerChatIpc } from './ipc/chat'
import { registerConfigIpc } from './ipc/config'
import { registerImageIpc } from './ipc/image'
import { registerIllustrationIpc } from './ipc/illustration'
import { registerKnowledgeIpc } from './ipc/knowledge'
import { registerWordPressIpc } from './ipc/wordpress'
import { attachExternalLinkHandlers, registerWindowIpc } from './ipc/window'
import {
  registerDrawImgProtocol,
  registerDrawImgSchemePrivileged
} from './image/imageHistoryStore'
import { registerIllustrationProtocol } from './illustration/illustrationStore'
import { resolveArticleEnvPath } from './paths'
import { setHostWindow } from './window/trayManager'

export { attachExternalLinkHandlers }

export interface BootstrapArticleAgentOptions {
  /** When true, host owns the window chrome / tray; do not create a second tray. */
  embedded?: boolean
  hostWindow?: BrowserWindow
}

let bootstrapped = false
let privilegedRegistered = false

export function registerPrivilegedSchemes(): void {
  if (privilegedRegistered) return
  // Workbench registers drawimg/illustration before ready; avoid double-register.
  if (process.env.ARTICLE_HOST_SCHEMES === '1') {
    privilegedRegistered = true
    return
  }
  // Electron only allows this before ready. Hosts that load us late must register schemes themselves.
  if (app.isReady()) {
    console.warn(
      '[ai-article-agent] skip registerPrivilegedSchemes: app already ready (host should register drawimg/illustration schemes earlier)'
    )
    privilegedRegistered = true
    return
  }
  privilegedRegistered = true
  registerDrawImgSchemePrivileged()
}

/** Load .env from the article-agent project root (safe to call more than once). */
export function loadArticleEnv(): void {
  const envPath = resolveArticleEnvPath(__dirname)
  if (existsSync(envPath)) {
    loadEnv({ path: envPath })
  }
}

/**
 * Register IPC, custom protocols, and load config.
 * Does not create a BrowserWindow or tray — caller owns the window lifecycle.
 * Safe to call once per process.
 */
export async function bootstrapArticleAgent(
  options: BootstrapArticleAgentOptions = {}
): Promise<void> {
  if (bootstrapped) {
    if (options.hostWindow) setHostWindow(options.hostWindow)
    return
  }
  bootstrapped = true

  loadArticleEnv()
  registerPrivilegedSchemes()

  await loadConfig()
  registerDrawImgProtocol()
  registerIllustrationProtocol()
  registerWindowIpc()
  registerArticleIpc()
  registerChatIpc()
  registerConfigIpc()
  registerImageIpc()
  registerKnowledgeIpc()
  registerIllustrationIpc()
  registerWordPressIpc()

  if (options.hostWindow) {
    setHostWindow(options.hostWindow)
  }
}

// Side effects for both standalone entry and workbench `require(out/main/embed.js)` before app.ready.
loadArticleEnv()
registerPrivilegedSchemes()
