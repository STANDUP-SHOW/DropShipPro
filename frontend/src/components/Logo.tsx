/**
 * La marque, dans le menu et sur les pages publiques.
 *
 * L'icône est celle de l'application — le cube sur dégradé rose→violet, la même
 * que l'extension Chrome et le favicon —, et le titre « DropShipper IA » porte
 * désormais les mêmes couleurs (demandé le 10/09/2026 : « nouvelle icône
 * extension et titre gradient rose idem icône »). Le fichier vit dans /public,
 * donc l'adresse est absolue depuis la racine du site.
 */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2 font-extrabold" style={{ fontSize: size * 0.7 }}>
      <img
        src="/favicon-128.png"
        width={size}
        height={size}
        alt=""
        aria-hidden
        className="rounded-[26%] shadow-[0_0_12px_rgba(192,38,211,0.45)]"
        style={{ width: size, height: size }}
      />
      <span className="text-gradient-rose">DropShipper IA</span>
    </div>
  )
}
