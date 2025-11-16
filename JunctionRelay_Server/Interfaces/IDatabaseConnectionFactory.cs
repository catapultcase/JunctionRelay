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

using Microsoft.Data.Sqlite;

namespace JunctionRelayServer.Interfaces
{
    /// <summary>
    /// Factory for creating SQLite database connections.
    /// Thread-safe - each call creates a new connection instance.
    /// </summary>
    public interface IDatabaseConnectionFactory
    {
        /// <summary>
        /// Creates and opens a new SQLite connection.
        /// </summary>
        /// <returns>An opened SqliteConnection. Caller must dispose.</returns>
        SqliteConnection CreateConnection();

        /// <summary>
        /// Gets the connection string used by this factory.
        /// </summary>
        string ConnectionString { get; }
    }
}
