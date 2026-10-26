; A product may supply its palette and shape in product-theme.nsh beside this file; every value below is a default.
!include /NONFATAL "${__FILEDIR__}\product-theme.nsh"
!macro InstallerDefault NAME VALUE
    !ifndef ${NAME}
        !define ${NAME} `${VALUE}`
    !endif
!macroend

; Figma logical pixels, independent of the Windows display scale.
!define INSTALLER_WINDOW_SIZE 600
!define INSTALLER_BRAND_Y 174
!define INSTALLER_BRAND_HEIGHT 196
!define INSTALLER_BUTTON_X 240
!define INSTALLER_BUTTON_Y 490
!define INSTALLER_BUTTON_WIDTH 120
!define INSTALLER_BUTTON_HEIGHT 44
!insertmacro InstallerDefault INSTALLER_BUTTON_DIAMETER 20
!define INSTALLER_PROGRESS_X 64
!define INSTALLER_PROGRESS_Y 482
!define INSTALLER_PROGRESS_WIDTH 472
!define INSTALLER_PROGRESS_HEIGHT 6
!define INSTALLER_PROGRESS_DIAMETER 4
!define INSTALLER_STATUS_Y 512
!define INSTALLER_STATUS_HEIGHT 22
!define INSTALLER_FONT "Microsoft YaHei UI"
!define INSTALLER_BUTTON_FONT_SIZE 16
!define INSTALLER_STATUS_FONT_SIZE 14
; Text and background as RRGGBB for SetCtlColors; GDI+ ARGB and GDI COLORREF (0xBBGGRR) for drawing.
!insertmacro InstallerDefault INSTALLER_LIGHT_BG_HEX FFFFFF
!insertmacro InstallerDefault INSTALLER_LIGHT_TEXT_HEX 0F1115
!insertmacro InstallerDefault INSTALLER_LIGHT_BG_ARGB 0xFFFFFFFF
!insertmacro InstallerDefault INSTALLER_LIGHT_BG_COLORREF 0xFFFFFF
!insertmacro InstallerDefault INSTALLER_TEXT_COLORREF 0x15110F
!insertmacro InstallerDefault INSTALLER_PRIMARY 0xFF0F1115
!insertmacro InstallerDefault INSTALLER_PRIMARY_HOVER 0xFF2D3135
!insertmacro InstallerDefault INSTALLER_PRIMARY_PRESSED 0xFF000000
!insertmacro InstallerDefault INSTALLER_CONTROL_HOVER 0xFFEEF0F2
!insertmacro InstallerDefault INSTALLER_TRACK_COLOR 0xFFE9ECF2
!insertmacro InstallerDefault INSTALLER_LIGHT_BUTTON_TEXT 0xFFFFFF
!insertmacro InstallerDefault INSTALLER_LIGHT_BORDER 0xFFBBC0C8
!insertmacro InstallerDefault INSTALLER_DARK_BG_HEX 151517
!insertmacro InstallerDefault INSTALLER_DARK_TEXT_HEX FFFFFF
!insertmacro InstallerDefault INSTALLER_DARK_BG_ARGB 0xFF151517
!insertmacro InstallerDefault INSTALLER_DARK_BG_COLORREF 0x171515
!insertmacro InstallerDefault INSTALLER_DARK_TEXT_COLORREF 0xFFFFFF
!insertmacro InstallerDefault INSTALLER_DARK_PRIMARY 0xFFF9FAFB
!insertmacro InstallerDefault INSTALLER_DARK_PRIMARY_HOVER 0xFFE9ECF2
!insertmacro InstallerDefault INSTALLER_DARK_PRIMARY_PRESSED 0xFFD4DBE9
!insertmacro InstallerDefault INSTALLER_DARK_CONTROL_HOVER 0xFF303034
!insertmacro InstallerDefault INSTALLER_DARK_TRACK_COLOR 0xFF61666B
!insertmacro InstallerDefault INSTALLER_DARK_BUTTON_TEXT 0x15110F
!insertmacro InstallerDefault INSTALLER_DARK_BORDER 0xFF61666B

