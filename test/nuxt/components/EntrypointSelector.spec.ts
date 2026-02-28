import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import EntrypointSelector from '~/components/EntrypointSelector.vue'

const baseProps = {
  packageName: '@nuxt/kit',
  version: '4.3.1',
  currentEntrypoint: '.',
  entrypoints: ['.', 'compatibility', 'loader'],
}

describe('EntrypointSelector', () => {
  describe('single entrypoint', () => {
    it('renders the path as text without a select', async () => {
      const component = await mountSuspended(EntrypointSelector, {
        props: { ...baseProps, currentEntrypoint: '.', entrypoints: ['.'] },
      })

      expect(component.find('select').exists()).toBe(false)
      expect(component.text()).toContain('.')
    })

    it('formats non-root single entrypoints with the "./" prefix', async () => {
      const component = await mountSuspended(EntrypointSelector, {
        props: { ...baseProps, currentEntrypoint: 'client', entrypoints: ['client'] },
      })

      expect(component.text()).toContain('./client')
    })
  })

  describe('multi-entrypoint select', () => {
    it('renders a select with the current entrypoint selected', async () => {
      const component = await mountSuspended(EntrypointSelector, { props: baseProps })
      const select = component.get('select')

      expect(select.element.value).toBe('.')
      expect(component.findAll('option')).toHaveLength(3)
    })

    it('formats option labels with the root marker and "./" prefixes', async () => {
      const component = await mountSuspended(EntrypointSelector, { props: baseProps })
      const options = component.findAll('option')

      expect(options[0]?.text()).toBe('.')
      expect(options[1]?.text()).toBe('./compatibility')
      expect(options[2]?.text()).toBe('./loader')
    })

    it('updates the selected option when the current entrypoint prop changes', async () => {
      const component = await mountSuspended(EntrypointSelector, { props: baseProps })
      const select = component.get('select')

      await component.setProps({ currentEntrypoint: 'compatibility' })

      expect(select.element.value).toBe('compatibility')
    })

    it('updates the displayed selection immediately when a new entrypoint is chosen', async () => {
      const component = await mountSuspended(EntrypointSelector, { props: baseProps })
      const select = component.get('select')

      await select.setValue('compatibility')

      expect(select.element.value).toBe('compatibility')
    })
  })
})
