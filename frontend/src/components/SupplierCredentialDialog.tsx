import { useEffect, useState } from 'react'
import { Check, ExternalLink, Package, RefreshCw, ShoppingCart, Truck } from 'lucide-react'
import { api } from '../lib/api'
import { PROPS_SANS_REMPLISSAGE, nomSansRemplissage } from '../lib/champSecret'

/**
 * La saisie des identifiants d'un fournisseur.
 *
 * Sortie de la page « API Sourcing Connect », qui n'existe plus : les
 * fournisseurs tiennent désormais dans un seul écran, où chaque fiche porte à la
 * fois ce que le fournisseur vend et comment on s'y relie.
 */
type Supplier = Awaited<ReturnType<typeof api.listSuppliers>>[number]
type Lien = Awaited<ReturnType<typeof api.listSupplierLinks>>[number]

/**
 * Les champs que l'autorisation remplit à la place du vendeur.
 *
 * Écrits ici et pas devinés : « tout champ secret » en aurait aussi masqué
 * l'App Secret, que le vendeur DOIT saisir. Ce sont les deux jetons, nommément.
 */
const JETONS_AUTORISES = new Set(['accessToken', 'refreshToken'])

const CAPACITES = [
  { cle: 'lectureCatalogue' as const, icone: Package, titre: 'Lire le catalogue' },
  { cle: 'stockTempsReel' as const, icone: RefreshCw, titre: 'Stock et prix en direct' },
  { cle: 'commande' as const, icone: ShoppingCart, titre: 'Commander depuis ici' },
  { cle: 'suivi' as const, icone: Truck, titre: 'Numéro de suivi' },
]

/**
 * Le corps du raccordement, sans cadre.
 *
 * Il vivait dans une fenêtre modale. Le dépliage sur place le rend plus simple à
 * lire : le vendeur garde la fiche du fournisseur sous les yeux — ce qu'il vend,
 * ses mises en garde — pendant qu'il colle sa clé. Une fenêtre les lui cachait
 * au moment précis où il en avait besoin.
 */
