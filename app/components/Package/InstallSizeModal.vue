<script setup lang="ts">
import {
  VueUiTreemap,
  type VueUiTreemapConfig,
  type VueUiTreemapDatasetItem,
} from 'vue-data-ui/vue-ui-treemap'
import { getPalette } from 'vue-data-ui/utils'
import { useColors } from '~/composables/useColors'
import { OKLCH_NEUTRAL_FALLBACK } from '~/utils/colors'
import { applyEllipsis, sanitise } from '~/utils/charts'
import { downloadFileLink } from '~/utils/download'

import('vue-data-ui/style.css')

const props = defineProps<{
  installSize: InstallSizeResult | null | undefined
  packageName: string
}>()

const TOP_DEPENDENCIES = 12

const colorMode = useColorMode()
const rootEl = shallowRef<HTMLElement | null>(null)

const { colors } = useColors(rootEl)
const { accentColors, selectedAccentColor } = useAccentColor()
const bytesFormatter = useBytesFormatter()
const numberFormatter = useNumberFormatter()

const palette = getPalette('')

const chartKey = shallowRef(0)
function onModalOpened() {
  chartKey.value++
}

onMounted(() => {
  rootEl.value = document.documentElement
})

const isDarkMode = computed(() => colorMode.value === 'dark')

const accentColorValueById = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {}
  for (const item of accentColors.value) {
    map[item.id] = item.value
  }
  return map
})

const accent = computed(() => {
  const id = selectedAccentColor.value
  return id
    ? (accentColorValueById.value[id] ?? colors.value.fgSubtle ?? OKLCH_NEUTRAL_FALLBACK)
    : (colors.value.fgSubtle ?? OKLCH_NEUTRAL_FALLBACK)
})

interface SizeSlice {
  name: string
  value: number
  /** Present only on the "other" bucket, so that cell is the only zoomable one */
  children?: SizeSlice[]
}

const slices = computed<SizeSlice[]>(() => {
  const data = props.installSize
  if (!data) return []

  const result: SizeSlice[] = [
    {
      name: $t('package.stats.install_size_distribution.self', { package: props.packageName }),
      value: data.selfSize,
    },
  ]

  const top = data.dependencies.slice(0, TOP_DEPENDENCIES)
  for (const dep of top) {
    result.push({ name: dep.name, value: dep.size })
  }

  const rest = data.dependencies.slice(TOP_DEPENDENCIES)
  if (rest.length) {
    const restSize = rest.reduce((sum, dep) => sum + dep.size, 0)
    result.push({
      name: $t('package.stats.install_size_distribution.other', { count: rest.length }),
      value: restSize,
      children: rest.map(dep => ({ name: dep.name, value: dep.size })),
    })
  }

  return result
})

const dataset = computed<VueUiTreemapDatasetItem[]>(() =>
  slices.value.map((slice, index) => {
    // The package itself is highlighted with the accent colour; dependencies cycle the palette.
    const node: VueUiTreemapDatasetItem = {
      name: applyEllipsis(slice.name, 28),
      value: slice.value,
      color: index === 0 ? accent.value : palette[(index - 1) % palette.length],
    }
    if (slice.children?.length) {
      node.children = slice.children.map((child, childIndex) => ({
        name: applyEllipsis(child.name, 28),
        value: child.value,
        color: palette[childIndex % palette.length],
      }))
    }
    return node
  }),
)

function shareOfTotal(value: number): string {
  const total = props.installSize?.totalSize ?? 0
  if (total <= 0) return ''
  return `${((value / total) * 100).toFixed(1)}%`
}

function buildExportFilename(extension: string): string {
  return `${sanitise(applyEllipsis(props.packageName, 32) ?? '')}_install_size.${extension}`
}

