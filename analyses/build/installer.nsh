; Custom NSIS steps for electron-builder.
; The installer creates the deposit folder; the uninstaller removes the
; watchdog task the Poste may have created but NEVER the deposit folder (Max's reports).

!macro customInstall
  CreateDirectory "C:\DropShipper-Analyses"
  CreateDirectory "C:\DropShipper-Analyses\rapports"
  CreateDirectory "C:\DropShipper-Analyses\releves"
  CreateDirectory "C:\DropShipper-Analyses\journaux"
  CreateDirectory "C:\DropShipper-Analyses\diagnostics"
  CreateDirectory "C:\DropShipper-Analyses\sauvegardes"
  CreateDirectory "C:\DropShipper-Analyses\prompts"
  ; no watchdog task here (12/10): the Poste creates it itself, and only while the automatic night is on.
  ; An older version (0.3.5 or before) left a task that brought the window back every 10 minutes: removed now (16/10).
  nsExec::Exec 'schtasks /Delete /F /TN "DropShipper Poste d analyses"'
!macroend

!macro customUnInstall
  nsExec::Exec 'schtasks /Delete /F /TN "DropShipper Poste d analyses"'
!macroend
