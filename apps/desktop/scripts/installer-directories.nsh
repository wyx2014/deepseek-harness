!include "LogicLib.nsh"

Var dshFinalDirectory
Var dshNewDirectory
Var dshOldDirectory
Var dshOldMoved
Var dshNewMoved

!include "${__FILEDIR__}\installer-directory-recovery.nsh"

!macro dshExtractPayload FILE
  !ifmacrodef customInstallerExtract
    !insertmacro customInstallerExtract "${FILE}"
  !else
    nsExec::ExecToStack '"$PLUGINSDIR\dsh-7za.exe" x -y -bd -bb0 "-o$INSTDIR" "${FILE}"'
    Pop $R0
    Pop $R1
  !endif
  ${If} $R0 != 0
    DetailPrint $R1
    Call dshRollbackDirectories
    !ifmacrodef customInstallerExtractFailed
      !insertmacro customInstallerExtractFailed "${FILE}"
    !else
      MessageBox MB_OK|MB_ICONEXCLAMATION "$(decompressionFailed)" /SD IDOK
    !endif
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

!macro dshStageApplication
  StrCpy $dshFinalDirectory $INSTDIR
  System::Call 'ole32::CoCreateGuid(g .r0) i .r1'
  ${If} $1 != 0
    SetErrorLevel 2
    Quit
  ${EndIf}
  StrCpy $dshNewDirectory "$INSTDIR.new-$0"
  StrCpy $dshOldDirectory "$INSTDIR.old-$0"
  ; The builder defines the updater cache after including functions, before expanding this macro.
  StrCpy $dshDirectoryLogRoot "${DSH_INSTALLER_LOG_DIR}"
  StrCpy $dshDirectoryLog "$dshDirectoryLogRoot\directory-failure-$0.log"
  StrCpy $dshDirectoryLogSaved ""
  StrCpy $dshOldMoved ""
  StrCpy $dshNewMoved ""
  ClearErrors
  CreateDirectory $dshNewDirectory
  ${If} ${Errors}
    SetErrorLevel 2
    Quit
  ${EndIf}
  File /oname=$PLUGINSDIR\dsh-7za.exe "${DSH_SEVENZIP_PATH}"
  StrCpy $INSTDIR $dshNewDirectory
  SetOutPath $INSTDIR
  !insertmacro installApplicationFiles
  !ifdef DSH_SEVENZIP_LICENSE_DIR
    File /oname=7zip-installer-LICENSE.txt "${DSH_SEVENZIP_LICENSE_DIR}\LICENSE.txt"
    File /oname=7zip-installer-COPYING.txt "${DSH_SEVENZIP_LICENSE_DIR}\COPYING"
  !endif
  !ifdef UNINSTALLER_ICON
    File /oname=uninstallerIcon.ico "${UNINSTALLER_ICON}"
  !endif
  StrCpy $INSTDIR $dshFinalDirectory
  SetOutPath $PLUGINSDIR
!macroend

Function .onGUIEnd
  Call dshCleanupDirectories
FunctionEnd

Function dshCleanupDirectories
  ${If} $dshFinalDirectory != ""
    Call dshRollbackDirectories
  ${EndIf}
FunctionEnd

; Only directories created or renamed by this installer are removed during rollback.
Function dshRollbackDirectories
  SetOutPath $PLUGINSDIR
  ${If} $dshNewMoved == "1"
    RMDir /r "\\?\$dshFinalDirectory"
    StrCpy $dshNewMoved ""
  ${EndIf}
  ${If} $dshOldMoved == "1"
    StrCpy $dshDirectoryOperation "restore-backup"
    StrCpy $dshMoveSource $dshOldDirectory
    StrCpy $dshMoveTarget $dshFinalDirectory
    Call dshTryMoveDirectory
    ${If} $dshMoveError != 0
      ; Leave the complete backup in place if another process prevents restoration.
      Call dshWriteDirectoryReport
      DetailPrint $dshOldDirectory
      ${IfNot} ${Silent}
        MessageBox MB_OK|MB_ICONEXCLAMATION "$(INSTALLER_DIRECTORY_RESTORE)$\r$\n$dshOldDirectory$\r$\n$(INSTALLER_DIRECTORY_ERROR) $dshMoveError$\r$\n$dshDirectoryLog" /SD IDOK
      ${EndIf}
      Return
    ${EndIf}
    StrCpy $dshOldMoved ""
    ${If} $dshDirectoryLogSaved == "1"
      Call dshWriteDirectoryReport
    ${EndIf}
  ${EndIf}
  ${If} $dshNewDirectory != ""
    RMDir /r "\\?\$dshNewDirectory"
  ${EndIf}
  StrCpy $INSTDIR $dshFinalDirectory
FunctionEnd

Function dshPromoteDirectories
  !ifmacrodef InstallerPublishStage
    !insertmacro InstallerPublishStage 2
  !endif
  ; SetOutPath opens a directory handle; release it before either rename.
  SetOutPath $PLUGINSDIR
  ClearErrors
  ${If} ${FileExists} "$dshFinalDirectory\*.*"
    StrCpy $dshDirectoryOperation "backup-installation"
    StrCpy $dshMoveSource $dshFinalDirectory
    StrCpy $dshMoveTarget $dshOldDirectory
    Call dshMoveDirectory
    ${If} ${Errors}
      Call dshRollbackDirectories
      SetErrors
      Return
    ${EndIf}
    StrCpy $dshOldMoved "1"
  ${Else}
    ; NSIS can create the destination before the install section starts.
    RMDir $dshFinalDirectory
  ${EndIf}
  ClearErrors
  StrCpy $dshDirectoryOperation "promote-installation"
  StrCpy $dshMoveSource $dshNewDirectory
  StrCpy $dshMoveTarget $dshFinalDirectory
  Call dshMoveDirectory
  ${If} ${Errors}
    Call dshRollbackDirectories
    SetErrors
    Return
  ${EndIf}
  StrCpy $dshNewMoved "1"
  SetOutPath $dshFinalDirectory
  !ifmacrodef InstallerPublishStage
    !insertmacro InstallerPublishStage 3
  !endif
  ClearErrors
FunctionEnd

!macro dshFinishDirectories
  StrCpy $dshNewMoved ""
  ${If} $dshOldMoved == "1"
    RMDir /r "\\?\$dshOldDirectory"
    StrCpy $dshOldMoved ""
  ${EndIf}
!macroend
