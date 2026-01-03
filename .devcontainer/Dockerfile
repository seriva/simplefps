# See here for image contents: https://github.com/microsoft/vscode-dev-containers/tree/v0.195.0/containers/javascript-node/.devcontainer/base.Dockerfile
# [Choice] Node.js version (use -bookworm variants for latest Debian): 22, 20, 18, 22-bookworm, 20-bookworm, 18-bookworm, 22-bullseye, 20-bullseye, 18-bullseye
ARG VARIANT=22-bookworm
FROM mcr.microsoft.com/vscode/devcontainers/javascript-node:1-${VARIANT}

# Install imagemagick for texture conversion (used by bsp2map and obj2mesh)
RUN apt-get update && apt-get install -y imagemagick && rm -rf /var/lib/apt/lists/*

# Update npm to the latest version
RUN su node -c "npm install -g npm@latest"