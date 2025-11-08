import React, { useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Radio,
    RadioGroup,
    FormControlLabel,
    FormControl,
    Typography,
    Box,
    Alert
} from '@mui/material';
import {
    CloudSync as MigrateIcon,
    AddCircleOutline as NewIcon
} from '@mui/icons-material';

interface ImportModeModalProps {
    open: boolean;
    onClose: () => void;
    onConfirm: (preserveIds: boolean) => void;
    layoutName: string;
    cloudVariantId: string;
}

const FrameEngine_ImportModeModal: React.FC<ImportModeModalProps> = ({
    open,
    onClose,
    onConfirm,
    layoutName,
    cloudVariantId
}) => {
    const [selectedMode, setSelectedMode] = useState<'migrate' | 'new'>('migrate');

    const handleConfirm = () => {
        const preserveIds = selectedMode === 'migrate';
        onConfirm(preserveIds);
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
        >
            <DialogTitle>
                Import User Layout
            </DialogTitle>
            <DialogContent>
                <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                        Importing: <strong>{layoutName}</strong>
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        Variant ID: {cloudVariantId}
                    </Typography>
                </Box>

                <FormControl component="fieldset" fullWidth>
                    <RadioGroup
                        value={selectedMode}
                        onChange={(e) => setSelectedMode(e.target.value as 'migrate' | 'new')}
                    >
                        {/* Migration Mode */}
                        <Box
                            sx={{
                                border: '1px solid',
                                borderColor: selectedMode === 'migrate' ? 'primary.main' : 'divider',
                                borderRadius: 1,
                                p: 2,
                                mb: 2,
                                cursor: 'pointer',
                                '&:hover': {
                                    borderColor: 'primary.main',
                                    bgcolor: 'action.hover'
                                }
                            }}
                            onClick={() => setSelectedMode('migrate')}
                        >
                            <FormControlLabel
                                value="migrate"
                                control={<Radio />}
                                label={
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <MigrateIcon color="primary" />
                                        <Box>
                                            <Typography variant="body1" fontWeight={500}>
                                                Migrate Layout
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                Preserve template identity and snapshot history
                                            </Typography>
                                        </Box>
                                    </Box>
                                }
                                sx={{ m: 0, width: '100%' }}
                            />
                        </Box>

                        {/* New Layout Mode */}
                        <Box
                            sx={{
                                border: '1px solid',
                                borderColor: selectedMode === 'new' ? 'primary.main' : 'divider',
                                borderRadius: 1,
                                p: 2,
                                cursor: 'pointer',
                                '&:hover': {
                                    borderColor: 'primary.main',
                                    bgcolor: 'action.hover'
                                }
                            }}
                            onClick={() => setSelectedMode('new')}
                        >
                            <FormControlLabel
                                value="new"
                                control={<Radio />}
                                label={
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <NewIcon color="success" />
                                        <Box>
                                            <Typography variant="body1" fontWeight={500}>
                                                Import as New Layout
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                Create a fresh layout with new identity (no snapshot history)
                                            </Typography>
                                        </Box>
                                    </Box>
                                }
                                sx={{ m: 0, width: '100%' }}
                            />
                        </Box>
                    </RadioGroup>
                </FormControl>

                {selectedMode === 'migrate' && (
                    <Alert severity="warning" sx={{ mt: 2 }}>
                        <Typography variant="body2">
                            <strong>Note:</strong> If a layout with this Variant ID already exists, the import will fail.
                            You must delete the existing layout first, or choose "Import as New Layout" instead.
                        </Typography>
                    </Alert>
                )}

                {selectedMode === 'new' && (
                    <Alert severity="info" sx={{ mt: 2 }}>
                        <Typography variant="body2">
                            A new Variant ID will be generated. Any cloud snapshots from the original layout will not be accessible.
                        </Typography>
                    </Alert>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    onClick={handleConfirm}
                    variant="contained"
                    color="primary"
                >
                    {selectedMode === 'migrate' ? 'Migrate Layout' : 'Import as New'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default FrameEngine_ImportModeModal;
