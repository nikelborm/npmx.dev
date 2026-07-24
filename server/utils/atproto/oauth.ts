import {
  scope,
  OAuthClient,
  type OAuthSession,
  type ClientAssertionPrivateJwk,
} from '@atcute/oauth-node-client'
import {
  LocalActorResolver,
  CompositeHandleResolver,
  CompositeDidDocumentResolver,
  PlcDidDocumentResolver,
  WebDidDocumentResolver,
  DohJsonHandleResolver,
} from '@atcute/identity-resolver'
import { NodeDnsHandleResolver } from '@atcute/identity-resolver-node'
import type { Agent } from '@atproto/lex'
import type { EventHandlerRequest, H3Event, SessionManager } from 'h3'
import { getOAuthLock } from '#server/utils/atproto/lock'
import { useOAuthStorage } from '#server/utils/atproto/storage'
import type { UserServerSession } from '#shared/types/userSession'
// @ts-expect-error virtual file from oauth module
import { clientUri } from '#oauth/config'
import * as dev from '#shared/types/lexicons/dev'

const SCOPES = [
  scope.repo({
    collection: [dev.npmx.feed.like.$nsid, dev.npmx.actor.profile.$nsid],
    action: ['create', 'update', 'delete'],
  }),
]

/**
 * Creates an @atproto/lex-compatible Agent from an atcute OAuthSession.
 * Required for compatibility while @atproto/lex is still in use.
 */
export function sessionAsAgent(session: OAuthSession): Agent {
  return {
    did: session.did,
    fetchHandler: (path, init) => session.handle(path, init),
  }
}

type EventHandlerWithOAuthSession<T extends EventHandlerRequest, D> = (
  event: H3Event<T>,
  session: OAuthSession | undefined,
  serverSession: SessionManager,
) => Promise<D>

export async function getNodeOAuthClient(): Promise<OAuthClient> {
  const { sessions, states } = useOAuthStorage()
  const keyset = await loadJWKs()
  const stores = { sessions, states }
  const requestLock = getOAuthLock()
  const redirectUri = new URL('/api/auth/atproto', clientUri).toString()

  const actorResolver = new LocalActorResolver({
    handleResolver: new CompositeHandleResolver({
      strategy: 'race',
      methods: {
        dns: new NodeDnsHandleResolver(),
        http: new DohJsonHandleResolver({ dohUrl: 'https://cloudflare-dns.com/dns-query' }),
      },
    }),
    didDocumentResolver: new CompositeDidDocumentResolver({
      methods: {
        plc: new PlcDidDocumentResolver(),
        web: new WebDidDocumentResolver(),
      },
    }),
  })

  if (keyset) {
    return new OAuthClient({
      metadata: {
        client_id: `${clientUri}/oauth-client-metadata.json`,
        redirect_uris: [redirectUri],
        client_name: 'npmx.dev',
        client_uri: clientUri,
        logo_uri: `${clientUri}/logo-icon.svg`,
        jwks_uri: `${clientUri}/.well-known/jwks.json`,
        scope: SCOPES,
      },
      keyset,
      stores,
      requestLock,
      actorResolver,
    })
  }

  return new OAuthClient({
    metadata: {
      redirect_uris: [redirectUri],
      scope: SCOPES,
    },
    stores,
    requestLock,
    actorResolver,
  })
}

export async function loadJWKs(): Promise<ClientAssertionPrivateJwk[] | undefined> {
  // If we ever need to add multiple JWKs to rotate keys we will need to add a new one
  // under a new variable and update here
  const jwkOne = useRuntimeConfig().oauthJwkOne

  // nuxt auto parses the string as JSON, but we don't know that in the types
  return jwkOne ? [jwkOne as unknown as ClientAssertionPrivateJwk] : undefined
}

async function getOAuthSession(event: H3Event): Promise<{
  oauthSession: OAuthSession | undefined
  serverSession: SessionManager<UserServerSession>
}> {
  const serverSession = await useServerSession(event)

  try {
    const currentSession = serverSession.data
    // TODO (jg): why can a session be `{}`?
    if (!currentSession || !currentSession.public?.did) {
      return { oauthSession: undefined, serverSession }
    }

    const oauthSession = await event.context.oauthClient.restore(currentSession.public.did)
    return { oauthSession, serverSession }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      '[oauth] Failed to get session:',
      error instanceof Error ? error.message : 'Unknown error',
    )
    return { oauthSession: undefined, serverSession }
  }
}

/**
 * Throws if the logged in OAuth Session does not have the required scopes.
 * As we add new scopes we need to check if the client has the ability to use it.
 * If not need to let the client know to redirect the user to the PDS to upgrade their scopes.
 *
 * @todo should do a more thorough check by parsing scopes
 *
 * @param oAuthSession - The current OAuth session from the event
 * @param requiredScopes - The required scope you are checking if you can use
 */
export async function throwOnMissingOAuthScope(oAuthSession: OAuthSession, requiredScopes: string) {
  const tokenInfo = await oAuthSession.getTokenInfo()
  if (!tokenInfo.scope.includes(requiredScopes)) {
    throw createError({
      status: 403,
      message: ERROR_NEED_REAUTH,
    })
  }
}

export function eventHandlerWithOAuthSession<T extends EventHandlerRequest, D>(
  handler: EventHandlerWithOAuthSession<T, D>,
) {
  return defineEventHandler(async event => {
    const { oauthSession, serverSession } = await getOAuthSession(event)
    const publicData = serverSession.data.public
    // User was authenticated at one point, but was not able to restore
    // the session to the PDS
    if (!oauthSession && publicData) {
      // cleans up our server side session store
      await serverSession.clear()
      throw createError({
        status: 401,
        message: 'User needs to re authenticate',
      })
    }

    return await handler(event, oauthSession, serverSession)
  })
}
