import { readdir, writeFile, mkdir } from 'fs/promises'
import path from 'path'
import os from 'os'

/**
 * Rendre les polices visibles pour librsvg, et pas seulement présentes.
 *
 * Le piège est en deux temps, et le second est le vrai.
 *
 * **Un.** L'image Nixpacks n'embarque aucune police. `nixpacks.toml` en
 * installe, mais Nix ne les range pas où on les cherche : elles vivent dans
 * `/nix/store/<hash>-dejavu-fonts/share/fonts`, jamais dans `/usr/share/fonts`.
 *
 * **Deux, et c'est celui qui coûte.** Même installées, fontconfig ne les voit
 * pas : il lit `/etc/fonts/fonts.conf`, qui ne connaît que les chemins
 * standards. Le paquet est là, la police est là, et `sharp` dessine quand même
 * un carré vide par caractère. Un contrôle qui se contente de trouver un
 * fichier `.ttf` répond donc « tout va bien » sur un serveur qui produira des
 * publicités illisibles — pire que de ne rien contrôler.
 *
 * On écrit donc notre propre configuration fontconfig, qui liste les dossiers
 * réellement trouvés, et on la désigne par `FONTCONFIG_FILE`. Cette variable
 * l'emporte sur tout le reste : c'est le seul point d'entrée qui ne dépende ni
 * de la distribution, ni de l'image de base.
 */

export interface EtatPolices {
  /** Vrai quand au moins une police est trouvée **et** déclarée à fontconfig. */
  pretes: boolean
  /** Les dossiers retenus, pour le diagnostic. */
  dossiers: string[]
  /** Le fichier de configuration écrit, quand il l'a été. */
  configuration: string | null
  /** Ce qui a manqué, en clair. */
  raison: string | null
}

let etat: EtatPolices | null = null

/** Les emplacements standards, dans l'ordre où on les rencontre. */
const CANDIDATS = [
  '/usr/share/fonts',
  '/usr/local/share/fonts',
  '/nix/var/nix/profiles/default/share/fonts',
  '/root/.nix-profile/share/fonts',
]

/** Vrai quand ce dossier contient au moins un fichier de police. */
async function contientUnePolice(dossier: string): Promise<boolean> {
  try {
    const entrees = (await readdir(dossier, { recursive: true } as never)) as string[]
    return entrees.some((f) => /\.(ttf|otf|ttc|pfb)$/i.test(f))
  } catch {
    return false
  }
}

/**
 * Les dossiers de polices du magasin Nix.
 *
 * Balayé à un seul niveau, et seulement les entrées dont le nom parle de
 * polices : le magasin compte des milliers de dossiers, et le parcourir en
 * entier retiendrait le démarrage pendant des dizaines de secondes.
 */
async function dossiersNix(): Promise<string[]> {
  try {
    const magasin = await readdir('/nix/store')
    const trouves: string[] = []
    for (const entree of magasin) {
      if (!/font|dejavu|liberation|noto|freefont/i.test(entree)) continue
      const dossier = `/nix/store/${entree}/share/fonts`
      if (await contientUnePolice(dossier)) trouves.push(dossier)
    }
    return trouves
  } catch {
    return []
  }
}

/**
 * Prépare les polices, une fois par démarrage.
 *
 * Idempotent et sans exception : appelé avant chaque composition, il doit
 * répondre vite et ne jamais faire échouer autre chose que la composition
 * elle-même.
 */
export async function preparerPolices(): Promise<EtatPolices> {
  if (etat) return etat

  // Hors Linux, le système en fournit toujours et fontconfig les connaît.
  if (process.platform !== 'linux') {
    etat = { pretes: true, dossiers: [], configuration: null, raison: null }
    return etat
  }

  const dossiers: string[] = []

  /*
   * Les polices livrées avec le dépôt passent en premier.
   *
   * C'est le seul emplacement dont on maîtrise le contenu : une image de base
   * qui change, un paquet Nix renommé, et tout le reste disparaît sans
   * prévenir. Le dossier est vide aujourd'hui — y déposer un `.ttf` suffit à
   * rendre la composition indépendante du serveur.
   */
  const embarquees = path.resolve('assets/fonts')
  if (await contientUnePolice(embarquees)) dossiers.push(embarquees)

  for (const candidat of CANDIDATS) {
    if (await contientUnePolice(candidat)) dossiers.push(candidat)
  }

  const maison = `${process.env.HOME ?? ''}/.fonts`
  if (process.env.HOME && (await contientUnePolice(maison))) dossiers.push(maison)

  dossiers.push(...(await dossiersNix()))

  if (!dossiers.length) {
    etat = {
      pretes: false,
      dossiers: [],
      configuration: null,
      raison:
        "Aucun fichier de police trouvé sur le serveur. Vérifiez que nixpacks.toml est bien pris en compte (Railway › Settings › Root Directory doit pointer sur « backend »), ou déposez un .ttf dans backend/assets/fonts.",
    }
    return etat
  }

  /*
   * La configuration, écrite dans un dossier temporaire.
   *
   * `/etc/fonts` n'est pas toujours accessible en écriture, et le disque de
   * Railway est éphémère de toute façon : le fichier est refait à chaque
   * démarrage, ce qui est exactement ce qu'on veut quand l'image change.
   *
   * `<cachedir>` est indispensable : sans dossier de cache accessible en
   * écriture, fontconfig relit toutes les polices à chaque appel — quelques
   * centaines de millisecondes par publicité, pour rien.
   */
  const dossierConf = path.join(os.tmpdir(), 'dropshipper-fonts')
  const fichier = path.join(dossierConf, 'fonts.conf')
  const xml = [
    '<?xml version="1.0"?>',
    '<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">',
    '<fontconfig>',
    ...dossiers.map((d) => `  <dir>${d}</dir>`),
    `  <cachedir>${path.join(dossierConf, 'cache')}</cachedir>`,
    // Sans famille par défaut, un SVG qui demande « sans-serif » n'obtient rien
    // là où la configuration système aurait fait la correspondance.
    '  <alias><family>sans-serif</family><prefer><family>DejaVu Sans</family><family>Liberation Sans</family></prefer></alias>',
    '</fontconfig>',
  ].join('\n')

  try {
    await mkdir(path.join(dossierConf, 'cache'), { recursive: true })
    await writeFile(fichier, xml, 'utf8')
    process.env.FONTCONFIG_FILE = fichier
    etat = { pretes: true, dossiers, configuration: fichier, raison: null }
  } catch (err) {
    /*
     * Les polices existent mais on n'a pas pu le dire à fontconfig.
     *
     * On tente quand même : la configuration système les connaît peut-être
     * déjà. C'est le seul cas où l'on compose sans certitude — et il vaut mieux
     * essayer que refuser un service qui marcherait.
     */
    etat = {
      pretes: true,
      dossiers,
      configuration: null,
      raison: `Polices trouvées, mais la configuration fontconfig n'a pas pu être écrite (${
        err instanceof Error ? err.message : 'erreur inconnue'
      }). Les textes peuvent sortir en carrés.`,
    }
  }

  return etat
}

/** Remet le contrôle à zéro. Utile au banc, inutile en production. */
export function oublierPolices(): void {
  etat = null
}
