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

using JunctionRelayServer.Interfaces;

namespace JunctionRelayServer.Services
{
    public class Service_AuthMode : IAuthModeService
    {
        private readonly IService_Auth _authService;
        private readonly IConfiguration _configuration;

        public Service_AuthMode(IService_Auth authService, IConfiguration configuration)
        {
            _authService = authService ?? throw new ArgumentNullException(nameof(authService));
            _configuration = configuration ?? throw new ArgumentNullException(nameof(configuration));
        }

        public async Task<string> GetCurrentAuthModeAsync()
        {
            return await _authService.GetAuthModeAsync();
        }

        public async Task SetAuthModeAsync(string mode)
        {
            await _authService.SetAuthModeAsync(mode);
        }

        public async Task<bool> IsAuthConfiguredAsync()
        {
            var authMode = await GetCurrentAuthModeAsync();

            return authMode switch
            {
                "none" => true,
                "local" => await _authService.HasAnyUsersAsync(),
                "cloud" => !string.IsNullOrEmpty(_configuration["JunctionRelayCloud:ApiUrl"]),
                _ => false
            };
        }

        public async Task<bool> RequiresSetupAsync()
        {
            var authMode = await GetCurrentAuthModeAsync();

            return authMode switch
            {
                "none" => false,
                "local" => !await _authService.HasAnyUsersAsync(),
                "cloud" => false,
                _ => false
            };
        }
    }
}