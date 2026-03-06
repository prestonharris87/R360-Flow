import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkflowPersistence } from '../use-workflow-persistence';
import type { DiagramModel } from '@workflow-builder/types';
import type { WorkflowDetail } from '../../api/workflow-api';

// Mock the workflow API
const mockWorkflowApi = {
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

vi.mock('../../api/workflow-api', () => ({
  createWorkflowApi: () => mockWorkflowApi,
}));

const sampleDiagram: DiagramModel = {
  name: 'Test Workflow',
  layoutDirection: 'RIGHT',
  diagram: {
    nodes: [
      {
        id: 'node-1',
        type: 'start-node',
        position: { x: 100, y: 200 },
        data: {
          type: 'manualTrigger',
          icon: 'PlayCircle',
          properties: { label: 'Start' },
        },
      },
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  },
};

const sampleWorkflow: WorkflowDetail = {
  id: 'wf-123',
  name: 'Test Workflow',
  is_active: false,
  created_at: '2026-03-01T00:00:00Z',
  updated_at: '2026-03-01T00:00:00Z',
  created_by: 'user-1',
  definition_json: sampleDiagram,
};

describe('useWorkflowPersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads a workflow by ID', async () => {
    mockWorkflowApi.get.mockResolvedValueOnce(sampleWorkflow);

    const { result } = renderHook(() => useWorkflowPersistence(mockWorkflowApi));

    await act(async () => {
      await result.current.loadWorkflow('wf-123');
    });

    expect(mockWorkflowApi.get).toHaveBeenCalledWith('wf-123');
    expect(result.current.currentWorkflow).toEqual(sampleWorkflow);
    expect(result.current.isDirty).toBe(false);
  });

  it('saves a new workflow', async () => {
    mockWorkflowApi.create.mockResolvedValueOnce(sampleWorkflow);

    const { result } = renderHook(() => useWorkflowPersistence(mockWorkflowApi));

    await act(async () => {
      await result.current.saveWorkflow(sampleDiagram);
    });

    expect(mockWorkflowApi.create).toHaveBeenCalledWith({
      name: 'Test Workflow',
      definition_json: sampleDiagram,
    });
  });

  it('updates an existing workflow', async () => {
    mockWorkflowApi.get.mockResolvedValueOnce(sampleWorkflow);
    mockWorkflowApi.update.mockResolvedValueOnce({
      ...sampleWorkflow,
      updated_at: '2026-03-02T00:00:00Z',
    });

    const { result } = renderHook(() => useWorkflowPersistence(mockWorkflowApi));

    await act(async () => {
      await result.current.loadWorkflow('wf-123');
    });

    const updatedDiagram = { ...sampleDiagram, name: 'Updated Name' };
    await act(async () => {
      await result.current.saveWorkflow(updatedDiagram);
    });

    expect(mockWorkflowApi.update).toHaveBeenCalledWith('wf-123', {
      name: 'Updated Name',
      definition_json: updatedDiagram,
    });
  });

  it('tracks dirty state when diagram changes', async () => {
    mockWorkflowApi.get.mockResolvedValueOnce(sampleWorkflow);

    const { result } = renderHook(() => useWorkflowPersistence(mockWorkflowApi));

    await act(async () => {
      await result.current.loadWorkflow('wf-123');
    });

    expect(result.current.isDirty).toBe(false);

    act(() => {
      result.current.markDirty();
    });

    expect(result.current.isDirty).toBe(true);
  });

  it('resets dirty state after save', async () => {
    mockWorkflowApi.get.mockResolvedValueOnce(sampleWorkflow);
    mockWorkflowApi.update.mockResolvedValueOnce(sampleWorkflow);

    const { result } = renderHook(() => useWorkflowPersistence(mockWorkflowApi));

    await act(async () => {
      await result.current.loadWorkflow('wf-123');
    });

    act(() => {
      result.current.markDirty();
    });
    expect(result.current.isDirty).toBe(true);

    await act(async () => {
      await result.current.saveWorkflow(sampleDiagram);
    });

    expect(result.current.isDirty).toBe(false);
  });

  it('detects save conflicts via 409 response', async () => {
    const staleWorkflow = { ...sampleWorkflow };
    mockWorkflowApi.get.mockResolvedValueOnce(staleWorkflow);
    mockWorkflowApi.update.mockRejectedValueOnce(
      Object.assign(new Error('Conflict'), { status: 409 }),
    );

    const { result } = renderHook(() => useWorkflowPersistence(mockWorkflowApi));

    await act(async () => {
      await result.current.loadWorkflow('wf-123');
    });

    await act(async () => {
      try {
        await result.current.saveWorkflow(sampleDiagram);
      } catch {
        // expected
      }
    });

    expect(result.current.hasConflict).toBe(true);
  });

  it('isSaving prevents concurrent saves', async () => {
    mockWorkflowApi.get.mockResolvedValueOnce(sampleWorkflow);

    // Create a deferred promise so we can control when the update resolves
    let resolveUpdate!: (value: WorkflowDetail) => void;
    const updatePromise = new Promise<WorkflowDetail>((resolve) => {
      resolveUpdate = resolve;
    });
    mockWorkflowApi.update.mockReturnValueOnce(updatePromise);

    const { result } = renderHook(() => useWorkflowPersistence(mockWorkflowApi));

    // Load a workflow first
    await act(async () => {
      await result.current.loadWorkflow('wf-123');
    });

    // Start the first save (will hang on the promise)
    let firstSavePromise: Promise<void>;
    act(() => {
      firstSavePromise = result.current.saveWorkflow(sampleDiagram) as Promise<void>;
    });

    expect(result.current.isSaving).toBe(true);

    // Try a second save while the first is in flight
    await act(async () => {
      await result.current.saveWorkflow(sampleDiagram);
    });

    // Should only have been called once because the second was blocked
    expect(mockWorkflowApi.update).toHaveBeenCalledTimes(1);

    // Resolve the first save
    await act(async () => {
      resolveUpdate(sampleWorkflow);
      await firstSavePromise!;
    });

    expect(result.current.isSaving).toBe(false);
  });

  it('scheduleAutoSave debounces with configurable delay', async () => {
    mockWorkflowApi.get.mockResolvedValueOnce(sampleWorkflow);
    mockWorkflowApi.update.mockResolvedValueOnce(sampleWorkflow);

    const { result } = renderHook(() => useWorkflowPersistence(mockWorkflowApi));

    await act(async () => {
      await result.current.loadWorkflow('wf-123');
    });

    // Schedule auto-save with 5000ms delay
    act(() => {
      result.current.scheduleAutoSave(sampleDiagram, 5000);
    });

    // Advance time partially - should NOT have saved yet
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(mockWorkflowApi.update).not.toHaveBeenCalled();

    // Schedule again (debounce resets)
    act(() => {
      result.current.scheduleAutoSave(sampleDiagram, 5000);
    });

    // Advance the full delay
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(mockWorkflowApi.update).toHaveBeenCalledTimes(1);
  });

  it('cancelAutoSave clears the pending timer', async () => {
    mockWorkflowApi.get.mockResolvedValueOnce(sampleWorkflow);

    const { result } = renderHook(() => useWorkflowPersistence(mockWorkflowApi));

    await act(async () => {
      await result.current.loadWorkflow('wf-123');
    });

    // Schedule auto-save
    act(() => {
      result.current.scheduleAutoSave(sampleDiagram, 3000);
    });

    // Cancel before it fires
    act(() => {
      result.current.cancelAutoSave();
    });

    // Advance past the delay
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Should NOT have triggered a save
    expect(mockWorkflowApi.update).not.toHaveBeenCalled();
  });

  it('captures error on save failure', async () => {
    mockWorkflowApi.create.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useWorkflowPersistence(mockWorkflowApi));

    await act(async () => {
      try {
        await result.current.saveWorkflow(sampleDiagram);
      } catch {
        // expected
      }
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Network error');
    expect(result.current.isSaving).toBe(false);
  });

  it('clears error and hasConflict on successful load', async () => {
    // First, trigger an error state
    mockWorkflowApi.create.mockRejectedValueOnce(
      Object.assign(new Error('Conflict'), { status: 409 }),
    );

    const { result } = renderHook(() => useWorkflowPersistence(mockWorkflowApi));

    await act(async () => {
      try {
        await result.current.saveWorkflow(sampleDiagram);
      } catch {
        // expected
      }
    });

    expect(result.current.hasConflict).toBe(true);
    expect(result.current.error).not.toBeNull();

    // Now load a workflow - should clear error/conflict
    mockWorkflowApi.get.mockResolvedValueOnce(sampleWorkflow);

    await act(async () => {
      await result.current.loadWorkflow('wf-123');
    });

    expect(result.current.hasConflict).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('uses default 3000ms delay for scheduleAutoSave', async () => {
    mockWorkflowApi.get.mockResolvedValueOnce(sampleWorkflow);
    mockWorkflowApi.update.mockResolvedValueOnce(sampleWorkflow);

    const { result } = renderHook(() => useWorkflowPersistence(mockWorkflowApi));

    await act(async () => {
      await result.current.loadWorkflow('wf-123');
    });

    // Schedule with default delay
    act(() => {
      result.current.scheduleAutoSave(sampleDiagram);
    });

    // Advance less than 3000ms - should not save
    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(mockWorkflowApi.update).not.toHaveBeenCalled();

    // Advance past 3000ms
    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(mockWorkflowApi.update).toHaveBeenCalledTimes(1);
  });
});
