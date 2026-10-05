/*
 * This file is part of JunctionRelay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * JunctionRelay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * JunctionRelay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with JunctionRelay. If not, see <https://www.gnu.org/licenses/>.
 */

import React from 'react';
import {
    Modal,
    Box,
    Typography,
    LinearProgress,
    CircularProgress,
    Backdrop,
    Alert
} from '@mui/material';

/**
 * Props for the sensor addition progress modal
 */
export interface AddSensorsProgressModalProps {
    /** Whether modal is open */
    open: boolean;

    /** Total number of sensors to add */
    totalSensors: number;

    /** Number of sensors successfully added */
    addedSensors: number;

    /** Number of sensors skipped due to validation errors */
    skippedSensors?: number;

    /** Whether the operation is complete */
    isComplete: boolean;

    /** Whether an error occurred */
    hasError: boolean;

    /** Error message if any */
    errorMessage?: string;

    /** Callback when modal should close */
    onClose: () => void;
}

/**
 * Sensor Addition Progress Modal Component
 *
 * Displays progress during bulk sensor addition operations with:
 * - Linear progress bar showing sensor addition progress
 * - Count of sensors added (X of Y)
 * - Success/error messages
 * - Auto-close on success, manual close on error
 *
 * **Usage Example:**
 * ```typescript
 * <AddSensorsProgressModal
 *     open={addingSensors}
 *     totalSensors={fetchedSensors.length}
 *     addedSensors={addedCount}
 *     isComplete={operationComplete}
 *     hasError={!!error}
 *     errorMessage={error}
 *     onClose={handleCloseModal}
 * />
 * ```
 *
 * @param props - Component props
 */
export const AddSensorsProgressModal: React.FC<AddSensorsProgressModalProps> = ({
    open,
    totalSensors,
    addedSensors,
    skippedSensors = 0,
    isComplete,
    hasError,
    errorMessage,
    onClose
}) => {
    const progressPercentage = totalSensors > 0 ? (addedSensors / totalSensors) * 100 : 0;
    const hasPartialSuccess = skippedSensors > 0 && addedSensors > 0;

    // Auto-close on successful completion (but not partial success - let user see warning)
    React.useEffect(() => {
        if (isComplete && !hasError && !hasPartialSuccess) {
            const timer = setTimeout(() => {
                onClose();
            }, 1500);
            return () => clearTimeout(timer);
        }
    }, [isComplete, hasError, hasPartialSuccess, onClose]);

    return (
        <Modal
            open={open}
            onClose={hasError || isComplete ? onClose : undefined}
            closeAfterTransition
            BackdropComponent={Backdrop}
            BackdropProps={{
                timeout: 500,
                sx: { backgroundColor: 'rgba(0, 0, 0, 0.8)' }
            }}
        >
            <Box
                sx={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    bgcolor: 'background.paper',
                    borderRadius: 2,
                    boxShadow: 24,
                    p: 4,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    minWidth: 400,
                    maxWidth: 500
                }}
            >
                {hasError ? (
                    <>
                        {/* Error State */}
                        <Alert severity="error" sx={{ width: '100%' }}>
                            Failed to add sensors
                        </Alert>
                        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                            {errorMessage || 'An unknown error occurred'}
                        </Typography>
                        <Typography
                            variant="caption"
                            color="primary"
                            sx={{ mt: 1, cursor: 'pointer' }}
                            onClick={onClose}
                        >
                            Click to close
                        </Typography>
                    </>
                ) : isComplete ? (
                    <>
                        {/* Success State (or Partial Success) */}
                        <Alert severity={hasPartialSuccess ? "warning" : "success"} sx={{ width: '100%' }}>
                            {hasPartialSuccess
                                ? `Added ${addedSensors} sensors, skipped ${skippedSensors}`
                                : 'Successfully added all sensors!'}
                        </Alert>
                        <Typography variant="body1">
                            {addedSensors} of {totalSensors} sensors added
                        </Typography>
                        {hasPartialSuccess && (
                            <>
                                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                                    {skippedSensors} sensor{skippedSensors > 1 ? 's were' : ' was'} skipped due to missing Name or SensorType
                                </Typography>
                                <Typography
                                    variant="caption"
                                    color="primary"
                                    sx={{ mt: 1, cursor: 'pointer' }}
                                    onClick={onClose}
                                >
                                    Click to close
                                </Typography>
                            </>
                        )}
                    </>
                ) : (
                    <>
                        {/* Progress State */}
                        <CircularProgress size={48} />
                        <Typography variant="h6" component="h2">
                            Adding sensors...
                        </Typography>
                        <Box sx={{ width: '100%', mt: 1 }}>
                            <LinearProgress
                                variant="determinate"
                                value={progressPercentage}
                                sx={{ height: 8, borderRadius: 4 }}
                            />
                        </Box>
                        <Typography variant="body1" color="text.primary">
                            {addedSensors} of {totalSensors} sensors
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Please wait while we add the sensors...
                        </Typography>
                    </>
                )}
            </Box>
        </Modal>
    );
};

export default AddSensorsProgressModal;
