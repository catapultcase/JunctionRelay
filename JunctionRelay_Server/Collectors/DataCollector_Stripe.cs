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

using System.Net.Http.Headers;
using JunctionRelayServer.Interfaces;
using JunctionRelayServer.Models;
using Newtonsoft.Json.Linq;

namespace JunctionRelayServer.Collectors
{
    public class DataCollector_Stripe : IDataCollector
    {
        public int CollectorId { get; private set; }

        public string CollectorName => "Stripe";

        private string _baseUrl = string.Empty;
        private string _secretKey = string.Empty;

        public void ApplyConfiguration(Model_Collector collector)
        {
            _baseUrl = collector.URL?.TrimEnd('/')
                ?? throw new ArgumentException("Collector.URL is required.");
            _secretKey = collector.DecryptedAccessToken
                ?? throw new ArgumentException("Collector.AccessToken (Secret Key) is required.");

            // Validate that we have a Stripe secret key
            if (!_secretKey.StartsWith("sk_"))
            {
                throw new ArgumentException("Invalid Stripe secret key format. Must start with 'sk_'");
            }

            // Set the CollectorId from the Model_Collector.
            CollectorId = collector.Id;
        }

        public async Task<List<Model_Sensor>> FetchSensorsAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            ApplyConfiguration(collector);
            var sensors = new List<Model_Sensor>();

            using var client = new HttpClient();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _secretKey);
            client.DefaultRequestHeaders.Add("User-Agent", "JunctionRelay-Stripe-Collector");

            try
            {
                // Fetch subscription metrics
                var subscriptions = await FetchSubscriptions(client, cancellationToken);
                if (subscriptions != null)
                {
                    sensors.AddRange(ParseSubscriptionMetrics(subscriptions, collector));
                }

                // Fetch recent payment intents for payment analytics
                var paymentIntents = await FetchPaymentIntents(client, cancellationToken);
                if (paymentIntents != null)
                {
                    sensors.AddRange(ParsePaymentMetrics(paymentIntents, collector));
                }

                // Fetch recent charges for additional payment data
                var charges = await FetchCharges(client, cancellationToken);
                if (charges != null)
                {
                    sensors.AddRange(ParseChargeMetrics(charges, collector));
                }

                // Fetch customers for growth metrics
                var customers = await FetchCustomers(client, cancellationToken);
                if (customers != null)
                {
                    sensors.AddRange(ParseCustomerMetrics(customers, collector));
                }

                // Fetch products for catalog metrics
                var products = await FetchProducts(client, cancellationToken);
                if (products != null)
                {
                    sensors.AddRange(ParseProductMetrics(products, collector));
                }
            }
            catch (HttpRequestException ex)
            {
                Console.WriteLine($"Stripe API request failed: {ex.Message}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Stripe collector error: {ex.Message}");
            }

