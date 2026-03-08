import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getStoreDataForIntegration } from '@/store/slices/diagram-slice/actions';

import { IntegrationDataFormatOptional, OnSave } from '@/features/integration/types';

import { createApiClient } from '../../../../../api/api-client';
import { createWorkflowApi } from '../../../../../api/workflow-api';
import type { WorkflowDetail } from '../../../../../api/workflow-api';
import { useAuth } from '../../../../../auth/use-auth';
import { showSnackbarSaveErrorIfNeeded, showSnackbarSaveSuccessIfNeeded } from '../../utils/show-snackbar';
import { IntegrationWrapper } from './wrapper/integration-wrapper';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api';

function getWorkflowIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('workflowId');
}

export function withIntegrationThroughR360Api<WProps extends object>(
  WrappedComponent: React.ComponentType<WProps>,
) {
  function WithIntegrationComponent(props: React.ComponentProps<typeof WrappedComponent>) {
    const { isAuthenticated, isLoading, token, user, login } = useAuth();
    const currentWorkflowRef = useRef<WorkflowDetail | null>(null);

    const workflowApi = useMemo(() => {
      if (!token || !user?.tenantId) return null;

      const client = createApiClient({
        baseUrl: API_BASE_URL,
        getAuthToken: async () => token,
        tenantId: user.tenantId,
      });

      return createWorkflowApi(client);
    }, [token, user?.tenantId]);

    const [{ name, layoutDirection, nodes, edges }, setData] = useState<IntegrationDataFormatOptional>({});

    // Load workflow from API on mount if workflowId is in URL
    useEffect(() => {
      if (!workflowApi) return;

      const workflowId = getWorkflowIdFromUrl();
      if (!workflowId) return;

      (async () => {
        try {
          const workflow = await workflowApi.get(workflowId);
          currentWorkflowRef.current = workflow;

          const definitionJson = workflow.definitionJson as IntegrationDataFormatOptional | undefined;

          if (definitionJson) {
            setData({
              name: definitionJson.name ?? workflow.name,
              layoutDirection: definitionJson.layoutDirection,
              nodes: definitionJson.nodes,
              edges: definitionJson.edges,
            });
          }
        } catch {
          //
        }
      })();
    }, [workflowApi]);

    const handleSave: OnSave = useCallback(
      async (savingParams) => {
        if (!workflowApi) {
          showSnackbarSaveErrorIfNeeded(savingParams);
          return 'error';
        }

        const data = getStoreDataForIntegration();

        const definitionJson: Record<string, unknown> = {
          name: data.name,
          layoutDirection: data.layoutDirection,
          nodes: data.nodes,
          edges: data.edges,
        };

        try {
          let saved: WorkflowDetail;

          if (currentWorkflowRef.current) {
            // Update existing workflow
            saved = await workflowApi.update(currentWorkflowRef.current.id, {
              name: data.name,
              definitionJson,
            });
          } else {
            // Create new workflow
            saved = await workflowApi.create({
              name: data.name || 'Untitled Workflow',
              definitionJson,
            });

            // Update URL with new workflow ID without reloading
            const url = new URL(window.location.href);
            url.searchParams.set('workflowId', saved.id);
            window.history.replaceState({}, '', url.toString());
          }

          currentWorkflowRef.current = saved;
          showSnackbarSaveSuccessIfNeeded(savingParams);

          return 'success';
        } catch {
          //
        }

        showSnackbarSaveErrorIfNeeded(savingParams);

        return 'error';
      },
      [workflowApi],
    );

    // Show nothing while auth is loading
    if (isLoading) {
      return null;
    }

    // Redirect to login if not authenticated
    if (!isAuthenticated) {
      login();
      return null;
    }

    return (
      <IntegrationWrapper name={name} layoutDirection={layoutDirection} nodes={nodes} edges={edges} onSave={handleSave}>
        <WrappedComponent {...props} />
      </IntegrationWrapper>
    );
  }

  return WithIntegrationComponent;
}