Var InstallerTheme
Var InstallerBgHex
Var InstallerTextHex
Var InstallerBgArgb
Var InstallerBgColorref
Var InstallerTextColorref
Var InstallerPrimary
Var InstallerPrimaryHover
Var InstallerPrimaryPressed
Var InstallerControlHover
Var InstallerTrack
Var InstallerButtonText
Var InstallerBorder

; SetCtlColors accepts only compile-time colors; choose between the two native palettes.
!macro InstallerControlColors HANDLE
    ${If} $InstallerTheme == "dark"
        SetCtlColors ${HANDLE} ${INSTALLER_DARK_TEXT_HEX} ${INSTALLER_DARK_BG_HEX}
    ${Else}
        SetCtlColors ${HANDLE} ${INSTALLER_LIGHT_TEXT_HEX} ${INSTALLER_LIGHT_BG_HEX}
    ${EndIf}
!macroend

Function InstallerResolveTheme
    ${If} $InstallerTheme == "auto"
        ClearErrors
        ReadRegDWORD $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Themes\Personalize" "AppsUseLightTheme"
        ${If} ${Errors}
            StrCpy $0 1
        ${EndIf}
        ${If} $0 == 0
            StrCpy $InstallerTheme "dark"
        ${Else}
            StrCpy $InstallerTheme "light"
        ${EndIf}
    ${EndIf}
    ${If} $InstallerTheme == "dark"
        StrCpy $InstallerBgHex "${INSTALLER_DARK_BG_HEX}"
        StrCpy $InstallerTextHex "${INSTALLER_DARK_TEXT_HEX}"
        StrCpy $InstallerBgArgb ${INSTALLER_DARK_BG_ARGB}
        StrCpy $InstallerBgColorref ${INSTALLER_DARK_BG_COLORREF}
        StrCpy $InstallerTextColorref ${INSTALLER_DARK_TEXT_COLORREF}
        StrCpy $InstallerPrimary ${INSTALLER_DARK_PRIMARY}
        StrCpy $InstallerPrimaryHover ${INSTALLER_DARK_PRIMARY_HOVER}
        StrCpy $InstallerPrimaryPressed ${INSTALLER_DARK_PRIMARY_PRESSED}
        StrCpy $InstallerControlHover ${INSTALLER_DARK_CONTROL_HOVER}
        StrCpy $InstallerTrack ${INSTALLER_DARK_TRACK_COLOR}
        StrCpy $InstallerButtonText ${INSTALLER_DARK_BUTTON_TEXT}
        StrCpy $InstallerBorder ${INSTALLER_DARK_BORDER}
    ${Else}
        StrCpy $InstallerBgHex "${INSTALLER_LIGHT_BG_HEX}"
        StrCpy $InstallerTextHex "${INSTALLER_LIGHT_TEXT_HEX}"
        StrCpy $InstallerBgArgb ${INSTALLER_LIGHT_BG_ARGB}
        StrCpy $InstallerBgColorref ${INSTALLER_LIGHT_BG_COLORREF}
        StrCpy $InstallerTextColorref ${INSTALLER_TEXT_COLORREF}
        StrCpy $InstallerPrimary ${INSTALLER_PRIMARY}
        StrCpy $InstallerPrimaryHover ${INSTALLER_PRIMARY_HOVER}
        StrCpy $InstallerPrimaryPressed ${INSTALLER_PRIMARY_PRESSED}
        StrCpy $InstallerControlHover ${INSTALLER_CONTROL_HOVER}
        StrCpy $InstallerTrack ${INSTALLER_TRACK_COLOR}
        StrCpy $InstallerButtonText ${INSTALLER_LIGHT_BUTTON_TEXT}
        StrCpy $InstallerBorder ${INSTALLER_LIGHT_BORDER}
    ${EndIf}
FunctionEnd
