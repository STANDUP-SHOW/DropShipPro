# Réduire le coût de Claude Code — pour Max (et pour Claude)

## Pourquoi ~230 $ en un jour et demi

Rien d'anormal dans le prix unitaire : c'est la **façon** de travailler qui a coûté.

1. **Une seule session très longue, sur Opus** (le modèle le plus cher, ~5× Sonnet).
   À chaque message, Claude relit *tout* le contexte accumulé : plus la session
   est longue, plus chaque tour coûte cher. Cinq pubs dans la même conversation,
   c'est payer la cinquième pub avec le contexte des quatre premières.
2. **`CLAUDE.md` faisait 105 Ko (~30 000 tokens)**, renvoyé à chaque tour de
   chaque session. Des centaines d'outils × 30 000 tokens = une grosse part du total.
3. **Images lues** (planches contact, captures) : chaque image est chère et reste
   dans le contexte ensuite.
4. **Vérification horaire de la PR pendant la nuit** : ~15 réveils inutiles,
   chacun rejouant tout le contexte. **Arrêtée.**

## Ce qui a changé (28/09/2026)

- `CLAUDE.md` réduit à ~6 Ko. L'ancien texte intégral est conservé dans
  `docs/memoire-projet.md` ; Claude n'y va chercher que la section utile.
- Consignes d'économie écrites dans `CLAUDE.md` (Claude les lit à chaque session) :
  Sonnet par défaut, une tâche par session, lectures ciblées, pas de surveillance
  planifiée sans demande.
- Check-in horaire supprimé, abonnement à la PR #14 arrêté.

## Ce que Max doit faire

1. **Passer à Sonnet** : taper `/model` dans la session et choisir **Sonnet**
   (ou le choisir dans le menu du modèle de l'app avant de lancer la session).
   Sonnet suffit largement pour les pubs, textes, corrections courantes.
   Garder Opus pour un problème vraiment difficile.
2. **Une nouvelle session par tâche** (une pub = une session). Pour une pub,
   commencer par : « utilise la skill pub-video, musique X de mm:ss à mm:ss, sujet Y ».
   Toute la méthode est dans `.claude/skills/pub-video/SKILL.md`.
3. **Fusionner la PR #14** (branche `maxdev/exciting-galileo-1ltrdw`) dans `main` :
   sans ça, les nouvelles sessions partant de `main` ne voient ni la skill
   pub-video ni ce `CLAUDE.md` allégé.
4. Ne demander une surveillance (« surveille la PR », routines) que si c'est utile.

## Ordres de grandeur

| Habitude | Effet sur le coût |
|---|---|
| Sonnet au lieu d'Opus | ÷ 5 environ |
| CLAUDE.md 105 Ko → 6 Ko | ~25 000 tokens de moins par tour |
| Une session par pub | contexte petit → chaque tour reste bon marché |
| Pas de check-in nocturne | zéro coût pendant qu'on dort |

Une pub dans une session neuve, sur Sonnet, avec la skill : quelques dollars,
pas des dizaines.
