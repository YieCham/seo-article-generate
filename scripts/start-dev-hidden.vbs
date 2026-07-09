' 无控制台窗口启动开发模式（双击此文件，或在项目根目录执行 npm run dev:quiet）
Dim fso, shell, projectDir
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
projectDir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
shell.CurrentDirectory = projectDir
shell.Run "cmd /c npm run dev", 0, False
