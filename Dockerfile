FROM node:20-alpine

# Install dependencies for puppeteer if needed
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Set puppeteer to use installed chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy built application
COPY dist ./dist
COPY public ./public
COPY policies ./policies

# Create non-root user
RUN addgroup -g 1001 -S aegis && \
    adduser -S aegis -u 1001 -G aegis && \
    chown -R aegis:aegis /app

USER aegis

# Expose HTTP port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start server (HTTP mode by default)
CMD ["node", "dist/src/mcp-server.js"]