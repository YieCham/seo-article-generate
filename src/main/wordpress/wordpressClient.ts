import { readHistoryImageBuffer } from '../image/imageHistoryStore'
import {
  normalizeSiteUrl,
  parseArticleForWordPress,
  slugifyTitle,
  wordpressEditLink,
  type WordPressConfig,
  type WordPressDraftBinding,
  type WordPressPreset,
  type WordPressPublishRequest,
  type WordPressPublishResult,
  type WordPressSeoPlugin,
  type WordPressTerm,
  type WordPressTestResult
} from '../../shared/wordpress'

const REQUEST_TIMEOUT_MS = 45_000
const MEDIA_TIMEOUT_MS = 120_000
const USER_AGENT = 'AIWritingAssistant/0.1 (WordPress REST)'

interface WpErrorShape {
  code?: string
  message?: string
  data?: {
    status?: number
    term_id?: number
    resource_id?: number
  }
}

interface WpPostShape {
  id?: number
  slug?: string
  link?: string
  featured_media?: number
}

interface WpUserShape {
  name?: string
  slug?: string
  roles?: string[]
  capabilities?: Record<string, boolean>
}

interface WpIndexShape {
  name?: string
}

function applicationPassword(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, '')
}

function authHeader(config: WordPressConfig): string {
  const token = Buffer.from(
    `${config.username.trim()}:${applicationPassword(config.applicationPassword)}`,
    'utf8'
  ).toString('base64')
  return `Basic ${token}`
}

function splitPathAndQuery(path: string): { pathname: string; search: string } {
  const trimmed = path.trim() || '/'
  const q = trimmed.indexOf('?')
  const rawPath = q >= 0 ? trimmed.slice(0, q) : trimmed
  const search = q >= 0 ? trimmed.slice(q + 1) : ''
  const pathname = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
  return { pathname: pathname || '/', search }
}

function wpV2Route(path: string): string {
  const { pathname } = splitPathAndQuery(path)
  if (!pathname || pathname === '/') return '/'
  if (pathname.startsWith('/wp/') || pathname.startsWith('/yoast/')) return pathname
  return `/wp/v2${pathname}`
}

function prettyRestUrl(restRoot: string, path: string): string {
  const root = restRoot.replace(/\/+$/, '')
  const { pathname, search } = splitPathAndQuery(path)
  if (!pathname || pathname === '/') {
    return search ? `${root}/?${search}` : `${root}/`
  }
  const route =
    pathname.startsWith('/wp/') || pathname.startsWith('/yoast/') ? pathname : `/wp/v2${pathname}`
  const url = `${root}${route}`
  return search ? `${url}?${search}` : url
}

function queryRestUrl(siteUrl: string, path: string, viaIndexPhp = false): string {
  const base = normalizeSiteUrl(siteUrl)
  const { search } = splitPathAndQuery(path)
  const route = wpV2Route(path)
  const prefix = viaIndexPhp ? `${base}/index.php` : `${base}/`
  return search ? `${prefix}?rest_route=${route}&${search}` : `${prefix}?rest_route=${route}`
}

function restUrl(siteUrl: string, path: string): string {
  return prettyRestUrl(`${normalizeSiteUrl(siteUrl)}/wp-json`, path)
}

function isRestLikeUrl(url: string): boolean {
  return /\/wp-json(\/|$|\?)/i.test(url) || /[?&]rest_route=/i.test(url)
}

function normalizeRestRoot(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    parsed.search = ''
    let pathname = parsed.pathname.replace(/\/+$/, '')
    pathname = pathname.replace(/\/wp\/v2$/i, '')
    parsed.pathname = pathname || '/'
    return parsed.toString().replace(/\/+$/, '')
  } catch {
    return url.replace(/\/+$/, '')
  }
}

function errorMessageFromUnknown(error: unknown, fallback: string): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return '连接 WordPress 超时，请检查站点地址与网络。'
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function hostKey(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return url
  }
}

