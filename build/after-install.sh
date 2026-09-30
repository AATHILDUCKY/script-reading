#!/bin/bash

set -e

app_dir='/opt/ScriptFlow Studio'
executable="$app_dir/scriptflow-studio"
sandbox="$app_dir/chrome-sandbox"

# Ubuntu 24.04 can restrict unprivileged user namespaces. Electron then needs
# its setuid sandbox helper to be owned by root with exactly this mode.
chown root:root "$sandbox"
chmod 4755 "$sandbox"

if command -v update-alternatives >/dev/null 2>&1; then
    if [ -L /usr/bin/scriptflow-studio ] && [ -e /usr/bin/scriptflow-studio ] && \
       [ "$(readlink /usr/bin/scriptflow-studio)" != /etc/alternatives/scriptflow-studio ]; then
        rm -f /usr/bin/scriptflow-studio
    fi
    update-alternatives --install /usr/bin/scriptflow-studio scriptflow-studio "$executable" 100
else
    ln -sf "$executable" /usr/bin/scriptflow-studio
fi

if command -v update-mime-database >/dev/null 2>&1; then
    update-mime-database /usr/share/mime || true
fi

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database /usr/share/applications || true
fi

