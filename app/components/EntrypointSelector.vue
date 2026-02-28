<script setup lang="ts">
const props = defineProps<{
  packageName: string
  version: string
  currentEntrypoint: string
  entrypoints: string[]
}>()

const hasMultiple = computed(() => props.entrypoints.length > 1)
const selectId = useId()

const selectedEntrypoint = shallowRef(props.currentEntrypoint)

watch(
  () => props.currentEntrypoint,
  entrypoint => {
    selectedEntrypoint.value = entrypoint
  },
)

const entrypointItems = computed(() =>
  props.entrypoints.map(entrypoint => ({
    value: entrypoint,
    label: formatEntrypointLabel(entrypoint),
  })),
)

function formatEntrypointLabel(entrypoint: string): string {
  return entrypoint === '.' ? '.' : `./${entrypoint}`
}

function handleEntrypointChange(entrypoint: string | undefined) {
  if (!entrypoint || entrypoint === props.currentEntrypoint) {
    return
  }

  selectedEntrypoint.value = entrypoint
  navigateTo(docsRoute(props.packageName, props.version, entrypoint))
}
</script>

<template>
  <div
    v-if="!hasMultiple"
    class="text-fg-subtle font-mono text-sm inline-flex items-center gap-1.5"
  >
    <span class="i-lucide:package w-3.5 h-3.5" aria-hidden="true" />
    <span dir="ltr">{{ formatEntrypointLabel(currentEntrypoint) }}</span>
  </div>

  <div v-else class="inline-flex items-center gap-1.5">
    <span class="i-lucide:package w-3.5 h-3.5 text-fg-subtle shrink-0" aria-hidden="true" />
    <SelectField
      :id="selectId"
      v-model="selectedEntrypoint"
      :items="entrypointItems"
      :label="$t('package.docs.select_entrypoint')"
      hidden-label
      size="sm"
      :select-attrs="{ dir: 'ltr' }"
      @update:model-value="handleEntrypointChange"
    />
  </div>
</template>
