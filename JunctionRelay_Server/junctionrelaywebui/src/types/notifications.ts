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

export enum JunctionStartStage {
    Validating = 1,
    LoadingConfiguration = 2,
    TestingCollectors = 3,
    RegisteringSources = 4,
    ConfiguringGateway = 5,
    StartingStreams = 6,
    Complete = 7
}

export enum TemplateVersionUploadStage {
    Preparing = 1,
    HashingAssets = 2,
    CheckingCloud = 3,
    UploadingAssets = 4,
    SavingMetadata = 5,
    Complete = 6,
}

export interface JunctionProgress {
    junctionId: number;
    junctionName: string;
    operationId: string;
    stage: JunctionStartStage;
    detailMessage: string;
    timestamp: string;
    isComplete: boolean;
    hasError: boolean;
    errorMessage?: string;
}

export interface TemplateVersionProgress {
    templateId: number;
    templateName: string;
    operationId: string;
    stage: TemplateVersionUploadStage;
    detailMessage: string;
    progressPercentage: number;
    timestamp: string;
    isComplete: boolean;
    hasError: boolean;
    errorMessage?: string;
}

// Helper functions
export const getStageDisplayName = (stage: JunctionStartStage): string => {
    switch (stage) {
        case JunctionStartStage.Validating:
            return 'Validating';
        case JunctionStartStage.LoadingConfiguration:
            return 'Loading Configuration';
        case JunctionStartStage.TestingCollectors:
            return 'Testing Collectors';
        case JunctionStartStage.RegisteringSources:
            return 'Registering Sources';
        case JunctionStartStage.ConfiguringGateway:
            return 'Configuring Gateway';
        case JunctionStartStage.StartingStreams:
            return 'Starting Streams';
        case JunctionStartStage.Complete:
            return 'Complete';
        default:
            return 'Unknown';
    }
};
