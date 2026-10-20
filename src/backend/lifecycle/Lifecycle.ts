import {
  AuthorizationGrantResult,
  CanUninstallResult,
  getAppContext,
  Lifecycle as AppLifecycle,
  LifecycleResult,
  LifecycleSettingsResult,
  logger,
  Request as AppRequest,
  storage,
  SubmittedFormData,
  ValueHash
} from '@zaiusinc/app-sdk';
import {LIFECYCLE_LOG_LIMIT} from '@shared/constants';
import type {LifecycleEntry} from '@shared/protocol';
import {getCmsToken} from '../lib/cmsApi';
import {graphQuery} from '../lib/graph';
import {ConfigError} from '../lib/http';
import {appendLog, LIFECYCLE_KEY} from '../lib/logs';

const SECRET_FIELDS: Record<string, string[]> = {
  cms_api: ['clientSecret'],
  graph: ['appSecret']
};

/** Records every hook with the context it ran in, so the extensions can compare it with their own. */
async function record(hook: string, detail?: string): Promise<void> {
  const context = getAppContext();
  const entry: LifecycleEntry = {
    at: new Date().toISOString(),
    hook,
    detail,
    context: {
      trackerId: context?.trackerId,
      installId: context?.installId,
      scope: context?.scope ?? null,
      account: context?.account ?? null
    }
  };
  try {
    await appendLog(LIFECYCLE_KEY, entry, LIFECYCLE_LOG_LIMIT);
  } catch (error) {
    logger.warn('Could not record lifecycle entry', hook, error);
  }
}

export class Lifecycle extends AppLifecycle {
  public async onInstall(): Promise<LifecycleResult> {
    await record('onInstall');
    return {success: true};
  }

  public async onUpgrade(fromVersion: string): Promise<LifecycleResult> {
    await record('onUpgrade', `from ${fromVersion}`);
    return {success: true};
  }

  public async onFinalizeUpgrade(fromVersion: string): Promise<LifecycleResult> {
    await record('onFinalizeUpgrade', `from ${fromVersion}`);
    return {success: true};
  }

  public async onAfterUpgrade(): Promise<LifecycleResult> {
    await record('onAfterUpgrade');
    return {success: true};
  }

  public async canUninstall(): Promise<CanUninstallResult> {
    return {uninstallable: true};
  }

  public async onUninstall(): Promise<LifecycleResult> {
    return {success: true};
  }

  public async onSettingsForm(
    section: string,
    action: string,
    formData: SubmittedFormData
  ): Promise<LifecycleSettingsResult> {
    const result = new LifecycleSettingsResult();
    await record('onSettingsForm', `${section}/${action}`);

    if (!(section in SECRET_FIELDS) || (action !== 'save' && action !== 'test')) {
      logger.warn('Unsupported section-action combination:', section, action);
      return result;
    }

    // A secret field comes back empty when the user didn't retype it. Keep the stored value then.
    const previous = await storage.settings.get<ValueHash>(section);
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries(formData)) {
      next[key] = typeof value === 'string' ? value.trim() : '';
    }
    for (const field of SECRET_FIELDS[section]) {
      if (!next[field] && typeof previous[field] === 'string') next[field] = previous[field];
    }
    await storage.settings.put(section, next);

    if (action === 'save') return result.addToast('success', 'Saved.');

    try {
      if (section === 'cms_api') {
        const {report} = await getCmsToken();
        const subject = report.decoded?.claims.sub ?? report.decoded?.claims.client_id ?? 'unknown';
        return result.addToast('success', `Saved. Token OK (subject: ${String(subject)}).`);
      }
      const auth = next.appKey && next.appSecret ? 'basic' : 'single';
      const response = await graphQuery('{ _Content(limit: 1) { total } }', undefined, auth);
      if (response.status === 200) {
        return result.addToast('success', `Saved. Graph answered with ${auth} auth.`);
      }
      return result.addToast('danger', `Saved, but Graph returned HTTP ${response.status}.`);
    } catch (error) {
      const message = error instanceof ConfigError || error instanceof Error ? error.message : String(error);
      return result.addToast('danger', `Saved, but the test failed: ${message}`);
    }
  }

  public async onAuthorizationRequest(
    _section: string,
    _formData: SubmittedFormData
  ): Promise<LifecycleSettingsResult> {
    return new LifecycleSettingsResult().addToast('danger', 'OAuth is not supported.');
  }

  public async onAuthorizationGrant(_request: AppRequest): Promise<AuthorizationGrantResult> {
    return new AuthorizationGrantResult('').addToast('danger', 'OAuth is not supported.');
  }
}
