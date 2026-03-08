import { SnackbarType } from '@synergycodes/overflow-ui';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import { showSnackbar } from '@/utils/show-snackbar';

import useStore from '@/store/store';
import { setStoreDataFromIntegration } from '@/store/slices/diagram-slice/actions';
import { FIT_VIEW_DURATION_TIME, FIT_VIEW_MAX_ZOOM, FIT_VIEW_PADDING } from '@/features/diagram/diagram.const';

import { openTemplateSelectorModal } from '@/features/modals/template-selector/open-template-selector-modal';

import { IntegrationDataFormat } from '../types';

type IntegrationSavingStatus = 'disabled' | 'waiting' | 'saving' | 'saved' | 'notSaved';

type IntegrationStore = {
  savingStatus: IntegrationSavingStatus;
  lastSaveAttemptTimestamp: number;
};

export const useIntegrationStore = create<IntegrationStore>()(
  devtools(
    () =>
      ({
        savingStatus: 'disabled',
        lastSaveAttemptTimestamp: Date.now(),
      }) satisfies IntegrationStore,
    { name: 'integrationStore' },
  ),
);

export function loadData(loadData: Partial<IntegrationDataFormat>) {
  const hasAnyData = Object.values(loadData).some(Boolean);
  if (hasAnyData) {
    setStoreDataFromIntegration(loadData);

    // Fit viewport to loaded nodes — must use requestAnimationFrame so React
    // commits the node update to DOM before React Flow measures positions.
    requestAnimationFrame(() => {
      const instance = useStore.getState().reactFlowInstance;
      if (instance) {
        instance.fitView({
          duration: FIT_VIEW_DURATION_TIME,
          maxZoom: FIT_VIEW_MAX_ZOOM,
          padding: FIT_VIEW_PADDING,
        });
      }
    });

    showSnackbar({
      title: 'restoreDiagramSuccess',
      variant: SnackbarType.SUCCESS,
    });
  } else {
    // Welcome modal for no data
    openTemplateSelectorModal();
  }

  useIntegrationStore.setState({
    savingStatus: 'waiting',
    lastSaveAttemptTimestamp: Date.now(),
  });
}

export function getStoreSavingStatus() {
  return useIntegrationStore.getState().savingStatus;
}

export function setStoreSavingStatus(savingStatus: IntegrationSavingStatus) {
  return useIntegrationStore.setState((state) => ({
    savingStatus,
    lastSaveAttemptTimestamp: savingStatus === 'saved' ? Date.now() : state.lastSaveAttemptTimestamp,
  }));
}
