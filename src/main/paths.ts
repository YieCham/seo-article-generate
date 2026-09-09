import { app } from 'electron'
import { join } from 'path'

/**
 * Data directory for ai-article-agent stores.
 * Standalone: Electron default userData (`%APPDATA%/ai-article-agent`).
 * Embedded in workbench: set ARTICLE_AGENT_USER_DATA to that same path so configs/sessions are shared.
 */
export function getArticleUserDataDir(): string {
  const override = process.env.ARTICLE_AGENT_USER_DATA?.trim()
  if (override) return override
  return app.getPath('userData')
}

export function getArticleAgentRoot(): string | null {
  const override = process.env.ARTICLE_AGENT_ROOT?.trim()
  if (override) return override
  return null
}

export function resolveArticleEnvPath(fromDirname: string): string {
  const root = getArticleAgentRoot()
  if (root) return join(root, '.env')
  return join(fromDirname, '../../.env')
}
