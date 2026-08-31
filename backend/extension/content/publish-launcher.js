/**
 * Le bouton « Publier avec DropShipper IA », posé sur les formulaires de dépôt.
 *
 * Il n'ouvre plus de panneau dans la page. Un panneau injecté disparaît au
 * premier changement d'écran, et un dépôt Leboncoin en fait quatre : le vendeur
 * choisissait son annonce, passait à l'étape suivante, et tout avait disparu.
 *
 * Le panneau latéral de Chrome vit **à côté** de l'onglet, survit à la
 * navigation, et laisse voir l'annonce et le formulaire en même temps.
 */
;(() => {
  const HOTES = [
    ['vinted', 'VINTED'],
    ['leboncoin', 'LEBONCOIN'],
    ['ebay', 'EBAY'],
    ['amazon', 'AMAZON'],
    ['facebook', 'FACEBOOK'],
    ['cdiscount', 'CDISCOUNT'],
    ['tiktokglobalshop', 'TIKTOK_SHOP'],
    ['merchants.google', 'GOOGLE_SHOPPING'],
  ]
  const PLATEFORME = HOTES.find(([hote]) => location.hostname.includes(hote))?.[1] ?? null

  function monter() {
    if (!PLATEFORME || document.getElementById('dsp-publish-btn')) return

    const bouton = document.createElement('button')
    bouton.id = 'dsp-publish-btn'
    bouton.type = 'button'
    bouton.textContent = '⚡ Publier avec DropShipper IA'
    Object.assign(bouton.style, {
      position: 'fixed',
      right: '20px',
      bottom: '20px',
      zIndex: '2147483646',
      padding: '12px 18px',
      border: '0',
      borderRadius: '10px',
      font: '600 14px system-ui, sans-serif',
      color: '#fff',
      background: 'linear-gradient(90deg, #a855f7, #ec4899)',
      boxShadow: '0 8px 24px rgba(0,0,0,.35)',
      cursor: 'pointer',
    })

    bouton.addEventListener('click', () => {
      // Envoyé sans attendre : Chrome n'accepte l'ouverture du panneau que dans
      // la foulée immédiate du clic, et un `await` intercalé la ferait refuser.
      chrome.runtime.sendMessage({ type: 'dsp-open-panel' })
    })

    document.body.appendChild(bouton)
  }

  monter()
  new MutationObserver(monter).observe(document.documentElement, { childList: true, subtree: true })
})()
