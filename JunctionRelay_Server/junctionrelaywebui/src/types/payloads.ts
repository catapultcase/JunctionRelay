import type { ViewMode } from './devices';

const VIEW_MODES: readonly ViewMode[] = ['table', 'standard', 'mini'];

/** A stored or broadcast view mode string, narrowed to one of the modes the list pages know. */
export const isViewMode = (value: unknown): value is ViewMode =>
    VIEW_MODES.some((mode) => mode === value);

/** The `detail` of a 'bottom-action-view-mode-change' CustomEvent, if it carries a valid mode. */
export const viewModeFromEvent = (e: Event): ViewMode | null => {
    if (!(e instanceof CustomEvent)) return null;
    const detail: unknown = e.detail;
    if (typeof detail !== 'object' || detail === null || !('mode' in detail)) return null;
    return isViewMode(detail.mode) ? detail.mode : null;
};

/** Model_PayloadResult: one screen's generated payload (binaryPayload is byte[] - base64 in JSON). */
export interface PayloadResult {
    binaryPayload: string;
    uncompressedJson: string;
    uncompressedPrefix: string;
    compressedPrefix: string;
    isCompressed: boolean;
    payloadType: string;
}

/** Model_PayloadResultCollection: generated payloads keyed by screen key (keys are not camelCased). */
export interface PayloadResultCollection {
    results: Record<string, PayloadResult>;
}

/** POST /api/payloads/{id}/preview-payload */
export interface PreviewPayloadResponse {
    configPayload?: PayloadResultCollection | null;
    sensorPayload?: PayloadResultCollection | null;
}
