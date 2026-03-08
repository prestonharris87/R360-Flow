import { useState, useEffect, useCallback } from 'react';
import type { WorkflowSummary } from '../../api/workflow-api';
import type { createWorkflowApi } from '../../api/workflow-api';
import { WorkflowCard } from './workflow-card';
import { CreateWorkflowDialog } from './create-workflow-dialog';

interface WorkflowListProps {
  workflowApi: ReturnType<typeof createWorkflowApi>;
  onOpenWorkflow: (workflow: WorkflowSummary) => void;
}

export function WorkflowList({
  workflowApi,
  onOpenWorkflow,
}: WorkflowListProps) {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const fetchWorkflows = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await workflowApi.list();
      setWorkflows(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load workflows',
      );
    } finally {
      setIsLoading(false);
    }
  }, [workflowApi]);

  useEffect(() => {
    void fetchWorkflows();
  }, [fetchWorkflows]);

  const handleCreate = useCallback(
    async (name: string) => {
      try {
        const workflow = await workflowApi.create({
          name,
          definitionJson: {},
        });
        setShowCreateDialog(false);
        onOpenWorkflow(workflow);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to create workflow',
        );
      }
    },
    [workflowApi, onOpenWorkflow],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await workflowApi.delete(id);
        setWorkflows((prev) => prev.filter((w) => w.id !== id));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to delete workflow',
        );
      }
    },
    [workflowApi],
  );

  if (isLoading) {
    return (
      <div role="status">
        <p>Loading workflows...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert">
        <p>Error: {error}</p>
        <button onClick={() => void fetchWorkflows()} type="button">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem',
        }}
      >
        <h1 style={{ margin: 0 }}>Workflows</h1>
        <button onClick={() => setShowCreateDialog(true)} type="button">
          Create Workflow
        </button>
      </div>
      {workflows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p>No workflows yet. Create your first workflow to get started.</p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '1rem',
            padding: '1rem',
          }}
        >
          {workflows.map((w) => (
            <WorkflowCard
              key={w.id}
              workflow={w}
              onOpen={() => onOpenWorkflow(w)}
              onDelete={() => void handleDelete(w.id)}
            />
          ))}
        </div>
      )}
      {showCreateDialog && (
        <CreateWorkflowDialog
          onSubmit={handleCreate}
          onCancel={() => setShowCreateDialog(false)}
        />
      )}
    </div>
  );
}
