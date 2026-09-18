Option Explicit
Dim shell, fs, script
Set shell = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
script = fs.BuildPath(fs.GetParentFolderName(WScript.ScriptFullName), "scripts\Launch-Watch-Sync-Repair.ps1")
shell.Run "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -File " & Chr(34) & script & Chr(34) & " -Action stop", 0, False
