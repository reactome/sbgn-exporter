# The release's bulk SBGN file (README, "The release's bulk file"), as the release's
# Jenkins step runs it (Jenkinsfile). Node 24 runs the TypeScript as it is: no build.
FROM node:24-slim

WORKDIR /opt/sbgn-exporter

# Every package is a development one (the website takes the library from dist/, which
# has none); the command line loads neo4j-driver, to read the graph.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund \
    && npm cache clean --force

COPY src ./src

USER node
ENTRYPOINT ["node", "src/cli.ts"]
