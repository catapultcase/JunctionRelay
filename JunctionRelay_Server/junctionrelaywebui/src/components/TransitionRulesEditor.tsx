/**
 * Server wrapper for TransitionRulesEditor from FrameEngine
 * Provides the Server-specific API implementation for global transition rules
 */
import { TransitionRulesEditor as FrameEngineTransitionRulesEditor, TransitionRulesAPI } from '@junctionrelay/frameengine';

interface TransitionRulesEditorProps {
  availableLayouts: Array<{ path: string; name: string; source: 'user' | 'bundled' | 'subscribed' }>;
}

// Stub API implementation - endpoints don't exist yet on Server backend
// Returns empty/default data to allow UI to render without errors
const transitionRulesApi: TransitionRulesAPI = {
  getTransitionRules: async () => {
    try {
      const response = await fetch('/api/transitionrules');
      if (!response.ok) {
        // Endpoint doesn't exist yet - return empty array
        return [];
      }
      const text = await response.text();
      // Check if response is JSON
      if (text.startsWith('<')) {
        return [];
      }
      return JSON.parse(text);
    } catch (err) {
      return [];
    }
  },
  getSensorMetadata: async () => {
    try {
      const response = await fetch('/api/sensors/metadata');
      if (!response.ok) {
        return { categories: {} };
      }
      const text = await response.text();
      if (text.startsWith('<')) {
        return { categories: {} };
      }
      return JSON.parse(text);
    } catch (err) {
      return { categories: {} };
    }
  },
  getLayoutMappings: async (path: string) => {
    const emptyResponse = {
      sensorTags: [],
      mappingCount: 0,
      mappingsByTag: {},
      additionalSensors: [],
      layoutName: 'Unknown'
    };
    try {
      const response = await fetch(`/api/frameengine/layouts/${encodeURIComponent(path)}/mappings`);
      if (!response.ok) {
        return emptyResponse;
      }
      const text = await response.text();
      if (text.startsWith('<')) {
        return emptyResponse;
      }
      return JSON.parse(text);
    } catch (err) {
      return emptyResponse;
    }
  },
  createTransitionRule: async (rule: unknown) => {
    try {
      const response = await fetch('/api/transitionrules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      });
      if (!response.ok) {
        throw new Error('API endpoint not implemented yet');
      }
      return response.json();
    } catch (err) {
      console.error('[TransitionRulesEditor] createTransitionRule not implemented:', err);
      throw new Error('Transition rules API not implemented yet on server');
    }
  },
  deleteTransitionRule: async (id: number) => {
    try {
      const response = await fetch(`/api/transitionrules/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('API endpoint not implemented yet');
      }
      return response.json();
    } catch (err) {
      console.error('[TransitionRulesEditor] deleteTransitionRule not implemented:', err);
      throw new Error('Transition rules API not implemented yet on server');
    }
  },
  reorderTransitionRules: async (data: unknown) => {
    try {
      const response = await fetch('/api/transitionrules/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error('API endpoint not implemented yet');
      }
      return response.json();
    } catch (err) {
      console.error('[TransitionRulesEditor] reorderTransitionRules not implemented:', err);
      throw new Error('Transition rules API not implemented yet on server');
    }
  },
  updateTransitionRule: async (id: number, rule: unknown) => {
    try {
      const response = await fetch(`/api/transitionrules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      });
      if (!response.ok) {
        throw new Error('API endpoint not implemented yet');
      }
      return response.json();
    } catch (err) {
      console.error('[TransitionRulesEditor] updateTransitionRule not implemented:', err);
      throw new Error('Transition rules API not implemented yet on server');
    }
  },
  getExternalSensors: async () => {
    // External sensors not implemented on Server yet - return empty array
    return [];
  },
};

export default function TransitionRulesEditor({ availableLayouts }: TransitionRulesEditorProps) {
  return (
    <FrameEngineTransitionRulesEditor
      availableLayouts={availableLayouts}
      api={transitionRulesApi}
      context="global"
    />
  );
}
