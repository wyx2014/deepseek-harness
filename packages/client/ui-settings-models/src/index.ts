/** Host configuration and page bootstrap for Models settings and onboarding. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { type Config, ONBOARDING_CONFIG_GLOBAL } from './onboarding-config.ts'

export { Config } from './onboarding-config.ts'

/**
 * Publish Models page options before browser plugins activate.
 * @param ctx - Host context collecting the page's initialization data.
 * @param config - plugin options with schema defaults applied by the Loader.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.on('webserver/index-inject', (table) => {
    table.push({
      kind: 'global',
      name: ONBOARDING_CONFIG_GLOBAL,
      value: { credentialOnboarding: config.credentialOnboarding, providerCatalog: config.providerCatalog },
    })
  })
}
