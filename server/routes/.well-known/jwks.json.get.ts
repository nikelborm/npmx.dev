export default defineEventHandler(event => {
  const jwks = event.context.oauthClient.jwks
  if (!jwks) {
    console.error('JWKS not configured (running as public client)')
    return { keys: [] }
  }
  return jwks
})