            return sensors;
        }

        public async Task<List<Model_Sensor>> FetchSelectedSensorsAsync(Model_Collector collector, List<string> selectedSensorIds, CancellationToken cancellationToken = default)
        {
            var allSensors = await FetchSensorsAsync(collector, cancellationToken);
            return allSensors.FindAll(sensor => selectedSensorIds.Contains(sensor.ExternalId));
        }

        public async Task<bool> TestConnectionAsync(Model_Collector collector, CancellationToken cancellationToken = default)
        {
            try
            {
                ApplyConfiguration(collector);
                using var client = new HttpClient();
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _secretKey);
                client.DefaultRequestHeaders.Add("User-Agent", "JunctionRelay-Stripe-Collector");

                // Test with a simple account retrieval
                var response = await client.GetAsync($"https://api.stripe.com/v1/account", cancellationToken);
                return response.IsSuccessStatusCode;
            }
            catch
            {
                return false;
            }
        }

        // Stub persistent session methods (non-persistent)
        public Task StartSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task StopSessionAsync(Model_Collector collector, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public bool IsConnected(Model_Collector collector) => true;

        private async Task<JObject?> FetchSubscriptions(HttpClient client, CancellationToken cancellationToken)
        {
            try
            {
                var response = await client.GetAsync($"https://api.stripe.com/v1/subscriptions?limit=100", cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(cancellationToken);
                    return JObject.Parse(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to fetch subscriptions: {ex.Message}");
            }
            return null;
        }

        private async Task<JObject?> FetchPaymentIntents(HttpClient client, CancellationToken cancellationToken)
        {
            try
            {
                // Get payment intents from last 30 days
                var since = DateTimeOffset.UtcNow.AddDays(-30).ToUnixTimeSeconds();
                var response = await client.GetAsync($"https://api.stripe.com/v1/payment_intents?limit=100&created[gte]={since}", cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(cancellationToken);
                    return JObject.Parse(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to fetch payment intents: {ex.Message}");
            }
            return null;
        }

        private async Task<JObject?> FetchCharges(HttpClient client, CancellationToken cancellationToken)
        {
            try
            {
                // Get charges from last 30 days
                var since = DateTimeOffset.UtcNow.AddDays(-30).ToUnixTimeSeconds();
                var response = await client.GetAsync($"https://api.stripe.com/v1/charges?limit=100&created[gte]={since}", cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(cancellationToken);
                    return JObject.Parse(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to fetch charges: {ex.Message}");
            }
            return null;
        }

        private async Task<JObject?> FetchCustomers(HttpClient client, CancellationToken cancellationToken)
        {
            try
            {
                // Get customers from last 30 days
                var since = DateTimeOffset.UtcNow.AddDays(-30).ToUnixTimeSeconds();
                var response = await client.GetAsync($"https://api.stripe.com/v1/customers?limit=100&created[gte]={since}", cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(cancellationToken);
                    return JObject.Parse(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to fetch customers: {ex.Message}");
            }
            return null;
        }

        private async Task<JObject?> FetchProducts(HttpClient client, CancellationToken cancellationToken)
        {
            try
            {
                var response = await client.GetAsync($"https://api.stripe.com/v1/products?limit=100&active=true", cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync(cancellationToken);
                    return JObject.Parse(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to fetch products: {ex.Message}");
            }
            return null;
        }

        private List<Model_Sensor> ParseSubscriptionMetrics(JObject subscriptions, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();
            var data = subscriptions["data"] as JArray;

            if (data != null)
            {
                // Count subscriptions by status
                var activeCount = data.Count(s => s["status"]?.ToString() == "active");
                var trialingCount = data.Count(s => s["status"]?.ToString() == "trialing");
                var pastDueCount = data.Count(s => s["status"]?.ToString() == "past_due");
                var canceledCount = data.Count(s => s["status"]?.ToString() == "canceled");

                // Active subscriptions
                string activeValue = activeCount.ToString();
                sensors.Add(new Model_Sensor
                {
                    ExternalId = "stripe_active_subscriptions",
                    Name = "Active Subscriptions",
                    Value = activeValue,
                    Unit = "subscriptions",
                    DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(activeValue),
                    Category = "Stripe Subscriptions",
                    DeviceName = collector.Name,
                    SensorType = "API",
                    SensorTag = "active_subscriptions",
                    ComponentName = "Subscription Management",
                    JunctionId = null,
                    DeviceId = null,
                    CollectorId = collector.Id,
                    LastUpdated = DateTime.UtcNow
                });

                // Trialing subscriptions
                string trialingValue = trialingCount.ToString();
                sensors.Add(new Model_Sensor
                {
                    ExternalId = "stripe_trialing_subscriptions",
                    Name = "Trialing Subscriptions",
                    Value = trialingValue,
                    Unit = "subscriptions",
                    DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(trialingValue),
                    Category = "Stripe Subscriptions",
                    DeviceName = collector.Name,
                    SensorType = "API",
                    SensorTag = "trialing_subscriptions",
                    ComponentName = "Subscription Management",
                    JunctionId = null,
                    DeviceId = null,
                    CollectorId = collector.Id,
                    LastUpdated = DateTime.UtcNow
                });

                // Past due subscriptions
                string pastDueValue = pastDueCount.ToString();
                sensors.Add(new Model_Sensor
                {
                    ExternalId = "stripe_past_due_subscriptions",
                    Name = "Past Due Subscriptions",
                    Value = pastDueValue,
                    Unit = "subscriptions",
                    DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(pastDueValue),
                    Category = "Stripe Subscriptions",
                    DeviceName = collector.Name,
                    SensorType = "API",
                    SensorTag = "past_due_subscriptions",
                    ComponentName = "Subscription Management",
                    JunctionId = null,
                    DeviceId = null,
                    CollectorId = collector.Id,
                    LastUpdated = DateTime.UtcNow
                });

                // Canceled subscriptions
                string canceledValue = canceledCount.ToString();
                sensors.Add(new Model_Sensor
                {
                    ExternalId = "stripe_canceled_subscriptions",
                    Name = "Canceled Subscriptions",
                    Value = canceledValue,
                    Unit = "subscriptions",
                    DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(canceledValue),
                    Category = "Stripe Subscriptions",
                    DeviceName = collector.Name,
                    SensorType = "API",
                    SensorTag = "canceled_subscriptions",
                    ComponentName = "Subscription Management",
                    JunctionId = null,
                    DeviceId = null,
                    CollectorId = collector.Id,
                    LastUpdated = DateTime.UtcNow
                });

                // Calculate MRR from active subscriptions
                var monthlyRevenue = 0m;
                foreach (var subscription in data.Where(s => s["status"]?.ToString() == "active"))
                {
                    var items = subscription["items"]?["data"] as JArray;
                    if (items != null)
                    {
                        foreach (var item in items)
                        {
                            var price = item["price"];
                            var unitAmount = price?["unit_amount"]?.ToObject<decimal>() ?? 0;
                            var interval = price?["recurring"]?["interval"]?.ToString();
                            var quantity = item["quantity"]?.ToObject<int>() ?? 1;

                            // Convert to monthly amount
                            if (interval == "month")
                            {
                                monthlyRevenue += (unitAmount / 100) * quantity; // Convert from cents
                            }
                            else if (interval == "year")
                            {
                                monthlyRevenue += (unitAmount / 100 / 12) * quantity; // Convert annual to monthly
                            }
                        }
                    }
                }

                // Monthly Recurring Revenue
                var (mrrValue, mrrDecimals) = Helper_DataCollector.SanitizeSensorValue((double)monthlyRevenue, 2);
                sensors.Add(new Model_Sensor
                {
                    ExternalId = "stripe_monthly_recurring_revenue",
                    Name = "Monthly Recurring Revenue",
                    Value = mrrValue,
                    Unit = "USD",
                    DecimalPlaces = mrrDecimals,
                    Category = "Stripe Revenue",
                    DeviceName = collector.Name,
                    SensorType = "API",
                    SensorTag = "monthly_recurring_revenue",
                    ComponentName = "Revenue Analytics",
                    JunctionId = null,
                    DeviceId = null,
                    CollectorId = collector.Id,
                    LastUpdated = DateTime.UtcNow
                });

                // Annual Recurring Revenue
                var (arrValue, arrDecimals) = Helper_DataCollector.SanitizeSensorValue((double)(monthlyRevenue * 12), 2);
                sensors.Add(new Model_Sensor
                {
                    ExternalId = "stripe_annual_recurring_revenue",
                    Name = "Annual Recurring Revenue",
                    Value = arrValue,
                    Unit = "USD",
                    DecimalPlaces = arrDecimals,
                    Category = "Stripe Revenue",
                    DeviceName = collector.Name,
                    SensorType = "API",
                    SensorTag = "annual_recurring_revenue",
                    ComponentName = "Revenue Analytics",
                    JunctionId = null,
                    DeviceId = null,
                    CollectorId = collector.Id,
                    LastUpdated = DateTime.UtcNow
                });
            }

            return sensors;
        }

        private List<Model_Sensor> ParsePaymentMetrics(JObject paymentIntents, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();
            var data = paymentIntents["data"] as JArray;

            if (data != null)
            {
                var succeededCount = data.Count(p => p["status"]?.ToString() == "succeeded");
                var failedCount = data.Count(p => p["status"]?.ToString() == "payment_failed");
                var pendingCount = data.Count(p => p["status"]?.ToString() == "processing");

                // Successful payments
                string succeededValue = succeededCount.ToString();
                sensors.Add(new Model_Sensor
                {
                    ExternalId = "stripe_successful_payments_30d",
                    Name = "Successful Payments (30d)",
                    Value = succeededValue,
                    Unit = "payments",
                    DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(succeededValue),
                    Category = "Stripe Payments",
                    DeviceName = collector.Name,
                    SensorType = "API",
                    SensorTag = "successful_payments_30d",
                    ComponentName = "Payment Analytics",
                    JunctionId = null,
                    DeviceId = null,
                    CollectorId = collector.Id,
                    LastUpdated = DateTime.UtcNow
                });

                // Failed payments
                string failedValue = failedCount.ToString();
                sensors.Add(new Model_Sensor
                {
                    ExternalId = "stripe_failed_payments_30d",
                    Name = "Failed Payments (30d)",
                    Value = failedValue,
                    Unit = "payments",
                    DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(failedValue),
                    Category = "Stripe Payments",
                    DeviceName = collector.Name,
                    SensorType = "API",
                    SensorTag = "failed_payments_30d",
                    ComponentName = "Payment Analytics",
                    JunctionId = null,
                    DeviceId = null,
                    CollectorId = collector.Id,
                    LastUpdated = DateTime.UtcNow
                });

                // Payment success rate
                var totalPayments = succeededCount + failedCount;
                var successRate = totalPayments > 0 ? (succeededCount / (double)totalPayments) * 100 : 0;
                var (successRateValue, successRateDecimals) = Helper_DataCollector.SanitizeSensorValue(successRate, 1);
                sensors.Add(new Model_Sensor
                {
                    ExternalId = "stripe_payment_success_rate_30d",
                    Name = "Payment Success Rate (30d)",
                    Value = successRateValue,
                    Unit = "%",
                    DecimalPlaces = successRateDecimals,
                    Category = "Stripe Payments",
                    DeviceName = collector.Name,
                    SensorType = "API",
                    SensorTag = "payment_success_rate_30d",
                    ComponentName = "Payment Analytics",
                    JunctionId = null,
                    DeviceId = null,
                    CollectorId = collector.Id,
                    LastUpdated = DateTime.UtcNow
                });
            }

            return sensors;
        }

        private List<Model_Sensor> ParseChargeMetrics(JObject charges, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();
            var data = charges["data"] as JArray;

            if (data != null)
            {
                // Calculate total revenue from charges
                var totalRevenue = 0m;
                var refundedAmount = 0m;

                foreach (var charge in data.Where(c => c["paid"]?.ToObject<bool>() == true))
                {
                    var amount = charge["amount"]?.ToObject<decimal>() ?? 0;
                    var refunded = charge["amount_refunded"]?.ToObject<decimal>() ?? 0;

                    totalRevenue += amount / 100; // Convert from cents
                    refundedAmount += refunded / 100;
                }

                // Total revenue (30 days)
                var (revenueValue, revenueDecimals) = Helper_DataCollector.SanitizeSensorValue((double)totalRevenue, 2);
                sensors.Add(new Model_Sensor
                {
                    ExternalId = "stripe_total_revenue_30d",
                    Name = "Total Revenue (30d)",
                    Value = revenueValue,
                    Unit = "USD",
                    DecimalPlaces = revenueDecimals,
                    Category = "Stripe Revenue",
                    DeviceName = collector.Name,
                    SensorType = "API",
                    SensorTag = "total_revenue_30d",
                    ComponentName = "Revenue Analytics",
                    JunctionId = null,
                    DeviceId = null,
                    CollectorId = collector.Id,
                    LastUpdated = DateTime.UtcNow
                });

                // Total refunds (30 days)
                var (refundValue, refundDecimals) = Helper_DataCollector.SanitizeSensorValue((double)refundedAmount, 2);
                sensors.Add(new Model_Sensor
                {
                    ExternalId = "stripe_total_refunds_30d",
                    Name = "Total Refunds (30d)",
                    Value = refundValue,
                    Unit = "USD",
                    DecimalPlaces = refundDecimals,
                    Category = "Stripe Revenue",
                    DeviceName = collector.Name,
                    SensorType = "API",
                    SensorTag = "total_refunds_30d",
                    ComponentName = "Revenue Analytics",
                    JunctionId = null,
                    DeviceId = null,
                    CollectorId = collector.Id,
                    LastUpdated = DateTime.UtcNow
                });
            }

            return sensors;
        }

        private List<Model_Sensor> ParseCustomerMetrics(JObject customers, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();
            var data = customers["data"] as JArray;

            if (data != null)
            {
                // New customers (30 days)
                string customerValue = data.Count.ToString();
                sensors.Add(new Model_Sensor
                {
                    ExternalId = "stripe_new_customers_30d",
                    Name = "New Customers (30d)",
                    Value = customerValue,
                    Unit = "customers",
                    DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(customerValue),
                    Category = "Stripe Customers",
                    DeviceName = collector.Name,
                    SensorType = "API",
                    SensorTag = "new_customers_30d",
                    ComponentName = "Customer Analytics",
                    JunctionId = null,
                    DeviceId = null,
                    CollectorId = collector.Id,
                    LastUpdated = DateTime.UtcNow
                });
            }

            return sensors;
        }

        private List<Model_Sensor> ParseProductMetrics(JObject products, Model_Collector collector)
        {
            var sensors = new List<Model_Sensor>();
            var data = products["data"] as JArray;

            if (data != null)
            {
                // Active products
                string productValue = data.Count.ToString();
                sensors.Add(new Model_Sensor
                {
                    ExternalId = "stripe_active_products",
                    Name = "Active Products",
                    Value = productValue,
                    Unit = "products",
                    DecimalPlaces = Helper_DataCollector.GetDecimalPlaces(productValue),
                    Category = "Stripe Products",
                    DeviceName = collector.Name,
                    SensorType = "API",
                    SensorTag = "active_products",
                    ComponentName = "Product Catalog",
                    JunctionId = null,
                    DeviceId = null,
                    CollectorId = collector.Id,
                    LastUpdated = DateTime.UtcNow
                });
            }

            return sensors;
        }
    }
}