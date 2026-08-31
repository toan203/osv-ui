FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node bin ./bin
COPY --chown=node:node src ./src
USER node
ENTRYPOINT ["node", "bin/osv-ui-mcp.js"]
