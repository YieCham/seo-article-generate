import type { ReactNode } from 'react'
import { resolveLlmModelIcon, resolveLlmVendorIcon } from '../utils/llmIcons'

type IconBaseProps = {
  size?: number
  className?: string
}

const BRAND_COLORS: Record<string, string> = {
  OpenAI: '#10a37f',
  Anthropic: '#d4a27f',
  Google: '#4285f4',
  DeepSeek: '#4d6bfe',
  Qwen: '#615ced',
  Meta: '#0866ff',
  Mistral: '#f54d23',
  Moonshot: '#111827',
  Zhipu: '#336ef6',
  Baichuan: '#ff6a00',
  Yi: '#000000',
  ByteDance: '#fe2c55',
  Tencent: '#12b7f5',
  MiniMax: '#7c3aed',
  StepFun: '#0ea5e9',
  xAI: '#111827',
  Cohere: '#ff7759',
  Amazon: '#ff9900',
  Microsoft: '#0078d4'
}

function DefaultBrandIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" fill="#eef0f5" />
      <path
        d="M8 9.5h8M8 12h6M8 14.5h4"
        stroke="#5b6275"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function LetterBadge({ brand, size }: { brand: string; size: number }) {
  const color = BRAND_COLORS[brand] ?? '#5b6275'
  const label = brand.slice(0, 1).toUpperCase()

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" fill={color} />
      <text
        x="12"
        y="16"
        textAnchor="middle"
        fill="#fff"
        fontSize="11"
        fontWeight="700"
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
      >
        {label}
      </text>
    </svg>
  )
}

function IconImage({ src, size }: { src: string; size: number }) {
  return <img src={src} alt="" width={size} height={size} draggable={false} />
}

function IconShell({
  size = 18,
  className,
  children
}: IconBaseProps & { children: ReactNode }) {
  return (
    <span
      className={['llm-brand-icon', className].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {children}
    </span>
  )
}

/** 厂商图标：用于分组标题 */
export function LlmVendorIcon({
  brand,
  size = 18,
  className
}: IconBaseProps & { brand: string }) {
  const iconUrl = resolveLlmVendorIcon(brand)
  return (
    <IconShell size={size} className={className}>
      {iconUrl ? (
        <IconImage src={iconUrl} size={size} />
      ) : brand === '其他' ? (
        <DefaultBrandIcon size={size} />
      ) : (
        <LetterBadge brand={brand} size={size} />
      )}
    </IconShell>
  )
}

/** 大模型图标：用于具体模型行 */
export function LlmModelIcon({
  model,
  brand,
  size = 16,
  className
}: IconBaseProps & { model: string; brand: string }) {
  const iconUrl = resolveLlmModelIcon(model)
  if (!iconUrl) {
    return (
      <IconShell size={size} className={className}>
        {brand === '其他' ? <DefaultBrandIcon size={size} /> : <LetterBadge brand={brand} size={size} />}
      </IconShell>
    )
  }

  return (
    <IconShell size={size} className={className}>
      <IconImage src={iconUrl} size={size} />
    </IconShell>
  )
}

/** @deprecated use LlmVendorIcon or LlmModelIcon */
export default function LlmBrandIcon({
  brand,
  size = 18,
  className
}: IconBaseProps & { brand: string }) {
  return <LlmVendorIcon brand={brand} size={size} className={className} />
}
