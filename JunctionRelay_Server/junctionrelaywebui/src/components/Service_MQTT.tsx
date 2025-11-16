import React, { useState, useEffect } from 'react';
import {
    Box,
    TextField,
    Button,
    Typography,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    Paper,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Card,
    CardContent,
    Alert
} from '@mui/material';
import {
    ConnectWithoutContact as ConnectIcon,
    LinkOff as DisconnectIcon,
    Add as AddIcon,
    Remove as RemoveIcon,
    Security as SecurityIcon
} from '@mui/icons-material';

interface Subscription {
    topic: string;
    qos: number;
}

interface Service_MQTTProps {
    serviceData: any;
    editMode: boolean;
    isLocked: boolean;
    onServiceUpdate: (field: string, value: any) => void;
    onShowSnackbar: (message: string, severity?: "success" | "error" | "info" | "warning") => void;
}

const Service_MQTT: React.FC<Service_MQTTProps> = ({
    serviceData,
    editMode,
    isLocked,
    onServiceUpdate,
    onShowSnackbar
}) => {
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [showAddSubscriptionModal, setShowAddSubscriptionModal] = useState(false);
    const [newTopic, setNewTopic] = useState('');
    const [newTopicQoS, setNewTopicQoS] = useState<number>(0);
    const [accessTokenChanged, setAccessTokenChanged] = useState(false);
    const [originalAccessToken, setOriginalAccessToken] = useState('');

    // Initialize original access token
    useEffect(() => {
        setOriginalAccessToken(serviceData?.accessToken || '');
    }, [serviceData?.accessToken]);

    // Fetch subscriptions
    const fetchSubscriptions = async () => {
        if (isLocked || !serviceData?.id) return;

        try {
            const response = await fetch(`/api/services/subscriptions/${serviceData.id}`);
            if (!response.ok) {
                if (response.status === 500) {
                    setSubscriptions([]);
                    return;
                }
                throw new Error('Failed to fetch subscriptions');
            }

            const data = await response.json();
            const subscriptions: Subscription[] = (data.subscriptions || []).map((sub: any) => ({
                topic: sub.topic,
                qos: typeof sub.qos === 'string' ? parseInt(sub.qos, 10) : sub.qos || 0
            }));

            setSubscriptions(subscriptions);
        } catch (error) {
            console.error('Error fetching subscriptions:', error);
            setSubscriptions([]);
        }
    };

    useEffect(() => {
        fetchSubscriptions();
    }, [serviceData?.id, isLocked]);

    // Handle access token change
    const handleAccessTokenChange = (value: string) => {
        setAccessTokenChanged(true);
        onServiceUpdate('accessToken', value);
    };

    // Get access token display value
    const getAccessTokenDisplay = () => {
        if (originalAccessToken && !accessTokenChanged) {
            return '••••••••••••••••';
        }
        return serviceData?.accessToken || '';
    };

    const getAccessTokenHelperText = () => {
        if (originalAccessToken && !accessTokenChanged) {
            return 'Encrypted password exists. Enter new password to change it.';
        }
        return 'MQTT password (will be encrypted when saved)';
    };

    // MQTT Connection handlers
    const handleConnect = async () => {
        if (isLocked) {
            onShowSnackbar('Please unlock the service first', 'warning');
            return;
        }

        try {
            const response = await fetch(`/api/services/connect-to-mqtt/${serviceData.id}`, {
                method: 'POST'
            });
            if (!response.ok) throw new Error('Failed to connect');
            onShowSnackbar('Connected to MQTT broker', 'success');
        } catch (error) {
            onShowSnackbar('Connect failed', 'error');
            console.error(error);
        }
    };

    const handleDisconnect = async () => {
        try {
            const response = await fetch(`/api/services/disconnect-from-mqtt/${serviceData.id}`, {
                method: 'POST'
            });
            if (!response.ok) throw new Error('Failed to disconnect');
            onShowSnackbar('Disconnected from MQTT broker', 'success');
        } catch (error) {
            onShowSnackbar('Disconnect failed', 'error');
            console.error(error);
        }
    };

    // Subscription management
    const handleAddSubscription = async () => {
        if (isLocked) {
            onShowSnackbar('Please unlock the service first', 'warning');
            return;
        }

        try {
            const response = await fetch(`/api/services/subscribe/${serviceData.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic: newTopic, qos: newTopicQoS })
            });

            if (!response.ok) throw new Error('Failed to add subscription');
            onShowSnackbar('Subscription added!', 'success');
            setNewTopic('');
            setNewTopicQoS(0);
            setShowAddSubscriptionModal(false);
            await fetchSubscriptions();
        } catch (error) {
            onShowSnackbar('Failed to subscribe', 'error');
        }
    };

    const handleRemoveSubscription = async (topic: string) => {
        if (isLocked) {
            onShowSnackbar('Please unlock the service first', 'warning');
            return;
        }

        try {
            const response = await fetch(`/api/services/unsubscribe/${serviceData.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic })
            });

            if (!response.ok) throw new Error('Unsubscribe failed');
            onShowSnackbar('Unsubscribed successfully', 'success');
            await fetchSubscriptions();
        } catch (error) {
            console.error('Unsubscribe error:', error);
            onShowSnackbar('Unsubscribe failed', 'error');
        }
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* MQTT Connection Settings */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                    label="MQTT Broker Address"
                    value={serviceData?.mqttBrokerAddress || ''}
                    onChange={(e) => onServiceUpdate('mqttBrokerAddress', e.target.value)}
                    disabled={!editMode || isLocked}
                    size="small"
                    placeholder="localhost"
                />

                <TextField
                    label="MQTT Broker Port"
                    type="number"
                    value={serviceData?.mqttBrokerPort || 1883}
                    onChange={(e) => onServiceUpdate('mqttBrokerPort', parseInt(e.target.value) || 1883)}
                    disabled={!editMode || isLocked}
                    size="small"
                />

                <TextField
                    label="MQTT Username"
                    value={serviceData?.mqttUsername || ''}
                    onChange={(e) => onServiceUpdate('mqttUsername', e.target.value)}
                    disabled={!editMode || isLocked}
                    size="small"
                />

                <TextField
                    label="MQTT Password"
                    type="password"
                    value={getAccessTokenDisplay()}
                    onChange={(e) => handleAccessTokenChange(e.target.value)}
                    disabled={!editMode || isLocked}
                    size="small"
                    helperText={editMode ? getAccessTokenHelperText() : ''}
                    placeholder={originalAccessToken && !accessTokenChanged ? 'Enter new password to change existing' : ''}
                />
            </Box>

            {/* MQTT Management Section */}
            <Card elevation={1}>
                <CardContent>
                    <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'medium' }}>
                        MQTT Management
                    </Typography>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button
                                variant="contained"
                                color="success"
                                onClick={handleConnect}
                                disabled={isLocked}
                                startIcon={<ConnectIcon />}
                                size="small"
                            >
                                {isLocked ? 'Unlock First' : 'Connect'}
                            </Button>
                            <Button
                                variant="contained"
                                color="error"
                                onClick={handleDisconnect}
                                startIcon={<DisconnectIcon />}
                                size="small"
                            >
                                Disconnect
                            </Button>
                        </Box>

                        <Box sx={{
                            p: 2,
                            bgcolor: 'action.hover',
                            borderRadius: 1,
                            textAlign: 'center'
                        }}>
                            <Typography variant="body2" color="text.secondary">
                                <strong>Active Subscriptions:</strong> {subscriptions.length}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                <strong>Broker:</strong> {serviceData?.mqttBrokerAddress || 'Not configured'}
                            </Typography>
                        </Box>

                        {/* Security Notice */}
                        <Alert severity="info" sx={{ mt: 1 }}>
                            <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center' }}>
                                <SecurityIcon sx={{ mr: 1, fontSize: 16 }} />
                                MQTT credentials are automatically encrypted before being stored.
                            </Typography>
                        </Alert>
                    </Box>
                </CardContent>
            </Card>

            {/* MQTT Subscriptions */}
            <Card elevation={1}>
                <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 'medium' }}>
                            MQTT Subscriptions
                        </Typography>
                        <Button
                            variant="outlined"
                            onClick={() => setShowAddSubscriptionModal(true)}
                            disabled={isLocked}
                            startIcon={<AddIcon />}
                            size="small"
                        >
                            {isLocked ? 'Unlock to Add' : 'Add Subscription'}
                        </Button>
                    </Box>

                    {subscriptions.length > 0 ? (
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Topic</TableCell>
                                    <TableCell>QoS Level</TableCell>
                                    <TableCell>Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {subscriptions.map((sub) => (
                                    <TableRow key={sub.topic}>
                                        <TableCell>{sub.topic}</TableCell>
                                        <TableCell>
                                            {sub.qos} - {['At Most Once', 'At Least Once', 'Exactly Once'][sub.qos] ?? 'Unknown QoS'}
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                color="error"
                                                onClick={() => handleRemoveSubscription(sub.topic)}
                                                disabled={isLocked}
                                                startIcon={<RemoveIcon />}
                                                size="small"
                                            >
                                                Remove
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <Paper sx={{ p: 3, textAlign: 'center' }}>
                            <Typography variant="body2" color="text.secondary">
                                No MQTT subscriptions configured.
                            </Typography>
                            <Button
                                variant="contained"
                                onClick={() => setShowAddSubscriptionModal(true)}
                                disabled={isLocked}
                                startIcon={<AddIcon />}
                                sx={{ mt: 2 }}
                                size="small"
                            >
                                {isLocked ? 'Unlock to Add Subscription' : 'Add First Subscription'}
                            </Button>
                        </Paper>
                    )}
                </CardContent>
            </Card>

            {/* Add Subscription Dialog */}
            <Dialog open={showAddSubscriptionModal} onClose={() => setShowAddSubscriptionModal(false)}>
                <DialogTitle>Add MQTT Subscription</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 400 }}>
                    <TextField
                        label="MQTT Topic"
                        fullWidth
                        value={newTopic}
                        onChange={(e) => setNewTopic(e.target.value)}
                        placeholder="sensor/temperature"
                        margin="normal"
                    />
                    <FormControl fullWidth margin="normal">
                        <InputLabel id="qos-label">QoS Level</InputLabel>
                        <Select
                            labelId="qos-label"
                            value={newTopicQoS}
                            label="QoS Level"
                            onChange={(e) => setNewTopicQoS(Number(e.target.value))}
                        >
                            <MenuItem value={0}>0 - At most once</MenuItem>
                            <MenuItem value={1}>1 - At least once</MenuItem>
                            <MenuItem value={2}>2 - Exactly once</MenuItem>
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setShowAddSubscriptionModal(false)}>Cancel</Button>
                    <Button
                        variant="contained"
                        onClick={handleAddSubscription}
                        disabled={!newTopic.trim()}
                    >
                        Subscribe
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default Service_MQTT;