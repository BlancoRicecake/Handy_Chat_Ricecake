FROM caddy:2-alpine

# Copy Caddyfile
COPY Caddyfile /etc/caddy/Caddyfile

# Create log directory
RUN mkdir -p /var/log/caddy

# Expose HTTP and HTTPS ports
EXPOSE 80 443

# Caddy runs as non-root user by default
# Data directory for certificates: /data
# Config directory: /config
