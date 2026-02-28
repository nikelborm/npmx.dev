import type { Meta, StoryObj } from '@storybook-vue/nuxt'
import EntrypointSelector from './EntrypointSelector.vue'

const meta = {
  component: EntrypointSelector,
} satisfies Meta<typeof EntrypointSelector>

export default meta
type Story = StoryObj<typeof meta>

export const SingleEntrypoint: Story = {
  args: {
    packageName: 'vue',
    version: '3.5.0',
    currentEntrypoint: '.',
    entrypoints: ['.'],
  },
}

export const MultipleEntrypoints: Story = {
  args: {
    packageName: '@nuxt/kit',
    version: '4.3.1',
    currentEntrypoint: '.',
    entrypoints: ['.', 'compatibility', 'loader'],
  },
}

export const ManyEntrypoints: Story = {
  args: {
    packageName: '@radix-ui/themes',
    version: '3.0.0',
    currentEntrypoint: 'button',
    entrypoints: [
      'accordion',
      'alert-dialog',
      'avatar',
      'badge',
      'box',
      'button',
      'callout',
      'card',
      'checkbox',
      'container',
      'dialog',
      'flex',
      'grid',
      'heading',
      'icon-button',
      'inset',
      'link',
      'popover',
      'progress',
      'radio-group',
      'scroll-area',
      'select',
      'separator',
      'skeleton',
      'slider',
      'spinner',
      'switch',
      'table',
      'tabs',
      'text',
      'text-area',
      'text-field',
      'theme',
      'tooltip',
    ],
  },
}

export const NestedEntrypoint: Story = {
  args: {
    packageName: '@nuxt/kit',
    version: '4.3.1',
    currentEntrypoint: 'compat/utils',
    entrypoints: ['.', 'compat/utils', 'compat/legacy'],
  },
}
