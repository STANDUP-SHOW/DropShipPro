import sqlite3, re, os

tmp = r'C:\Users\maxma\Downloads\DropPost\MARKET-ANALYSES\n8n\_copie-diag.sqlite'
db = sqlite3.connect(tmp)
db.row_factory = sqlite3.Row

MOTIFS = [
    r'Not enough credits',
    r'Query pattern not allowed',
    r'api\.anthropic\.com',
    r'anthropic',
    r'credit balance is too low',
    r'invalid_api_key',
    r'authentication_error',
    r'rate_limit_error',
    r'max_tokens',
    r'google\.serper\.dev',
]

print('exec | statut  | motifs trouves')
print('-' * 70)
for r in db.execute("""
  SELECT e.id, e.status, d.data
  FROM execution_entity e JOIN execution_data d ON d.executionId = e.id
  WHERE e.id BETWEEN 150 AND 200 ORDER BY e.id
"""):
    data = r['data'] or ''
    trouves = [m for m in MOTIFS if re.search(m, data, re.I)]
    print(f"{r['id']:>4} | {r['status']:<7} | {', '.join(trouves) if trouves else '-'}")

print()
print('=== derniers messages d erreur ===')
for r in db.execute("""
  SELECT e.id, d.data FROM execution_entity e JOIN execution_data d ON d.executionId = e.id
  WHERE e.status='error' AND e.id BETWEEN 150 AND 200 ORDER BY e.id DESC LIMIT 4
"""):
    data = r['data'] or ''
    msgs = set()
    for m in re.finditer(r'"([^"]{0,80}(?:credits|failed with status code|ERROR|Cannot read|undefined)[^"]{0,120})"', data):
        msgs.add(m.group(1))
    print(f"--- exec {r['id']} ---")
    for m in list(msgs)[:6]:
        print('   ', m[:200])
