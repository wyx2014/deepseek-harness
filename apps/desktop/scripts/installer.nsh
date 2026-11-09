; Additions to electron-builder's stock assisted installer (see the nsis options in electron-builder-config.mjs).
; Everything else - install mode, folder choice, running-application check, upgrade and uninstall - is upstream.

!macro customInstall
  ; Standard uninstall-entry metadata read by inventory tools; the upstream template records it only under its private key.
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" InstallLocation "$INSTDIR"
!macroend
