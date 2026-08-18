import { Link } from 'react-router-dom'
import { Logo } from '../components/Logo'

/**
 * Public privacy policy.
 *
 * The Chrome Web Store refuses a listing that handles user data without a policy
 * reachable at a stable public URL, so this page must stay outside <Protected>.
 * Everything stated here is what the code actually does — anything the operator
 * has to fill in is marked as such rather than invented.
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-gray-300">{children}</div>
    </section>
  )
}

export default function Privacy() {
  return (
    <div className="min-h-screen bg-app-gradient text-white">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <Link to="/">
          <Logo />
        </Link>
        <Link to="/" className="text-sm text-gray-300 hover:text-white">
          Retour à l'accueil
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-20">
        <h1 className="text-2xl font-bold">Politique de confidentialité</h1>
        <p className="mt-2 text-sm text-gray-400">
          Elle couvre le site www.drop-shipper.fr, son API, et l'extension Chrome DropShipper IA.
        </p>

        <Section title="Qui traite vos données">
          <p>
            DropShipper IA, éditeur du service, joignable à l'adresse indiquée en bas de cette page.
          </p>
        </Section>

        <Section title="Ce que le service enregistre">
          <ul className="list-inside list-disc space-y-1 text-gray-400">
            <li>
              <b className="text-gray-200">Votre compte</b> : adresse email et mot de passe, ce
              dernier n'étant jamais stocké en clair mais sous forme d'empreinte bcrypt.
            </li>
            <li>
              <b className="text-gray-200">Votre boutique</b> : nom, filigrane, et l'identifiant
              public de votre catalogue.
            </li>
            <li>
              <b className="text-gray-200">Vos annonces</b> : adresse du produit source, titre,
              description, prix, photos, variantes et catégories.
            </li>
            <li>
              <b className="text-gray-200">Vos connexions aux plateformes</b> : les jetons d'API que
              vous saisissez vous-même, utilisés uniquement pour publier vos annonces en votre nom.
            </li>
            <li>
              <b className="text-gray-200">Vos commandes</b>, si vous les enregistrez : nom et
              adresse de livraison de l'acheteur, montant, suivi.
            </li>
          </ul>
          <p>
            Aucun mouchard publicitaire, aucune mesure d'audience, aucun profilage. Un jeton de
            session est conservé dans le stockage local de votre navigateur pour vous garder connecté ;
            il n'est lu par personne d'autre.
          </p>
        </Section>

        <Section title="Ce que fait l'extension Chrome">
          <p>
            L'extension ne lit le contenu d'une page que sur les sites que vous avez explicitement
            autorisés, un par un, depuis son panneau — Chrome vous demande alors l'autorisation pour
            ce site précis, et vous pouvez la retirer à tout moment.
          </p>
          <p>
            Sur ces sites, elle lit uniquement la fiche produit affichée — titre, prix, photos,
            variantes — et l'envoie à votre catalogue DropShipper IA, avec le jeton de votre compte.
            Sur les formulaires de dépôt d'annonce (Vinted, Leboncoin, eBay, Facebook Marketplace),
            elle remplit les champs avec vos propres annonces.
          </p>
          <p>
            Elle ne lit pas votre historique de navigation, ne collecte aucune donnée sur les sites
            que vous n'avez pas autorisés, et ne clique jamais sur « Publier » à votre place : la
            validation finale vous revient toujours.
          </p>
        </Section>

        <Section title="Qui d'autre voit ces données">
          <p>Vos données ne sont ni vendues, ni louées, ni cédées. Elles transitent uniquement par :</p>
          <ul className="list-inside list-disc space-y-1 text-gray-400">
            <li>Railway, qui héberge l'API et la base de données ;</li>
            <li>Vercel, qui héberge le site ;</li>
            <li>Anthropic, dont l'IA réécrit le texte de vos annonces ;</li>
            <li>Resend, qui achemine les emails de vérification et de mot de passe oublié ;</li>
            <li>
              les plateformes que vous connectez vous-même, telles que Shopify, et uniquement pour y
              publier ce que vous demandez.
            </li>
          </ul>
        </Section>

        <Section title="Combien de temps">
          <p>
            Vos données sont conservées tant que votre compte existe. Vous pouvez supprimer une
            annonce à tout moment depuis votre espace ; la suppression efface aussi ses photos
            filigranées. Pour la suppression complète de votre compte et de tout ce qui s'y rattache,
            écrivez-nous : la demande est traitée sans condition.
          </p>
        </Section>

        <Section title="Vos droits">
          <p>
            Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, d'effacement,
            de portabilité et d'opposition. Il s'exerce par simple message à l'adresse ci-dessous,
            sans justification à fournir.
          </p>
        </Section>

        <Section title="Nous écrire">
          <p className="rounded-lg border border-white/10 bg-white/5 p-3">
            {CONTACT_EMAIL}
          </p>
        </Section>

        <p className="mt-10 text-xs text-gray-500">Dernière mise à jour : août 2026.</p>
      </main>
    </div>
  )
}

/**
 * Single place to change the published contact address. It has to be an address
 * that is really read: the Chrome Web Store review writes to it.
 */
const CONTACT_EMAIL = 'contact@drop-shipper.fr'