const config = computed<VueUiTreemapConfig>(() => {
  return {
    theme: isDarkMode.value ? 'dark' : '',
    a11y: {
      translations: {
        keyboardNavigation: $t('package.trends.chart_assistive_text.keyboard_navigation_vertical'),
        tableAvailable: $t('package.trends.chart_assistive_text.table_available'),
        tableCaption: $t('package.trends.chart_assistive_text.table_caption'),
      },
    },
    userOptions: {
      buttons: {
        tooltip: false,
        pdf: false,
        fullscreen: false,
        sort: false,
        annotator: false,
        table: false,
        csv: false,
        labels: false,
      },
      buttonTitles: {
        img: $t('package.trends.download_file', { fileType: 'PNG' }),
        svg: $t('package.trends.download_file', { fileType: 'SVG' }),
      },
      callbacks: {
        img: args => {
          const imageUri = args?.imageUri
          if (!imageUri) return
          downloadFileLink(imageUri, buildExportFilename('png'))
        },
        svg: args => {
          const blob = args?.blob
          if (!blob) return
          const url = URL.createObjectURL(blob)
          downloadFileLink(url, buildExportFilename('svg'))
          URL.revokeObjectURL(url)
        },
      },
      useCursorPointer: true,
    },
    style: {
      chart: {
        backgroundColor: colors.value.bg,
        color: colors.value.fg,
        height: 420,
        layout: {
          sorted: true,
          rects: {
            stroke: colors.value.bg,
            strokeWidth: 2,
            borderRadius: 4,
            gradient: { show: true, intensity: 18 },
          },
          labels: {
            showDefaultLabels: true,
            fontSize: 16,
            minFontSize: 9,
            hideUnderProportion: 0.015,
            formatter: ({ value }) => bytesFormatter.format(value),
            name: { show: true, bold: true },
            value: { show: true, bold: false },
          },
        },
        title: { text: '' },
        legend: { show: false },
        tooltip: {
          show: true,
          teleportTo: '#install-size-modal',
          borderColor: 'transparent',
          backdropFilter: false,
          backgroundColor: 'transparent',
          customFormat: ({ datapoint }) => {
            const name = datapoint?.name ?? ''
            const value = datapoint?.value ?? 0
            return `
            <div class="font-mono p-3 border border-border rounded-md bg-[var(--bg)]/10 backdrop-blur-md">
              <div class="grid grid-cols-[12px_minmax(0,1fr)_max-content] items-center gap-x-3">
                <div class="w-3 h-3">
                  <svg viewBox="0 0 20 20" class="w-full h-full" aria-hidden="true">
                    <rect x="0" y="0" width="20" height="20" rx="3" fill="${datapoint?.color ?? 'transparent'}" />
                  </svg>
                </div>
                <span class="text-3xs uppercase tracking-wide text-[var(--fg)]/70 truncate">
                  ${name}
                </span>
                <span class="text-base text-[var(--fg)] font-mono tabular-nums text-end">
                  ${bytesFormatter.format(value)} &middot; ${shareOfTotal(value)}
                </span>
              </div>
            </div>
          `
          },
        },
      },
    },
  }
})

const subtitle = computed(() => {
  const data = props.installSize
  if (!data) return ''
  return $t('package.stats.install_size_distribution.subtitle', {
    size: bytesFormatter.format(data.totalSize),
    count: numberFormatter.value.format(data.dependencyCount),
  })
})
</script>

<template>
  <Modal
    :modal-title="$t('package.stats.install_size_distribution.title')"
    :modal-subtitle="subtitle"
    id="install-size-modal"
    class="sm:max-w-2xl"
    @transitioned="onModalOpened"
  >
    <div class="font-mono install-size-treemap">
      <ClientOnly v-if="dataset.length">
        <VueUiTreemap :key="chartKey" :dataset="dataset" :config="config" class="[direction:ltr]">
          <template #menuIcon="{ isOpen }">
            <span v-if="isOpen" class="i-lucide:x w-6 h-6" aria-hidden="true" />
            <span v-else class="i-lucide:ellipsis-vertical w-6 h-6" aria-hidden="true" />
          </template>

          <template #optionImg>
            <span class="text-fg-subtle font-mono pointer-events-none">PNG</span>
          </template>

          <template #optionSvg>
            <span class="text-fg-subtle font-mono pointer-events-none">SVG</span>
          </template>

          <template #skeleton>
            <div></div>
          </template>
        </VueUiTreemap>
      </ClientOnly>
    </div>
  </Modal>
</template>

<style scoped>
:deep(.vue-data-ui-component svg:focus-visible) {
  outline: 1px solid var(--accent) !important;
  border-radius: 0.1rem;
  outline-offset: 3px !important;
}
:deep(.vue-ui-user-options-button:focus-visible),
:deep(.vue-ui-user-options :first-child:focus-visible) {
  outline: 0.1rem solid var(--accent) !important;
  border-radius: 0.25rem;
}
</style>
