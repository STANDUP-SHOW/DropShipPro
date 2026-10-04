import sqlite3, shutil, os, json, re

src = r'C:\Users\maxma\.n8n\database.sqlite'
tmp = r'C:\Users\maxma\Downloads\DropPost\MARKET-ANALYSES\n8n\_sauvegardes\_diag2.sqlite'
os.makedirs(os.path.dirname(tmp), exist_ok=True)
for s in ('', '-wal', '-shm'):
    if os.path.exists(src + s):
        shutil.copyfile(src + s, tmp + s)

db = sqlite3.connect(tmp)
db.row_factory = sqlite3.Row

print('=== WORKFLOWS ===')
for r in db.execute('SELECT id,name,active,updatedAt FROM workflow_entity ORDER BY active DESC, updatedAt DESC'):
    print(f"{r['id'][:26]:<28} actif={r['active']} | {str(r['name'])[:44]:<46} | maj {r['updatedAt']}")

print()
print('=== 15 DERNIERES EXECUTIONS ===')
for r in db.execute('SELECT id,workflowId,status,mode,startedAt,stoppedAt FROM execution_entity ORDER BY id DESC LIMIT 15'):
    print(f"{r['id']:>5} | {str(r['workflowId'])[:26]:<28} | {r['status']:<9} | {r['mode']:<10} | {r['startedAt']} -> {r['stoppedAt']}")

print()
print('=== CHEMINS D ECRITURE DE FICHIER DANS LES WORKFLOWS ACTIFS ===')
for r in db.execute('SELECT id,name,nodes FROM workflow_entity WHERE active=1'):
    try:
        nodes = json.loads(r['nodes']) if isinstance(r['nodes'], str) else r['nodes']
    except Exception:
        continue
    print(f"--- {r['id']} / {r['name']}")
    for n in nodes:
        t = n.get('type', '')
        if 'readWriteFile' in t or 'writeBinaryFile' in t or 'convertToFile' in t:
            p = n.get('parameters', {})
            print(f"    [{n.get('name')}] {t}")
            print(f"       fileName = {p.get('fileName')}")
            print(f"       operation = {p.get('operation')}  dataPropertyName = {p.get('dataPropertyName')}")

print()
print('=== STATUT DES EXECUTIONS DE LA NUIT (03-04 oct) ===')
rows = list(db.execute("""SELECT workflowId, status, COUNT(*) n FROM execution_entity
  WHERE startedAt >= '2026-10-03 20:00' GROUP BY workflowId, status ORDER BY n DESC"""))
if rows:
    for r in rows:
        print(f"{str(r['workflowId'])[:28]:<30} {r['status']:<9} {r['n']}")
else:
    print('aucune execution enregistree depuis le 03/10 20h')
    print("(saveDataSuccessExecution='none' n'empeche PAS l'enregistrement de la ligne d'historique)")
