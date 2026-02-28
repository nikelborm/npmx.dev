// @unocss-include
import type { MaybeRefOrGetter } from 'vue'
import type {
  CommandPaletteContextCommandInput,
  CommandPalettePackageContext,
} from '~/types/command-palette'

interface EntrypointContext {
  packageContext: CommandPalettePackageContext
  entrypoints: string[]
  currentEntrypoint: string | null
}

function getEntrypointLabel(entrypoint: string): string {
  return entrypoint === '.' ? '.' : `./${entrypoint}`
}

export function useCommandPaletteEntrypointCommands(
  context: MaybeRefOrGetter<EntrypointContext | null>,
) {
  const { t } = useI18n()

  useCommandPaletteContextCommands(
    computed((): CommandPaletteContextCommandInput[] => {
      const ctx = toValue(context)
      if (!ctx?.packageContext.resolvedVersion) return []
      if (ctx.entrypoints.length === 0) return []

      return ctx.entrypoints.map(entrypoint => ({
        id: `entrypoint:${entrypoint}`,
        group: 'entrypoints' as const,
        label: t('command_palette.entrypoint.label', {
          entrypoint: getEntrypointLabel(entrypoint),
        }),
        keywords: [
          ctx.packageContext.packageName,
          entrypoint,
          getEntrypointLabel(entrypoint),
          t('command_palette.groups.entrypoints'),
        ],
        iconClass: 'i-lucide:package',
        active: entrypoint === ctx.currentEntrypoint,
        to: docsRoute(
          ctx.packageContext.packageName,
          ctx.packageContext.resolvedVersion!,
          entrypoint,
        ),
      }))
    }),
  )
}
