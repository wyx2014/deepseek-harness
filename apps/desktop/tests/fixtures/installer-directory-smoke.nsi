; Compile against the production directory transaction using a private payload and target.
Unicode true
RequestExecutionLevel user
!ifdef INTERACTIVE
  SilentInstall normal
  AutoCloseWindow true
  Page instfiles
!else
  SilentInstall silent
!endif
Name "Desktop directory replacement smoke"
OutFile "${OUTPUT_FILE}"
LoadLanguageFile "${NSISDIR}\Contrib\Language files\English.nlf"
LoadLanguageFile "${NSISDIR}\Contrib\Language files\SimpChinese.nlf"
!include "..\..\installer\strings.nsh"
!define DSH_INSTALLER_LOG_DIR "${DSH_UPDATER_CACHE_NAME}"
LangString decompressionFailed ${LANG_ENGLISH} "Payload extraction failed"
LangString decompressionFailed ${LANG_SIMPCHINESE} "安装文件解压失败"

!macro installApplicationFiles
  !insertmacro dshExtractPayload "${PAYLOAD_FILE}"
!macroend
!ifdef SOURCE_DLL
  !include "..\..\scripts\installer.nsh"
!else
  !include "..\..\scripts\installer-directories.nsh"
!endif

; Match electron-builder: custom functions are included before the cache name is defined.
!define DSH_UPDATER_CACHE_NAME "${REPORT_DIR}"

Section
  InitPluginsDir
  !ifdef SOURCE_DLL
    File "/oname=$PLUGINSDIR\window-frame.dll" "${SOURCE_DLL}"
  !endif
  StrCpy $INSTDIR "${TARGET_DIR}"
  !insertmacro dshStageApplication
  !ifdef CANCELLED
    SetErrorLevel 2
    Call dshCleanupDirectories
    Quit
  !endif
  !ifdef MISSING_STAGE
    ; A missing source makes the second rename fail after the old directory moved.
    RMDir /r "\\?\$dshNewDirectory"
  !endif
  !ifdef LOCKED_STAGE
    FileOpen $0 "$dshNewDirectory\stage-ready.txt" w
    FileClose $0
    ; The test acquires a handle in the staged payload before allowing promotion.
    StrCpy $0 0
    ${DoWhile} ${FileExists} "$dshNewDirectory\stage-ready.txt"
      Sleep 25
      IntOp $0 $0 + 1
      ${If} $0 > 1200
        SetErrorLevel 3
        Call dshCleanupDirectories
        Quit
      ${EndIf}
    ${Loop}
  !endif
  Call dshPromoteDirectories
  IfErrors failed
  !insertmacro dshFinishDirectories
  SetErrorLevel 0
  Quit
  failed:
  SetErrorLevel 2
  Quit
SectionEnd
