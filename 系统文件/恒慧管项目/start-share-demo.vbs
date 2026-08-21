Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = root & "\start-share-demo.ps1"
cmd = "powershell -NoProfile -ExecutionPolicy Bypass -File """ & ps1 & """"
sh.CurrentDirectory = root
sh.Run cmd, 1, False