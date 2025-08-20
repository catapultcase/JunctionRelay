import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Card,
    CardContent,
    Alert,
    FormControlLabel,
    Checkbox,
    Paper,
    Button,
    Chip,
    Divider,
    List,
    ListItem,
    ListItemText,
    ListItemSecondaryAction,
    ListItemButton,
    CircularProgress
} from '@mui/material';
import {
    Dashboard as DashboardIcon,
    CheckCircle as CheckIcon,
    RadioButtonUnchecked as UncheckIcon,
    Save as SaveIcon,
    Refresh as RefreshIcon
} from '@mui/icons-material';

interface Junction {
    id: number;
    name: string;
    status: string;
    description?: string;
}

interface Service_HomeAssistantProps {
    serviceData: any;
    editMode: boolean;
    isLocked: boolean;
    onServiceUpdate: (field: string, value: any) => void;
    onShowSnackbar: (message: string, severity?: "success" | "error" | "info" | "warning") => void;
}

const Service_HomeAssistant: React.FC<Service_HomeAssistantProps> = ({
    serviceData,
    editMode,
    isLocked,
    onServiceUpdate,
    onShowSnackbar
}) => {
    const [junctions, setJunctions] = useState<Junction[]>([]);
    const [sharedJunctions, setSharedJunctions] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Load junctions from API
    const fetchJunctions = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/junctions');
            if (!response.ok) throw new Error('Failed to fetch junctions');

            const data = await response.json();
            setJunctions(data);
        } catch (error) {
            console.error('Error fetching junctions:', error);
            onShowSnackbar('Failed to load junctions', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Load shared junctions from service data
    useEffect(() => {
        if (serviceData?.homeAssistantSharedJunctions) {
            try {
                const parsed = JSON.parse(serviceData.homeAssistantSharedJunctions);
                setSharedJunctions(Array.isArray(parsed) ? parsed : []);
            } catch (error) {
                console.error('Error parsing shared junctions:', error);
                setSharedJunctions([]);
            }
        } else {
            setSharedJunctions([]);
        }
    }, [serviceData?.homeAssistantSharedJunctions]);

    // Load junctions on component mount
    useEffect(() => {
        fetchJunctions();
    }, []);

    // Toggle junction sharing
    const toggleJunctionSharing = (junctionId: string) => {
        if (isLocked) {
            onShowSnackbar('Please unlock the service first', 'warning');
            return;
        }

        const newSharedJunctions = sharedJunctions.includes(junctionId)
            ? sharedJunctions.filter(id => id !== junctionId)
            : [...sharedJunctions, junctionId];

        setSharedJunctions(newSharedJunctions);
    };

    // Save shared junctions
    const saveSharedJunctions = async () => {
        setSaving(true);
        try {
            const response = await fetch(`/api/services/${serviceData.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...serviceData,
                    homeAssistantSharedJunctions: JSON.stringify(sharedJunctions)
                })
            });

            if (!response.ok) throw new Error('Failed to save shared junctions');

            onShowSnackbar(`Updated shared junctions (${sharedJunctions.length} selected)`, 'success');

            // Update the parent component's service data
            onServiceUpdate('homeAssistantSharedJunctions', JSON.stringify(sharedJunctions));
        } catch (error) {
            console.error('Error saving shared junctions:', error);
            onShowSnackbar('Failed to save shared junctions', 'error');
        } finally {
            setSaving(false);
        }
    };

    // Select/deselect all junctions
    const toggleAllJunctions = () => {
        if (isLocked) {
            onShowSnackbar('Please unlock the service first', 'warning');
            return;
        }

        const allJunctionIds = junctions.map(j => j.id.toString());
        setSharedJunctions(sharedJunctions.length === allJunctionIds.length ? [] : allJunctionIds);
    };

    const getStatusColor = (status: string) => {
        switch (status?.toLowerCase()) {
            case 'running': return 'success';
            case 'idle': return 'default';
            case 'error': return 'error';
            default: return 'default';
        }
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Service Information */}
            <Alert severity="info" icon={<DashboardIcon />}>
                <Typography variant="body2">
                    <strong>HomeAssistant Integration:</strong> This service controls which junctions are accessible
                    to your HomeAssistant integration. HomeAssistant will call JunctionRelay APIs to get junction
                    data and control junctions.
                </Typography>
            </Alert>

            {/* Service Status */}
            <Card elevation={1}>
                <CardContent>
                    <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'medium' }}>
                        Service Status
                    </Typography>

                    <Box sx={{
                        p: 2,
                        bgcolor: 'action.hover',
                        borderRadius: 1,
                        textAlign: 'center'
                    }}>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Service:</strong> {serviceData?.status || 'Unknown'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>Shared Junctions:</strong> {sharedJunctions.length} of {junctions.length}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>API Endpoint:</strong> /api/homeassistant/*
                        </Typography>
                    </Box>
                </CardContent>
            </Card>

            {/* Junction Selection */}
            <Card elevation={1}>
                <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 'medium' }}>
                            Junction Sharing Configuration
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button
                                variant="outlined"
                                onClick={fetchJunctions}
                                disabled={loading}
                                startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
                                size="small"
                            >
                                Refresh
                            </Button>
                            <Button
                                variant="contained"
                                onClick={saveSharedJunctions}
                                disabled={saving || isLocked}
                                startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
                                size="small"
                            >
                                {saving ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </Box>
                    </Box>

                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Select which junctions should be accessible to HomeAssistant. Only selected junctions
                        will appear as sensors and switches in your HomeAssistant instance.
                    </Typography>

                    {/* Select All Toggle */}
                    {junctions.length > 0 && (
                        <>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={sharedJunctions.length === junctions.length}
                                        indeterminate={sharedJunctions.length > 0 && sharedJunctions.length < junctions.length}
                                        onChange={toggleAllJunctions}
                                        disabled={isLocked}
                                    />
                                }
                                label={`Select All (${sharedJunctions.length}/${junctions.length})`}
                                sx={{ mb: 1 }}
                            />
                            <Divider sx={{ mb: 2 }} />
                        </>
                    )}

                    {/* Junction List */}
                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                            <CircularProgress size={24} />
                            <Typography sx={{ ml: 2 }}>Loading junctions...</Typography>
                        </Box>
                    ) : junctions.length > 0 ? (
                        <Paper variant="outlined" sx={{ maxHeight: 400, overflow: 'auto' }}>
                            <List dense>
                                {junctions.map((junction) => {
                                    const isShared = sharedJunctions.includes(junction.id.toString());

                                    return (
                                        <ListItem
                                            key={junction.id}
                                            disablePadding
                                            sx={{
                                                bgcolor: isShared ? 'action.selected' : 'transparent'
                                            }}
                                        >
                                            <ListItemButton
                                                onClick={() => toggleJunctionSharing(junction.id.toString())}
                                                disabled={isLocked}
                                                sx={{
                                                    '&:hover': {
                                                        bgcolor: 'action.hover'
                                                    }
                                                }}
                                            >
                                                <Box sx={{ display: 'flex', alignItems: 'center', mr: 2 }}>
                                                    {isShared ?
                                                        <CheckIcon color="success" fontSize="small" /> :
                                                        <UncheckIcon color="disabled" fontSize="small" />
                                                    }
                                                </Box>

                                                <ListItemText
                                                    primary={
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                            <Typography variant="body2" fontWeight="medium">
                                                                {junction.name}
                                                            </Typography>
                                                            <Chip
                                                                label={junction.status}
                                                                color={getStatusColor(junction.status)}
                                                                size="small"
                                                                variant="outlined"
                                                            />
                                                        </Box>
                                                    }
                                                    secondary={
                                                        <Box>
                                                            <Typography variant="caption" color="text.secondary">
                                                                ID: {junction.id}
                                                            </Typography>
                                                            {junction.description && (
                                                                <Typography variant="caption" color="text.secondary" display="block">
                                                                    {junction.description}
                                                                </Typography>
                                                            )}
                                                        </Box>
                                                    }
                                                />
                                            </ListItemButton>

                                            <ListItemSecondaryAction>
                                                <Checkbox
                                                    checked={isShared}
                                                    onChange={() => toggleJunctionSharing(junction.id.toString())}
                                                    disabled={isLocked}
                                                />
                                            </ListItemSecondaryAction>
                                        </ListItem>
                                    );
                                })}
                            </List>
                        </Paper>
                    ) : (
                        <Paper sx={{ p: 3, textAlign: 'center' }}>
                            <Typography variant="body2" color="text.secondary">
                                No junctions found. Create some junctions first to share them with HomeAssistant.
                            </Typography>
                        </Paper>
                    )}
                </CardContent>
            </Card>

            {/* Integration Instructions */}
            <Alert severity="success">
                <Typography variant="body2">
                    <strong>Next Steps:</strong> After configuring shared junctions, install the JunctionRelay
                    HomeAssistant integration and point it to this JunctionRelay instance. Selected junctions
                    will appear as entities with IDs like <code>sensor.junctionrelay_junction_1</code>.
                </Typography>
            </Alert>
        </Box>
    );
};

export default Service_HomeAssistant;