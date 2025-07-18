import React from "react";
import { Box, Typography, Paper, TextField, Chip, FormControlLabel, Switch } from "@mui/material";
import SecurityIcon from '@mui/icons-material/Security';
import { HeartbeatComponentProps } from './HeartbeatProtocolSelector';

const HeartbeatSSH: React.FC<HeartbeatComponentProps> = ({ formData, onFormDataChange }) => {
    const [passwordChanged, setPasswordChanged] = React.useState(false);
    const [privateKeyChanged, setPrivateKeyChanged] = React.useState(false);

    // Use consistent field names - match parent's expectation
    const updateField = (field: string, value: any) => {
        console.log(`[HeartbeatSSH] Field change: ${field} = ${value}`);

        // Track when sensitive fields are modified
        if (field === 'SshPassword') {
            setPasswordChanged(true);
        }
        if (field === 'SshPrivateKey') {
            setPrivateKeyChanged(true);
        }

        // Handle special field mappings for consistency
        const updates: any = {};
        if (field === 'target') {
            updates.HeartbeatTarget = value;
            updates.heartbeatTarget = value; // Keep both for compatibility
        } else if (field === 'expected') {
            updates.HeartbeatExpectedValue = value;
            updates.heartbeatExpectedValue = value; // Keep both for compatibility
        } else {
            updates[field] = value;
        }

        onFormDataChange(updates);
    };

    // Check if this is an existing device with existing credentials
    const isExistingDevice = formData.Id !== undefined;
    const hasExistingPassword = formData.hasSshPassword;
    const hasExistingPrivateKey = formData.hasSshPrivateKey;

    // Get current values with proper fallbacks - Use PascalCase field names
    const currentTarget = formData.HeartbeatTarget || formData.heartbeatTarget || 'uptime';
    const currentExpected = formData.HeartbeatExpectedValue || formData.heartbeatExpectedValue || 'up';
    const currentUsername = formData.SshUsername || formData.sshUsername || '';
    const currentPassword = formData.SshPassword || formData.sshPassword || '';
    const currentPrivateKey = formData.SshPrivateKey || formData.sshPrivateKey || '';
    const currentPort = formData.SshPort || formData.sshPort || 22;
    const currentTimeout = formData.SshTimeoutMs || formData.sshTimeoutMs || 10000;
    const currentUseKeyAuth = formData.UseSshKeyAuth ?? formData.useSshKeyAuth ?? false;
    const currentRetries = formData.SshConnectionRetries || formData.sshConnectionRetries || 3;
    const currentVerifyHostKey = formData.SshVerifyHostKey ?? formData.sshVerifyHostKey ?? true;

    const commonCommands = [
        { cmd: 'uptime', desc: 'System uptime and load', expected: 'up' },
        { cmd: 'systemctl is-system-running', desc: 'System status', expected: 'running' },
        { cmd: 'cat /proc/loadavg', desc: 'Load average', expected: '0.' },
        { cmd: 'free -h | grep Mem', desc: 'Memory usage', expected: 'Mem:' },
        { cmd: 'df -h / | tail -1', desc: 'Disk usage', expected: '/' },
        { cmd: 'echo "healthy"', desc: 'Simple health check', expected: 'healthy' },
        { cmd: 'whoami && echo "online"', desc: 'User check + status', expected: 'online' }
    ];

    // Determine what to show in password fields
    const getPasswordDisplay = () => {
        if (isExistingDevice && hasExistingPassword && !passwordChanged) {
            return '••••••••'; // Show placeholder for existing password
        }
        return currentPassword; // Show actual value for new entries or changed passwords
    };

    const getPrivateKeyDisplay = () => {
        if (isExistingDevice && hasExistingPrivateKey && !privateKeyChanged) {
            return '••••••••'; // Show placeholder for existing private key
        }
        return currentPrivateKey; // Show actual value for new entries or changed keys
    };

    const getPasswordHelperText = () => {
        if (isExistingDevice && hasExistingPassword && !passwordChanged) {
            return "Encrypted password exists. Enter new password to change it.";
        }
        return "SSH password (will be encrypted when saved)";
    };

    const getPrivateKeyHelperText = () => {
        if (isExistingDevice && hasExistingPrivateKey && !privateKeyChanged) {
            return "Encrypted private key exists. Enter new key to change it.";
        }
        return "SSH private key (will be encrypted when saved)";
    };

    return (
        <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>SSH Health Check</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Execute SSH commands to check Linux system health.
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {/* Health Check Configuration */}
                <Typography variant="subtitle2" sx={{ mt: 1, mb: 1, fontWeight: 'medium' }}>
                    Health Check Command
                </Typography>

                <TextField
                    label="SSH Command"
                    value={currentTarget}
                    onChange={(e) => updateField('target', e.target.value)}
                    placeholder="uptime"
                    size="small"
                    helperText="Command to execute for health check"
                />

                <TextField
                    label="Expected Output Contains"
                    value={currentExpected}
                    onChange={(e) => updateField('expected', e.target.value)}
                    placeholder="up"
                    size="small"
                    helperText="Text that should be present in command output"
                />

                <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                        <strong>Common Commands:</strong>
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        {commonCommands.map((item, index) => (
                            <Chip
                                key={index}
                                label={item.cmd}
                                size="small"
                                variant="outlined"
                                onClick={() => {
                                    updateField('target', item.cmd);
                                    updateField('expected', item.expected);
                                }}
                                sx={{ cursor: 'pointer', fontSize: '0.75rem' }}
                                title={`${item.desc} - expects "${item.expected}"`}
                            />
                        ))}
                    </Box>
                </Box>

                {/* SSH Connection Configuration */}
                <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, fontWeight: 'medium' }}>
                    SSH Connection Settings
                </Typography>

                <Box sx={{ display: 'flex', gap: 2 }}>
                    <TextField
                        label="SSH Port"
                        type="number"
                        value={currentPort}
                        onChange={(e) => updateField('SshPort', parseInt(e.target.value) || 22)}
                        size="small"
                        sx={{ width: 120 }}
                        slotProps={{
                            htmlInput: {
                                min: 1,
                                max: 65535
                            }
                        }}
                    />
                    <TextField
                        label="Timeout (ms)"
                        type="number"
                        value={currentTimeout}
                        onChange={(e) => updateField('SshTimeoutMs', parseInt(e.target.value) || 10000)}
                        size="small"
                        sx={{ flex: 1 }}
                        helperText="Connection timeout in milliseconds"
                    />
                </Box>

                <Box sx={{ display: 'flex', gap: 2 }}>
                    <TextField
                        label="Connection Retries"
                        type="number"
                        value={currentRetries}
                        onChange={(e) => updateField('SshConnectionRetries', parseInt(e.target.value) || 3)}
                        size="small"
                        sx={{ width: 150 }}
                        slotProps={{
                            htmlInput: {
                                min: 1,
                                max: 10
                            }
                        }}
                    />
                    <FormControlLabel
                        control={
                            <Switch
                                checked={currentVerifyHostKey}
                                onChange={(e) => updateField('SshVerifyHostKey', e.target.checked)}
                                color="primary"
                            />
                        }
                        label="Verify Host Key"
                        sx={{ ml: 1 }}
                    />
                </Box>

                {/* SSH Authentication */}
                <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, fontWeight: 'medium' }}>
                    SSH Authentication
                </Typography>

                <TextField
                    label="Username"
                    value={currentUsername}
                    onChange={(e) => updateField('SshUsername', e.target.value)}
                    size="small"
                    required
                    helperText="SSH login username"
                />

                <FormControlLabel
                    control={
                        <Switch
                            checked={currentUseKeyAuth}
                            onChange={(e) => updateField('UseSshKeyAuth', e.target.checked)}
                            color="primary"
                        />
                    }
                    label={
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <SecurityIcon sx={{ mr: 1, fontSize: 18 }} />
                            Use Private Key Authentication
                        </Box>
                    }
                />

                {currentUseKeyAuth ? (
                    <TextField
                        label="Private Key"
                        value={getPrivateKeyDisplay()}
                        onChange={(e) => updateField('SshPrivateKey', e.target.value)}
                        size="small"
                        multiline
                        rows={4}
                        helperText={getPrivateKeyHelperText()}
                        sx={{ fontFamily: 'monospace' }}
                        placeholder={
                            isExistingDevice && hasExistingPrivateKey && !privateKeyChanged
                                ? "Enter new private key to change existing"
                                : "-----BEGIN OPENSSH PRIVATE KEY-----"
                        }
                    />
                ) : (
                    <TextField
                        label="Password"
                        type="password"
                        value={getPasswordDisplay()}
                        onChange={(e) => updateField('SshPassword', e.target.value)}
                        size="small"
                        helperText={getPasswordHelperText()}
                        placeholder={
                            isExistingDevice && hasExistingPassword && !passwordChanged
                                ? "Enter new password to change existing"
                                : "Enter SSH password"
                        }
                    />
                )}

                {/* Security Notice */}
                <Box sx={{ mt: 1, p: 2, bgcolor: 'rgba(76, 175, 80, 0.08)', borderRadius: 1, border: '1px solid rgba(76, 175, 80, 0.23)' }}>
                    <Typography variant="caption" color="success.main" sx={{ fontWeight: 'medium', display: 'flex', alignItems: 'center', mb: 0.5 }}>
                        <SecurityIcon sx={{ mr: 1, fontSize: 16 }} />
                        Security Notice
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        SSH passwords and private keys are automatically encrypted before being stored in the database.
                        {isExistingDevice && (hasExistingPassword || hasExistingPrivateKey) &&
                            " Existing credentials are never sent to your browser for security."}
                    </Typography>
                </Box>

                <Box sx={{ mt: 1, p: 2, bgcolor: 'rgba(0,0,0,0.02)', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                        <strong>Example Output:</strong><br />
                        {`18:45:23 up 7 days, 12:34, 2 users, load average: 0.15, 0.25, 0.20`}
                    </Typography>
                </Box>
            </Box>
        </Paper>
    );
};

export default HeartbeatSSH;