/**
 * Fails fast, and in French, when the service has no database address.
 *
 * Without this the first thing to complain is the Prisma CLI, with a schema
 * validation error pointing at line 7 of schema.prisma — which reads like a code
 * problem when it is a missing variable on the service.
 */
const REQUIRED = ['DATABASE_URL']

const missing = REQUIRED.filter((name) => !process.env[name])

if (missing.length) {
  console.error('')
  console.error('=========================================================')
  console.error(` Variable(s) absente(s) sur ce service : ${missing.join(', ')}`)
  console.error('')
  console.error(" Ce n'est pas une erreur du code. Le service Railway n'a pas")
  console.error(' la variable dans son onglet Variables, pour cet environnement.')
  console.error('')
  console.error(" S'il s'agit d'un service en double, supprimez-le : il redemarre")
  console.error(' en boucle et consomme des ressources sans rien servir.')
  console.error('=========================================================')
  console.error('')
  process.exit(1)
}
