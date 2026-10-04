#!/bin/sh
echo '--- LANCEMENT DE LA NUIT COMPLETE ---'
wget -q -O - --timeout=30 --post-data='{}' \
  --header='Content-Type: application/json' \
  http://localhost:5678/webhook/orchestrateur-nuit
echo ""
echo "heure : $(date +%H:%M:%S)"
