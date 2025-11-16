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

using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;
using SixLabors.ImageSharp.Formats;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Formats.Jpeg;

namespace JunctionRelayServer.Services
{
    public enum ImageFormat
    {
        RGB565,
        RGB888,
        RGBA8888,
        Grayscale,
        MonochromeBW
    }

    public enum CompressionQuality
    {
        Low = 30,
        Medium = 60,
        High = 85,
        Maximum = 100
    }

    public class ImageProcessingResult
    {
        public bool Success { get; set; }
        public byte[]? Data { get; set; }
        public string? ErrorMessage { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }
        public int BytesPerPixel { get; set; }
        public ImageFormat Format { get; set; }
        public int TotalBytes => Data?.Length ?? 0;
    }

    public class Service_Image_Processor
    {
        /// Converts PNG image data to RGB565 format (16-bit color)

        public async Task<ImageProcessingResult> ConvertToRgb565Async(
            byte[] pngBytes,
            int? targetWidth = null,
            int? targetHeight = null)
        {
            try
            {
                using var inputStream = new MemoryStream(pngBytes);
                using var image = await Image.LoadAsync<Rgba32>(inputStream);

                var width = targetWidth ?? image.Width;
                var height = targetHeight ?? image.Height;

                // Resize if dimensions are different
                if (image.Width != width || image.Height != height)
                {
                    image.Mutate(x => x.Resize(width, height));
                }

                var rgb565Bytes = new byte[width * height * 2];
                int byteIndex = 0;

                for (int y = 0; y < height; y++)
                {
                    for (int x = 0; x < width; x++)
                    {
                        var pixel = image[x, y];

                        // Convert 8-bit RGB to 5-6-5 format
                        byte r = (byte)(pixel.R >> 3);  // 8-bit to 5-bit
                        byte g = (byte)(pixel.G >> 2);  // 8-bit to 6-bit
                        byte b = (byte)(pixel.B >> 3);  // 8-bit to 5-bit

                        // Pack into 16-bit value: RRRRR GGGGGG BBBBB
                        ushort rgb565 = (ushort)((r << 11) | (g << 5) | b);

                        // Store as little-endian bytes
                        rgb565Bytes[byteIndex++] = (byte)(rgb565 & 0xFF);
                        rgb565Bytes[byteIndex++] = (byte)((rgb565 >> 8) & 0xFF);
                    }
                }

                return new ImageProcessingResult
                {
                    Success = true,
                    Data = rgb565Bytes,
                    Width = width,
                    Height = height,
                    BytesPerPixel = 2,
                    Format = ImageFormat.RGB565
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_IMAGE_PROCESSOR] RGB565 conversion error: {ex.Message}");
                return new ImageProcessingResult
                {
                    Success = false,
                    ErrorMessage = ex.Message,
                    Format = ImageFormat.RGB565
                };
            }
        }

        public async Task<ImageProcessingResult> ConvertToRgb888Async(
            byte[] pngBytes,
            int? targetWidth = null,
            int? targetHeight = null)
        {
            try
            {
                using var inputStream = new MemoryStream(pngBytes);
                using var image = await Image.LoadAsync<Rgba32>(inputStream);

                var width = targetWidth ?? image.Width;
                var height = targetHeight ?? image.Height;

                if (image.Width != width || image.Height != height)
                {
                    image.Mutate(x => x.Resize(width, height));
                }

                var rgb888Bytes = new byte[width * height * 3];
                int byteIndex = 0;

                for (int y = 0; y < height; y++)
                {
                    for (int x = 0; x < width; x++)
                    {
                        var pixel = image[x, y];
                        rgb888Bytes[byteIndex++] = pixel.R;
                        rgb888Bytes[byteIndex++] = pixel.G;
                        rgb888Bytes[byteIndex++] = pixel.B;
                    }
                }

                return new ImageProcessingResult
                {
                    Success = true,
                    Data = rgb888Bytes,
                    Width = width,
                    Height = height,
                    BytesPerPixel = 3,
                    Format = ImageFormat.RGB888
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_IMAGE_PROCESSOR] RGB888 conversion error: {ex.Message}");
                return new ImageProcessingResult
                {
                    Success = false,
                    ErrorMessage = ex.Message,
                    Format = ImageFormat.RGB888
                };
            }
        }

        public async Task<ImageProcessingResult> ConvertToGrayscaleAsync(
            byte[] pngBytes,
            int? targetWidth = null,
            int? targetHeight = null)
        {
            try
            {
                using var inputStream = new MemoryStream(pngBytes);
                using var image = await Image.LoadAsync<Rgba32>(inputStream);

                var width = targetWidth ?? image.Width;
                var height = targetHeight ?? image.Height;

                if (image.Width != width || image.Height != height)
                {
                    image.Mutate(x => x.Resize(width, height));
                }

                var grayscaleBytes = new byte[width * height];
                int byteIndex = 0;

                for (int y = 0; y < height; y++)
                {
                    for (int x = 0; x < width; x++)
                    {
                        var pixel = image[x, y];
                        // Standard grayscale conversion formula
                        byte gray = (byte)(0.299 * pixel.R + 0.587 * pixel.G + 0.114 * pixel.B);
                        grayscaleBytes[byteIndex++] = gray;
                    }
                }

                return new ImageProcessingResult
                {
                    Success = true,
                    Data = grayscaleBytes,
                    Width = width,
                    Height = height,
                    BytesPerPixel = 1,
                    Format = ImageFormat.Grayscale
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_IMAGE_PROCESSOR] Grayscale conversion error: {ex.Message}");
                return new ImageProcessingResult
                {
                    Success = false,
                    ErrorMessage = ex.Message,
                    Format = ImageFormat.Grayscale
                };
            }
        }

