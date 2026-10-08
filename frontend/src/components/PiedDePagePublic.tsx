import donnees from '../data/pied-de-page.json'

/**
 * Le pied de page des écrans publics React (avis, confidentialité, API Power,
 * newsletter). Même table que les pages statiques (scripts/pied-de-page.cjs) :
 * src/data/pied-de-page.json.
 *
 * Des <a> et non des <Link> : /fonctions/ et /outils/ sont des pages statiques
 * écrites au build, que le routeur React ne connaît pas.
 */
type Lien = { href: string; label: string; badge?: string }

export default function PiedDePagePublic() {
  const colonnes = (donnees.colonnes as Array<{ titre: string; liens: Lien[] }>).filter((c) => c.liens.length > 0)
  return (
    <footer className="mt-16 border-t border-white/10">
      <nav aria-label="Pied de page" className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-6 py-10 sm:grid-cols-3 lg:grid-cols-5">
        {colonnes.map((c) => (
          <div key={c.titre}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-300">{c.titre}</h2>
            <ul className="space-y-2 text-sm">
              {c.liens.map((l) => {
                const externe = /^https?:/.test(l.href)
                return (
                  <li key={l.href}>
                    <a
                      href={l.href}
                      className="text-gray-400 hover:text-white"
                      {...(externe ? { target: '_blank', rel: 'noopener' } : {})}
                    >
                      {l.label}
                    </a>
                    {l.badge ? (
                      <span className="btn-gradient ml-1.5 rounded-full px-1.5 py-0.5 align-middle text-[10px] font-bold text-white">
                        {l.badge}
                      </span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
      <p className="mx-auto max-w-5xl border-t border-white/5 px-6 py-5 text-xs text-gray-500">
        <a href="/" className="hover:text-white">DropShipper IA</a> — logiciel français de dropshipping par IA. Sans abonnement, 1 drop = 0,01 €.
      </p>
    </footer>
  )
}
