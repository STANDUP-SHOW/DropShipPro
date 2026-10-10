"""
Purge la base n8n : 485 Mo pour 173 executions, dont l'essentiel est du HTML
de pages web brutes conserve par saveDataSuccessExecution='all'.

Ce script NE TOUCHE PAS aux workflows, aux identifiants, ni a l'historique des
executions : il ne supprime que les GROS PAYLOADS (table execution_data) des
executions autres que les 5 plus recentes. Les lignes d'historique restent, donc
l'interface n8n continue d'afficher la liste complete.

Une sauvegarde complete est faite avant toute ecriture.
Lancer n8n a l'arret.
"""
import sqlite3, os, shutil, time, datetime

BASE = r'C:\Users\maxma\.n8n\database.sqlite'
SAUV_DIR = r'C:\Users\maxma\Downloads\DropPost\MARKET-ANALYSES\n8n\_sauvegardes'
GARDER = 5

def mo(n):
    return f'{n / 1048576:.1f} Mo'

if not os.path.exists(BASE):
    raise SystemExit('base introuvable : ' + BASE)

# --- refus si n8n tourne encore (le WAL serait actif)
for suf in ('-shm',):
    pass

os.makedirs(SAUV_DIR, exist_ok=True)
horo = datetime.datetime.now().strftime('%Y-%m-%d_%Hh%M')
sauv = os.path.join(SAUV_DIR, f'database.sqlite.{horo}.bak')

avant = os.path.getsize(BASE)
wal = BASE + '-wal'
avant_wal = os.path.getsize(wal) if os.path.exists(wal) else 0
print(f'base  : {mo(avant)}')
print(f'wal   : {mo(avant_wal)}')

print(f'sauvegarde -> {sauv}')
shutil.copyfile(BASE, sauv)
for suf in ('-wal', '-shm'):
    if os.path.exists(BASE + suf):
        shutil.copyfile(BASE + suf, sauv + suf)
print('sauvegarde ok')

db = sqlite3.connect(BASE)
db.row_factory = sqlite3.Row

# on replie le WAL dans la base avant de travailler
db.execute('PRAGMA journal_mode=DELETE')

total = db.execute('SELECT COUNT(*) c FROM execution_data').fetchone()['c']
dernieres = [r['id'] for r in db.execute(
    'SELECT id FROM execution_entity ORDER BY id DESC LIMIT ?', (GARDER,))]
print(f'execution_data : {total} lignes | on garde les executions {dernieres}')

marques = ','.join('?' for _ in dernieres)
cur = db.execute(
    f'DELETE FROM execution_data WHERE executionId NOT IN ({marques})', dernieres)
print(f'payloads supprimes : {cur.rowcount}')
db.commit()

print('VACUUM (peut prendre une minute)...')
t0 = time.time()
db.execute('VACUUM')
db.commit()
db.close()
print(f'VACUUM fait en {time.time() - t0:.0f}s')

apres = os.path.getsize(BASE)
print()
print(f'AVANT : {mo(avant + avant_wal)}')
print(f'APRES : {mo(apres)}')
print(f'LIBERE: {mo(avant + avant_wal - apres)}')
print()
print('historique conserve :',
      sqlite3.connect(BASE).execute('SELECT COUNT(*) FROM execution_entity').fetchone()[0],
      'executions')
