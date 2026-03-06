import { useState } from 'react';

interface CreateWorkflowDialogProps {
  onSubmit: (name: string) => void | Promise<void>;
  onCancel: () => void;
}

export function CreateWorkflowDialog({
  onSubmit,
  onCancel,
}: CreateWorkflowDialogProps) {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      void onSubmit(name.trim());
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '2rem',
          minWidth: '400px',
        }}
      >
        <h2 style={{ margin: '0 0 1rem 0' }}>Create New Workflow</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ margin: '1rem 0' }}>
            <label
              htmlFor="workflow-name"
              style={{ display: 'block', marginBottom: '0.5rem' }}
            >
              Workflow Name
            </label>
            <input
              id="workflow-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Workflow"
              autoFocus
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #ccc',
                borderRadius: '4px',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.5rem',
            }}
          >
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" disabled={!name.trim()}>
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
