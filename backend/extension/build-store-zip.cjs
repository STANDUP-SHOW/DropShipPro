/**
 * Builds the package to upload to the Chrome Web Store.
 *
 * The folder itself stays as it is, because it doubles as the development build
 * loaded unpacked: what the store must not see is stripped here instead.
 *
 *   cd backend && node extension/build-store-zip.cjs
 */
const fs = require('fs')
const path = require('path')
const archiver = require('archiver')

const DIR = path.resolve(__dirname)
const OUT = path.resolve(__dirname, '..', 'extension-store.zip')

/**
 * Host permissions removed from the published manifest.
 *
 * localhost only makes sense on a developer machine, and reviewers read it as an
 * unexplained request. Temu, JoyBuy and AliExpress are redundant: the capture
 * button is registered per site once the user approves it from the popup, through
 * optional_host_permissions — asking for them up front makes the install prompt
 * far scarier than what the extension actually does at that point.
 */
const DROPPED_HOSTS = [
  'http://localhost:4000/*',
  'http://localhost:5173/*',
  'https://*.temu.com/*',
  'https://*.joybuy.com/*',
  'https://*.aliexpress.com/*',
]

function storeManifest() {
  const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'))

  manifest.host_permissions = manifest.host_permissions.filter((h) => !DROPPED_HOSTS.includes(h))
  manifest.content_scripts = manifest.content_scripts.map((script) => ({
    ...script,
    matches: script.matches.filter((m) => !m.includes('localhost')),
  }))
  manifest.homepage_url = 'https://www.drop-shipper.fr'

  return manifest
}

async function main() {
  const manifest = storeManifest()
  const archive = archiver('zip', { zlib: { level: 9 } })
  const out = fs.createWriteStream(OUT)
  archive.pipe(out)

  // Everything but the manifest and this script, then the rewritten manifest.
  archive.glob('**/*', {
    cwd: DIR,
    ignore: ['manifest.json', 'build-store-zip.cjs', 'check.cjs', 'README.md'],
  })
  archive.append(JSON.stringify(manifest, null, 2) + '\n', { name: 'manifest.json' })
  await archive.finalize()

  await new Promise((resolve) => out.on('close', resolve))
  console.log(`${OUT}`)
  console.log(`version ${manifest.version}, ${(fs.statSync(OUT).size / 1024).toFixed(0)} Ko`)
  console.log(`permissions d'hotes publiees : ${manifest.host_permissions.length}`)
  for (const h of manifest.host_permissions) console.log(`  ${h}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
