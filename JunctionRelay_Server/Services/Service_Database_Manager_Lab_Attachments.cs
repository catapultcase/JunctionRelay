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

using Dapper;
using JunctionRelayServer.Models;
using System.Data;

namespace JunctionRelayServer.Services
{
    public class Service_Database_Manager_Lab_Attachments
    {
        private readonly IDbConnection _db;

        public Service_Database_Manager_Lab_Attachments(IDbConnection db)
        {
            _db = db;
        }

        public async Task<IEnumerable<Model_Lab_Attachment>> GetAttachmentsAsync(int? componentId, int? machineId)
        {
            var sql = "SELECT * FROM Lab_Attachments WHERE 1 = 1";
            if (componentId.HasValue) sql += " AND ComponentId = @ComponentId";
            if (machineId.HasValue) sql += " AND MachineId = @MachineId";
            sql += " ORDER BY CreatedAt DESC, Id DESC";
            return await _db.QueryAsync<Model_Lab_Attachment>(sql, new { ComponentId = componentId, MachineId = machineId });
        }

        public async Task<Model_Lab_Attachment?> GetAttachmentByIdAsync(int id)
        {
            const string sql = "SELECT * FROM Lab_Attachments WHERE Id = @Id";
            return await _db.QuerySingleOrDefaultAsync<Model_Lab_Attachment>(sql, new { Id = id });
        }

        public async Task<int> CreateAttachmentAsync(Model_Lab_Attachment attachment)
        {
            const string sql = @"
                INSERT INTO Lab_Attachments (ComponentId, MachineId, Kind, FileName, StoredName, ContentType, SizeBytes, Sha256, Notes, CreatedAt)
                VALUES (@ComponentId, @MachineId, @Kind, @FileName, @StoredName, @ContentType, @SizeBytes, @Sha256, @Notes, @CreatedAt);
                SELECT last_insert_rowid();";

            attachment.CreatedAt = DateTime.UtcNow;
            return await _db.ExecuteScalarAsync<int>(sql, attachment);
        }

        // Content dedupe: identical uploads share one stored file
        public async Task<Model_Lab_Attachment?> GetByHashAsync(string sha256)
        {
            const string sql = "SELECT * FROM Lab_Attachments WHERE Sha256 = @Sha256 LIMIT 1";
            return await _db.QuerySingleOrDefaultAsync<Model_Lab_Attachment>(sql, new { Sha256 = sha256 });
        }

        public async Task<int> CountByStoredNameAsync(string storedName)
        {
            const string sql = "SELECT COUNT(*) FROM Lab_Attachments WHERE StoredName = @StoredName";
            return await _db.ExecuteScalarAsync<int>(sql, new { StoredName = storedName });
        }

        public async Task<bool> DeleteAttachmentAsync(int id)
        {
            var rows = await _db.ExecuteAsync("DELETE FROM Lab_Attachments WHERE Id = @Id", new { Id = id });
            return rows > 0;
        }
    }
}
