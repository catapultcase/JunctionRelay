import { Service } from './entities';

/** Updates one field of the service being edited on the configure page. */
export type ServiceFieldUpdate = <K extends keyof Service>(field: K, value: Service[K]) => void;

export type SnackbarSeverity = "success" | "error" | "info" | "warning";

/** The add-service form; posted to /api/services as a Service. */
export interface NewServiceForm {
    name: string;
    description: string;
    type: string;
    url: string;
    accessToken: string;
    externalAccessToken: boolean;
    mqttBrokerAddress: string;
    mqttBrokerPort: string;
    mqttUsername: string;
}

export type NewServiceTextField = Exclude<keyof NewServiceForm, 'externalAccessToken'>;

const NEW_SERVICE_TEXT_FIELDS: readonly NewServiceTextField[] =
    ['name', 'description', 'type', 'url', 'accessToken', 'mqttBrokerAddress', 'mqttBrokerPort', 'mqttUsername'];

export const isNewServiceTextField = (name: string): name is NewServiceTextField =>
    NEW_SERVICE_TEXT_FIELDS.some(field => field === name);

/** POST /api/services body: the service plus the password for an externally encrypted token. */
export type NewServiceRequest = Partial<Service> & { encryptionPassword?: string };