async function fetchFollowingRedirects(
  url: string,
  init: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<{ response: Response; finalUrl: string }> {
  let current = url
  const headers = new Headers(init.headers)
  if (!headers.has('User-Agent')) headers.set('User-Agent', USER_AGENT)
  const method = (init.method || 'GET').toUpperCase()

  for (let hop = 0; hop < 8; hop += 1) {
    const response = await fetchWithTimeout(
      current,
      { ...init, headers, redirect: 'manual' },
      timeoutMs
    )
    if (response.status < 300 || response.status >= 400) {
      return { response, finalUrl: current }
    }

    const location = response.headers.get('location')
    if (!location) return { response, finalUrl: current }

    const next = new URL(location, current).toString()
    if (hostKey(next) !== hostKey(current)) {
      throw new Error(
        `站点跳转到了其他域名（${new URL(next).host}）。请把站点地址改成浏览器地址栏中的最终网址后再试。`
      )
    }
    if (method !== 'GET' && method !== 'HEAD' && !isRestLikeUrl(next)) {
      return { response, finalUrl: current }
    }
    current = next
  }

  throw new Error('WordPress 站点重定向次数过多。请直接填写最终地址（含 https，以及是否带 www）。')
}

let restRootCache: { key: string; root: string } | null = null

async function resolveRestRoot(config: WordPressConfig): Promise<string> {
  const key = `${normalizeSiteUrl(config.siteUrl)}|${config.username.trim()}`
  if (restRootCache?.key === key) return restRootCache.root

  const fallback = `${normalizeSiteUrl(config.siteUrl)}/wp-json`
  const headers = {
    Authorization: authHeader(config),
    Accept: 'application/json',
    'User-Agent': USER_AGENT
  }

  try {
    const { response, finalUrl } = await fetchFollowingRedirects(
      `${fallback}/`,
      { method: 'GET', headers },
      REQUEST_TIMEOUT_MS
    )
    if (response.ok || response.status === 401 || response.status === 403) {
      const root = normalizeRestRoot(finalUrl)
      restRootCache = { key, root: root || fallback }
      return restRootCache.root
    }
  } catch {
    /* use pretty fallback */
  }

  restRootCache = { key, root: fallback }
  return fallback
}

function isNoRouteError(status: number, data: WpErrorShape | null): boolean {
  if (data?.code === 'rest_no_route') return true
  if (status !== 404) return false
  const message = data?.message?.toLowerCase() ?? ''
  return message.includes('no route was found')
}

function explainAuthFailure(status: number, body: WpErrorShape | null, requestUrl: string): string {
  const code = body?.code ?? ''
  const wpMessage = body?.message?.replace(/<[^>]+>/g, '').trim()

  if (code === 'application_passwords_disabled') {
    return '该站点已禁用应用程序密码。请在 WordPress 中开启，或确认站点使用 HTTPS。'
  }
  if (code === 'incorrect_password') {
    return '应用程序密码不正确。请重新生成一枚，整段复制（含空格也可以），并确认对应用户名是登录名而不是显示名称。'
  }
  if (code === 'rest_cannot_access') {
    return 'REST API 被安全插件或站点设置拦截。请允许本机访问 /wp-json/，或把本软件 IP 加入白名单。'
  }
  if (status === 401 && (code === 'rest_not_logged_in' || !code)) {
    return [
      '站点没有接受这次登录（HTTP 401）。密码本身不一定填错，更常见原因：',
      '1. 用户名填的是昵称/显示名称，应填登录用户名（个人资料里的 Username，或登录邮箱）；',
      '2. 站点地址不是最终网址（缺 https、www 与非 www 不一致），跳转时认证头会被丢掉；',
      '3. 主机或安全插件剥离了 Authorization 头（Nginx/Apache/Cloudflare/Wordfence 常见）。',
      wpMessage ? `站点返回：${wpMessage}` : `请求：${requestUrl}`
    ].join('')
  }
  if (status === 403) {
    return `当前账号没有创建或编辑文章的权限。${wpMessage || ''}`.trim()
  }
  if (status === 404) {
    return `找不到 WordPress REST 接口。请确认站点地址，以及安全插件没有关闭 /wp-json/。`
  }
  if (wpMessage) return `${wpMessage}（HTTP ${status}${code ? `，${code}` : ''}）`
  return `WordPress 请求失败（HTTP ${status}${code ? `，${code}` : ''}）。`
}

function explainHttpError(
  status: number,
  body: WpErrorShape | null,
  fallback: string,
  requestUrl?: string
): string {
  if (status === 401 || status === 403) {
    return explainAuthFailure(status, body, requestUrl || '')
  }
  if (body?.code === 'rest_no_route' || body?.message?.includes('No route was found')) {
    return [
      'WordPress 没有匹配到该接口（rest_no_route）。常见原因是站点伪静态只处理 GET、不处理 POST，或固定链接为「朴素」。',
      requestUrl ? `请求：${requestUrl}` : ''
    ]
      .filter(Boolean)
      .join(' ')
  }
  if (body?.message) {
    const text = body.message.replace(/<[^>]+>/g, '').trim()
    if (text) return text
  }
  if (status === 404) {
    return '找不到 WordPress REST 接口或目标文章。请确认站点地址与 REST API 未被安全插件关闭。'
  }
  return `${fallback}（HTTP ${status}）`
}

async function readJson<T>(response: Response): Promise<T | null> {
  const text = await response.text()
  if (!text.trim()) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

async function wpFetch<T>(
  config: WordPressConfig,
  path: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<{ ok: boolean; status: number; data: T | null; raw: Response }> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', authHeader(config))
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')
  if (init.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const restRoot = await resolveRestRoot(config)
  const candidates = [
    prettyRestUrl(restRoot, path),
    queryRestUrl(config.siteUrl, path, false),
    queryRestUrl(config.siteUrl, path, true)
  ].filter((url, index, list) => list.indexOf(url) === index)

  let last: { ok: boolean; status: number; data: T | null; raw: Response } | null = null

  for (const url of candidates) {
    const { response } = await fetchFollowingRedirects(url, { ...init, headers }, timeoutMs)
    const data = await readJson<T>(response)
    last = { ok: response.ok, status: response.status, data, raw: response }
    if (response.ok) return last
    const redirectedOffRest = response.status >= 300 && response.status < 400
    if (!redirectedOffRest && !isNoRouteError(response.status, data as WpErrorShape | null)) {
      return last
    }
  }

  if (last && isNoRouteError(last.status, last.data as WpErrorShape | null)) {
    const detail = `Tried: ${candidates.join(' | ')}`
    const previous =
      last.data && typeof last.data === 'object'
        ? (last.data as WpErrorShape)
        : { code: 'rest_no_route', message: 'No route was found matching the URL and request method.' }
    last = {
      ...last,
      data: { ...previous, message: `${previous.message || 'No route was found matching the URL and request method.'} ${detail}` } as T
    }
  }

  return (
    last ?? {
      ok: false,
      status: 404,
      data: {
        code: 'rest_no_route',
        message: 'No route was found matching the URL and request method.'
      } as T,
      raw: new Response(null, { status: 404 })
    }
  )
}

function uniquePositiveIds(ids: number[]): number[] {
  return [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))]
}

async function fetchAllTerms(
  config: WordPressConfig,
  kind: 'categories' | 'tags'
): Promise<WordPressTerm[]> {
  const items: WordPressTerm[] = []
  let page = 1
  while (page <= 20) {
    const result = await wpFetch<Array<{ id?: number; name?: string; slug?: string; count?: number }>>(
      config,
      `/${kind}?per_page=100&page=${page}&hide_empty=false&_fields=id,name,slug,count`
    )
    if (!result.ok) {
      throw new Error(
        explainHttpError(
          result.status,
          result.data as WpErrorShape | null,
          `读取${kind === 'categories' ? '分类' : '标签'}失败`,
          restUrl(config.siteUrl, `/${kind}`)
        )
      )
    }
    const batch = (result.data ?? [])
      .filter((item) => typeof item.id === 'number' && typeof item.name === 'string')
      .map((item) => ({
        id: item.id as number,
        name: item.name as string,
        slug: item.slug ?? '',
        count: item.count
      }))
    items.push(...batch)
    const totalPages = Number(result.raw.headers.get('X-WP-TotalPages') || '1')
    if (page >= totalPages || batch.length === 0) break
    page += 1
  }
  return items
}

async function ensureTags(config: WordPressConfig, names: string[], existingIds: number[]): Promise<number[]> {
  const ids = uniquePositiveIds(existingIds)
  for (const rawName of names) {
    const name = rawName.trim()
    if (!name) continue
    const created = await wpFetch<{ id?: number } & WpErrorShape>(config, '/tags', {
      method: 'POST',
      body: JSON.stringify({ name })
    })
    if (created.ok && typeof created.data?.id === 'number') {
      ids.push(created.data.id)
      continue
    }
    const existingId = created.data?.data?.term_id ?? created.data?.data?.resource_id
    if (typeof existingId === 'number' && existingId > 0) {
      ids.push(existingId)
      continue
    }
    const search = await wpFetch<Array<{ id?: number; name?: string }>>(
      config,
      `/tags?search=${encodeURIComponent(name)}&per_page=20&_fields=id,name`
    )
    const match = (search.data ?? []).find(
      (item) => item.name?.trim().toLowerCase() === name.toLowerCase() && typeof item.id === 'number'
    )
    if (match?.id) ids.push(match.id)
  }
  return uniquePositiveIds(ids)
}

function seoMetaPayload(
  plugin: WordPressSeoPlugin,
  metaTitle: string,
  metaDescription: string
): Record<string, string> | undefined {
  const title = metaTitle.trim()
  const description = metaDescription.trim()
  if (!title && !description) return undefined
  if (plugin === 'yoast') {
    return {
      _yoast_wpseo_title: title,
      _yoast_wpseo_metadesc: description
    }
  }
  if (plugin === 'rankmath') {
    return {
      rank_math_title: title,
      rank_math_description: description
    }
  }
  return undefined
}

function guessMediaFileName(fileName: string, mimeType: string): string {
  const extFromName = fileName.match(/\.([a-z0-9]+)$/i)?.[1]
  if (extFromName) return `featured.${extFromName.toLowerCase()}`
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'featured.jpg'
  if (mimeType.includes('webp')) return 'featured.webp'
  if (mimeType.includes('gif')) return 'featured.gif'
  return 'featured.png'
}

async function uploadFeaturedImage(
  config: WordPressConfig,
  fileName: string,
  title: string
): Promise<number> {
  const file = await readHistoryImageBuffer(fileName)
  if (!file) {
    throw new Error('找不到所选特色图，请重新从绘图历史中选择。')
  }

  const uploadName = guessMediaFileName(fileName, file.mimeType)
  const result = await wpFetch<{ id?: number } & WpErrorShape>(
    config,
    '/media',
    {
      method: 'POST',
      headers: {
        'Content-Type': file.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${uploadName}"`
      },
      body: file.buffer
    },
    MEDIA_TIMEOUT_MS
  )
  if (!result.ok || typeof result.data?.id !== 'number') {
    throw new Error(
      explainHttpError(result.status, result.data, '上传特色图失败', restUrl(config.siteUrl, '/media'))
    )
  }
  const mediaId = result.data.id

  const alt = title.trim()
  if (alt) {
    await wpFetch(config, `/media/${mediaId}`, {
      method: 'POST',
      body: JSON.stringify({ alt_text: alt, title: alt })
    })
  }

  return mediaId
}

function buildPostBody(options: {
  title: string
  slug: string
  html: string
  excerpt: string
  categoryIds: number[]
  tagIds: number[]
  featuredMediaId?: number
  meta?: Record<string, string>
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title: options.title,
    slug: options.slug || slugifyTitle(options.title),
    content: options.html,
    excerpt: options.excerpt,
    status: 'draft'
  }
  if (options.categoryIds.length > 0) body.categories = options.categoryIds
  if (options.tagIds.length > 0) body.tags = options.tagIds
  if (options.featuredMediaId && options.featuredMediaId > 0) {
    body.featured_media = options.featuredMediaId
  }
  if (options.meta && Object.keys(options.meta).length > 0) {
    body.meta = options.meta
  }
  return body
}

function bindingFromPost(
  config: WordPressPreset,
  post: WpPostShape,
  title: string
): WordPressDraftBinding {
  const postId = post.id as number
  return {
    postId,
    siteUrl: normalizeSiteUrl(config.siteUrl),
    editLink: wordpressEditLink(config.siteUrl, postId),
    link: post.link,
    slug: post.slug,
    title,
    featuredMediaId: post.featured_media,
    presetId: config.id,
    updatedAt: Date.now()
  }
}

export async function testWordPressConnection(config: WordPressConfig): Promise<WordPressTestResult> {
  restRootCache = null
  if (!config.siteUrl.trim() || !config.username.trim() || !config.applicationPassword.trim()) {
    return { ok: false, message: '请填写站点地址、用户名和应用程序密码。' }
  }

  try {
    const indexUrl = restUrl(config.siteUrl, '/')
    const index = await wpFetch<WpIndexShape>(config, '/')
    if (!index.ok && index.status !== 401 && index.status !== 403) {
      return {
        ok: false,
        message: explainHttpError(
          index.status,
          index.data as WpErrorShape | null,
          '无法访问 WordPress REST API',
          indexUrl
        )
      }
    }

    const me = await wpFetch<WpUserShape>(config, '/users/me?context=edit')
    if (me.ok) {
      const caps = me.data?.capabilities ?? {}
      const canEdit = Boolean(caps.edit_posts || caps.publish_posts || caps.edit_pages)
      if (Object.keys(caps).length > 0 && !canEdit) {
        return {
          ok: false,
          message: '当前账号无法创建文章。请改用作者及以上角色，并确认应用程序密码属于该用户。',
          siteName: index.data?.name,
          userName: me.data?.name,
          roles: me.data?.roles
        }
      }

      return {
        ok: true,
        message: `已连接「${index.data?.name || normalizeSiteUrl(config.siteUrl)}」，账号 ${me.data?.name || config.username}。草稿将写入该站点，不会自动发布。`,
        siteName: index.data?.name,
        userName: me.data?.name,
        roles: me.data?.roles
      }
    }

    const drafts = await wpFetch<unknown>(config, '/posts?per_page=1&status=draft&context=edit')
    if (drafts.ok) {
      return {
        ok: true,
        message: `已连接「${index.data?.name || normalizeSiteUrl(config.siteUrl)}」。站点拦截了用户信息接口，但应用程序密码可用，可以推送草稿。`,
        siteName: index.data?.name,
        userName: config.username
      }
    }

    return {
      ok: false,
      message: explainAuthFailure(
        me.status,
        me.data as WpErrorShape | null,
        restUrl(config.siteUrl, '/users/me')
      )
    }
  } catch (error) {
    return { ok: false, message: errorMessageFromUnknown(error, '无法连接 WordPress。') }
  }
}

export async function listWordPressTerms(
  config: WordPressConfig
): Promise<{ categories: WordPressTerm[]; tags: WordPressTerm[] }> {
  const [categories, tags] = await Promise.all([
    fetchAllTerms(config, 'categories'),
    fetchAllTerms(config, 'tags')
  ])
  return { categories, tags }
}

export async function publishWordPressDraft(
  config: WordPressConfig,
  request: WordPressPublishRequest
): Promise<WordPressPublishResult> {
  const title = request.title.trim()
  if (!title) {
    return { ok: false, created: false, message: '文章标题不能为空。' }
  }

  const parsed = parseArticleForWordPress(request.markdown)
  const contentHtml = parsed.contentHtml
  if (!contentHtml.trim()) {
    return { ok: false, created: false, message: '文章正文为空，无法创建草稿。' }
  }

  const slug = slugifyTitle(request.slug || parsed.slug || title)
  const excerpt = request.metaDescription.trim() || parsed.metaDescription
  const metaTitle = request.metaTitle.trim() || parsed.metaTitle || title
  const meta = seoMetaPayload(config.seoPlugin, metaTitle, excerpt)

  try {
    const tagIds = await ensureTags(config, request.tagNamesToCreate ?? [], request.tagIds)
    let featuredMediaId: number | undefined
    if (request.featuredImageFileName) {
      featuredMediaId = await uploadFeaturedImage(config, request.featuredImageFileName, title)
    }

    const body = buildPostBody({
      title,
      slug,
      html: contentHtml,
      excerpt,
      categoryIds: uniquePositiveIds(request.categoryIds),
      tagIds,
      featuredMediaId,
      meta
    })

    const existingPostId =
      !request.forceNew && request.existingPostId && request.existingPostId > 0
        ? request.existingPostId
        : null

    let created = !existingPostId
    let result = existingPostId
      ? await wpFetch<WpPostShape & WpErrorShape>(config, `/posts/${existingPostId}`, {
          method: 'POST',
          body: JSON.stringify(body)
        })
      : await wpFetch<WpPostShape & WpErrorShape>(config, '/posts', {
          method: 'POST',
          body: JSON.stringify(body)
        })

    if (
      existingPostId &&
      !result.ok &&
      (result.status === 404 || result.data?.code === 'rest_post_invalid_id')
    ) {
      created = true
      result = await wpFetch<WpPostShape & WpErrorShape>(config, '/posts', {
        method: 'POST',
        body: JSON.stringify(body)
      })
    }

    if (!result.ok && meta && result.data?.code === 'rest_cannot_update') {
      const { meta: _ignored, ...withoutMeta } = body
      result = await wpFetch<WpPostShape & WpErrorShape>(
        config,
        existingPostId && !created ? `/posts/${existingPostId}` : '/posts',
        { method: 'POST', body: JSON.stringify(withoutMeta) }
      )
      if (result.ok) {
        const binding = bindingFromPost(config, result.data ?? {}, title)
        return {
          ok: true,
          created,
          message: created ? '已创建 WordPress 草稿（SEO 插件字段未写入）。' : '已更新 WordPress 草稿（SEO 插件字段未写入）。',
          warning:
            '站点未开放该 SEO 插件的 REST 字段。草稿已保存，标题与摘要仍可用；请在 WordPress 后台补填 SEO 标题。',
          postId: binding.postId,
          editLink: binding.editLink,
          link: binding.link,
          slug: binding.slug,
          featuredMediaId: binding.featuredMediaId ?? featuredMediaId,
          binding
        }
      }
    }

    if (!result.ok || typeof result.data?.id !== 'number') {
      return {
        ok: false,
        created: false,
        message: explainHttpError(
          result.status,
          result.data,
          '写入 WordPress 草稿失败',
          restUrl(config.siteUrl, '/posts')
        )
      }
    }

    const binding = bindingFromPost(config, result.data, title)
    return {
      ok: true,
      created,
      message: created ? '已创建 WordPress 草稿。' : '已更新 WordPress 草稿。',
      postId: binding.postId,
      editLink: binding.editLink,
      link: binding.link,
      slug: binding.slug,
      featuredMediaId: binding.featuredMediaId ?? featuredMediaId,
      binding
    }
  } catch (error) {
    return {
      ok: false,
      created: false,
      message: errorMessageFromUnknown(error, '写入 WordPress 草稿失败。')
    }
  }
}
