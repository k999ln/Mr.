FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node packages/automation-hub ./packages/automation-hub
COPY --chown=node:node services/automation-runner ./services/automation-runner
USER node
ENV NODE_ENV=production
ENTRYPOINT ["node", "services/automation-runner/cli.mjs"]
CMD ["--stdio"]
