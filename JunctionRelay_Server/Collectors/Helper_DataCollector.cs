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

namespace JunctionRelayServer.Collectors
{
    public static class Helper_DataCollector
    {
        // Maximum decimal places allowed for Math.Round() operations
        // .NET's Math.Round() for double can handle 0-15 decimal places safely
        public const int MAX_DECIMAL_PLACES = 15;

        // Detects the number of decimal places in a string value
        public static int GetDecimalPlaces(string value)
        {
            // Handle null or empty values
            if (string.IsNullOrEmpty(value))
                return 0;

            // Try to parse as decimal to validate it's a numeric value
            if (!decimal.TryParse(value, out decimal numericValue))
                return 0; // Non-numeric values (including "N/A") have 0 decimal places

            // Convert to string to analyze decimal places
            string valueStr = numericValue.ToString();

            // Find the decimal point
            int decimalIndex = valueStr.IndexOf('.');
            if (decimalIndex == -1)
                return 0; // No decimal point found

            // Count digits after decimal point
            return valueStr.Length - decimalIndex - 1;
        }

        // Detects the number of decimal places in a double value
        public static int GetDecimalPlaces(double value)
        {
            var valueStr = value.ToString("G17");
            var decimalIndex = valueStr.IndexOf('.');
            if (decimalIndex == -1) return 0;

            var afterDecimal = valueStr.Substring(decimalIndex + 1);
            // Remove trailing zeros
            afterDecimal = afterDecimal.TrimEnd('0');

            return afterDecimal.Length;
        }

        // Sanitizes a numeric value by ensuring it has a safe number of decimal places
        // and returns both the sanitized value string and the safe decimal places count.
        // This prevents crashes when Math.Round() is called with extreme decimal place values.
        public static (string value, int decimalPlaces) SanitizeSensorValue(double value, int requestedDecimalPlaces)
        {
            // Cap decimal places at safe maximum
            int safeDecimalPlaces = Math.Min(requestedDecimalPlaces, MAX_DECIMAL_PLACES);

            // Round the value to the safe decimal places to prevent extreme precision issues
            double sanitizedValue = Math.Round(value, safeDecimalPlaces);

            // Format the value with the safe decimal places
            string valueString = sanitizedValue.ToString("F" + safeDecimalPlaces);

            return (valueString, safeDecimalPlaces);
        }

        // Sanitizes a numeric value parsed from a string
        public static (string value, int decimalPlaces) SanitizeSensorValue(string valueString, int requestedDecimalPlaces)
        {
            if (string.IsNullOrEmpty(valueString))
            {
                return (valueString ?? string.Empty, 0);
            }

            // Try to parse as double
            if (double.TryParse(valueString, out double numericValue))
            {
                return SanitizeSensorValue(numericValue, requestedDecimalPlaces);
            }

            // If not numeric, return as-is with 0 decimal places
            return (valueString, 0);
        }

        // Ensures decimal places is within safe bounds for Math.Round()
        public static int SanitizeDecimalPlaces(int decimalPlaces)
        {
            return Math.Max(0, Math.Min(decimalPlaces, MAX_DECIMAL_PLACES));
        }

        // Safely rounds a numeric value to the specified decimal places, automatically sanitizing the decimal places parameter
        public static double SafeRound(double value, int decimalPlaces)
        {
            int safeDecimalPlaces = SanitizeDecimalPlaces(decimalPlaces);
            return Math.Round(value, safeDecimalPlaces);
        }
    }
}
