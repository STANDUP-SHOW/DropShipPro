#!/bin/sh
# lance l'execution DETACHEE : elle survit a la deconnexion du client docker exec
export N8N_RUNNERS_ENABLED=false
export N8N_RUNNERS_BROKER_PORT=5688
export N8N_PORT=5699
rm -f /tmp/exec-unifie.log /tmp/exec-unifie.done
nohup sh -c 'n8n execute --id agentRayonUnifie > /tmp/exec-unifie.log 2>&1; echo $? > /tmp/exec-unifie.done' >/dev/null 2>&1 &
echo "lance, pid=$!"
