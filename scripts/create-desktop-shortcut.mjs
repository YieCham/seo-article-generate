import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const vbsLauncher = path.join(projectRoot, 'scripts', 'start-dev-hidden.vbs')
const pngIconPath = path.join(projectRoot, 'icons', 'icon.png')
const icoIconPath = path.join(projectRoot, 'icons', 'icon.ico')
const desktop = path.join(os.homedir(), 'Desktop')
const shortcutName = 'AIWriting Assistant.lnk'
const shortcutPath = path.join(desktop, shortcutName)
const wscript = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'wscript.exe')

function escapeVbsPath(value) {
  return value.replace(/\\/g, '\\\\')
}

function escapePsPath(value) {
  return value.replace(/'/g, "''")
}

function writeUtf16Vbs(filePath, content) {
  fs.writeFileSync(filePath, `\uFEFF${content}`, 'utf16le')
}

function runVbs(content) {
  const tempVbs = path.join(os.tmpdir(), `ai-article-shortcut-${Date.now()}.vbs`)
  writeUtf16Vbs(tempVbs, content)
  try {
    execFileSync('cscript', ['//nologo', tempVbs], { stdio: 'inherit' })
  } finally {
    fs.unlinkSync(tempVbs)
  }
}

function findPackagedExe() {
  const unpackedDir = path.join(projectRoot, 'dist', 'win-unpacked')
  if (!fs.existsSync(unpackedDir)) return null
  const exe = fs.readdirSync(unpackedDir).find((name) => name.endsWith('.exe'))
  return exe ? path.join(unpackedDir, exe) : null
}

function ensureIcoFromPng() {
  if (!fs.existsSync(pngIconPath)) return null

  const pngStat = fs.statSync(pngIconPath)
  if (fs.existsSync(icoIconPath)) {
    const icoStat = fs.statSync(icoIconPath)
    if (icoStat.mtimeMs >= pngStat.mtimeMs) return icoIconPath
  }

  const ps = `
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap('${escapePsPath(pngIconPath)}')
$hIcon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$stream = [System.IO.File]::Create('${escapePsPath(icoIconPath)}')
$icon.Save($stream)
$stream.Close()
$bmp.Dispose()
$icon.Dispose()
`

  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
    stdio: 'inherit'
  })

  return fs.existsSync(icoIconPath) ? icoIconPath : null
}

function resolveShortcutIcon() {
  const packagedExe = findPackagedExe()
  if (packagedExe) return `${packagedExe},0`

  const ico = ensureIcoFromPng()
  if (ico) return `${ico},0`

  if (fs.existsSync(pngIconPath)) return `${pngIconPath},0`

  return ''
}

const launcherArg = escapeVbsPath(vbsLauncher)
const iconLocation = resolveShortcutIcon()
const cleanupVbs = `
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
desktop = shell.SpecialFolders("Desktop")
For Each file In fso.GetFolder(desktop).Files
  If LCase(fso.GetExtensionName(file.Name)) = "lnk" Then
    Set sc = shell.CreateShortcut(file.Path)
    If InStr(LCase(sc.Arguments), "start-dev-hidden.vbs") > 0 Then
      fso.DeleteFile file.Path, True
    End If
  End If
Next
`

const createVbs = `
Set shell = CreateObject("WScript.Shell")
Set sc = shell.CreateShortcut("${escapeVbsPath(shortcutPath)}")
sc.TargetPath = "${escapeVbsPath(wscript)}"
sc.Arguments = "//B //Nologo ""${launcherArg}"""
sc.WorkingDirectory = "${escapeVbsPath(projectRoot)}"
sc.WindowStyle = 7
sc.Description = "AIWriting Assistant"
${iconLocation ? `sc.IconLocation = "${escapeVbsPath(iconLocation.split(',')[0])},0"` : ''}
sc.Save
`

console.log('正在清理旧的桌面快捷方式…')
runVbs(cleanupVbs)

if (iconLocation) {
  console.log(`使用图标：${iconLocation.split(',')[0]}`)
} else {
  console.log('未找到应用图标，快捷方式将使用默认图标。')
}

console.log(`正在创建桌面快捷方式：${shortcutName}`)
runVbs(createVbs)

console.log('完成。请使用桌面上的「AIWriting Assistant」启动。')
