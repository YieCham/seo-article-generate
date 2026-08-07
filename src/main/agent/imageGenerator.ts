import { loadConfig } from '../config/configStore'
import { normalizeImageGenConfig } from '../config/types'

export interface GenerateImageRequest {
  prompt?: string
  size?: string
  model?: string
}

export interface EditImageRequest {
  prompt: string
  size?: string
  model?: string
  /** Current preview as data URL (preferred) */
  imageDataUrl?: string
  /** Fallback remote URL */
  imageUrl?: string
}

export interface GenerateImageResult {
  ok: boolean
  message?: string
  /** Prefer data URL for renderer <img src> */
  imageDataUrl?: string
  /** Remote URL when API returns url instead of b64 */
  imageUrl?: string
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

async function resolveSourceImage(
  imageDataUrl?: string,
  imageUrl?: string
): Promise<{ mimeType: string; buffer: Buffer } | null> {
  if (imageDataUrl?.trim()) {
    const parsed = parseDataUrl(imageDataUrl)
    if (parsed) return parsed
  }

  if (imageUrl?.trim()) {
    try {
      const response = await fetch(imageUrl.trim())
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
  | { ok: true; imageDataUrl?: string; imageUrl?: string }
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
    const mime = guessMimeFromB64(b64)
    return { ok: true, imageDataUrl: `data:${mime};base64,${b64}` }
  }

  if (item.url?.trim()) {
    return { ok: true, imageUrl: item.url.trim() }
  }

  return { ok: false, message: `${failLabel}接口未返回 b64_json 或 url。` }
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
    const response = await fetch(imageGen.apiUrl, {
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

    return {
      ok: true,
      imageDataUrl: parsed.imageDataUrl,
      imageUrl: parsed.imageUrl,
      prompt,
      size,
      model
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '绘图请求失败'
    return { ok: false, message }
  }
}

/**
 * Image-to-image edit via OpenAI-compatible /v1/images/edits (multipart).
 * Size / model / prompt / response_format follow the generations API params.
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

  const source = await resolveSourceImage(request.imageDataUrl, request.imageUrl)
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

    const response = await fetch(editsUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${imageGen.apiKey}`
      },
      body: form
    })

    const text = await response.text()
    const parsed = parseImageApiPayload(text, response.ok, response.status, '编辑')
    if (!parsed.ok) return parsed

    return {
      ok: true,
      imageDataUrl: parsed.imageDataUrl,
      imageUrl: parsed.imageUrl,
      prompt,
      size,
      model
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '编辑请求失败'
    return { ok: false, message }
  }
}
