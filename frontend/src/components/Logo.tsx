/**
 * La marque, dans le menu et sur les pages publiques.
 *
 * Charte du 29/09/2026 : le logo complet (cube orange→rose, « DropShipper »,
 * pastille IA) remplace l'icône + le titre en texte. Une seule image, fournie
 * par Max (docs/marque/complet.png), réduite dans public/marque/.
 *
 * L'icône est celle de l'application — le cube sur dégradé rose→violet, la même
 * que l'extension Chrome et le favicon —, et le titre « DropShipper IA » porte
 * désormais les mêmes couleurs (demandé le 10/09/2026 : « nouvelle icône
 * extension et titre gradient rose idem icône »). Le fichier vit dans /public,
 * donc l'adresse est absolue depuis la racine du site.
 */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <img
      src="/marque/dropshipper-complet.png"
      alt="DropShipper IA"
      height={Math.round(size * 1.25)}
      style={{ height: Math.round(size * 1.25), width: 'auto' }}
      className="block max-w-full"
    />
  )
}
