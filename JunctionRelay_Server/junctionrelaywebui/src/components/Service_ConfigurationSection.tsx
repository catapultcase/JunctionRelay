import React from 'react';
import { Box, Typography, Divider } from '@mui/material';
import Service_MQTT from './Service_MQTT';
import Service_HomeAssistant from './Service_HomeAssistant';
import Service_Grafana from './Service_Grafana';

interface Service_ConfigurationSectionProps {
    serviceData: any;
    editMode: boolean;
    isLocked: boolean;
    onServiceUpdate: (field: string, value: any) => void;
    onShowSnackbar: (message: string, severity?: "success" | "error" | "info" | "warning") => void;
}

const Service_ConfigurationSection: React.FC<Service_ConfigurationSectionProps> = ({
    serviceData,
    editMode,
    isLocked,
    onServiceUpdate,
    onShowSnackbar
}) => {
    const renderServiceSpecificConfiguration = () => {
        const serviceType = serviceData?.type?.toLowerCase();

        switch (serviceType) {
            case 'mqtt broker':
                return (
                    <Service_MQTT
                        serviceData={serviceData}
                        editMode={editMode}
                        isLocked={isLocked}
                        onServiceUpdate={onServiceUpdate}
                        onShowSnackbar={onShowSnackbar}
                    />
                );

            case 'homeassistant':
                return (
                    <Service_HomeAssistant
                        serviceData={serviceData}
                        editMode={editMode}
                        isLocked={isLocked}
                        onServiceUpdate={onServiceUpdate}
                        onShowSnackbar={onShowSnackbar}
                    />
                );

            case 'grafana':
                return (
                    <Service_Grafana
                        serviceData={serviceData}
                        editMode={editMode}
                        isLocked={isLocked}
                        onServiceUpdate={onServiceUpdate}
                        onShowSnackbar={onShowSnackbar}
                    />
                );

            default:
                return (
                    <Box sx={{
                        p: 2,
                        bgcolor: 'action.hover',
                        borderRadius: 1,
                        textAlign: 'center'
                    }}>
                        <Typography variant="body2" color="text.secondary">
                            No specific configuration available for service type: {serviceData?.type}
                        </Typography>
                    </Box>
                );
        }
    };

    return (
        <Box>
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'medium' }}>
                {serviceData?.type} Configuration
            </Typography>

            {renderServiceSpecificConfiguration()}
        </Box>
    );
};

export default Service_ConfigurationSection;