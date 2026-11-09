#!/bin/bash
# electron-builder's stock DEB after-install script, followed by a desktop shortcut for each user.
# electron-builder substitutes ${executable}-style macros here, so the script's own variables never use braces.

if type update-alternatives >/dev/null 2>&1; then
    # Remove previous link if it doesn't use update-alternatives
    if [ -L '/usr/bin/${executable}' -a -e '/usr/bin/${executable}' -a "`readlink '/usr/bin/${executable}'`" != '/etc/alternatives/${executable}' ]; then
        rm -f '/usr/bin/${executable}'
    fi
    update-alternatives --install '/usr/bin/${executable}' '${executable}' '/opt/${sanitizedProductName}/${executable}' 100 || ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
else
    ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
fi

# Check if user namespaces are supported by the kernel and working with a quick test:
if ! { [[ -L /proc/self/ns/user ]] && unshare --user true; }; then
    # Use SUID chrome-sandbox only on systems without user namespaces:
    chmod 4755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
else
    chmod 0755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
fi

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi

if hash gtk-update-icon-cache 2>/dev/null; then
    gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
fi

# Install apparmor profile. (Ubuntu 24+)
if apparmor_status --enabled > /dev/null 2>&1; then
  APPARMOR_PROFILE_SOURCE='/opt/${sanitizedProductName}/resources/apparmor-profile'
  APPARMOR_PROFILE_TARGET='/etc/apparmor.d/${executable}'
  if apparmor_parser --skip-kernel-load --debug "$APPARMOR_PROFILE_SOURCE" > /dev/null 2>&1; then
    cp -f "$APPARMOR_PROFILE_SOURCE" "$APPARMOR_PROFILE_TARGET"
    if ! { [ -x '/usr/bin/ischroot' ] && /usr/bin/ischroot; } && hash apparmor_parser 2>/dev/null; then
      apparmor_parser --replace --write-cache --skip-read-cache "$APPARMOR_PROFILE_TARGET"
    fi
  else
    echo "Skipping the installation of the AppArmor profile as this version of AppArmor does not seem to support the bundled profile"
  fi
fi

# Desktop shortcut, as Kylin and UOS desktops expect from an installed application. Every file operation runs as the
# home's owner, so a link planted in a user's folder cannot redirect a root write. A per-user marker records that the
# shortcut was offered once: a user who deletes it does not get it back on the next upgrade.
DESKTOP_ENTRY='/usr/share/applications/${executable}.desktop'
if [ -f "$DESKTOP_ENTRY" ] && hash runuser 2>/dev/null; then
  for home in /home/*; do
    [ -d "$home" ] && [ ! -L "$home" ] || continue
    user=$(stat -c '%U' "$home" 2>/dev/null) || continue
    [ -n "$user" ] && [ "$user" != UNKNOWN ] && [ "$user" != root ] || continue
    marker="$home/.local/share/${executable}/desktop-shortcut"
    [ -e "$marker" ] && continue
    desktop=""
    if hash xdg-user-dir 2>/dev/null; then
      desktop=$(runuser -u "$user" -- env HOME="$home" xdg-user-dir DESKTOP 2>/dev/null)
    fi
    if [ -z "$desktop" ] || [ "$desktop" = "$home" ] || [ ! -d "$desktop" ]; then
      desktop=""
      for candidate in "$home/Desktop" "$home/桌面"; do
        if [ -d "$candidate" ]; then desktop="$candidate"; break; fi
      done
    fi
    [ -n "$desktop" ] || continue
    runuser -u "$user" -- install -m 755 "$DESKTOP_ENTRY" "$desktop/${executable}.desktop" 2>/dev/null || continue
    # GNOME launches desktop files only once trusted; other desktops ignore the attribute.
    runuser -u "$user" -- gio set "$desktop/${executable}.desktop" metadata::trusted true >/dev/null 2>&1 || true
    runuser -u "$user" -- mkdir -p "$home/.local/share/${executable}" 2>/dev/null \
      && runuser -u "$user" -- touch "$marker" 2>/dev/null || true
  done
fi
