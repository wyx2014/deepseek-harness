#!/bin/bash
# electron-builder's stock DEB after-remove script, followed by removal of the desktop shortcuts the installer created.
# electron-builder substitutes ${executable}-style macros here, so the script's own variables never use braces.

# Delete the link to the binary
if type update-alternatives >/dev/null 2>&1; then
    update-alternatives --remove '${executable}' '/opt/${sanitizedProductName}/${executable}'
else
    rm -f '/usr/bin/${executable}'
fi

APPARMOR_PROFILE_DEST='/etc/apparmor.d/${executable}'

# Remove and unload apparmor profile.
if [ -f "$APPARMOR_PROFILE_DEST" ]; then
  if apparmor_status --enabled > /dev/null 2>&1; then
    if ! { [ -x '/usr/bin/ischroot' ] && /usr/bin/ischroot; } && hash apparmor_parser 2>/dev/null; then
      apparmor_parser --remove "$APPARMOR_PROFILE_DEST" || true
    fi
  fi
  rm -f "$APPARMOR_PROFILE_DEST"
fi

# Only an uninstall removes shortcuts; dpkg also runs this script with "upgrade" while replacing the package.
if { [ "$1" = remove ] || [ "$1" = purge ]; } && hash runuser 2>/dev/null; then
  for home in /home/*; do
    [ -d "$home" ] && [ ! -L "$home" ] || continue
    user=$(stat -c '%U' "$home" 2>/dev/null) || continue
    [ -n "$user" ] && [ "$user" != UNKNOWN ] && [ "$user" != root ] || continue
    marker="$home/.local/share/${executable}/desktop-shortcut"
    [ -e "$marker" ] || continue
    for desktop in "$(runuser -u "$user" -- env HOME="$home" xdg-user-dir DESKTOP 2>/dev/null)" "$home/Desktop" "$home/桌面"; do
      [ -n "$desktop" ] && [ -f "$desktop/${executable}.desktop" ] && runuser -u "$user" -- rm -f "$desktop/${executable}.desktop" 2>/dev/null
    done
    # Removing the marker lets a later reinstall offer the shortcut again.
    runuser -u "$user" -- rm -f "$marker" 2>/dev/null || true
    runuser -u "$user" -- rmdir "$home/.local/share/${executable}" 2>/dev/null || true
  done
fi