        public async Task<ImageProcessingResult> ConvertToMonochromeAsync(
            byte[] pngBytes,
            byte threshold = 128,
            int? targetWidth = null,
            int? targetHeight = null)
        {
            try
            {
                using var inputStream = new MemoryStream(pngBytes);
                using var image = await Image.LoadAsync<Rgba32>(inputStream);

                var width = targetWidth ?? image.Width;
                var height = targetHeight ?? image.Height;

                if (image.Width != width || image.Height != height)
                {
                    image.Mutate(x => x.Resize(width, height));
                }

                // Calculate bytes needed for 1-bit per pixel storage
                int bytesPerRow = (width + 7) / 8; // Round up to nearest byte
                var monochromeBytes = new byte[bytesPerRow * height];

                for (int y = 0; y < height; y++)
                {
                    for (int x = 0; x < width; x++)
                    {
                        var pixel = image[x, y];
                        // Convert to grayscale first
                        byte gray = (byte)(0.299 * pixel.R + 0.587 * pixel.G + 0.114 * pixel.B);

                        // Apply threshold
                        bool isWhite = gray >= threshold;

                        if (isWhite)
                        {
                            int byteIndex = y * bytesPerRow + x / 8;
                            int bitIndex = 7 - (x % 8); // MSB first
                            monochromeBytes[byteIndex] |= (byte)(1 << bitIndex);
                        }
                    }
                }

                return new ImageProcessingResult
                {
                    Success = true,
                    Data = monochromeBytes,
                    Width = width,
                    Height = height,
                    BytesPerPixel = 1, // Conceptually, though packed
                    Format = ImageFormat.MonochromeBW
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_IMAGE_PROCESSOR] Monochrome conversion error: {ex.Message}");
                return new ImageProcessingResult
                {
                    Success = false,
                    ErrorMessage = ex.Message,
                    Format = ImageFormat.MonochromeBW
                };
            }
        }

        public async Task<ImageProcessingResult> CompressToJpegAsync(
            byte[] imageBytes,
            CompressionQuality quality = CompressionQuality.High,
            int? targetWidth = null,
            int? targetHeight = null)
        {
            try
            {
                using var inputStream = new MemoryStream(imageBytes);
                using var image = await Image.LoadAsync(inputStream);

                var width = targetWidth ?? image.Width;
                var height = targetHeight ?? image.Height;

                if (image.Width != width || image.Height != height)
                {
                    image.Mutate(x => x.Resize(width, height));
                }

                using var outputStream = new MemoryStream();
                var encoder = new JpegEncoder
                {
                    Quality = (int)quality
                };

                await image.SaveAsync(outputStream, encoder);

                return new ImageProcessingResult
                {
                    Success = true,
                    Data = outputStream.ToArray(),
                    Width = width,
                    Height = height,
                    BytesPerPixel = 3, // JPEG is typically 24-bit
                    Format = ImageFormat.RGB888 // JPEG output format
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_IMAGE_PROCESSOR] JPEG compression error: {ex.Message}");
                return new ImageProcessingResult
                {
                    Success = false,
                    ErrorMessage = ex.Message,
                    Format = ImageFormat.RGB888
                };
            }
        }

        public async Task<ImageProcessingResult> ConvertImageAsync(
            byte[] imageBytes,
            ImageFormat format,
            int? targetWidth = null,
            int? targetHeight = null,
            Dictionary<string, object>? options = null)
        {
            return format switch
            {
                ImageFormat.RGB565 => await ConvertToRgb565Async(imageBytes, targetWidth, targetHeight),
                ImageFormat.RGB888 => await ConvertToRgb888Async(imageBytes, targetWidth, targetHeight),
                ImageFormat.Grayscale => await ConvertToGrayscaleAsync(imageBytes, targetWidth, targetHeight),
                ImageFormat.MonochromeBW => await ConvertToMonochromeAsync(imageBytes,
                    options?.TryGetValue("threshold", out var t) == true ? (byte)t : (byte)128,
                    targetWidth, targetHeight),
                _ => throw new NotSupportedException($"Image format {format} is not supported")
            };
        }

        public async Task<(int width, int height, string format)> GetImageInfoAsync(byte[] imageBytes)
        {
            try
            {
                using var inputStream = new MemoryStream(imageBytes);
                var imageInfo = await Image.IdentifyAsync(inputStream);

                return (imageInfo.Width, imageInfo.Height, imageInfo.Metadata.DecodedImageFormat?.Name ?? "Unknown");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SERVICE_IMAGE_PROCESSOR] Error getting image info: {ex.Message}");
                return (0, 0, "Unknown");
            }
        }

        public async Task<bool> IsValidImageAsync(byte[] imageBytes)
        {
            try
            {
                using var inputStream = new MemoryStream(imageBytes);
                await Image.IdentifyAsync(inputStream);
                return true;
            }
            catch
            {
                return false;
            }
        }
    }
}