; Retry only the failed move, before rollback; a successful move is never repeated.
Var dshMoveSource
Var dshMoveTarget
Var dshMoveError
Var dshMoveAttempt
Var dshMoveMessage
Var dshDirectoryOperation
Var dshDirectoryLog
Var dshDirectoryLogSaved

Function dshTryMoveDirectory
  StrCpy $dshMoveAttempt 0
  ${Do}
    System::Call 'kernel32::MoveFileExW(w "$dshMoveSource", w "$dshMoveTarget", i 0) i.r0 ?e'
    Pop $dshMoveError
    ${If} $0 != 0
      StrCpy $dshMoveError 0
      Return
    ${EndIf}
    IntOp $dshMoveAttempt $dshMoveAttempt + 1
    ${If} $dshMoveAttempt == 1
      Call dshWriteDirectoryReport
    ${EndIf}
    ${If} $dshMoveAttempt >= 20
      Return
    ${EndIf}
    ; Access denied can be a short-lived scanner handle; other errors need intervention.
    ${If} $dshMoveError != 5
    ${AndIf} $dshMoveError != 32
    ${AndIf} $dshMoveError != 33
      Return
    ${EndIf}
    Sleep 250
  ${Loop}
FunctionEnd

; UTF-16 preserves installation paths on every Windows system locale.
Function dshWriteDirectoryReport
  Push $0
  Push $1
  CreateDirectory "${DSH_INSTALLER_LOG_DIR}"
  ClearErrors
  FileOpen $0 $dshDirectoryLog a
  ${If} ${Errors}
    StrCpy $dshDirectoryLogSaved ""
    Pop $1
    Pop $0
    Return
  ${EndIf}
  FileSeek $0 0 END $1
  ${If} $1 == 0
    FileWriteUTF16LE /BOM $0 "Installer directory failure report$\r$\n"
  ${EndIf}
  FileWriteUTF16LE $0 "Operation: $dshDirectoryOperation$\r$\nWindows error: $dshMoveError$\r$\n"
  FileWriteUTF16LE $0 "Source: $dshMoveSource$\r$\n"
  FileWriteUTF16LE $0 "Destination: $dshMoveTarget$\r$\n"
  FileWriteUTF16LE $0 "Installation: $dshFinalDirectory$\r$\n"
  FileWriteUTF16LE $0 "Staging: $dshNewDirectory$\r$\n"
  FileWriteUTF16LE $0 "Backup: $dshOldDirectory$\r$\n"
  FileWriteUTF16LE $0 "Old moved: $dshOldMoved$\r$\nNew moved: $dshNewMoved$\r$\n$\r$\n"
  ${If} ${Errors}
    StrCpy $dshDirectoryLogSaved ""
  ${Else}
    StrCpy $dshDirectoryLogSaved "1"
  ${EndIf}
  FileClose $0
  Pop $1
  Pop $0
FunctionEnd

Function dshMoveDirectory
  ${Do}
    Call dshTryMoveDirectory
    ${If} $dshMoveError == 0
      ClearErrors
      Return
    ${EndIf}
    Call dshWriteDirectoryReport
    DetailPrint "$dshDirectoryOperation: $dshMoveSource -> $dshMoveTarget (Windows $dshMoveError)"
    ${If} ${Silent}
      SetErrors
      Return
    ${EndIf}
    System::Call 'kernel32::FormatMessageW(i 0x1200, p 0, i $dshMoveError, i 0, w .r0, i ${NSIS_MAX_STRLEN}, p 0)'
    StrCpy $dshMoveMessage "$(INSTALLER_DIRECTORY_FAILED)$\r$\n$\r$\n$(INSTALLER_DIRECTORY_ERROR) $dshMoveError: $0$\r$\n$dshMoveTarget$\r$\n$\r$\n$(INSTALLER_DIRECTORY_RETRY)"
    ${If} $dshDirectoryLogSaved == "1"
      StrCpy $dshMoveMessage "$dshMoveMessage$\r$\n$\r$\n$(INSTALLER_DIRECTORY_LOG)$\r$\n$dshDirectoryLog"
    ${EndIf}
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$dshMoveMessage" /SD IDCANCEL IDRETRY dsh_move_retry
    SetErrors
    Return
    dsh_move_retry:
  ${Loop}
FunctionEnd
