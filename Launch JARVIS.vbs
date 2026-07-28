' Launch JARVIS with no visible console window.
' Double-click this file (or pin it to Start Menu / taskbar) instead of using `npm start`.
Dim shell, fso, dir
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.Run """" & dir & "\node_modules\electron\dist\electron.exe"" """ & dir & """", 0, False
