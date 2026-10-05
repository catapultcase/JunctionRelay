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
using System.IO.Compression;
using System.Text;

namespace JunctionRelayServer.Services
{
    public class Service_Manager_Payloads_Blit
    {
        private const uint MAX_PAYLOAD_SIZE = 4294967295; // 4GB - 1 (uint.MaxValue)

        public Service_Manager_Payloads_Blit()
        {
        }

        public byte[] GenerateBlitFramePayload(
    byte[] rgb565Data,
    bool compressPayload = false,
    bool isGatewayMode = false)
        {
            if (rgb565Data == null || rgb565Data.Length == 0)
            {
                throw new ArgumentException("RGB565 data cannot be null or empty", nameof(rgb565Data));
            }

            byte[] dataToSend;
            ushort typeField;

            if (compressPayload)
            {
                dataToSend = CompressData(rgb565Data);
                typeField = 0x3004; // TYPE_BLIT_COMPRESSED
            }
            else
            {
                dataToSend = rgb565Data;
                typeField = 0x3003; // TYPE_BLIT_RGB565
            }

            // Use 4-byte binary length field (little-endian)
            uint payloadLength = (uint)Math.Min(dataToSend.Length, MAX_PAYLOAD_SIZE);
            byte[] lengthBytes = BitConverter.GetBytes(payloadLength);

            // Ensure little-endian byte order
            if (!BitConverter.IsLittleEndian)
            {
                Array.Reverse(lengthBytes);
            }

            // Convert type field to binary (2 bytes, little-endian)
            byte[] typeBytes = BitConverter.GetBytes(typeField);
            if (!BitConverter.IsLittleEndian)
            {
                Array.Reverse(typeBytes);
            }

            // Convert routing field to binary (2 bytes, little-endian)
            ushort routingField = isGatewayMode ? (ushort)0x0001 : (ushort)0x0000;
            byte[] routingBytes = BitConverter.GetBytes(routingField);
            if (!BitConverter.IsLittleEndian)
            {
                Array.Reverse(routingBytes);
            }

            // New format: [4 bytes length][2 bytes type][2 bytes routing][payload data]
            var finalPayload = new byte[lengthBytes.Length + typeBytes.Length + routingBytes.Length + dataToSend.Length];
            int offset = 0;

            // Copy length (4 bytes, binary)
            Array.Copy(lengthBytes, 0, finalPayload, offset, lengthBytes.Length);
            offset += lengthBytes.Length;

            // Copy type (2 bytes, binary)
            Array.Copy(typeBytes, 0, finalPayload, offset, typeBytes.Length);
            offset += typeBytes.Length;

            // Copy routing (2 bytes, binary)
            Array.Copy(routingBytes, 0, finalPayload, offset, routingBytes.Length);
            offset += routingBytes.Length;

            // Copy payload data
            Array.Copy(dataToSend, 0, finalPayload, offset, dataToSend.Length);

            return finalPayload;
        }

        public static uint ParseBinaryLength(byte[] lengthBytes)
        {
            if (lengthBytes.Length != 4)
            {
                throw new ArgumentException("Length bytes must be exactly 4 bytes", nameof(lengthBytes));
            }

            // Parse as little-endian uint32
            if (BitConverter.IsLittleEndian)
            {
                return BitConverter.ToUInt32(lengthBytes, 0);
            }
            else
            {
                byte[] reversed = new byte[4];
                Array.Copy(lengthBytes, reversed, 4);
                Array.Reverse(reversed);
                return BitConverter.ToUInt32(reversed, 0);
            }
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
    }
}