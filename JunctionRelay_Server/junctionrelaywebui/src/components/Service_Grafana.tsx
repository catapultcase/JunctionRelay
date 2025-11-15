import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Card,
    CardContent,
    Alert,
    Paper,
    Chip,
    Divider,
    List,
    ListItem,
    ListItemText,
    ListItemIcon,
    ListItemButton,
    FormControlLabel,
    Checkbox,
    Button,
    CircularProgress
} from '@mui/material';
import {
    Analytics as AnalyticsIcon,
    Security as SecurityIcon,
    Storage as StorageIcon,
    TrendingUp as TrendingUpIcon,
    Assessment as AssessmentIcon,
    Timeline as TimelineIcon,
    Save as SaveIcon,
    CheckCircle as CheckIcon,
    RadioButtonUnchecked as UncheckIcon
} from '@mui/icons-material';

interface Service_GrafanaProps {
    serviceData: any;
    editMode: boolean;
    isLocked: boolean;
    onServiceUpdate: (field: string, value: any) => void;
    onShowSnackbar: (message: string, severity?: "success" | "error" | "info" | "warning") => void;
}

const Service_Grafana: React.FC<Service_GrafanaProps> = ({
    serviceData,
    editMode,
    isLocked,
    onServiceUpdate,
    onShowSnackbar
}) => {
    const [sharedMetrics, setSharedMetrics] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);

    // Available metric types
    const availableMetrics = [
        { id: 'junctions', name: 'Junction States', description: 'Junction status and operational data' },
        { id: 'sensors', name: 'Sensor Data', description: 'Time series sensor readings and values' },
        { id: 'system', name: 'System Metrics', description: 'System health and performance data' },
        { id: 'events', name: 'System Events', description: 'System events and alerts' }
    ];

    // Load shared metrics from service data
    useEffect(() => {
        if (serviceData?.grafanaSharedMetrics) {
            try {
                const parsed = JSON.parse(serviceData.grafanaSharedMetrics);
                setSharedMetrics(Array.isArray(parsed) ? parsed : []);
            } catch (error) {
                console.error('Error parsing shared metrics:', error);
                setSharedMetrics([]);
            }
        } else {
            setSharedMetrics([]);
        }
    }, [serviceData?.grafanaSharedMetrics]);

    // Toggle metric sharing
    const toggleMetricSharing = (metricId: string) => {
        if (isLocked) {
            onShowSnackbar('Please unlock the service first', 'warning');
            return;
        }

        const newSharedMetrics = sharedMetrics.includes(metricId)
            ? sharedMetrics.filter(id => id !== metricId)
            : [...sharedMetrics, metricId];

        setSharedMetrics(newSharedMetrics);
    };

    // Save shared metrics
    const saveSharedMetrics = async () => {
        setSaving(true);
        try {
            const response = await fetch(`/api/services/${serviceData.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...serviceData,
                    grafanaSharedMetrics: JSON.stringify(sharedMetrics)
                })
            });

            if (!response.ok) throw new Error('Failed to save shared metrics');

            onShowSnackbar(`Updated shared metrics (${sharedMetrics.length} selected)`, 'success');

            // Update the parent component's service data
            onServiceUpdate('grafanaSharedMetrics', JSON.stringify(sharedMetrics));
        } catch (error) {
            console.error('Error saving shared metrics:', error);
            onShowSnackbar('Failed to save shared metrics', 'error');
        } finally {
            setSaving(false);
        }
    };

    // Select/deselect all metrics
    const toggleAllMetrics = () => {
        if (isLocked) {
            onShowSnackbar('Please unlock the service first', 'warning');
            return;
        }

        const allMetricIds = availableMetrics.map(m => m.id);
        setSharedMetrics(sharedMetrics.length === allMetricIds.length ? [] : allMetricIds);
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Service Information */}
            <Alert severity="info" icon={<AnalyticsIcon />}>
                <Typography variant="body2">
                    <strong>Grafana Data Source:</strong> This service provides data endpoints for Grafana dashboards.
                    Grafana will pull data from JunctionRelay using the API Backend datasource plugin.
                    Configure which metrics to share below.
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
                            <strong>Shared Metrics:</strong> {sharedMetrics.length} of {availableMetrics.length}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            <strong>API Endpoints:</strong> /api/grafana/*
                        </Typography>
                    </Box>
                </CardContent>
            </Card>

            {/* Metrics Selection */}
            <Card elevation={1}>
                <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 'medium' }}>
                            Metrics Sharing Configuration
                        </Typography>
                        <Button
                            variant="contained"
                            onClick={saveSharedMetrics}
                            disabled={saving || isLocked}
                            startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
                            size="small"
                        >
                            {saving ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </Box>

                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Select which metric types should be available to Grafana. Only selected metrics
                        will be accessible via the API endpoints.
                    </Typography>

                    {/* Select All Toggle */}
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={sharedMetrics.length === availableMetrics.length}
                                indeterminate={sharedMetrics.length > 0 && sharedMetrics.length < availableMetrics.length}
                                onChange={toggleAllMetrics}
                                disabled={isLocked}
                            />
                        }
                        label={`Select All (${sharedMetrics.length}/${availableMetrics.length})`}
                        sx={{ mb: 1 }}
                    />
                    <Divider sx={{ mb: 2 }} />

                    {/* Metrics List */}
                    <Paper variant="outlined" sx={{ maxHeight: 300, overflow: 'auto' }}>
                        <List dense>
                            {availableMetrics.map((metric) => {
                                const isShared = sharedMetrics.includes(metric.id);

                                return (
                                    <ListItem
                                        key={metric.id}
                                        disablePadding
                                        sx={{
                                            bgcolor: isShared ? 'action.selected' : 'transparent'
                                        }}
                                    >
                                        <ListItemButton
                                            onClick={() => toggleMetricSharing(metric.id)}
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
                                                    <Typography variant="body2" fontWeight="medium">
                                                        {metric.name}
                                                    </Typography>
                                                }
                                                secondary={
                                                    <Typography variant="caption" color="text.secondary">
                                                        {metric.description}
                                                    </Typography>
                                                }
                                            />
                                        </ListItemButton>
                                    </ListItem>
                                );
                            })}
                        </List>
                    </Paper>
                </CardContent>
            </Card>

            {/* Integration Features */}
            <Card elevation={1}>
                <CardContent>
                    <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'medium' }}>
                        Integration Features
                    </Typography>

                    <List dense>
                        <ListItem>
                            <ListItemIcon>
                                <StorageIcon color="primary" />
                            </ListItemIcon>
                            <ListItemText
                                primary="Data Source Provider"
                                secondary="JunctionRelay provides data endpoints that Grafana can consume"
                            />
                        </ListItem>

                        <ListItem>
                            <ListItemIcon>
                                <AssessmentIcon color="primary" />
                            </ListItemIcon>
                            <ListItemText
                                primary="Real-time Dashboards"
                                secondary="Create live dashboards using junction and sensor data"
                            />
                        </ListItem>

                        <ListItem>
                            <ListItemIcon>
                                <TrendingUpIcon color="primary" />
                            </ListItemIcon>
                            <ListItemText
                                primary="Historical Analysis"
                                secondary="Analyze trends and patterns in your data over time"
                            />
                        </ListItem>

                        <ListItem>
                            <ListItemIcon>
                                <TimelineIcon color="primary" />
                            </ListItemIcon>
                            <ListItemText
                                primary="Custom Visualizations"
                                secondary="Build custom charts and graphs using Grafana's visualization tools"
                            />
                        </ListItem>
                    </List>
                </CardContent>
            </Card>

            {/* Setup Instructions */}
            <Card elevation={1}>
                <CardContent>
                    <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'medium' }}>
                        Grafana Setup Instructions
                    </Typography>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Paper sx={{ p: 2, bgcolor: 'action.hover' }}>
                            <Typography variant="body2" sx={{ mb: 1, fontWeight: 'medium' }}>
                                1. Install API Backend Plugin
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                In Grafana, install the "API Backend" datasource plugin from the plugin marketplace.
                            </Typography>
                        </Paper>

                        <Paper sx={{ p: 2, bgcolor: 'action.hover' }}>
                            <Typography variant="body2" sx={{ mb: 1, fontWeight: 'medium' }}>
                                2. Add JunctionRelay Data Source
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                Add a new data source pointing to: {window.location.origin}/api/grafana
                            </Typography>
                        </Paper>

                        <Paper sx={{ p: 2, bgcolor: 'action.hover' }}>
                            <Typography variant="body2" sx={{ mb: 1, fontWeight: 'medium' }}>
                                3. Create Dashboards
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                Build dashboards using the JunctionRelay data source with your selected metrics.
                            </Typography>
                        </Paper>
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    <Alert severity="success">
                        <Typography variant="body2">
                            <strong>Available Endpoints:</strong> JunctionRelay provides the following API endpoints
                            for Grafana integration: /api/grafana/junctions, /api/grafana/sensors, /api/grafana/system, /api/grafana/metrics
                        </Typography>
                    </Alert>
                </CardContent>
            </Card>
        </Box>
    );
};

export default Service_Grafana;