import { computedWithControl, syncRef } from '@vueuse/core'
import type { App, Ref } from 'vue'
import { computed, ref } from 'vue'
import type { Router } from 'vue-router'
import { clientDataSymbol } from './composables/index.js'
import { redirects, routes } from './internal/routes.js'
import { siteData } from './internal/siteData.js'
import { resolvers } from './resolvers.js'
import type {
  ClientConfig,
  ClientData,
  PageChunk,
  PageData,
  PageFrontmatter,
  PageHead,
  PageHeadTitle,
  PageLang,
  RouteLocale,
  SiteData,
  SiteLocaleData,
} from './types/index.js'
import { withBase } from './utils/index.js'

/**
 * Create and provide global computed
 */
export const setupGlobalComputed = (
  app: App,
  router: Router,
  clientConfigs: ClientConfig[],
): ClientData => {
  // route path of current page
  const routePath = computed(() => router.currentRoute.value.path)

  // load page chunk from route meta
  const pageChunk = computedWithControl(
    routePath,
    () => router.currentRoute.value.meta._pageChunk!,
  )
  // #1500 get a side-effect free ref to use in the computed
  const pageChunkSideEffectFreeRef: Ref<PageChunk> = ref(pageChunk.value)
  syncRef(pageChunk, pageChunkSideEffectFreeRef, {
    direction: 'ltr',
  })

  // handle page data HMR
  if (__VUEPRESS_DEV__ && (import.meta.webpackHot || import.meta.hot)) {
    __VUE_HMR_RUNTIME__.updatePageData = async (newPageData: PageData) => {
      const oldPageChunk = await routes.value[newPageData.path].loader()
      routes.value[newPageData.path].loader = () =>
        Promise.resolve({ comp: oldPageChunk.comp, data: newPageData })
      if (
        newPageData.path ===
        router.currentRoute.value.meta._pageChunk?.data.path
      ) {
        router.currentRoute.value.meta._pageChunk.data = newPageData
        pageChunk.trigger()
      }
    }
  }

  // create other global computed
  const layouts = computed(() => resolvers.resolveLayouts(clientConfigs))
  const routeLocale = computed(() =>
    resolvers.resolveRouteLocale(siteData.value.locales, routePath.value),
  )
  const siteLocaleData = computed(() =>
    resolvers.resolveSiteLocaleData(siteData.value, routeLocale.value),
  )
  const pageComponent = computed(() => pageChunkSideEffectFreeRef.value.comp)
  const pageData = computed(() => pageChunkSideEffectFreeRef.value.data)
  const pageFrontmatter = computed(() => pageData.value.frontmatter)
  const pageHeadTitle = computed(() =>
    resolvers.resolvePageHeadTitle(pageData.value, siteLocaleData.value),
  )
  const pageHead = computed(() =>
    resolvers.resolvePageHead(
      pageHeadTitle.value,
      pageFrontmatter.value,
      siteLocaleData.value,
    ),
  )
  const pageLang = computed(() =>
    resolvers.resolvePageLang(pageData.value, siteLocaleData.value),
  )
  const pageLayout = computed(() =>
    resolvers.resolvePageLayout(pageData.value, layouts.value),
  )

  // provide global computed in clientData
  const clientData: ClientData = {
    layouts,
    pageData,
    pageComponent,
    pageFrontmatter,
    pageHead,
    pageHeadTitle,
    pageLang,
    pageLayout,
    redirects,
    routeLocale,
    routePath,
    routes,
    siteData,
    siteLocaleData,
  }
  app.provide(clientDataSymbol, clientData)

  // provide global helpers
  Object.defineProperties(app.config.globalProperties, {
    $frontmatter: { get: () => pageFrontmatter.value },
    $head: { get: () => pageHead.value },
    $headTitle: { get: () => pageHeadTitle.value },
    $lang: { get: () => pageLang.value },
    $page: { get: () => pageData.value },
    $routeLocale: { get: () => routeLocale.value },
    $site: { get: () => siteData.value },
    $siteLocale: { get: () => siteLocaleData.value },
    $withBase: { get: () => withBase },
  })

  return clientData
}

declare module 'vue' {
  export interface ComponentCustomProperties {
    $frontmatter: PageFrontmatter
    $head: PageHead
    $headTitle: PageHeadTitle
    $lang: PageLang
    $page: PageData
    $routeLocale: RouteLocale
    $site: SiteData
    $siteLocale: SiteLocaleData
    $withBase: typeof withBase
  }
}
