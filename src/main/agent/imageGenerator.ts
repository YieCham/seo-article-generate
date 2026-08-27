import { loadConfig } from '../config/configStore'
import { normalizeImageGenConfig } from '../config/types'
import {
  readHistoryImageBuffer,
  saveImageHistoryFromBuffer,
  toDrawImgSrc
} from '../image/imageHistoryStore'

const IMAGE_FETCH_TIMEOUT_MS = 180_000

export interface GenerateImageRequest {
  prompt?: string
  size?: string
  model?: string
}

export interface EditImageRequest {
  prompt: string
  size?: string
  model?: string
  /** Prefer referencing a saved history file (avoids huge IPC) */
  fileName?: string
  /** Legacy / fallback data URL */
  imageDataUrl?: string
  imageUrl?: string
}

export interface GenerateImageResult {
  ok: boolean
  message?: string
  /** Custom protocol URL for <img src> */
  imageSrc?: string
  fileName?: string
  mimeType?: string
  prompt?: string
  size?: string
  model?: string
}

interface ImageApiResponse {
  data?: Array<{ b64_json?: string; url?: string }>
  error?: { message?: string } | string
}

function guessMimeFromB64(b64: string): string {
  if (b64.startsWith('/9j/')) return 'image/jpeg'
  if (b64.startsWith('iVBOR')) return 'image/png'
  if (b64.startsWith('UklGR')) return 'image/webp'
  if (b64.startsWith('R0lGOD')) return 'image/gif'
  return 'image/png'
}

function guessExt(mimeType: string): string {
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg'
  if (mimeType.includes('webp')) return 'webp'
  if (mimeType.includes('gif')) return 'gif'
  return 'png'
}

function toEditsUrl(generationsUrl: string): string {
  const trimmed = generationsUrl.trim()
  if (trimmed.includes('/images/generations')) {
    return trimmed.replace('/images/generations', '/images/edits')
  }
  if (/\/generations\/?$/.test(trimmed)) {
    return trimmed.replace(/\/generations\/?$/, '/edits')
  }
  return trimmed.replace(/\/?$/, '/') + 'edits'
}

function parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } | null {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl.trim())
  if (!match) return null
  try {
    return {
      mimeType: match[1] || 'image/png',
      buffer: Buffer.from(match[2], 'base64')
    }
  } catch {
    return null
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = IMAGE_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`请求超时（${Math.round(timeoutMs / 1000)} 秒），请稍后重试`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function resolveSourceImage(
  request: EditImageRequest
): Promise<{ mimeType: string; buffer: Buffer } | null> {
  if (request.fileName?.trim()) {
    const fromDisk = await readHistoryImageBuffer(request.fileName.trim())
    if (fromDisk) return fromDisk
  }

  if (request.imageDataUrl?.trim()) {
    const parsed = parseDataUrl(request.imageDataUrl)
    if (parsed) return parsed
  }

  if (request.imageUrl?.trim()) {
    try {
      const response = await fetchWithTimeout(request.imageUrl.trim(), { method: 'GET' }, 60_000)
      if (!response.ok) return null
      const arrayBuffer = await response.arrayBuffer()
      const contentType = response.headers.get('content-type') || 'image/png'
      return {
        mimeType: contentType.split(';')[0]?.trim() || 'image/png',
        buffer: Buffer.from(arrayBuffer)
      }
    } catch {
      return null
    }
  }

  return null
}

function parseImageApiPayload(
  text: string,
  responseOk: boolean,
  status: number,
  failLabel: string
):
  | { ok: true; buffer: Buffer; mimeType: string }
  | { ok: true; remoteUrl: string }
  | { ok: false; message: string } {
  let payload: ImageApiResponse = {}
  try {
    payload = JSON.parse(text) as ImageApiResponse
  } catch {
    return {
      ok: false,
      message: responseOk
        ? `${failLabel}接口返回了无法解析的内容`
        : `${failLabel}失败（HTTP ${status}）`
    }
  }

  if (!responseOk) {
    const errMsg =
      typeof payload.error === 'string'
        ? payload.error
        : payload.error?.message || text.slice(0, 200) || `HTTP ${status}`
    return { ok: false, message: `${failLabel}失败：${errMsg}` }
  }

  const item = payload.data?.[0]
  if (!item) {
    return { ok: false, message: `${failLabel}接口未返回图片数据。` }
  }

  if (item.b64_json?.trim()) {
    const b64 = item.b64_json.trim()
    const mimeType = guessMimeFromB64(b64)
    return { ok: true, buffer: Buffer.from(b64, 'base64'), mimeType }
  }

  if (item.url?.trim()) {
    return { ok: true, remoteUrl: item.url.trim() }
  }

  return { ok: false, message: `${failLabel}接口未返回 b64_json 或 url。` }
}

async function persistAndBuildResult(input: {
  prompt: string
  size: string
  model: string
  buffer: Buffer
  mimeType: string
}): Promise<GenerateImageResult> {
  const saved = await saveImageHistoryFromBuffer({
    prompt: input.prompt,
    size: input.size,
    model: input.model,
    mimeType: input.mimeType,
    buffer: input.buffer
  })

  return {
    ok: true,
    imageSrc: toDrawImgSrc(saved.fileName),
    fileName: saved.fileName,
    mimeType: saved.mimeType,
    prompt: input.prompt,
    size: input.size,
    model: input.model
  }
}

async function resolveRemoteToBuffer(
  remoteUrl: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const response = await fetchWithTimeout(remoteUrl, { method: 'GET' }, 60_000)
    if (!response.ok) return null
    const arrayBuffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || 'image/png'
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType: contentType.split(';')[0]?.trim() || 'image/png'
    }
  } catch {
    return null
  }
}

