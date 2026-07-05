import { generateClientAssertionKey } from '@atcute/oauth-node-client'

async function run() {
  const kid = Date.now().toString()
  const jwk = await generateClientAssertionKey(kid, 'ES256')

  console.log(JSON.stringify(jwk))
}

await run()
