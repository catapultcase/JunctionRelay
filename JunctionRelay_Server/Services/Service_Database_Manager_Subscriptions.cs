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

using System.Data;
using Dapper;
using JunctionRelayServer.Models;

namespace JunctionRelayServer.Services
{
    /// <summary>
    /// Database manager for layout subscriptions (cloud, remote server, and manual imports).
    /// Matches XSD's Layout_Subscriptions schema for shared UI compatibility.
    /// </summary>
    public class Service_Database_Manager_Subscriptions
    {
        private readonly IDbConnection _db;

        public Service_Database_Manager_Subscriptions(IDbConnection db)
        {
            _db = db;
        }

        // ============================================================================
        // TABLE CREATION
        // ============================================================================

        public void EnsureTableExists()
        {
            Service_Database_Schema.CreateOrAmendTable(_db, @"
                CREATE TABLE IF NOT EXISTS LayoutSubscriptions (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ServerUrl TEXT NOT NULL,
                    ServerPort TEXT NOT NULL DEFAULT '0',
                    ServerName TEXT,
                    RemoteLayoutId TEXT NOT NULL,
                    RemoteLayoutName TEXT NOT NULL,
                    RemoteVariantId TEXT,
                    LocalFilePath TEXT NOT NULL,
                    LocalFileName TEXT NOT NULL,
                    LastDownloadedAt TEXT,
                    RemoteLastModified TEXT,
                    SubscribedAt TEXT NOT NULL,
                    IsActive INTEGER NOT NULL DEFAULT 1,
                    AutoUpdate INTEGER NOT NULL DEFAULT 1,
                    IsTemplate INTEGER NOT NULL DEFAULT 0,
                    Source TEXT NOT NULL DEFAULT 'manual',
                    HasThumbnail INTEGER NOT NULL DEFAULT 0,
                    ThumbnailPath TEXT,
                    ThumbnailFormat TEXT,
                    AuthorName TEXT,
                    AuthorUrl TEXT,
                    AuthorId TEXT,
                    AuthorAvatarUrl TEXT,
                    UNIQUE(ServerUrl, ServerPort, RemoteLayoutId)
                );
            ");
        }

        // ============================================================================
        // CRUD OPERATIONS
        // ============================================================================

        public async Task<IEnumerable<Model_Layout_Subscription>> GetAllSubscriptionsAsync(bool activeOnly = true)
        {
            var sql = activeOnly
                ? "SELECT * FROM LayoutSubscriptions WHERE IsActive = 1 ORDER BY SubscribedAt DESC"
                : "SELECT * FROM LayoutSubscriptions ORDER BY SubscribedAt DESC";

            return await _db.QueryAsync<Model_Layout_Subscription>(sql);
        }

        public async Task<Model_Layout_Subscription?> GetSubscriptionByIdAsync(int id)
        {
            const string sql = "SELECT * FROM LayoutSubscriptions WHERE Id = @Id";
            return await _db.QueryFirstOrDefaultAsync<Model_Layout_Subscription>(sql, new { Id = id });
        }

        public async Task<Model_Layout_Subscription?> GetSubscriptionByRemoteLayoutAsync(
            string serverUrl, string serverPort, string remoteLayoutId)
        {
            const string sql = @"
                SELECT * FROM LayoutSubscriptions
                WHERE ServerUrl = @ServerUrl
                  AND ServerPort = @ServerPort
                  AND RemoteLayoutId = @RemoteLayoutId
                LIMIT 1";

            return await _db.QueryFirstOrDefaultAsync<Model_Layout_Subscription>(
                sql, new { ServerUrl = serverUrl, ServerPort = serverPort, RemoteLayoutId = remoteLayoutId });
        }

        public async Task<int> CreateSubscriptionAsync(Model_Layout_Subscription subscription)
        {
            const string sql = @"
                INSERT INTO LayoutSubscriptions
                    (ServerUrl, ServerPort, ServerName, RemoteLayoutId, RemoteLayoutName,
                     RemoteVariantId, LocalFilePath, LocalFileName, LastDownloadedAt,
                     RemoteLastModified, SubscribedAt, IsActive, AutoUpdate, IsTemplate, Source,
                     AuthorName, AuthorUrl, AuthorId, AuthorAvatarUrl)
                VALUES
                    (@ServerUrl, @ServerPort, @ServerName, @RemoteLayoutId, @RemoteLayoutName,
                     @RemoteVariantId, @LocalFilePath, @LocalFileName, @LastDownloadedAt,
                     @RemoteLastModified, @SubscribedAt, @IsActive, @AutoUpdate, @IsTemplate, @Source,
                     @AuthorName, @AuthorUrl, @AuthorId, @AuthorAvatarUrl);
                SELECT last_insert_rowid();";

            if (string.IsNullOrEmpty(subscription.SubscribedAt))
                subscription.SubscribedAt = DateTime.UtcNow.ToString("o");

            if (string.IsNullOrEmpty(subscription.LastDownloadedAt))
                subscription.LastDownloadedAt = DateTime.UtcNow.ToString("o");

            return await _db.ExecuteScalarAsync<int>(sql, subscription);
        }

        public async Task<bool> DeleteSubscriptionAsync(int id)
        {
            const string sql = "DELETE FROM LayoutSubscriptions WHERE Id = @Id";
            var affected = await _db.ExecuteAsync(sql, new { Id = id });
            return affected > 0;
        }

        public async Task<bool> UpdateLastDownloadedAsync(int id, string? remoteLastModified)
        {
            const string sql = @"
                UPDATE LayoutSubscriptions
                SET LastDownloadedAt = @LastDownloadedAt, RemoteLastModified = @RemoteLastModified
                WHERE Id = @Id";

            var affected = await _db.ExecuteAsync(sql, new
            {
                Id = id,
                LastDownloadedAt = DateTime.UtcNow.ToString("o"),
                RemoteLastModified = remoteLastModified
            });
            return affected > 0;
        }

        public async Task<bool> UpdateThumbnailAsync(int id, bool hasThumbnail, string? thumbnailPath, string? thumbnailFormat)
        {
            const string sql = @"
                UPDATE LayoutSubscriptions
                SET HasThumbnail = @HasThumbnail, ThumbnailPath = @ThumbnailPath, ThumbnailFormat = @ThumbnailFormat
                WHERE Id = @Id";

            var affected = await _db.ExecuteAsync(sql, new
            {
                Id = id,
                HasThumbnail = hasThumbnail ? 1 : 0,
                ThumbnailPath = thumbnailPath,
                ThumbnailFormat = thumbnailFormat
            });
            return affected > 0;
        }

        public async Task<bool> SetAutoUpdateAsync(int id, bool enabled)
        {
            const string sql = "UPDATE LayoutSubscriptions SET AutoUpdate = @AutoUpdate WHERE Id = @Id";
            var affected = await _db.ExecuteAsync(sql, new { Id = id, AutoUpdate = enabled ? 1 : 0 });
            return affected > 0;
        }

        public async Task<IEnumerable<Model_Layout_Subscription>> GetSubscriptionsByServerAsync(
            string serverUrl, string serverPort)
        {
            const string sql = @"
                SELECT * FROM LayoutSubscriptions
                WHERE ServerUrl = @ServerUrl AND ServerPort = @ServerPort AND IsActive = 1
                ORDER BY SubscribedAt DESC";

            return await _db.QueryAsync<Model_Layout_Subscription>(
                sql, new { ServerUrl = serverUrl, ServerPort = serverPort });
        }

        public async Task<IEnumerable<Model_Layout_Subscription>> GetSubscriptionsBySourceAsync(string source)
        {
            const string sql = @"
                SELECT * FROM LayoutSubscriptions
                WHERE Source = @Source AND IsActive = 1
                ORDER BY SubscribedAt DESC";

            return await _db.QueryAsync<Model_Layout_Subscription>(sql, new { Source = source });
        }
    }
}
