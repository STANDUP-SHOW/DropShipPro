@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

REM ===================================================================
REM  DropPost - import des rapports Markdown dans la base du site
REM
REM  Fait entrer dans backend\rapports.db les rapports que les taches
REM  planifiees Claude ecrivent chaque nuit sous
REM  MARKET-ANALYSES\rapports\<date>\<categorie>\, puis recalcule la
REM  memoire et les alertes.
REM
REM  Les agents ecrivent sur le disque ; le site lit la base. Sans cette
REM  etape les rapports existent et restent invisibles - c'est ce qui
REM  s'est passe du 23 septembre au 4 octobre 2026.
REM
REM  A LANCER A LA MAIN :
REM     import-rapports.bat
REM
REM  OU A PROGRAMMER (une seule fois, dans une invite ADMINISTRATEUR) :
REM     schtasks /create /tn "DropPost import rapports" /sc daily /st 12:45 ^
REM       /tr "C:\Users\maxma\Downloads\DropPost\import-rapports.bat" /rl highest
REM
REM  Coute zero token : ce sont trois commandes node, pas une session IA.
REM  Tourne meme si l'application Claude est fermee.
REM ===================================================================

set RACINE=%~dp0
set RACINE=%RACINE:~0,-1%
set JOURNAL=%RACINE%\MARKET-ANALYSES\rapports\_import.log

echo. >> "%JOURNAL%"
echo ================================================= >> "%JOURNAL%"
echo %DATE% %TIME% - debut >> "%JOURNAL%"

if not exist "%RACINE%\backend\importer-markdown.cjs" (
  echo ERREUR : importer-markdown.cjs introuvable dans %RACINE%\backend >> "%JOURNAL%"
  echo ERREUR : importer-markdown.cjs introuvable dans %RACINE%\backend
  exit /b 1
)

REM --- filet de securite : on ne touche pas a la base sans copie
set HORO=%DATE:~-4%-%DATE:~3,2%-%DATE:~0,2%
if not exist "%RACINE%\MARKET-ANALYSES\n8n\_sauvegardes" mkdir "%RACINE%\MARKET-ANALYSES\n8n\_sauvegardes"
copy /y "%RACINE%\backend\rapports.db" "%RACINE%\MARKET-ANALYSES\n8n\_sauvegardes\rapports.db.avant-import-%HORO%.bak" >nul
if errorlevel 1 (
  echo ERREUR : sauvegarde de rapports.db impossible, on s'arrete >> "%JOURNAL%"
  echo ERREUR : sauvegarde de rapports.db impossible, on s'arrete
  exit /b 1
)
echo sauvegarde : rapports.db.avant-import-%HORO%.bak >> "%JOURNAL%"

cd /d "%RACINE%\backend"

REM --- sans --date : toutes les dates presentes sur le disque.
REM     L'import est idempotent (il met a jour, il ne duplique pas), donc
REM     une nuit ecrite en retard est rattrapee toute seule au passage suivant.
echo --- importer-markdown >> "%JOURNAL%"
node importer-markdown.cjs >> "%JOURNAL%" 2>&1
if errorlevel 1 (
  echo ERREUR : l'import a echoue, migration et alertes non lancees >> "%JOURNAL%"
  echo ERREUR : l'import a echoue - voir %JOURNAL%
  exit /b 1
)

echo --- memoire-migration >> "%JOURNAL%"
node memoire-migration.cjs >> "%JOURNAL%" 2>&1
if errorlevel 1 (
  echo ERREUR : la migration memoire a echoue >> "%JOURNAL%"
  echo ERREUR : la migration memoire a echoue - voir %JOURNAL%
  exit /b 1
)

echo --- memoire-alertes >> "%JOURNAL%"
node memoire-alertes.cjs >> "%JOURNAL%" 2>&1
if errorlevel 1 (
  echo ERREUR : le calcul des alertes a echoue >> "%JOURNAL%"
  echo ERREUR : le calcul des alertes a echoue - voir %JOURNAL%
  exit /b 1
)

REM --- LE GARDE-FOU. Il ne repare rien, il refuse.
REM     Trois fois le systeme a echoue en silence : rapport vide le 19/09,
REM     faux « success » le 23/09, et le 04/10 vingt-quatre rapports importes
REM     annonces comme une reussite alors qu'AUCUN ne tenait le contrat.
REM     Le point commun n'etait pas une panne : rien ne comparait la sortie
REM     au contrat. Desormais si, et le code de sortie le dit.
echo --- verifier-rapports >> "%JOURNAL%"
node verifier-rapports.cjs >> "%JOURNAL%" 2>&1
set CONTRAT=%ERRORLEVEL%

echo %DATE% %TIME% - fin >> "%JOURNAL%"

if not "%CONTRAT%"=="0" (
  echo. >> "%JOURNAL%"
  echo RUPTURE DE CONTRAT : ne pas publier cette journee en l'etat. >> "%JOURNAL%"
  echo.
  echo ####################################################################
  echo #  RUPTURE DE CONTRAT                                              #
  echo #                                                                  #
  echo #  Les donnees sont dans la base, mais au moins un rayon n'est pas #
  echo #  livrable : produits manquants, URL manquantes ou prix absents.  #
  echo #  NE PAS committer ni pousser en l'etat.                          #
  echo #                                                                  #
  echo #  Le detail rayon par rayon est dans :                            #
  echo #  MARKET-ANALYSES\rapports\_import.log                           #
  echo #                                                                  #
  echo #  Pour le relire a l'ecran :                                      #
  echo #    cd backend ^&^& node verifier-rapports.cjs                      #
  echo ####################################################################
  echo.
  exit /b 2
)

echo.
echo Termine, contrat tenu. Detail dans MARKET-ANALYSES\rapports\_import.log
echo.
echo RAPPEL : la donnee est dans la base LOCALE. Pour qu'elle apparaisse sur
echo www.drop-shipper.fr il faut encore commiter backend\rapports.db et
echo pousser sur main - Railway redeploie ensuite.
exit /b 0