export async function generateImage(request: GenerateImageRequest = {}): Promise<GenerateImageResult> {
  const config = await loadConfig()
  const imageGen = normalizeImageGenConfig(config.imageGen)

  if (!imageGen.apiKey.trim()) {
    return { ok: false, message: '未配置绘图 API Key，请在设置 → 绘图中填写。' }
  }

  if (!imageGen.apiUrl.trim()) {
    return { ok: false, message: '未配置绘图 API 地址。' }
  }

  const prompt = (request.prompt ?? imageGen.defaultPrompt).trim()
  if (!prompt) {
    return { ok: false, message: '请输入绘图提示词（prompt）。' }
  }

  const size = (request.size ?? imageGen.size).trim() || '1024x1024'
  const model = (request.model ?? imageGen.model).trim() || 'gpt-image-2'

  try {
    const response = await fetchWithTimeout(imageGen.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${imageGen.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        prompt,
        size,
        response_format: 'b64_json'
      })
    })

    const text = await response.text()
    const parsed = parseImageApiPayload(text, response.ok, response.status, '绘图')
    if (!parsed.ok) return parsed

    if ('remoteUrl' in parsed) {
      const downloaded = await resolveRemoteToBuffer(parsed.remoteUrl)
      if (!downloaded) {
        return { ok: false, message: '绘图接口返回了 URL，但下载图片失败。' }
      }
      return persistAndBuildResult({
        prompt,
        size,
        model,
        buffer: downloaded.buffer,
        mimeType: downloaded.mimeType
      })
    }

    return persistAndBuildResult({
      prompt,
      size,
      model,
      buffer: parsed.buffer,
      mimeType: parsed.mimeType
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '绘图请求失败'
    return { ok: false, message }
  }
}

/**
 * Image-to-image edit via OpenAI-compatible /v1/images/edits (multipart).
 */
export async function editImage(request: EditImageRequest): Promise<GenerateImageResult> {
  const config = await loadConfig()
  const imageGen = normalizeImageGenConfig(config.imageGen)

  if (!imageGen.apiKey.trim()) {
    return { ok: false, message: '未配置绘图 API Key，请在设置 → 绘图中填写。' }
  }

  if (!imageGen.apiUrl.trim()) {
    return { ok: false, message: '未配置绘图 API 地址。' }
  }

  const prompt = request.prompt.trim()
  if (!prompt) {
    return { ok: false, message: '请输入编辑提示词。' }
  }

  const source = await resolveSourceImage(request)
  if (!source) {
    return { ok: false, message: '缺少可编辑的预览图数据。' }
  }

  const size = (request.size ?? imageGen.size).trim() || '1024x1024'
  const model = (request.model ?? imageGen.model).trim() || 'gpt-image-2'
  const editsUrl = toEditsUrl(imageGen.apiUrl)

  try {
    const form = new FormData()
    form.append('model', model)
    form.append('prompt', prompt)
    form.append('size', size)
    form.append('response_format', 'b64_json')
    form.append(
      'image',
      new Blob([new Uint8Array(source.buffer)], { type: source.mimeType }),
      `source.${guessExt(source.mimeType)}`
    )

    const response = await fetchWithTimeout(editsUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${imageGen.apiKey}`
      },
      body: form
    })

    const text = await response.text()
    const parsed = parseImageApiPayload(text, response.ok, response.status, '编辑')
    if (!parsed.ok) return parsed

    if ('remoteUrl' in parsed) {
      const downloaded = await resolveRemoteToBuffer(parsed.remoteUrl)
      if (!downloaded) {
        return { ok: false, message: '编辑接口返回了 URL，但下载图片失败。' }
      }
      return persistAndBuildResult({
        prompt,
        size,
        model,
        buffer: downloaded.buffer,
        mimeType: downloaded.mimeType
      })
    }

    return persistAndBuildResult({
      prompt,
      size,
      model,
      buffer: parsed.buffer,
      mimeType: parsed.mimeType
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '编辑请求失败'
    return { ok: false, message }
  }
}
