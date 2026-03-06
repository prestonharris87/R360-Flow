import { useCallback, useRef, useState } from 'react';
import type { DiagramModel } from '@workflow-builder/types';
import type { WorkflowDetail } from '../api/workflow-api';

export interface WorkflowApi {
  list: (
    page?: number,
    pageSize?: number,
  ) => Promise<{ workflows: WorkflowDetail[]; total: number }>;
  get: (id: string) => Promise<WorkflowDetail>;
  create: (input: {
    name: string;
    definition_json: DiagramModel;
  }) => Promise<WorkflowDetail>;
  update: (
    id: string,
    input: { name?: string; definition_json?: DiagramModel },
  ) => Promise<WorkflowDetail>;
  delete: (id: string) => Promise<void>;
}

export function useWorkflowPersistence(api: WorkflowApi) {
  const [currentWorkflow, setCurrentWorkflow] =
    useState<WorkflowDetail | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasConflict, setHasConflict] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadWorkflow = useCallback(
    async (id: string) => {
      setError(null);
      setHasConflict(false);
      const workflow = await api.get(id);
      setCurrentWorkflow(workflow);
      setIsDirty(false);
      return workflow;
    },
    [api],
  );

  const saveWorkflow = useCallback(
    async (diagram: DiagramModel) => {
      if (isSaving) return;
      setIsSaving(true);
      setError(null);
      try {
        let saved: WorkflowDetail;
        if (currentWorkflow) {
          saved = await api.update(currentWorkflow.id, {
            name: diagram.name,
            definition_json: diagram,
          });
        } else {
          saved = await api.create({
            name: diagram.name,
            definition_json: diagram,
          });
        }
        setCurrentWorkflow(saved);
        setIsDirty(false);
        setHasConflict(false);
        return saved;
      } catch (err: unknown) {
        if (
          err &&
          typeof err === 'object' &&
          'status' in err &&
          (err as { status: number }).status === 409
        ) {
          setHasConflict(true);
        }
        setError(err instanceof Error ? err : new Error('Save failed'));
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [api, currentWorkflow, isSaving],
  );

  const markDirty = useCallback(() => {
    setIsDirty(true);
  }, []);

  const scheduleAutoSave = useCallback(
    (diagram: DiagramModel, delayMs = 3000) => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      autoSaveTimerRef.current = setTimeout(() => {
        saveWorkflow(diagram).catch(() => {
          // Auto-save failures are silently logged
        });
      }, delayMs);
    },
    [saveWorkflow],
  );

  const cancelAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, []);

  const exportAsJson = useCallback(
    (diagram: DiagramModel) => {
      const blob = new Blob([JSON.stringify(diagram, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${diagram.name || 'workflow'}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [],
  );

  return {
    currentWorkflow,
    isDirty,
    isSaving,
    hasConflict,
    error,
    loadWorkflow,
    saveWorkflow,
    markDirty,
    scheduleAutoSave,
    cancelAutoSave,
    exportAsJson,
  };
}
