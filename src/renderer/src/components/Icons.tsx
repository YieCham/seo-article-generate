type IconProps = { size?: number; className?: string }

export function IconSparkles({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3L13.8 8.2L19 10L13.8 11.8L12 17L10.2 11.8L5 10L10.2 8.2L12 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M18 4L18.8 6.4L21.2 7.2L18.8 8L18 10.4L17.2 8L14.8 7.2L17.2 6.4L18 4Z" fill="currentColor" opacity="0.55" />
    </svg>
  )
}

export function IconPlus({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function IconSettings({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" fill="currentColor" className={className} aria-hidden="true">
      <path d="M512 315.9c-108.3 0-196.1 87.8-196.1 196.1S403.7 708.1 512 708.1 708.1 620.3 708.1 512 620.3 315.9 512 315.9z m93.41 289.51A132.11 132.11 0 1 1 644.1 512a131.25 131.25 0 0 1-38.69 93.41z" />
      <path d="M851.37 512c0-7.13-0.23-14.33-0.69-21.54l68.83-62.15-4.73-18.69a413.07 413.07 0 0 0-45.62-110L859.29 283l-92.59 4.73a340.49 340.49 0 0 0-30.45-30.45l4.75-92.57-16.56-9.87a413.07 413.07 0 0 0-110-45.62l-18.69-4.74-62.15 68.84a336.56 336.56 0 0 0-43.08 0l-62.15-68.84-18.69 4.74a413.07 413.07 0 0 0-110 45.62L283 164.71l4.73 92.59a341.81 341.81 0 0 0-30.45 30.45L164.71 283l-9.87 16.56a413.07 413.07 0 0 0-45.62 110l-4.74 18.69 68.84 62.15c-0.46 7.21-0.69 14.41-0.69 21.54s0.23 14.33 0.69 21.54l-68.84 62.15 4.74 18.69a413.07 413.07 0 0 0 45.62 110l9.87 16.68 92.59-4.73a340.49 340.49 0 0 0 30.45 30.45L283 859.29l16.56 9.87a413.07 413.07 0 0 0 110 45.62l18.69 4.73 62.15-68.83a336.56 336.56 0 0 0 43.08 0l62.15 68.83 18.69-4.73a413.07 413.07 0 0 0 110-45.62l16.68-9.87-4.73-92.59a341.81 341.81 0 0 0 30.45-30.45l92.57 4.75 9.87-16.56a413.07 413.07 0 0 0 45.62-110l4.73-18.69-68.83-62.15c0.46-7.27 0.69-14.47 0.69-21.6z m-65.75-31.06a276.51 276.51 0 0 1 0 62.12l-1.83 16.32L847.57 617a349.88 349.88 0 0 1-24.1 58.1l-85.81-4.38-10.25 12.85a277.6 277.6 0 0 1-43.88 43.88l-12.85 10.25 4.38 85.81a349.88 349.88 0 0 1-58.1 24.1l-57.58-63.78-16.32 1.83a276.51 276.51 0 0 1-62.12 0l-16.32-1.83L407 847.57a349.88 349.88 0 0 1-58.1-24.1l4.38-85.81-12.85-10.25a277.66 277.66 0 0 1-43.89-43.88l-10.24-12.85-85.81 4.38A349 349 0 0 1 176.44 617l63.77-57.58-1.83-16.32a276.51 276.51 0 0 1 0-62.12l1.83-16.32L176.43 407a349.88 349.88 0 0 1 24.1-58.1l85.81 4.38 10.24-12.85a278.57 278.57 0 0 1 43.89-43.89l12.85-10.24-4.38-85.81a349.88 349.88 0 0 1 58.1-24.1l57.58 63.78 16.32-1.83a276.51 276.51 0 0 1 62.12 0l16.32 1.83L617 176.44a349 349 0 0 1 58.1 24.09l-4.38 85.81 12.85 10.24a277.66 277.66 0 0 1 43.88 43.89l10.25 12.85 85.81-4.38a349.88 349.88 0 0 1 24.1 58.1l-63.78 57.58z" />
    </svg>
  )
}

export function IconSend({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" fill="currentColor" className={className} aria-hidden="true">
      <path d="M978.716444 67.527111l-0.113777-0.227555a36.238222 36.238222 0 0 0-20.821334-17.408l-0.284444-0.113778a31.288889 31.288889 0 0 0-5.290667-1.137778c-0.512-0.113778-1.024-0.341333-1.592889-0.341333a27.875556 27.875556 0 0 0-5.006222-0.113778h-1.991111a36.693333 36.693333 0 0 0-13.994667 3.925333L61.44 482.588444a35.043556 35.043556 0 0 0-19.569778 28.330667 34.816 34.816 0 0 0 18.602667 36.920889l220.273778 115.768889a36.408889 36.408889 0 0 0 49.095111-14.506667 35.157333 35.157333 0 0 0-14.791111-48.128l-160.995556-84.593778L801.564444 195.185778l-394.922666 453.518222c-0.284444 0.284444-0.398222 0.682667-0.682667 1.024a35.214222 35.214222 0 0 0-16.213333 29.582222v261.12a35.726222 35.726222 0 0 0 36.295111 35.498667v0.056889a35.84 35.84 0 0 0 36.181333-35.498667v-246.158222l431.104-495.331556-89.6 653.312-227.271111-109.226666a36.693333 36.693333 0 0 0-48.526222 16.213333 35.441778 35.441778 0 0 0 16.611555 47.616l270.108445 129.877333a36.750222 36.750222 0 0 0 15.985778 3.640889l0.568889-0.113778 1.934222 0.170667a36.010667 36.010667 0 0 0 35.896889-30.776889l112.014222-816.128a34.645333 34.645333 0 0 0-2.389333-26.055111z" />
    </svg>
  )
}

export function IconStop({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" />
    </svg>
  )
}

export function IconArrowLeft({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M14 6L8 12L14 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconCopy({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 16H5.5A2.5 2.5 0 0 1 3 13.5V5.5A2.5 2.5 0 0 1 5.5 3H13.5A2.5 2.5 0 0 1 16 5.5V6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function IconUser({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 20.5C6.6 17.2 9 15.5 12 15.5C15 15.5 17.4 17.2 18.5 20.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function IconBot({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="4.5" y="7" width="15" height="11" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 4.5V7M15 4.5V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="9.5" cy="12.5" r="1" fill="currentColor" />
      <circle cx="14.5" cy="12.5" r="1" fill="currentColor" />
    </svg>
  )
}

export function IconCpu({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 3V7M15 3V7M9 17V21M15 17V21M3 9H7M17 9H21M3 15H7M17 15H21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function IconMessage({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M5 6.5A2.5 2.5 0 0 1 7.5 4H16.5A2.5 2.5 0 0 1 19 6.5V13.5A2.5 2.5 0 0 1 16.5 16H10L6 19V16H7.5A2.5 2.5 0 0 1 5 13.5V6.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconLayers({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 4L20 9L12 14L4 9L12 4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M4 14L12 19L20 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconTrash({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 7H19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4H13.5A1.5 1.5 0 0 1 15 5.5V7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7L9 19H15L16 7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

export function IconMinimize({ size = 10, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" className={className} aria-hidden="true">
      <path d="M1.5 5.5H8.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}

export function IconMaximize({ size = 10, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" className={className} aria-hidden="true">
      <rect x="1.5" y="1.5" width="7" height="7" rx="0.5" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

export function IconRestore({ size = 10, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" className={className} aria-hidden="true">
      <path d="M3.5 2.5H7.5V6.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="2.5" y="3.5" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

export function IconClose({ size = 10, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" className={className} aria-hidden="true">
      <path d="M2.5 2.5L7.5 7.5M7.5 2.5L2.5 7.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}

export function IconRename({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" fill="currentColor" className={className} aria-hidden="true">
      <path d="M544 768h-384c-17.92 0-32-14.08-32-32v-384c0-17.92 14.08-32 32-32h384c17.92 0 32 14.08 32 32s-14.08 32-32 32H192v320h352c17.92 0 32 14.08 32 32s-14.08 32-32 32z m-256-256c-17.92 0-32 14.08-32 32s14.08 32 32 32h192c17.92 0 32-14.08 32-32S497.92 512 480 512h-192z m512 384H704V192h96c17.92 0 32-14.08 32-32s-14.08-32-32-32h-256c-17.92 0-32 14.08-32 32s14.08 32 32 32H640v704H544c-17.92 0-32 14.08-32 32s14.08 32 32 32h256c17.92 0 32-14.08 32-32s-14.08-32-32-32z m64-576h-64c-17.92 0-32 14.08-32 32s14.08 32 32 32h32v320h-32c-17.92 0-32 14.08-32 32s14.08 32 32 32h64c17.92 0 32-14.08 32-32v-384c0-17.92-14.08-32-32-32z" />
    </svg>
  )
}

export function IconClear({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" fill="currentColor" className={className} aria-hidden="true">
      <path d="M567.1 776.4l4.5 4.4c7.5 7.4 19.6 7.4 27 0l315.3-311.1c15.5-15.2 24.2-36.1 24.2-57.8 0-21.7-8.7-42.5-24.2-57.8L643.6 87.5c-15.6-15.4-36.6-24-58.5-23.9-22.2 0-42.9 8.5-58.6 23.9L211.2 398.7c-3.6 3.5-5.6 8.3-5.6 13.3s2 9.8 5.6 13.3l4.5 4.4L112.1 532c-15.7 15.4-24.3 35.9-24.3 57.8s8.6 42.4 24.3 57.8l234.3 231.1c11.1 11 25.1 18.6 40.3 21.9H102.6c-10.5 0-23.8 12-23.8 30.7 0 18.8 13.2 29 23.7 29h777.3c10.5 0 25-10.2 25-29 0-18.7-14.5-30.7-25-30.7H423c15.1-3.4 29.1-10.8 40.4-21.9l103.7-102.3z m-166.5 60.5c-10.4 0-20.4-4.1-27.8-11.4L166.7 622.2c-7.4-7.2-11.6-17.1-11.6-27.4 0-10.3 4.2-20.2 11.6-27.4l91.2-89.9 261.6 258-91.2 89.9c-7.3 7.5-17.3 11.6-27.7 11.5z" />
    </svg>
  )
}

export function IconDelete({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" fill="currentColor" className={className} aria-hidden="true">
      <path d="M703.355701 958.712041 297.259706 958.712041c-97.55792 0-131.029242-18.10945-131.029242-130.289392L166.230464 390.164141c0-14.950504 12.122085-27.073612 27.073612-27.073612 14.950504 0 27.073612 12.122085 27.073612 27.073612l0 438.258509c0 71.145363-1.797949 76.144214 76.883041 76.144214l406.095995 0c76.05007 0 85.554538-2.142803 85.554538-76.144214L788.911262 390.164141c0-14.950504 12.122085-27.073612 27.073612-27.073612 14.950504 0 27.072589 12.122085 27.072589 27.073612l0 438.258509C843.05644 931.904489 808.528042 958.712041 703.355701 958.712041z" />
      <path d="M694.155155 241.261832c-14.950504 0-27.072589-12.122085-27.072589-27.073612l0-8.460696c0-78.231759-14.620999-86.295412-85.554538-86.295412L419.088402 119.432113c-73.961502 0-76.883041 10.482749-76.883041 86.295412l0 8.460696c0 14.950504-12.122085 27.073612-27.073612 27.073612-14.951527 0-27.073612-12.122085-27.073612-27.073612l0-8.460696c0-105.000426 27.601638-140.441613 131.029242-140.441613l162.438603 0c112.575961 0 139.701762 45.289486 139.701762 140.441613l0 8.460696C721.228767 229.139747 709.106682 241.261832 694.155155 241.261832z" />
      <path d="M342.205361 823.346027c-7.482415 0-13.537318-6.079462-13.537318-13.537318l0-27.071565c0-7.482415 6.054903-13.537318 13.537318-13.537318 7.482415 0 13.536294 6.053879 13.536294 13.537318l0 27.071565C355.741655 817.266565 349.686752 823.346027 342.205361 823.346027z" />
      <path d="M342.205361 728.58992c-7.482415 0-13.537318-6.079462-13.537318-13.537318L328.668043 484.920248c0-7.475252 6.054903-13.536294 13.537318-13.536294 7.482415 0 13.536294 6.061043 13.536294 13.536294l0 230.133378C355.741655 722.510458 349.686752 728.58992 342.205361 728.58992z" />
      <path d="M504.64294 823.346027c-7.482415 0-13.536294-6.079462-13.536294-13.537318l0-324.889485c0-7.475252 6.053879-13.536294 13.536294-13.536294s13.537318 6.061043 13.537318 13.536294l0 324.889485C518.180258 817.266565 512.125355 823.346027 504.64294 823.346027z" />
      <path d="M667.082566 823.346027c-7.482415 0-13.537318-6.079462-13.537318-13.537318l0-324.889485c0-7.475252 6.054903-13.536294 13.537318-13.536294s13.536294 6.061043 13.536294 13.536294l0 324.889485C680.617837 817.266565 674.563958 823.346027 667.082566 823.346027z" />
      <path d="M951.349865 305.560254c0 61.674665-49.994648 111.676475-111.676475 111.676475l-656.522558 0c-61.680804 0-111.676475-50.001811-111.676475-111.676475l0-6.768147c0-61.674665 49.994648-111.676475 111.676475-111.676475l656.522558 0c61.680804 0 111.676475 50.001811 111.676475 111.676475L951.349865 305.560254zM897.203664 298.79313c0-31.772634-25.750477-57.530274-57.530274-57.530274l-656.522558 0c-31.778774 0-57.530274 25.75764-57.530274 57.530274l0 6.768147c0 31.772634 25.7515 57.530274 57.530274 57.530274l656.522558 0c31.779797 0 57.530274-25.75764 57.530274-57.530274L897.203664 298.79313z" />
    </svg>
  )
}
