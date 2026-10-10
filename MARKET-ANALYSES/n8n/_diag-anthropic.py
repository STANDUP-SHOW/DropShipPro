import sqlite3, re

tmp = r'C:\Users\maxma\Downloads\DropPost\MARKET-ANALYSES\n8n\_copie-diag.sqlite'
db = sqlite3.connect(tmp)
db.row_factory = sqlite3.Row

for ex in (154, 160, 165, 170):
    row = db.execute("SELECT data FROM execution_data WHERE executionId=?", (ex,)).fetchone()
    if not row:
        print(f'--- exec {ex}: aucune donnee'); continue
    d = row['data'] or ''
    print(f'=========== EXEC {ex} (taille {len(d)}) ===========')
    for motif in ('credit balance is too low', 'invalid_x_api_key', 'authentication_error',
                  'rate_limit_error', 'Not enough credits'):
        for m in list(re.finditer(re.escape(motif), d))[:2]:
            i = m.start()
            ctx = d[max(0, i - 450):i + 250]
            ctx = ctx.replace('\\n', ' ').replace('\\t', ' ')
            print(f'>>> {motif} @ {i}')
            print('   ', ctx[-600:])
            print()
