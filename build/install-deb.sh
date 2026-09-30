#!/bin/bash

set -e

version="$(node -p "require('./package.json').version")"
architecture="$(dpkg --print-architecture)"
package_file="release/ScriptFlow Studio-${version}-${architecture}.deb"
temporary_file="/tmp/ScriptFlow-Studio-${version}-${architecture}.deb"

if [ ! -f "$package_file" ]; then
    echo "Installer not found: $package_file" >&2
    echo "Run 'npm run dist' first." >&2
    exit 1
fi

# _apt cannot traverse private home directories. Give it a readable copy in
# /tmp instead of weakening the user's home-directory permissions.
install -m 0644 "$package_file" "$temporary_file"
sudo apt install "$temporary_file"