export function FormulaireFournisseur({
  supplier,
  lien,
  onSaved,
}: {
  supplier: Supplier
  lien: Lien | undefined
  onSaved: () => void
}) {
  const api_ = supplier.api!
  const [valeurs, setValeurs] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /*
   * L'adresse de rappel attendue par le fournisseur.
   *
   * Demandée au serveur plutôt que recomposée ici : elle dépend de
   * PUBLIC_API_URL, que seul le serveur connaît, et une adresse approximative
   * affichée au vendeur serait pire qu'aucune — il la recopierait.
   */
  const [retourAttendu, setRetourAttendu] = useState('')
  useEffect(() => {
    if (!supplier.api?.autorisation) return
    api
      .aliexpressAuthorizeUrl()
      .then((r) => setRetourAttendu(r.retour))
      // Un refus ici est normal (clés pas encore saisies) : le bloc se tait.
      .catch(() => undefined)
  }, [supplier.id])

  async function enregistrer() {
    setBusy(true)
    setError(null)
    try {
      const r = await api.saveSupplierLink(supplier.id, valeurs)
      /*
       * Le refus du fournisseur s'affiche ICI, au moment de la saisie.
       *
       * Les identifiants sont enregistrés quand même — les resaisir à chaque
       * essai serait pénible, et certains refus sont temporaires. Mais la
       * liaison n'est PAS déclarée reliée, et le vendeur lit le refus mot pour
       * mot : « Invalid Token » dit quoi corriger, « échec » ne dit rien.
       */
      if (r?.refus) setError(r.refus)
      onSaved()
          } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible')
    } finally {
      setBusy(false)
    }
  }

  async function detacher() {
    if (!window.confirm(`Détacher ${supplier.label} ? Les identifiants seront effacés.`)) return
    setBusy(true)
    try {
      await api.deleteSupplierLink(supplier.id)
      onSaved()
          } finally {
      setBusy(false)
    }
  }

  return (
    <>
        {/*
          L'avertissement ne s'affiche QUE là où il est vrai.

          Il s'affichait sur tous les fournisseurs, y compris ceux dont le
          connecteur tourne depuis des mois. Un vendeur qui venait de brancher
          AliExpress lisait donc, juste sous les quatre capacités cochées en
          vert, que ça ne servait à rien. Signalé le 15/09/2026 : « quelle est
          donc cette supercherie ? ». Il avait raison — c'en était une.
        */}
        {supplier.connecteurEcrit ? (
          <p className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-xs leading-relaxed text-emerald-100">
            Ce raccordement est <b>actif</b> : une fois relié, {supplier.label} alimente vos fiches —
            catalogue, prix et stock à jour, commandes déposées depuis ici et numéros de suivi
            remontés automatiquement.
          </p>
        ) : (
          <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100">
            Ce raccordement sera <b>conservé, rien de plus</b>. Le connecteur qui lira le catalogue,
            passera les commandes et remontera le suivi n'est pas encore écrit pour {supplier.label}.
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          {CAPACITES.map((c) => (
            <div
              key={c.cle}
              className={
                api_[c.cle]
                  ? 'flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-2 text-xs text-emerald-200'
                  : 'flex items-center gap-2 rounded-lg border border-white/10 px-2.5 py-2 text-xs text-gray-500'
              }
            >
              <c.icone size={12} className="shrink-0" />
              <span>{c.titre}</span>
              {api_[c.cle] ? <Check size={11} className="ml-auto shrink-0" /> : null}
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-gray-400">
          <b>Ce qu'il faut :</b> {api_.exige}
        </p>
        <a
          href={api_.console}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-1 inline-flex items-center gap-1 text-xs text-purple-300 underline hover:text-purple-200"
        >
          <span>Ouvrir la console développeur</span>
          <ExternalLink size={11} />
        </a>

        {/*
          Un champ qu'on ne peut pas remplir ne s'affiche pas.

          Chez un fournisseur qui délivre son jeton par autorisation, les deux
          champs de jeton n'ont AUCUNE valeur que le vendeur puisse y mettre :
          sa console ne les affiche nulle part. Les laisser visibles, même
          marqués « facultatif », faisait chercher — et c'est ce qu'a signalé
          Max le 15/09/2026. Ils sortent du formulaire ; le bouton
          d'autorisation les remplit.
        */}
        <div className="mt-4 space-y-3">
          {api_.champs
            .filter((champ) => !(api_.autorisation && JETONS_AUTORISES.has(champ.cle)))
            .map((champ) => (
            <label key={champ.cle} className="block">
              <span className="text-xs text-gray-400">
                {lien?.champs.includes(champ.cle) && champ.secret
                  ? `${champ.label} (laissez vide pour garder l'actuel)`
                  : champ.optionnel
                    ? `${champ.label} (facultatif)`
                    : champ.label}
              </span>
              <input
                type={champ.secret ? 'password' : 'text'}
                /* Voir lib/champSecret.ts : Chrome versait l'e-mail et le mot
                   de passe du vendeur dans App Key / App Secret. */
                {...PROPS_SANS_REMPLISSAGE}
                name={nomSansRemplissage(champ.cle)}
                value={valeurs[champ.cle] ?? ''}
                onChange={(e) => setValeurs((v) => ({ ...v, [champ.cle]: e.target.value }))}
                placeholder={lien?.champs.includes(champ.cle) ? '••••••••' : ''}
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm outline-none focus:border-purple-400/70"
              />
            </label>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-gray-600">
          Rien n'est réaffiché une fois enregistré : le serveur ne renvoie que le nom des champs
          remplis.
        </p>

        {/*
          AliExpress : le jeton ne se colle pas, il s'autorise.
          Sa console ne l'affiche nulle part — le protocole est OAuth, le jeton
          d'accès vit UN JOUR et son jeton de rafraîchissement deux. Saisi à la
          main, le raccordement mourait dans la nuit. Ce bouton fait le seul
          geste qui donne un jeton renouvelable ; les deux champs au-dessus
          restent utiles pour qui possède déjà le couple.
        */}
        {api_.autorisation ? (
          <div className="mt-4 rounded-xl border border-purple-400/25 bg-purple-500/10 p-3">
            <p className="text-xs leading-relaxed text-purple-100">
              <b>Le jeton d'accès ne se recopie pas.</b> {supplier.label} ne l'affiche nulle part :
              il dure <b>un jour</b> et se renouvelle tout seul, à condition d'avoir été obtenu par
              autorisation. Remplissez seulement <b>App Key</b> et <b>App Secret</b>, laissez les
              deux champs de jeton vides, et cliquez ci-dessous : vos clés sont enregistrées au
              passage, puis {supplier.label} vous demande d'approuver. Vous n'aurez plus à y revenir.
            </p>
            {/*
              L'adresse de rappel, affichée noir sur blanc.

              Refus constaté le 15/09/2026 : « L'URL de redirection ne
              correspond pas à l'URL de rappel de l'application ». AliExpress
              compare la nôtre à celle déclarée dans la console du vendeur, au
              caractère près, et son message ne dit pas laquelle il attendait.
              Sans cette ligne, le vendeur n'a aucun moyen de savoir quoi
              recopier — et c'est le seul réglage qui lui reste à faire.
            */}
            {retourAttendu ? (
              <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-2.5">
                <p className="text-[11px] text-gray-400">
                  Dans votre console {supplier.label}, le champ <b>Callback URL</b> doit valoir
                  exactement :
                </p>
                <code className="mt-1 block break-all text-[11px] text-emerald-300">{retourAttendu}</code>
              </div>
            ) : null}

            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setError('')
                setBusy(true)
                try {
                  /*
                   * Enregistrer AVANT de partir, et sans que le vendeur ait à y
                   * penser.
                   *
                   * Signalé le 15/09/2026, et c'était une impasse parfaite :
                   * « Autoriser » répondait « enregistrez d'abord votre App Key »
                   * — parce qu'elle n'était encore que dans le champ, jamais
                   * envoyée — et « Relier » répondait « il manque le jeton ».
                   * Deux boutons qui se renvoyaient l'un à l'autre, et aucun
                   * moyen de sortir.
                   *
                   * Le vendeur n'a pas à connaître cet ordre : ce qu'il a tapé
                   * part d'abord, l'autorisation suit.
                   */
                  if (Object.values(valeurs).some((v) => v.trim())) {
                    await api.saveSupplierLink(supplier.id, valeurs)
                    onSaved()
                  }
                  const { url } = await api.aliexpressAuthorizeUrl()
                  window.location.href = url
                } catch (e) {
                  setError(e instanceof Error ? e.message : "L'autorisation n'a pas pu être lancée")
                } finally {
                  setBusy(false)
                }
              }}
              className="btn-gradient mt-3 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              Autoriser sur {supplier.label}
            </button>
          </div>
        ) : null}

        {error ? <p className="mt-3 text-xs text-red-400">{error}</p> : null}

        <div className="mt-5 flex justify-between gap-2">
          {lien?.connected ? (
            <button
              type="button"
              onClick={detacher}
              disabled={busy}
              className="rounded-lg border border-white/10 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10"
            >
              Détacher
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={enregistrer}
            disabled={busy}
            className="btn-gradient rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
          >
            {busy ? 'Enregistrement…' : 'Relier'}
          </button>
        </div>
    </>
  )
}
