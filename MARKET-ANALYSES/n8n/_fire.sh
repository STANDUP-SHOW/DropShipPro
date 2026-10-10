#!/bin/sh
# declenche le workflow via son webhook, depuis l'interieur du conteneur
BODY='{"categorie":"telephonie","theme":"smartphones","libelle_categorie":"Telephonie","libelle_theme":"smartphones"}'
echo "--- APPEL WEBHOOK ---"
wget -q -O - --timeout=30 \
  --header='Content-Type: application/json' \
  --post-data="$BODY" \
  http://localhost:5678/webhook/agent-rayon-unifie 2>&1
echo ""
echo "code=$?"
