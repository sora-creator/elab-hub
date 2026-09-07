Option Explicit
Dim shell, fso, grammarDir, appDir, pythonPath, scriptPath, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
grammarDir = fso.GetParentFolderName(WScript.ScriptFullName)
appDir = fso.GetParentFolderName(grammarDir)
pythonPath = fso.BuildPath(appDir, ".venv-grammar\Scripts\python.exe")
scriptPath = fso.BuildPath(grammarDir, "mockexam_db\local_bridge.py")
If fso.FileExists(pythonPath) And fso.FileExists(scriptPath) Then
  command = Chr(34) & pythonPath & Chr(34) & " " & Chr(34) & scriptPath & Chr(34) & " --no-browser"
  shell.Run command, 0, False
End If
