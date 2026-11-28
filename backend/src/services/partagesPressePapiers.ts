/**
 * Links an old desktop app (before 0.5.4, 17/11/2026) captured from the
 * clipboard: every Ctrl+C on a web address became a "shared product", which
 * the fully automatic mode then imported into Mes annonces (max, 28/11/2026:
 * « à chaque fois que je fais CTRL-C … cela vient ajouter un produit »).
 *
 * The capture is gone from the app, but an app installed before 0.5.4 keeps
 * sending them with this source. The server now refuses them, never hands the
 * queued ones back to an app, and never imports one.
 */
export const SOURCE_PRESSE_PAPIERS = 'presse-papiers'

export const MESSAGE_PRESSE_PAPIERS =
  "La capture du presse-papiers n'existe plus : rien ne s'ajoute sans votre geste. Mettez à jour DropShipper Desktop."

/** Prisma filter: every shared link except the clipboard captures. */
export const horsPressePapiers = { NOT: { source: SOURCE_PRESSE_PAPIERS } }
