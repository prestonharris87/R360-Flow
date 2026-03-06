import type { WorkflowSummary } from '../../api/workflow-api';

interface WorkflowCardProps {
  workflow: WorkflowSummary;
  onOpen: () => void;
  onDelete: () => void;
}

export function WorkflowCard({ workflow, onOpen, onDelete }: WorkflowCardProps) {
  const updatedAt = new Date(workflow.updated_at).toLocaleDateString();

  return (
    <div
      style={{
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        padding: '1rem',
        cursor: 'pointer',
      }}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <h3 style={{ margin: '0 0 0.5rem 0' }}>{workflow.name}</h3>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '0.5rem',
        }}
      >
        <span style={{ fontSize: '0.75rem', color: '#999' }}>
          Updated: {updatedAt}
        </span>
        <span
          style={{
            fontSize: '0.75rem',
            padding: '2px 8px',
            borderRadius: '4px',
            backgroundColor: workflow.is_active ? '#e8f5e9' : '#f5f5f5',
            color: workflow.is_active ? '#2e7d32' : '#666',
          }}
        >
          {workflow.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (confirm('Delete this workflow?')) onDelete();
        }}
        style={{
          marginTop: '0.5rem',
          color: '#d32f2f',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '0.875rem',
          padding: '4px 0',
        }}
        type="button"
      >
        Delete
      </button>
    </div>
  );
}
