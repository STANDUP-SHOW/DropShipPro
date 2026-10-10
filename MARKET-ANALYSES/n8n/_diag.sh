#!/bin/sh
L=/tmp/exec-unifie.log
echo "--- TAILLE ---"
wc -c $L
echo "--- ERREURS ---"
grep -o '"message": "[^"]*"' $L | head -8
grep -o '"name": "NodeOperationError"' $L | head -3
grep -i -o 'Error: [^"]\{0,160\}' $L | head -8
echo "--- STATUT ---"
grep -o '"status": "[a-z]*"' $L | tail -3
echo "--- DERNIER NOEUD ---"
grep -o '"lastNodeExecuted": "[^"]*"' $L | tail -2
echo "--- 600 DERNIERS OCTETS ---"
tail -c 600 $L
