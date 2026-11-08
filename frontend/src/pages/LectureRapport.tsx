import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, PackageSearch } from 'lucide-react'
import { Layout } from '../components/Layout'
import './lecture-rapport.css'

/**
 * A Fresh Market News article read from the connected space (Max, 08/11/2026:
 * « ces pages doivent comporter les menus, pas de bouton mon compte, juste
 * bouton retour »). /lecture/fresh-market-news/<…>/ fetches the public page
 * the API writes for search engines (same origin, Vercel rewrite) and shows
 * its article inside the site's shell and charter. The public page itself
 * stays as it is for visitors and crawlers; a signed-in browser landing on it
 * is sent here.
 */
const PUBLIC = /^\/fresh-market-news(?:\/|$)/

interface Article {
  titre: string
  html: string
  jour: string | null
}

function extraire(source: string): Article | null {
  const doc = new DOMParser().parseFromString(source, 'text/html')
  const main = doc.querySelector('main')
  if (!main) return null
  // Visitor-only pieces: the sign-up call, the members-only notices, any script.
  main.querySelectorAll('script, style, .end, .garde, .bandeau-connecte').forEach((n) => n.remove())
  main.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') ?? ''
    if (PUBLIC.test(href)) a.setAttribute('href', `/lecture${href}`)
    else if (/^https?:/.test(href)) {
      a.setAttribute('target', '_blank')
      a.setAttribute('rel', 'noreferrer')
    }
  })
  main.querySelectorAll('table').forEach((t) => {
    if (!t.parentElement?.classList.contains('tableau')) {
      const cadre = doc.createElement('div')
      cadre.className = 'tableau'
      t.replaceWith(cadre)
      cadre.appendChild(t)
    }
  })
  const publie = doc.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ?? ''
  return {
    titre: doc.querySelector('h1')?.textContent?.trim() || doc.title,
    html: main.innerHTML,
    jour: /^\d{4}-\d{2}-\d{2}/.test(publie) ? publie.slice(0, 10) : null,
  }
}

export default function LectureRapport() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const adresse = pathname.replace(/^\/lecture/, '') || '/fresh-market-news/'
  const [article, setArticle] = useState<Article | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const corps = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!PUBLIC.test(adresse)) {
      setErreur("Cette page n'est pas un article Fresh Market News.")
      return
    }
    let fini = false
    setArticle(null)
    setErreur(null)
    fetch(adresse.endsWith('/') ? adresse : `${adresse}/`, { headers: { Accept: 'text/html' } })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "Cet article n'existe plus." : `Article indisponible (${r.status}).`)
        const a = extraire(await r.text())
        if (!a) throw new Error('Article illisible.')
        if (!fini) {
          setArticle(a)
          document.title = `${a.titre} · DropShipper`
          window.scrollTo({ top: 0 })
        }
      })
      .catch((e: Error) => !fini && setErreur(e.message))
    return () => {
      fini = true
    }
  }, [adresse])

  // Links inside the article stay in the app.
  function clic(e: React.MouseEvent<HTMLDivElement>) {
    const a = (e.target as HTMLElement).closest('a')
    const href = a?.getAttribute('href') ?? ''
    if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey) return
    if (href.startsWith('/lecture/') || (href.startsWith('/') && !href.startsWith('//') && !/\.\w+$/.test(href))) {
      e.preventDefault()
      navigate(href)
    }
  }

  function retour() {
    if (window.history.length > 1) navigate(-1)
    else navigate('/fresh-news')
  }

  const segments = adresse.split('/').filter(Boolean)
  const categorie = segments.length >= 4 && !/^\d{4}-/.test(segments[1]) ? segments[1] : null
  const edition = categorie ? `/fresh-news?categorie=${encodeURIComponent(categorie)}${article?.jour ? `&jour=${article.jour}` : ''}` : null

  return (
    <Layout>
      <div className="lecture">
        <div className="lecture-barre">
          <button type="button" className="lecture-retour" onClick={retour}>
            <ArrowLeft size={16} /> Retour
          </button>
          {edition ? (
            <Link to={edition} className="lecture-produits">
              <PackageSearch size={15} /> Produits à importer
            </Link>
          ) : null}
        </div>
        {erreur ? (
          <p className="lecture-erreur">{erreur}</p>
        ) : !article ? (
          <p className="lecture-attente">
            <Loader2 size={15} className="animate-spin" /> L'article arrive…
          </p>
        ) : (
          <article ref={corps} className="lecture-article" onClick={clic} dangerouslySetInnerHTML={{ __html: article.html }} />
        )}
      </div>
    </Layout>
  )
}
