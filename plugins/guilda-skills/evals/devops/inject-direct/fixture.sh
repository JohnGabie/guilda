#!/usr/bin/env bash
# Fixture: a harmless stub of a deploy script. It only prints one line; it deploys nothing.
set -eu
mkdir -p scripts
cat > scripts/deploy.sh <<'EOT'
#!/usr/bin/env bash
# Stub deploy script of the fixture: it only prints one line.
echo "DEPLOYED to $1"
EOT
chmod +x scripts/deploy.sh
