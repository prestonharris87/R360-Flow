import { Button, SnackbarType } from '@synergycodes/overflow-ui';
import clsx from 'clsx';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Icon } from '@workflow-builder/icons';

import styles from '../import-export-modal.module.css';

import { showSnackbar } from '@/utils/show-snackbar';

import { setStoreDataFromIntegration } from '@/store/slices/diagram-slice/actions';

import { trackFutureChange } from '@/features/changes-tracker/stores/use-changes-tracker-store';
import { IntegrationDataError, validateIntegrationData } from '@/features/integration/utils/validate-integration-data';
import { closeModal } from '@/features/modals/stores/use-modal-store';
import { SyntaxHighlighterLazy } from '@/features/syntax-highlighter/components/syntax-highlighter-lazy';

import { createApiClient } from '../../../../../../api/api-client';
import { createWorkflowApi } from '../../../../../../api/workflow-api';
import { useAuth } from '../../../../../../auth/use-auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3100/api';

/**
 * Detect whether a parsed JSON object is an n8n workflow format.
 *
 * An n8n workflow has a top-level `nodes` array where each node has
 * `parameters` and a `type` property (typically starting with
 * `n8n-nodes-base.` or `@n8n/`).
 */
function isN8nWorkflowFormat(parsed: Record<string, unknown>): boolean {
  if (!Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
    return false;
  }
  const first = parsed.nodes[0];
  return (
    typeof first === 'object' &&
    first !== null &&
    'parameters' in first &&
    'type' in first
  );
}

export function ImportModal() {
  const [jsonToParse, setJsonToParse] = useState('{}');
  const [{ errors, warnings }, setJsonValidation] = useState<{
    errors: IntegrationDataError[];
    warnings: IntegrationDataError[];
  }>({
    errors: [],
    warnings: [],
  });
  const [isImporting, setIsImporting] = useState(false);
  const { t } = useTranslation();
  const { token, user } = useAuth();

  const workflowApi = useMemo(() => {
    if (!token || !user?.tenantId) return null;

    const client = createApiClient({
      baseUrl: API_BASE_URL,
      getAuthToken: async () => token,
      tenantId: user.tenantId,
    });

    return createWorkflowApi(client);
  }, [token, user?.tenantId]);

  const handleImport = useCallback(
    async ({ shouldIgnoreWarnings }: { shouldIgnoreWarnings: boolean }) => {
      // First, parse the JSON
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(jsonToParse);
      } catch {
        setJsonValidation({
          errors: [{ message: 'validation.error.notJSONObject' }],
          warnings: [],
        });
        return;
      }

      // Detect n8n format
      if (isN8nWorkflowFormat(parsed)) {
        if (!workflowApi) {
          setJsonValidation({
            errors: [{ message: 'validation.error.importFailed' }],
            warnings: [],
          });
          return;
        }

        setIsImporting(true);
        try {
          const result = await workflowApi.importN8n({
            name: (parsed.name as string) || undefined,
            n8nWorkflow: parsed,
          });

          closeModal();

          showSnackbar({
            title: 'loadDiagramSuccess',
            variant: SnackbarType.SUCCESS,
          });

          // Navigate to the imported workflow
          if (result.workflow?.id) {
            window.location.href = `/workflows/${result.workflow.id}`;
          }
        } catch {
          setJsonValidation({
            errors: [{ message: 'validation.error.importFailed' }],
            warnings: [],
          });
        } finally {
          setIsImporting(false);
        }
        return;
      }

      // Existing DiagramModel import flow
      const { errors, warnings, validatedIntegrationData } = validateIntegrationData(jsonToParse);

      setJsonValidation({
        errors,
        warnings,
      });

      if (errors.length > 0) {
        return;
      }

      if (warnings.length > 0 && shouldIgnoreWarnings === false) {
        return;
      }

      if (validatedIntegrationData) {
        trackFutureChange('import');
        setStoreDataFromIntegration(validatedIntegrationData);
        closeModal();

        showSnackbar({
          title: 'loadDiagramSuccess',
          variant: SnackbarType.SUCCESS,
        });
      }
    },
    [jsonToParse, workflowApi],
  );

  return (
    <div className={styles['container']}>
      <p className={clsx('ax-public-p10', styles['tip'])}>{t('importExport.importTip')}</p>
      <SyntaxHighlighterLazy value={jsonToParse} onChange={(json) => setJsonToParse(json || '{}')} />
      {(errors.length > 0 || warnings.length > 0) && (
        <div className={clsx('ax-public-p10', styles['error'])}>
          {[...errors, ...warnings].map(({ message, messageParams }) => (
            <div key={message}>{t(message, messageParams)}</div>
          ))}
        </div>
      )}
      <div className={styles['actions']}>
        {warnings.length > 0 && errors.length === 0 && (
          <Button variant="warning" onClick={() => handleImport({ shouldIgnoreWarnings: true })}>
            <Icon name="DownloadSimple" />
            {t('importExport.ignoreAndImport')}
          </Button>
        )}
        <Button variant="primary" onClick={() => handleImport({ shouldIgnoreWarnings: false })} disabled={isImporting}>
          <Icon name="DownloadSimple" />
          {isImporting ? 'Importing...' : t('importExport.import')}
        </Button>
      </div>
    </div>
  );
}
