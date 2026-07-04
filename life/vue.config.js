const { defineConfig } = require('@vue/cli-service')
module.exports = defineConfig({
  transpileDependencies: false,
  chainWebpack: (config) => {
    // Disable eslint-webpack-plugin's on-disk cache: on Windows it hits a
    // recurring EBUSY race (something briefly locks the cache file right as
    // it's rewritten, e.g. Defender's realtime scan) that crashes the dev
    // server's compile. The cache is a perf optimization only, not needed
    // for correctness, so turning it off just trades a little lint speed
    // for not randomly breaking `npm run serve`.
    config.plugin('eslint').tap((args) => {
      args[0].cache = false
      return args
    })
  }
})
