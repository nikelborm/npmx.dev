export default defineEventHandler(event => {
  return event.context.oauthClient.metadata
})
