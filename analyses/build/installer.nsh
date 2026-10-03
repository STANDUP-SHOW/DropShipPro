; Custom NSIS steps for electron-builder.
; The installer creates the deposit folder and the watchdog task; the
; uninstaller removes the task but NEVER the deposit folder (Max's reports).

!macro customInstall
  CreateDirectory "C:\DropShipper-Analyses"
  CreateDirectory "C:\DropShipper-Analyses\rapports"
  CreateDirectory "C:\DropShipper-Analyses\releves"
  CreateDirectory "C:\DropShipper-Analyses\journaux"
  CreateDirectory "C:\DropShipper-Analyses\diagnostics"
  CreateDirectory "C:\DropShipper-Analyses\sauvegardes"
  CreateDirectory "C:\DropShipper-Analyses\prompts"
  ; watchdog: a second launch every 10 min is harmless (single-instance lock) and relaunches a dead app
  nsExec::Exec 'schtasks /Create /F /SC MINUTE /MO 10 /TN "DropShipper Poste d analyses" /TR "\"$INSTDIR\${APP_EXECUTABLE_FILENAME}\""'
!macroend

!macro customUnInstall
  nsExec::Exec 'schtasks /Delete /F /TN "DropShipper Poste d analyses"'
!macroend
