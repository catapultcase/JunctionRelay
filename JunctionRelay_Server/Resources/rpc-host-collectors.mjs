#!/usr/bin/env node

// dist/CollectorPlugin.js
import * as readline from "node:readline";

// ../protocol/dist/index.js
var PLUGIN_ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*\.[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
var JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  SERVER_ERROR: -32e3
};

// dist/CollectorPlugin.js
var CollectorPlugin = class {
  config;
  startTime;
  currentConfig = { collectorId: 0 };
  constructor(config2) {
    const name = config2.metadata.collectorName;
    if (!PLUGIN_ID_PATTERN.test(name)) {
      throw new Error(`collectorName '${name}' must be namespaced dot-notation (e.g. 'junctionrelay.system-time')`);
    }
    this.config = config2;
    this.startTime = Date.now();
  }
  /**
   * Start the JSON-RPC stdin/stdout listener.
   * Called by rpc-host.mjs for Server's child-process mode.
   * NOT called automatically — plugins are pure config exports.
   */
  startRpc() {
    const rl = readline.createInterface({
      input: process.stdin,
      terminal: false
    });
    rl.on("line", (line) => {
      this.handleLine(line).catch((err) => {
        process.stderr.write(`[plugin] Unhandled error: ${err}
`);
      });
    });
    rl.on("close", () => {
      process.stderr.write(`[plugin] stdin closed, shutting down
`);
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      process.stderr.write(`[plugin] SIGTERM received, shutting down
`);
      process.exit(0);
    });
    process.stderr.write(`[plugin] ${this.config.metadata.displayName} ready
`);
  }
  async handleLine(line) {
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      this.writeResponse({
        jsonrpc: "2.0",
        id: 0,
        error: { code: JSON_RPC_ERRORS.PARSE_ERROR, message: "Parse error" }
      });
      return;
    }
    try {
      const result = await this.dispatch(request.method, request.params ?? {});
      this.writeResponse({
        jsonrpc: "2.0",
        id: request.id,
        result
      });
    } catch (err) {
      const code = typeof err.code === "number" ? err.code : JSON_RPC_ERRORS.SERVER_ERROR;
      this.writeResponse({
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code,
          message: err instanceof Error ? err.message : String(err)
        }
      });
    }
  }
  async dispatch(method, params) {
    switch (method) {
      case "getMetadata":
        return this.config.metadata;
      case "configure": {
        const configParams = params;
        this.currentConfig = configParams;
        if (this.config.configure) {
          return this.config.configure(configParams);
        }
        return { success: true };
      }
      case "fetchSensors":
        if (this.config.fetchSensors) {
          return this.config.fetchSensors(this.currentConfig);
        }
        return { sensors: [] };
      case "fetchSelectedSensors": {
        const selectedParams = params;
        if (this.config.fetchSelectedSensors) {
          return this.config.fetchSelectedSensors(this.currentConfig, selectedParams);
        }
        if (this.config.fetchSensors) {
          const all = await this.config.fetchSensors(this.currentConfig);
          return {
            sensors: all.sensors.filter((s) => selectedParams.sensorIds.includes(s.uniqueSensorKey))
          };
        }
        return { sensors: [] };
      }
      case "testConnection":
        if (this.config.testConnection) {
          return this.config.testConnection(this.currentConfig);
        }
        return { success: true };
      case "startSession":
        if (this.config.startSession) {
          return this.config.startSession(this.currentConfig);
        }
        return { success: true };
      case "stopSession":
        if (this.config.stopSession) {
          return this.config.stopSession(this.currentConfig);
        }
        return { success: true };
      case "healthCheck":
        return {
          healthy: true,
          uptime: Math.floor((Date.now() - this.startTime) / 1e3)
        };
      default:
        throw Object.assign(new Error(`Method not found: ${method}`), {
          code: JSON_RPC_ERRORS.METHOD_NOT_FOUND
        });
    }
  }
  writeResponse(response) {
    process.stdout.write(JSON.stringify(response) + "\n");
  }
};

// bin/rpc-host.mjs
import { resolve } from "node:path";
var pluginPath = process.argv[2];
if (!pluginPath) {
  process.stderr.write("Usage: rpc-host.mjs <plugin-entry>\n");
  process.exit(1);
}
var absolutePath = resolve(pluginPath);
var mod = await import(absolutePath);
var config = mod.default;
if (!config || !config.metadata) {
  process.stderr.write(`Error: Plugin at ${absolutePath} has no default export with metadata
`);
  process.exit(1);
}
var plugin = new CollectorPlugin(config);
plugin.startRpc();
