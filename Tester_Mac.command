#!/bin/bash
# Qissa · test en local (Mac) : double-cliquez sur ce fichier.
# Si Python n'est pas installé, le lanceur en installe un dans ce dossier (.tools/),
# sans Xcode et sans mot de passe administrateur.
cd "$(dirname "$0")" || exit 1

fin() { read -r -p "Appuyez sur Entrée pour fermer." _; exit "${1:-0}"; }
echec() { echo ""; echo "✗ $1"; fin 1; }

ok_version() { "$1" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' >/dev/null 2>&1; }

# Un Python déjà installé et utilisable (python.org, Homebrew, ou outils Xcode s'ils sont présents).
# On ne touche jamais à /usr/bin/python3 sans les outils Xcode : il ouvrirait leur installation.
trouver_python() {
  for p in /Library/Frameworks/Python.framework/Versions/3.*/bin/python3 /opt/homebrew/bin/python3 /usr/local/bin/python3; do
    [ -x "$p" ] && ok_version "$p" && { echo "$p"; return 0; }
  done
  if [ "$(uname -s)" = "Darwin" ]; then
    xcode-select -p >/dev/null 2>&1 && [ -x /usr/bin/python3 ] && ok_version /usr/bin/python3 && { echo /usr/bin/python3; return 0; }
  else
    command -v python3 >/dev/null 2>&1 && ok_version "$(command -v python3)" && { command -v python3; return 0; }
  fi
  return 1
}

installer_uv() {
  [ -x .tools/uv ] && return 0
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64) cible=aarch64-apple-darwin ;;
    Darwin-x86_64) cible=x86_64-apple-darwin ;;
    Linux-x86_64) cible=x86_64-unknown-linux-gnu ;;
    Linux-aarch64) cible=aarch64-unknown-linux-gnu ;;
    *) return 1 ;;
  esac
  mkdir -p .tools || return 1
  curl -fsSL "https://github.com/astral-sh/uv/releases/latest/download/uv-$cible.tar.gz" -o .tools/uv.tar.gz || return 1
  tar -xzf .tools/uv.tar.gz -C .tools --strip-components 1 && rm -f .tools/uv.tar.gz && chmod +x .tools/uv
}

export UV_PYTHON_INSTALL_DIR="$PWD/.tools/python" UV_CACHE_DIR="$PWD/.tools/cache"

if [ ! -x .venv/bin/python ] || ! ok_version .venv/bin/python; then
  rm -rf .venv
  PY="$(trouver_python)"
  if [ -n "$PY" ]; then
    echo "Première installation avec $PY (1 à 2 minutes)…"
    "$PY" -m venv .venv || echec "Impossible de créer l'environnement Python."
  else
    echo "Python n'est pas installé : installation d'un Python pour Qissa dans ce dossier (2 à 3 minutes, sans Xcode)…"
    installer_uv || echec "Téléchargement impossible : vérifiez la connexion internet puis relancez."
    # --managed-python : uv télécharge son propre Python et n'essaie jamais le /usr/bin/python3 de macOS
    ./.tools/uv venv .venv --python 3.12 --managed-python || echec "Installation de Python impossible : vérifiez la connexion internet puis relancez."
  fi
fi

echo "Vérification des modules…"
if [ -x .tools/uv ]; then
  ./.tools/uv pip install -q --python .venv/bin/python -r server/requirements.txt || echec "Installation des modules impossible : vérifiez la connexion internet puis relancez."
else
  ./.venv/bin/python -m pip install -q --disable-pip-version-check -r server/requirements.txt || echec "Installation des modules impossible : vérifiez la connexion internet puis relancez."
fi

./.venv/bin/python tools/tester.py "$@"
fin 0
