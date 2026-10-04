import sqlite3, json, shutil, os, sys

src = r'C:\Users\maxma\.n8n\database.sqlite'
tmp = r'C:\Users\maxma\Downloads\DropPost\MARKET-ANALYSES\n8n\_copie-diag.sqlite'
if not os.path.exists(tmp) or os.path.getmtime(tmp) < os.path.getmtime(src):
    for suf in ('', '-wal', '-shm'):
        if os.path.exists(src + suf):
            shutil.copyfile(src + suf, tmp + suf)

db = sqlite3.connect(tmp)
db.row_factory = sqlite3.Row

print('=== 15 DERNIERES EXECUTIONS ===')
for r in db.execute("""
  SELECT id, workflowId, status, mode, startedAt, stoppedAt
  FROM execution_entity ORDER BY id DESC LIMIT 15
"""):
    print(f"{r['id']:>5} | {r['workflowId'][:28]:<28} | {r['status']:<10} | {r['mode']:<10} | {r['startedAt']} -> {r['stoppedAt']}")

print()
print('=== NOEUD SERPER, EXECUTION 173 ===')
row = db.execute("SELECT data FROM execution_data WHERE executionId=173").fetchone()
if not row:
    print('pas de donnees pour 173')
    sys.exit(0)

raw = row['data']
try:
    blob = json.loads(raw)
except Exception as e:
    print('json illisible:', e)
    sys.exit(0)

# n8n stocke un graphe aplati : une liste de chaines + pointeurs
def deref(v, arr, prof=0):
    if prof > 40:
        return v
    if isinstance(v, str) and v.isdigit() and int(v) < len(arr):
        return deref(arr[int(v)], arr, prof + 1)
    return v

if isinstance(blob, list):
    arr = blob
    # cherche les noms de noeuds interessants dans les chaines
    for i, el in enumerate(arr):
        if isinstance(el, str) and 'Query pattern not allowed' in el:
            print('TROUVE refus Serper:', el[:400]); break
    txt = json.dumps(arr)[:0]
else:
    arr = []

full = raw
for motif in ['Query pattern not allowed', 'not allowed for free', 'credits', 'quota',
              '"statusCode":4', '"statusCode":5', 'Unauthorized', 'rate limit',
              'ECONNRESET', 'ETIMEDOUT']:
    idx = full.find(motif)
    print(f"{motif!r:<34} -> {'position ' + str(idx) if idx >= 0 else 'absent'}")
    if idx >= 0:
        print('   contexte:', full[max(0, idx - 300):idx + 300].replace('\\n', ' '))
