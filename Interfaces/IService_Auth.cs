/*
 * This file is part of Junction Relay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * Junction Relay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Junction Relay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Junction Relay. If not, see <https://www.gnu.org/licenses/>.
 */

using JunctionRelayServer.Models;

namespace JunctionRelayServer.Interfaces
{
    public interface IService_Auth
    {
        Task<bool> ValidateCredentialsAsync(string username, string password);
        Task<Model_AuthUser?> GetUserAsync(string username);
        Task<bool> CreateUserAsync(string username, string password);
        Task<bool> ChangePasswordAsync(string username, string currentPassword, string newPassword);
        Task<bool> HasAnyUsersAsync();
        Task UpdateLastLoginAsync(string username, string ipAddress);
        Task UpdateUsername(string oldUsername, string newUsername);
        Task<bool> IsAuthenticationEnabledAsync();
        void ClearAuthCache();
    }
}