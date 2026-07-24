<script setup lang="ts">
import type { InstallSizeDiff } from '~/composables/useInstallSizeDiff'
import { useAnalyzeCauseWorker } from '~/composables/pkg-size/useAnalizeCauseWorker'
import { computed } from 'vue'

const props = defineProps<{
  diff: InstallSizeDiff
  packageName: string
  version?: string | null
  comparedVersion?: string | null
}>()

const bytesFormatter = useBytesFormatter()
const numberFormatter = useNumberFormatter()
const percentFormatter = useNumberFormatter({ style: 'percent' })

const sizePercent = computed(() => percentFormatter.value.format(Math.abs(props.diff.sizeRatio)))

const useVersion = computed(() => {
  return props.version
})
const useComparedVersion = computed(() => {
  return props.diff.comparisonVersion
})

const {
  available,
  analyzing,
  cancelling,
  loading,
  result,
  summary,
  noResultScroll,
  allDependencies,
  startAnalyzeCause,
  cancelAnalyzeCause,
} = useAnalyzeCauseWorker(props.packageName, useVersion, useComparedVersion)
</script>

<template>
  <div
    class="border border-amber-600/40 bg-amber-500/10 rounded-lg px-3 py-2 text-base text-amber-800 dark:text-amber-400 of-hidden"
  >
    <h2 class="font-medium mb-1 flex items-center gap-2">
      <span class="i-lucide:trending-up w-4 h-4 shrink-0" aria-hidden="true" />
      {{
        diff.sizeThresholdExceeded && diff.depThresholdExceeded
          ? $t('package.size_increase.title_both', { version: diff.comparisonVersion })
          : diff.sizeThresholdExceeded
            ? $t('package.size_increase.title_size', { version: diff.comparisonVersion })
            : $t('package.size_increase.title_deps', { version: diff.comparisonVersion })
      }}
    </h2>

    <p class="text-sm m-0 mt-1">
      <i18n-t v-if="diff.sizeThresholdExceeded" keypath="package.size_increase.size" scope="global">
        <template #percent
          ><strong>{{ sizePercent }}</strong></template
        >
        <template #size
          ><strong>{{ bytesFormatter.format(diff.sizeIncrease) }}</strong></template
        >
      </i18n-t>
      <template v-if="diff.sizeThresholdExceeded && diff.depThresholdExceeded"> · </template>
      <i18n-t v-if="diff.depThresholdExceeded" keypath="package.size_increase.deps" scope="global">
        <template #count
          ><strong>+{{ numberFormatter.format(diff.depDiff) }}</strong></template
        >
      </i18n-t>
    </p>

    <div class="mt-3 flex flex-col gap-3">
      <div class="flex justify-start">
        <button
          type="button"
          :disabled="!available || cancelling"
          class="border border-amber-600/40 bg-amber-500/10 hover:bg-amber-500/20 rounded-md inline-flex items-center gap-1.5 text-xs font-medium text-amber-900 dark:text-amber-300 px-3 py-1.5 transition-all duration-200 ease-out focus-visible:outline-amber-600 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
          @click="analyzing ? cancelAnalyzeCause() : startAnalyzeCause()"
        >
          <span class="inline-flex items-center gap-1.5">
            <span
              v-if="loading || analyzing || cancelling"
              class="i-lucide:loader-2 animate-spin w-3.5 h-3.5 shrink-0 transition-opacity duration-150"
              aria-hidden="true"
            />

            <span
              v-if="analyzing && !cancelling"
              class="i-lucide:square w-3 h-3 fill-current shrink-0"
              aria-hidden="true"
            />

            <span>
              {{
                cancelling
                  ? $t('package.size_increase.analyze.cancelling')
                  : analyzing
                    ? $t('package.size_increase.analyze.cancel')
                    : $t('package.size_increase.analyze.analyze')
              }}
            </span>
          </span>
        </button>
      </div>

      <Transition name="expand">
        <div v-if="summary && result && result.length > 0" class="flex flex-col">
          <!-- SUMMARY -->
          <div class="border-t border-amber-600/20 pt-3 flex flex-col gap-1">
            <p class="text-xs text-amber-700 dark:text-amber-500 m-0">
              📦
              <i18n-t keypath="package.size_increase.analyze.summary.total_size" scope="global">
                <template #size>{{ summary.sizeDeltaText }}</template>
                <template #bytes>
                  <i18n-t keypath="package.size_increase.analyze.summary.bytes" scope="global">
                    <template #bytes>{{
                      summary.sizeDeltaBytesText || summary.sizeDelta
                    }}</template>
                  </i18n-t>
                </template>
              </i18n-t>
            </p>
            <p class="text-xs text-amber-700 dark:text-amber-500 m-0">
              🧠
              <i18n-t keypath="package.size_increase.analyze.summary.js_core_size" scope="global">
                <template #size>{{ summary.mandatorySizeDeltaText }}</template>
                <template #bytes>
                  <i18n-t keypath="package.size_increase.analyze.summary.bytes" scope="global">
                    <template #bytes>{{
                      summary.mandatorySizeDeltaBytesText || summary.mandatorySizeDelta
                    }}</template>
                  </i18n-t>
                </template>
              </i18n-t>
            </p>
            <p class="text-xs text-amber-700 dark:text-amber-500 m-0">
              🧩
              <i18n-t keypath="package.size_increase.analyze.summary.deps_variation" scope="global">
                <template #net>{{
                  summary.netDependenciesText ||
                  (summary.netDependencies > 0
                    ? `+${summary.netDependencies}`
                    : summary.netDependencies)
                }}</template>
                <template #details>
                  <i18n-t
                    keypath="package.size_increase.analyze.summary.deps_details"
                    scope="global"
                  >
                    <template #added>{{ summary.added }}</template>
                    <template #removed>{{ summary.removed }}</template>
                  </i18n-t>
                </template>
              </i18n-t>
            </p>
          </div>

          <!-- DIFF BALANCE -->
          <details class="group border-t border-amber-600/20 mt-3 pt-3 pb-1">
            <summary
              class="flex items-center gap-2 cursor-pointer text-sm font-medium text-amber-900 dark:text-amber-400 select-none hover:text-amber-700 dark:hover:text-amber-200 focus-visible:outline-amber-600 rounded transition-colors duration-150"
            >
              <span
                class="i-lucide:chevron-right icon-rtl w-4 h-4 shrink-0 transition-transform duration-200 group-open:rotate-90 rtl:group-open:-rotate-90"
                aria-hidden="true"
              />
              {{ $t('package.size_increase.analyze.diff') }}
            </summary>

            <div class="mt-3">
              <div
                class="flex items-center justify-start gap-1.5 mb-2 pb-2 border-b border-amber-600/10"
              >
                <button
                  type="button"
                  @click="allDependencies = !allDependencies"
                  class="inline-flex items-center gap-1 text-xs uppercase font-bold tracking-wider text-amber-900 dark:text-amber-300 bg-amber-500/5 hover:bg-amber-500/15 border border-amber-600/20 px-2 py-1 rounded transition-colors focus-visible:outline-amber-600"
                >
                  <span
                    :class="allDependencies ? 'i-lucide:list-filter' : 'i-lucide:list-tree'"
                    class="w-3 h-3 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{{
                    allDependencies
                      ? $t('package.size_increase.analyze.only_deps')
                      : $t('package.size_increase.analyze.all_deps')
                  }}</span>
                </button>

                <button
                  type="button"
                  @click="noResultScroll = !noResultScroll"
                  class="inline-flex items-center gap-1 text-xs uppercase font-bold tracking-wider text-amber-900 dark:text-amber-300 bg-amber-500/5 hover:bg-amber-500/15 border border-amber-600/20 px-2 py-1 rounded transition-colors focus-visible:outline-amber-600"
                >
                  <span
                    :class="noResultScroll ? 'i-lucide:minimize-2' : 'i-lucide:maximize-2'"
                    class="w-3 h-3 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{{
                    noResultScroll
                      ? $t('package.size_increase.analyze.collapse')
                      : $t('package.size_increase.analyze.expand')
                  }}</span>
                </button>
              </div>

              <div
                class="custom-scrollbar pe-1 transition-all duration-300"
                :class="{ 'overflow-y-auto max-h-[216px]': !noResultScroll }"
              >
                <ul class="flex flex-col gap-1.5 m-0 p-0 list-none pe-1">
                  <li
                    v-for="(item, index) in result"
                    :key="index"
                    class="flex flex-wrap items-center justify-between gap-2 py-1.5 px-2 rounded-md bg-amber-500/5 hover:bg-amber-500/10 transition-colors border border-amber-600/10"
                  >
                    <div class="flex items-center gap-2.5">
                      <abbr
                        :title="item.statusText || item.status"
                        class="flex shrink-0 items-center justify-center w-6 h-6 rounded border no-underline cursor-help"
                        :class="{
                          'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20':
                            item.status === 'added',
                          'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20':
                            item.status === 'removed',
                          'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20':
                            item.status === 'changed',
                        }"
                      >
                        <span
                          v-if="item.status === 'added'"
                          class="i-lucide:plus w-3.5 h-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        <span
                          v-else-if="item.status === 'removed'"
                          class="i-lucide:minus w-3.5 h-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        <span
                          v-else-if="item.status === 'changed'"
                          class="i-lucide:arrow-left-right w-3.5 h-3.5 shrink-0"
                          aria-hidden="true"
                        />
                      </abbr>

                      <span
                        class="font-mono text-2xs font-semibold text-amber-900 dark:text-amber-300 break-all"
                      >
                        {{ item.name }}
                      </span>
                    </div>

                    <div class="flex items-center gap-1.5 ms-auto shrink-0">
                      <template v-if="item.status === 'changed' && item.v1 && item.v2">
                        <span
                          class="font-mono text-2xs line-through text-amber-700/80 dark:text-amber-500/80"
                        >
                          {{ item.v1.version }}
                        </span>
                        <span
                          class="i-lucide:arrow-right w-3.5 h-3.5 shrink-0 text-amber-700/60 rtl:rotate-180"
                        />
                        <span
                          class="font-mono text-2xs font-bold text-amber-900 dark:text-amber-300"
                        >
                          {{ item.v2.version }}
                        </span>
                      </template>
                      <template v-else>
                        <span
                          class="font-mono text-2xs font-medium text-amber-900 dark:text-amber-300"
                        >
                          {{ (item.v2 || item.v1)?.version }}
                        </span>
                      </template>

                      <span class="text-amber-600/40 mx-1 shrink-0">|</span>

                      <span
                        class="font-mono text-2xs font-bold min-w-14 text-end shrink-0"
                        :class="{
                          'text-emerald-700 dark:text-emerald-400': item.status === 'removed',
                          'text-rose-700 dark:text-rose-400': item.status === 'added',
                          'text-amber-800 dark:text-amber-400': item.status === 'changed',
                        }"
                      >
                        {{ item.sizeDeltaText }}
                      </span>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </details>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.expand-enter-active,
.expand-leave-active {
  transition:
    max-height 0.35s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.25s ease-in-out;
  overflow: hidden;
  opacity: 1;
}

.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
  margin-top: 0;
  margin-bottom: 0;
}

details[dir='rtl']:not([open]) .icon-rtl {
  transform: scale(-1, 1);
}
summary {
  list-style: none;
}
summary::-webkit-details-marker {
  display: none;
}

.custom-scrollbar {
  scrollbar-width: auto;
  scrollbar-color: rgba(217, 119, 6, 0.3) transparent;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(217, 119, 6, 0.3);
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: rgba(217, 119, 6, 0.5);
}

:global(.dark) .custom-scrollbar {
  scrollbar-color: rgba(251, 191, 36, 0.3) transparent;
}
:global(.dark) .custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(251, 191, 36, 0.3);
}
:global(.dark) .custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: rgba(251, 191, 36, 0.5);
}
</style>
