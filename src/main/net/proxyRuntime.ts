import { session } from 'electron'
import { Agent, ProxyAgent, setGlobalDispatcher } from 'undici'
import type { NetworkProxyConfig } from '../config/types'
import { DEFAULT_NETWORK_PROXY, normalizeNetworkProxy } from '../config/types'

let appliedKey = ''
let sessionCleared = false

function proxyKey(proxy: NetworkProxyConfig): string {
  if (!proxy.enabled) return 'direct'
  return `http://${proxy.host}:${proxy.port}`
}

/**
 * Apply in-app HTTP proxy to Node/undici fetch only (LLM, research, image APIs).
 * Renderer assets (settings SVG icons) stay direct — Chromium session proxy is
 * forced to direct so UI images are never routed through Clash/etc.
 */
export async function applyNetworkProxy(raw?: NetworkProxyConfig | null): Promise<void> {
  const proxy = normalizeNetworkProxy(raw ?? DEFAULT_NETWORK_PROXY)
  const key = proxyKey(proxy)

  // Clear any previously applied Chromium session proxy (one-time / on each apply).
  if (!sessionCleared || key !== appliedKey) {
    try {
      await session.defaultSession.setProxy({ mode: 'direct' })
      sessionCleared = true
    } catch {
      /* session may be unavailable before app ready */
    }
  }

  if (key === appliedKey) return

  if (proxy.enabled) {
    setGlobalDispatcher(new ProxyAgent(`http://${proxy.host}:${proxy.port}`))
  } else {
    setGlobalDispatcher(new Agent())
  }

  appliedKey = key
}
