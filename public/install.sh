#!/usr/bin/env sh
# hashmark installer
# Usage: curl -fsSL https://hashmark.md/install.sh | sh
#
# Downloads the correct binary from the latest GitHub release and installs
# it to /usr/local/bin/hashmark (or ~/bin/hashmark if /usr/local/bin is
# not writable without sudo).

set -e

REPO="jpoindexter/hashmark"
BINARY="hashmark"
INSTALL_DIR="/usr/local/bin"

# ── Detect OS ──────────────────────────────────────────────────────────────
OS="$(uname -s)"
case "$OS" in
  Linux*)  PLATFORM="linux" ;;
  Darwin*) PLATFORM="macos" ;;
  *)
    echo "Unsupported OS: $OS" >&2
    echo "Download manually from: https://github.com/$REPO/releases/latest" >&2
    exit 1
    ;;
esac

# ── Detect architecture ─────────────────────────────────────────────────────
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64 | amd64)   ARCH_TAG="x64" ;;
  arm64 | aarch64)  ARCH_TAG="arm64" ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    echo "Download manually from: https://github.com/$REPO/releases/latest" >&2
    exit 1
    ;;
esac

ASSET_NAME="${BINARY}-${PLATFORM}-${ARCH_TAG}"

# ── Resolve latest release tag via GitHub API ────────────────────────────────
RELEASE_URL="https://api.github.com/repos/${REPO}/releases/latest"

if command -v curl >/dev/null 2>&1; then
  TAG=$(curl -fsSL "$RELEASE_URL" | grep '"tag_name"' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')
elif command -v wget >/dev/null 2>&1; then
  TAG=$(wget -qO- "$RELEASE_URL" | grep '"tag_name"' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')
else
  echo "Error: curl or wget is required." >&2
  exit 1
fi

if [ -z "$TAG" ]; then
  echo "Error: could not determine latest release tag." >&2
  echo "Check your network or visit: https://github.com/$REPO/releases/latest" >&2
  exit 1
fi

DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET_NAME}"

# ── Choose install directory ─────────────────────────────────────────────────
if [ -w "$INSTALL_DIR" ]; then
  DEST="$INSTALL_DIR/$BINARY"
elif [ -d "$HOME/bin" ] && [ -w "$HOME/bin" ]; then
  DEST="$HOME/bin/$BINARY"
  INSTALL_DIR="$HOME/bin"
else
  mkdir -p "$HOME/bin"
  DEST="$HOME/bin/$BINARY"
  INSTALL_DIR="$HOME/bin"
fi

# ── Download ─────────────────────────────────────────────────────────────────
TMP_FILE="$(mktemp)"
# Ensure temp file is removed on exit
trap 'rm -f "$TMP_FILE"' EXIT

echo "Downloading hashmark ${TAG} (${PLATFORM}-${ARCH_TAG})..."

if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$DOWNLOAD_URL" -o "$TMP_FILE"
else
  wget -qO "$TMP_FILE" "$DOWNLOAD_URL"
fi

# ── Install ──────────────────────────────────────────────────────────────────
chmod +x "$TMP_FILE"
mv "$TMP_FILE" "$DEST"

echo "Installed hashmark ${TAG} to ${DEST}"

# ── PATH hint if ~/bin is not in PATH ────────────────────────────────────────
if [ "$INSTALL_DIR" = "$HOME/bin" ]; then
  case ":$PATH:" in
    *":$HOME/bin:"*) ;;
    *)
      echo ""
      echo "Note: add ~/bin to your PATH to use hashmark from anywhere:"
      echo "  echo 'export PATH=\"\$HOME/bin:\$PATH\"' >> ~/.bashrc  # bash"
      echo "  echo 'export PATH=\"\$HOME/bin:\$PATH\"' >> ~/.zshrc   # zsh"
      ;;
  esac
fi

echo ""
echo "Run: hashmark --help"
