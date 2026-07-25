import Worker from '~/utils/pkg-size/analize-cause-worker?worker'

export const worker = new Worker({
  name: 'NpmxPkgSizeAnalyzeCauseWorker',
})
