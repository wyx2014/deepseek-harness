/** Operations available to the isolated native welcome renderer. */

import type { AccountView, SignInAttemptId } from '@deepseek-ai/dsh-deepseek-account/types'
import type { ProductEventMap } from '@deepseek-ai/dsh-client-product-analytics/types'
import type { DesktopLocale } from './locale.ts'

/** Private native welcome channels, installed only while its window exists. */
export const WELCOME_IPC = {
  saveApiKey: 'dsh-welcome:save-api-key',
  analytics: 'dsh-welcome:analytics',
  analyticsEnabled: 'dsh-welcome:analytics-enabled',
  skip: 'dsh-welcome:skip',
  start: 'dsh-welcome:start',
  cancel: 'dsh-welcome:cancel',
  copyLink: 'dsh-welcome:copy-link',
  state: 'dsh-welcome:state',
  takeNotice: 'dsh-welcome:take-notice',
} as const

/** Credential writes return a safe outcome without exposing Host diagnostics. */
export type WelcomeSaveResult = { readonly ok: true } | { readonly ok: false }

/** One-time notification retained by the main process until Welcome receives it. */
export type WelcomeNotice = 'session-expired'

type WelcomeEventName = 'auth_page_view' | 'auth_page_click' | 'api_key_save_click'

/** Host-owned operations used by the welcome window. */
export interface WelcomeOperations {
  /** @param eventName - allowed welcome event. @param attributes - approved fields without credentials. */
  analytics?<K extends WelcomeEventName>(eventName: K, attributes: ProductEventMap[K]): Promise<void>
  /** @returns the Host's current effective collection policy. */
  analyticsEnabled(): Promise<boolean>
  /** @returns the pending notification, clearing it before another renderer can receive it. */
  takeNotice(): Promise<WelcomeNotice | undefined>
  /** @returns account state after starting a login attempt. */
  startSignIn(): Promise<AccountView>
  /** @param id - attempt to cancel. @returns the settled state. */
  cancelSignIn(id: SignInAttemptId): Promise<AccountView>
  /** @param id - current waiting attempt whose authorization URL is copied to the system clipboard. */
  copySignInLink(id: SignInAttemptId): Promise<void>

  /**
   * Store the official provider's key before entering the workspace.
   * @param value - validated, trimmed API key.
   * @returns whether the write completed, without private error details.
   */
  saveApiKey(value: string): Promise<WelcomeSaveResult>
  /**
   * Enter the workspace without writing an onboarding-completion setting.
   * @returns completion after the workspace opens.
   */
  skip(): Promise<void>
}

/** The renderer receives localized copy, login operations, and safe account snapshots. */
export type WelcomeApi = DesktopLocale & WelcomeOperations & {
  /** @param listener - safe account snapshot recipient. @returns subscription disposer. */
  onAccountState(listener: (state: AccountView) => void): () => void
}

/** Authentication facts supplied at cold start or after a completed sign-out. */
export interface WelcomeAuthentication {
  readonly loggedIn: boolean
  readonly hasApiKey: boolean
}

/**
 * Decide whether a startup or sign-out requires the welcome entry.
 * @param authentication - current account and independently stored API-key facts.
 * @param injections - Host boot rows; absent rows retain native login. A product may publish the global
 * `__DSH_DESKTOP_LOGIN_ENTRY__` as `application` to own login, or `native` to retain the native entry.
 * @returns false for application-owned login; otherwise true when neither native authentication route is configured.
 * @throws when a product declares an unsupported login entry, preventing a silent fallback to native key setup.
 */
export function needsWelcome(authentication: WelcomeAuthentication, injections: readonly unknown[] = []): boolean {
  for (const row of injections) {
    if (typeof row !== 'object' || row === null || !('kind' in row) || row.kind !== 'global'
      || !('name' in row) || row.name !== '__DSH_DESKTOP_LOGIN_ENTRY__') continue
    if (!('value' in row) || (row.value !== 'application' && row.value !== 'native')) {
      throw new Error('desktop welcome: invalid product login entry')
    }
    // 产品账号下发模型配置时，由应用内登录屏障负责认证，不再显示原生 API Key 引导。
    if (row.value === 'application') return false
  }
  return !authentication.loggedIn && !authentication.hasApiKey
}
