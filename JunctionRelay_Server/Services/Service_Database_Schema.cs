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
using System.Text.RegularExpressions;
using Dapper;
using Microsoft.Data.Sqlite;

namespace JunctionRelayServer.Services
{
    /// <summary>
    /// Creates a table and brings an existing one up to date ("amend"), so an install of any
    /// age catches up with the code on boot. The CREATE TABLE statement is the only source of
    /// truth: it is built in a scratch in-memory database, compared column by column with the
    /// live table, and every column the live table lacks is added. There is no list of
    /// additions to maintain - adding a column to the CREATE TABLE is the whole change.
    ///
    /// Additive only: nothing is dropped, renamed or retyped, and data is never moved.
    /// </summary>
    public static class Service_Database_Schema
    {
        private class ColumnInfo
        {
            public string Name { get; set; } = "";
            public string Type { get; set; } = "";
            public long IsNotNull { get; set; }
            public string? DefaultValue { get; set; }
            public long Pk { get; set; }
        }

        public static void CreateOrAmendTable(IDbConnection db, string createTableSql)
        {
            db.Execute(createTableSql);

            using var scratch = new SqliteConnection("Data Source=:memory:");
            scratch.Open();
            scratch.Execute(createTableSql);

            var table = scratch.ExecuteScalar<string>(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
            if (table == null) return;

            var declared = ReadColumns(scratch, table);
            var live = ReadColumns(db, table).Select(c => c.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);

            foreach (var column in declared.Where(c => !live.Contains(c.Name)))
                AddColumn(db, table, column);
        }

        private static List<ColumnInfo> ReadColumns(IDbConnection db, string table) =>
            db.Query<ColumnInfo>(
                "SELECT name AS Name, type AS Type, \"notnull\" AS IsNotNull, dflt_value AS DefaultValue, pk AS Pk FROM pragma_table_info(@table)",
                new { table }).ToList();

        // SQLite's ADD COLUMN cannot add a PRIMARY KEY or UNIQUE column, a NOT NULL column
        // without a default, or a non-constant default (CURRENT_TIMESTAMP, an expression).
        // Those are added in the closest legal form and logged, so the difference is visible.
        private static void AddColumn(IDbConnection db, string table, ColumnInfo column)
        {
            if (column.Pk > 0)
            {
                Console.WriteLine($"[DB_SCHEMA] ⚠️ {table}.{column.Name} is part of the primary key and cannot be added to an existing table - skipped");
                return;
            }

            var constantDefault = column.DefaultValue != null && !IsNonConstantDefault(column.DefaultValue);
            var notNull = column.IsNotNull != 0 && constantDefault;

            var sql = $"ALTER TABLE \"{table}\" ADD COLUMN \"{column.Name}\" {column.Type}"
                    + (notNull ? " NOT NULL" : "")
                    + (constantDefault ? $" DEFAULT {column.DefaultValue}" : "");

            try
            {
                db.Execute(sql);
                var relaxed = column.IsNotNull != 0 && !notNull ? " (added nullable: SQLite cannot add NOT NULL without a constant default)"
                            : column.DefaultValue != null && !constantDefault ? $" (default {column.DefaultValue} dropped: not constant)"
                            : "";
                Console.WriteLine($"[DB_SCHEMA] ➕ {table}.{column.Name} {column.Type} added{relaxed}");
            }
            catch (Exception ex)
            {
                // Logged, not thrown: one column that cannot be added must not stop the server.
                Console.WriteLine($"[DB_SCHEMA] ❌ Could not add {table}.{column.Name}: {ex.Message}");
            }
        }

        private static bool IsNonConstantDefault(string defaultValue) =>
            defaultValue.StartsWith('(') ||
            Regex.IsMatch(defaultValue, @"^CURRENT_(TIME|DATE|TIMESTAMP)$", RegexOptions.IgnoreCase);
    }
}
