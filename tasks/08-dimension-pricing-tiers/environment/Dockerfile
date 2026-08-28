# syntax=docker/dockerfile:1
# Self-contained build: the workspace this task hands the agent ships in this
# repository under environment/workspace, so no external base image is needed.
FROM node:20-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl git jq patch python3 ripgrep \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY workspace/ /app/
RUN git init -q . \
 && git config user.email task@example.invalid \
 && git config user.name "task" \
 && git add -A \
 && git commit -qm "task base"
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
RUN mkdir -p /logs/verifier
CMD ["/bin/bash"]
