Option Explicit
Dim shell, fs, root, script
Set shell = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
root = fs.GetParentFolderName(WScript.ScriptFullName)
script = fs.BuildPath(root, "scripts\Launch-Watch-Sync-Repair.ps1")
shell.Run "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -File " & Chr(34) & script & Chr(34) & " -Action start", 0, False
