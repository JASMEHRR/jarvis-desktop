' Run this ONCE to generate "Launch JARVIS.lnk" next to it.
' Use this if right-click > Pin to Start/taskbar isn't offered for the .vbs
' file directly on your Windows build — .lnk shortcuts are always pinnable.
Dim shell, fso, dir, link
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
Set link = shell.CreateShortcut(dir & "\Launch JARVIS.lnk")
link.TargetPath = dir & "\node_modules\electron\dist\electron.exe"
link.Arguments = """" & dir & """"
link.WorkingDirectory = dir
link.IconLocation = link.TargetPath & ",0"
link.Description = "Launch JARVIS desktop"
link.Save
MsgBox "Created " & dir & "\Launch JARVIS.lnk" & vbCrLf & "Right-click it to pin to Start or taskbar.", vbInformation, "JARVIS"
