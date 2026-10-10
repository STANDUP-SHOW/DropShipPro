#!/bin/sh
n8n export:credentials --all --output=/tmp/creds.json >/dev/null 2>&1
node -e "
const c = require('/tmp/creds.json');
console.log('--- CREDENTIALS ---');
c.forEach(x => console.log(x.id + ' | ' + x.name + ' | ' + x.type));
"
echo '--- WORKFLOWS ---'
n8n list:workflow 2>/dev/null
