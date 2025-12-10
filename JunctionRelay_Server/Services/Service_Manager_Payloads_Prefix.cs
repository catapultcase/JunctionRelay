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

using System.Text;
using System.IO.Compression;
using System.Text.Json;

namespace JunctionRelayServer.Services
{
    public class Service_Manager_Payloads_Prefix
    {
        private const uint MAX_PAYLOAD_SIZE = 4294967295;

        public enum MessageType : ushort
        {
            DATA = 0x0001,
            COMMAND = 0x0002,
            BLIT_RGB565 = 0x3003,
            BLIT_COMPRESSED = 0x3004
        }

        public enum RoutingMode : ushort
        {
            LOCAL = 0x0000,
            GATEWAY = 0x0001,
            SCREEN_BASE = 0x0100
        }

        public enum SerializationFormat
        {
            Json
        }

        public Service_Manager_Payloads_Prefix()
        {
        }

        public byte[] CreateBinaryMessage(byte[] payload, MessageType messageType, RoutingMode routing = RoutingMode.LOCAL)
        {
            if (payload == null || payload.Length == 0)
            {
                throw new ArgumentException("Payload cannot be null or empty", nameof(payload));
            }

            uint payloadLength = (uint)Math.Min(payload.Length, MAX_PAYLOAD_SIZE);

            var header = new byte[8];
            var lengthBytes = BitConverter.GetBytes(payloadLength);
            var typeBytes = BitConverter.GetBytes((ushort)messageType);
            var routingBytes = BitConverter.GetBytes((ushort)routing);

            if (!BitConverter.IsLittleEndian)
            {
                Array.Reverse(lengthBytes);
                Array.Reverse(typeBytes);
                Array.Reverse(routingBytes);
            }

            Array.Copy(lengthBytes, 0, header, 0, 4);
            Array.Copy(typeBytes, 0, header, 4, 2);
            Array.Copy(routingBytes, 0, header, 6, 2);

            var finalMessage = new byte[header.Length + payload.Length];
            Array.Copy(header, 0, finalMessage, 0, header.Length);
            Array.Copy(payload, 0, finalMessage, header.Length, payload.Length);

            return finalMessage;
        }

        public byte[] CreateDataMessage(object data, RoutingMode routing = RoutingMode.LOCAL,
            SerializationFormat format = SerializationFormat.Json, bool compress = false)
        {
            byte[] payload = SerializeData(data, format);

            if (compress)
            {
                payload = CompressData(payload);
            }

            return CreateBinaryMessage(payload, MessageType.DATA, routing);
        }

        public byte[] CreateCommandMessage(object command, RoutingMode routing = RoutingMode.GATEWAY, bool compress = false)
        {
            byte[] payload = SerializeData(command, SerializationFormat.Json);

            if (compress)
            {
                payload = CompressData(payload);
            }

            return CreateBinaryMessage(payload, MessageType.COMMAND, routing);
        }

        public byte[] CreateBlitMessage(byte[] rgb565Data, bool compress = false, RoutingMode routing = RoutingMode.LOCAL)
        {
            byte[] payload = rgb565Data;
            MessageType type = MessageType.BLIT_RGB565;

            if (compress)
            {
                payload = CompressData(rgb565Data);
                type = MessageType.BLIT_COMPRESSED;
            }

            return CreateBinaryMessage(payload, type, routing);
        }

        public RoutingMode DetermineRouting(string? junctionType, bool isGateway = false)
        {
            if (isGateway || (junctionType?.Contains("Gateway", StringComparison.OrdinalIgnoreCase) == true))
            {
                return RoutingMode.GATEWAY;
            }
            return RoutingMode.LOCAL;
        }

        public RoutingMode GetScreenRouting(int screenId)
        {
            return (RoutingMode)((int)RoutingMode.SCREEN_BASE + screenId);
        }

        private byte[] SerializeData(object data, SerializationFormat format)
        {
            return format switch
            {
                SerializationFormat.Json => Encoding.UTF8.GetBytes(JsonSerializer.Serialize(data)),
                _ => throw new ArgumentException($"Unsupported serialization format: {format}")
            };
        }

        private byte[] CompressData(byte[] data)
        {
            using var output = new MemoryStream();
            using (var gzip = new GZipStream(output, CompressionLevel.Optimal))
            {
                gzip.Write(data, 0, data.Length);
            }
            return output.ToArray();
        }

        public static (uint length, MessageType type, RoutingMode routing) ParseHeader(byte[] header)
        {
            if (header.Length != 8)
            {
                throw new ArgumentException("Header must be exactly 8 bytes", nameof(header));
            }

            var lengthBytes = new byte[4];
            var typeBytes = new byte[2];
            var routingBytes = new byte[2];

            Array.Copy(header, 0, lengthBytes, 0, 4);
            Array.Copy(header, 4, typeBytes, 0, 2);
            Array.Copy(header, 6, routingBytes, 0, 2);

            if (!BitConverter.IsLittleEndian)
            {
                Array.Reverse(lengthBytes);
                Array.Reverse(typeBytes);
                Array.Reverse(routingBytes);
            }

            uint length = BitConverter.ToUInt32(lengthBytes, 0);
            MessageType type = (MessageType)BitConverter.ToUInt16(typeBytes, 0);
            RoutingMode routing = (RoutingMode)BitConverter.ToUInt16(routingBytes, 0);

            return (length, type, routing);
        }

        public byte[] ConvertLegacyPayload(object legacyPayload, string? junctionType = null, bool compress = false)
        {
            var routing = DetermineRouting(junctionType);
            return CreateDataMessage(legacyPayload, routing, SerializationFormat.Json, compress);
        }
    }
}